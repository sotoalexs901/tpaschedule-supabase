// netlify/functions/umnr-api.js
// Server-only UMNR data API. Requires verified Firebase Auth ID token.
// NO direct client writes to umnr_services. Keep UMNR_ENABLED=false until rules reviewed.
const admin = require('firebase-admin');
function app() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const c = raw ? JSON.parse(raw) : {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
  if (!c.project_id || !c.client_email || !c.private_key) throw Error('Admin credentials missing');
  return admin.initializeApp({ credential: admin.credential.cert({
    projectId: c.project_id, clientEmail: c.client_email, privateKey: c.private_key,
  }) });
}
const json = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
const text = (v, max=120) => String(v || '').trim().slice(0,max);
const roles = new Set(['station_manager','duty_manager','supervisor']);
const endStates = new Set(['DELIVERED','CANCELLED','REJECTED']);
const allowed = {
  ASSIGNED: ['ACCEPTED','REJECTED','CANCELLED'],
  ACCEPTED: ['PICKED_UP','CANCELLED'],
  PICKED_UP: ['IN_TRANSIT','DELIVERED','CANCELLED'],
  IN_TRANSIT: ['AT_GATE','DELIVERED','CANCELLED'],
  AT_GATE: ['DELIVERED','CANCELLED'],
  REJECTED: ['ASSIGNED','CANCELLED'],
};
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405,{error:'POST required'});
  if (process.env.UMNR_ENABLED !== 'true') return json(503,{error:'UMNR disabled'});
  try {
    const token = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || '')?.[1];
    if (!token) return json(401,{error:'Authentication required'});
    const firebase = app();
    const decoded = await firebase.auth().verifyIdToken(token, true);
    if (decoded.umnr !== true || !decoded.userDocId) return json(403,{error:'UMNR access required'});
    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(decoded.userDocId).get();
    if (!userDoc.exists || userDoc.data().umnrAccessEnabled !== true || userDoc.data().active === false)
      return json(403,{error:'Access revoked'});
    const user = userDoc.data();
    const role = String(user.role || '').toLowerCase();
    const manager = roles.has(role);
    const employeeId = text(user.employeeId || decoded.userDocId,100);
    const body = JSON.parse(event.body || '{}');
    const action = text(body.action,30);
    const services = db.collection('umnr_services');
    const now = admin.firestore.FieldValue.serverTimestamp();
    const actor = { id: decoded.userDocId, employeeId, role };
    const eventItem = (type, details={}) => ({ type, at: new Date().toISOString(), actor, ...details });
    if (action === 'list') {
      const snapshot = await services.orderBy('createdAt','desc').limit(150).get();
      const items = snapshot.docs.map(d=>({id:d.id,...d.data(), createdAt:d.data().createdAt?.toDate?.()?.toISOString() || null}));
      return json(200,{items:manager ? items : items.filter(x=>x.agentId===employeeId)});
    }
    if (action === 'create') {
      if (!manager) return json(403,{error:'Dispatch role required'});
      const flightId = text(body.flightId,120), name = text(body.fullName,120);
      const pnr = text(body.pnr,12).toUpperCase(), direction = text(body.direction,2).toUpperCase();
      if (!flightId || name.length < 2 || !/^[A-Z0-9]{4,8}$/.test(pnr) || !['IB','OB'].includes(direction))
        return json(400,{error:'Flight, name, PNR and IB/OB required'});
      const flight = await db.collection('wchr_daily_flights').doc(flightId).get();
      if (!flight.exists) return json(404,{error:'Existing WCHR flight not found'});
      const f = flight.data();
      const ref = services.doc();
      await ref.set({flightId, flightNumber:text(f.flight_number,30), airline:text(f.airline,40),
        gate:text(f.gate,30), direction, fullName:name, pnr, agentId:'', status:'UNASSIGNED',
        lastCustodyAt:null, handoffTo:'', createdAt:now, updatedAt:now,
        timeline:[eventItem('CREATED')], createdBy:actor.id});
      return json(200,{id:ref.id});
    }
    if (action === 'assign') {
      if (!manager) return json(403,{error:'Dispatch role required'});
      const id = text(body.id,150), agentId=text(body.agentId,120);
      if (!id || !agentId) return json(400,{error:'Service and agent required'});
      const agentRecord=await db.collection('wchr_agent_shifts').doc(agentId).get();
      if (!agentRecord.exists) return json(404,{error:'Agent not found in WCHR shift roster'});
      if (agentRecord.data().active_report_id) return json(409,{error:'Agent currently assigned to WCHR'});
      // NOTE: UMNR counts are transactional, but WCHR's existing writers are NOT part
      // of this transaction. Cross-module 1-WCHR-vs-10-UMNR guarantee needs shared lock.
      const ref=services.doc(id), capacity=db.collection('umnr_agent_capacity').doc(agentId);
      await db.runTransaction(async tx=>{
        const shiftRef=db.collection('wchr_agent_shifts').doc(agentId);
        const [s,c,shift] = await Promise.all([tx.get(ref),tx.get(capacity),tx.get(shiftRef)]);
        if (!shift.exists || shift.data().active_report_id) throw Error('Agent unavailable or WCHR busy');
        if (!s.exists) throw Error('Service not found');
        const item=s.data();
        if (!['UNASSIGNED','REJECTED'].includes(item.status)) throw Error('Service already assigned');
        const current=Number(c.exists?c.data().count:0);
        if (current>=10) throw Error('UMNR capacity reached');
        tx.set(capacity,{count:current+1,updatedAt:now},{merge:true});
        tx.update(ref,{agentId,status:'ASSIGNED',updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('ASSIGNED',{agentId}))});
      });
      return json(200,{ok:true});
    }
    if (action === 'advance' || action === 'custody') {
      const id=text(body.id,150), ref=services.doc(id);
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if (!s.exists) throw Error('Service not found');
        const item=s.data();
        if (!manager && item.agentId!==employeeId) throw Error('Not assigned to you');
        if (manager && !['CANCELLED'].includes(text(body.status,20).toUpperCase()) && action==='advance' && item.agentId!==employeeId) throw Error('Only assigned agent can advance service');
        if (action==='custody') {
          if (!['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(item.status)) throw Error('Custody not active');
          tx.update(ref,{lastCustodyAt:now,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('CUSTODY_CHECK'))});
          return;
        }
        const next=text(body.status,20).toUpperCase();
        if (!(allowed[item.status] || []).includes(next)) throw Error('Invalid status transition');
        if (next==='CANCELLED' && !manager) throw Error('Only Dispatch can cancel');
        const handoffTo=text(body.handoffTo,120);
        if (next==='DELIVERED' && handoffTo.length<3) throw Error('Authorized receiver required');
        if (next==='DELIVERED' && body.handoffConfirmed !== true) throw Error('Confirm authorized handoff');
        if (next==='DELIVERED' && body.receiverAuthorizationVerified !== true) throw Error('Receiver authorization must be verified');
        if (next==='DELIVERED' && body.receiverIdAndFormMatched !== true) throw Error('Agent must confirm physical photo ID, UMNR form, face match and authorized relationship before handoff');
        const receiverSignature=String(body.receiverSignature || '');
        if(next==='DELIVERED' && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(receiverSignature) || receiverSignature.length>180000 || receiverSignature.length<250)) throw Error('Valid receiver signature required');
        if (next==='REJECTED' && !text(body.reason,250)) throw Error('Rejection reason required');
        const patch={status:next,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem(next,{reason:text(body.reason,250)}))};
        if (next==='PICKED_UP') patch.lastCustodyAt=now;
        if (next==='DELIVERED') { patch.handoffTo=handoffTo; patch.handoffAt=now; patch.receiverSignature=receiverSignature; patch.receiverAuthorizationVerified=true; patch.receiverIdAndFormMatched=true; }
        if (endStates.has(next)) {
          const capRef=db.collection('umnr_agent_capacity').doc(item.agentId);
          const cap=await tx.get(capRef);
          patch.agentId=next==='REJECTED'?'':item.agentId;
          tx.set(capRef,{count:Math.max(0,Number(cap.exists?cap.data().count:0)-1),updatedAt:now},{merge:true});
        }
        tx.update(ref,patch);
      });
      return json(200,{ok:true});
    }
    return json(400,{error:'Unknown action'});
  } catch(err) {
    console.error('UMNR API',err.message);
    return json(400,{error:err.message==='Unexpected token'?'Invalid request':String(err.message || 'Request failed').slice(0,160)});
  }
};
