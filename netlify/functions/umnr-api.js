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
const releaseStates = new Set(['DELIVERED','CANCELLED','REJECTED']);
const allowed = {
  UNASSIGNED: ['CANCELLED'],
  ASSIGNED: ['ACCEPTED','REJECTED','CANCELLED'],
  ACCEPTED: ['PICKED_UP','CANCELLED'],
  PICKED_UP: ['IN_TRANSIT','CANCELLED'],
  IN_TRANSIT: ['AT_GATE','CANCELLED'],
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
    // Resolve the same employee document used by WCHR Agent Operations.
    let employeeDoc = user.employeeId ? await db.collection('employees').doc(String(user.employeeId)).get() : null;
    if ((!employeeDoc || !employeeDoc.exists) && (user.username || user.loginUsername)) {
      for (const username of [user.username,user.loginUsername].filter(Boolean)) {
        const matches=await db.collection('employees').where('loginUsername','==',username).limit(1).get();
        if (!matches.empty) {employeeDoc=matches.docs[0];break;}
      }
    }
    const employeeData=employeeDoc?.exists ? employeeDoc.data() : {};
    const myAgentIds=new Set([employeeId,decoded.userDocId,employeeDoc?.exists ? employeeDoc.id : ''].filter(Boolean));
    const isMyService=item=>myAgentIds.has(String(item.agentId||''));
    const displayName=data=>text(data?.name||data?.fullName||data?.displayName||data?.employeeName||data?.loginUsername||'',120);
    const myName=displayName(employeeData)||displayName(user);
    const body = JSON.parse(event.body || '{}');
    const action = text(body.action,30);
    const services = db.collection('umnr_services');
    const now = admin.firestore.FieldValue.serverTimestamp();
    const actor = { id: decoded.userDocId, employeeId, role, name: myName || '' };
    const eventItem = (type, details={}) => ({ type, at: new Date().toISOString(), actor, ...details });
    if (action === 'list') {
      const snapshot = await services.orderBy('createdAt','desc').limit(150).get();
      const items = snapshot.docs.filter(d=>!d.data().archivedAt).map(d=>{ const data=d.data(); return {id:d.id,...data,createdAt:data.createdAt?.toDate?.()?.toISOString() || null,lastCustodyAt:data.lastCustodyAt?.toDate?.()?.toISOString() || null,pickedUpAt:data.pickedUpAt?.toDate?.()?.toISOString() || null,handoffAt:data.handoffAt?.toDate?.()?.toISOString() || null}; });
      return json(200,{items:manager ? items : items.filter(item=>isMyService(item)||myAgentIds.has(String(item.pendingTransfer?.toAgentId||'')))});
    }
    if (action === 'archive') {
      if (role !== 'station_manager') return json(403,{error:'Station Manager authorization required'});
      const id=text(body.id,150), reason=text(body.reason,250);
      if (!id || reason.length<8) return json(400,{error:'Service and archive reason (8+ characters) required'});
      await db.runTransaction(async tx=>{
        const ref=services.doc(id), snap=await tx.get(ref);
        if(!snap.exists) throw Error('Service not found');
        const item=snap.data();
        if(!['DELIVERED','CANCELLED'].includes(item.status)) throw Error('Only delivered or cancelled services can be archived');
        if(item.archivedAt) throw Error('Service already archived');
        tx.update(ref,{archivedAt:now,archivedBy:actor,archiveReason:reason,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('ARCHIVED',{reason}))});
      });
      return json(200,{ok:true});
    }
    if (action === 'create') {
      // Lobby agents may prepare intake, but never assign or manage Dispatch.
      const lobbyShiftRef = db.collection('wchr_agent_shifts').doc(employeeDoc?.exists ? employeeDoc.id : employeeId);
      const lobbyShift = manager ? null : await lobbyShiftRef.get();
      const lobbyAuthorized = !!(lobbyShift?.exists &&
        String(lobbyShift.data()?.status || '').toUpperCase() === 'ACTIVE' &&
        lobbyShift.data()?.lobby_agent === true &&
        String(lobbyShift.data()?.user_id || lobbyShift.data()?.userId || '') === String(decoded.userDocId));
      if (!manager && !lobbyAuthorized) return json(403,{error:'Active Lobby Punch In or Dispatch role required'});
      const flightId = text(body.flightId,120), name = text(body.fullName,120);
      const pnr = text(body.pnr,12).toUpperCase(), direction = text(body.direction,2).toUpperCase();
      if (!flightId || name.length < 2 || !/^[A-Z0-9]{4,8}$/.test(pnr) || !['IB','OB'].includes(direction))
        return json(400,{error:'Flight, name, PNR and IB/OB required'});
      const flight = await db.collection('wchr_daily_flights').doc(flightId).get();
      if (!flight.exists) return json(404,{error:'Existing WCHR flight not found'});
      const f = flight.data();
      const flightStatus = String(f.status || f.flight_status || '').toUpperCase();
      if (['CANCELLED','CLOSED','COMPLETED','ARCHIVED'].includes(flightStatus) || f.is_open === false || f.approved === false)
        return json(409,{error:'Flight is not open for new passenger services'});
      const ref = services.doc();
      await ref.set({flightId, flightNumber:text(f.flight_number,30), airline:text(f.airline,40),
        gate:text(f.gate,30), direction, fullName:name, pnr, agentId:'', status:'UNASSIGNED',
        readyForAssignment:true, intakeSource:manager?'DISPATCH':'LOBBY',
        lastCustodyAt:null, pickedUpAt:null, pickupLocation:'', currentLocation:'', handoffTo:'', createdAt:now, updatedAt:now,
        timeline:[eventItem('CREATED')], createdBy:actor.id});
      return json(200,{id:ref.id});
    }
    if (action === 'assign') {
      if (!manager) return json(403,{error:'Dispatch role required'});
      const id = text(body.id,150), agentId=text(body.agentId,120);
      if (!id || !agentId) return json(400,{error:'Service and agent required'});
      // Capacity is enforced atomically against the same WCHR shift/capacity docs
      // used by Dispatch. This preserves the rule: 10 UMNR OR 1 WCHR, never mixed.
      const ref=services.doc(id), capacity=db.collection('umnr_agent_capacity').doc(agentId);
      await db.runTransaction(async tx=>{
        const shiftRef=db.collection('wchr_agent_shifts').doc(agentId);
        const [s,c,shift] = await Promise.all([tx.get(ref),tx.get(capacity),tx.get(shiftRef)]);
        if (!shift.exists) throw Error('Agent not found in WCHR shift roster');
        const shiftData=shift.data() || {};
        if (String(shiftData.status || '').toUpperCase() !== 'ACTIVE') throw Error('Agent is not punched in for operations');
        if (String(shiftData.availability_status || '').toUpperCase() !== 'AVAILABLE') throw Error('Agent is not currently available');
        if (shiftData.active_report_id) throw Error('Agent currently assigned to WCHR');
        if (!s.exists) throw Error('Service not found');
        const item=s.data();
        if (item.archivedAt) throw Error('Service archived');
        if (!['UNASSIGNED','REJECTED'].includes(item.status)) throw Error('Service already assigned');
        const current=Number(c.exists?c.data().count:0);
        if (current>=10) throw Error('UMNR capacity reached');
        const agentRecord=await tx.get(db.collection('employees').doc(agentId));
        tx.set(capacity,{count:current+1,updatedAt:now,lastAssignedServiceId:id},{merge:true});
        const agentName=displayName(agentRecord.exists?agentRecord.data():{}) || displayName(shiftData) || agentId;
        tx.update(ref,{agentId,agentName,status:'ASSIGNED',updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('ASSIGNED',{agentId,agentName}))});
      });
      return json(200,{ok:true});
    }
    if (action === 'transfer') {
      if (!manager) return json(403,{error:'Dispatch role required'});
      const id=text(body.id,150), agentId=text(body.agentId,120), reason=text(body.reason,250);
      if (!id || !agentId || reason.length<8) return json(400,{error:'Service, new agent and transfer reason (8+ characters) required'});
      const ref=services.doc(id), newCapRef=db.collection('umnr_agent_capacity').doc(agentId);
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if (!s.exists) throw Error('Service not found');
        const item=s.data();
        if (item.archivedAt) throw Error('Service archived');
        if (!['ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','AT_GATE'].includes(item.status)) throw Error('Service cannot be transferred in its current state');
        if (String(item.agentId)===agentId) throw Error('Choose a different agent');
        const oldAgentId=String(item.agentId||'');
        const oldCapRef=db.collection('umnr_agent_capacity').doc(oldAgentId);
        const shiftRef=db.collection('wchr_agent_shifts').doc(agentId);
        const [newCap,oldCap,shift,employee]=await Promise.all([tx.get(newCapRef),tx.get(oldCapRef),tx.get(shiftRef),tx.get(db.collection('employees').doc(agentId))]);
        if (!shift.exists) throw Error('New agent not in WCHR shift roster');
        const shiftData=shift.data()||{};
        if (String(shiftData.status||'').toUpperCase()!=='ACTIVE' || String(shiftData.availability_status||'').toUpperCase()!=='AVAILABLE') throw Error('New agent must be punched in and available');
        if (shiftData.active_report_id) throw Error('New agent currently assigned to WCHR');
        if (Number(newCap.exists?newCap.data().count:0)>=10) throw Error('New agent UMNR capacity reached');
        const newName=displayName(employee.exists?employee.data():{})||displayName(shiftData)||agentId;
        const inCustody=['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(item.status);
        if (inCustody) {
          // Do not change the current custodian until the receiving agent physically confirms handoff.
          if (item.pendingTransfer) throw Error('A custody transfer is already pending');
          const location=text(body.location,120);
          if (location.length<3) throw Error('Actual transfer location required');
          tx.update(ref,{pendingTransfer:{toAgentId:agentId,toAgentName:newName,fromAgentId:oldAgentId,fromAgentName:item.agentName||oldAgentId,reason,location,requestedAt:new Date().toISOString()},updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('TRANSFER_REQUESTED',{fromAgentId:oldAgentId,toAgentId:agentId,toAgentName:newName,reason,location}))});
        } else {
          tx.set(oldCapRef,{count:Math.max(0,Number(oldCap.exists?oldCap.data().count:0)-1),updatedAt:now},{merge:true});
          tx.set(newCapRef,{count:Number(newCap.exists?newCap.data().count:0)+1,updatedAt:now},{merge:true});
          tx.update(ref,{agentId,agentName:newName,status:'ASSIGNED',updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('TRANSFERRED_BEFORE_PICKUP',{fromAgentId:oldAgentId,toAgentId:agentId,toAgentName:newName,reason}))});
        }
      });
      return json(200,{ok:true});
    }
    if (action === 'confirmTransfer') {
      const id=text(body.id,150), location=text(body.location,120);
      if (!id || location.length<3 || body.physicalCustodyConfirmed!==true) return json(400,{error:'Actual location and physical custody confirmation required'});
      const ref=services.doc(id);
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if (!s.exists) throw Error('Service not found');
        const item=s.data(), pending=item.pendingTransfer;
        if(item.archivedAt) throw Error('Service archived');
        if (!pending || !myAgentIds.has(String(pending.toAgentId))) throw Error('Transfer is not assigned to you');
        if (!['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(item.status)) throw Error('Service not in active custody');
        if (location.toLowerCase()!==String(pending.location||'').toLowerCase()) throw Error('Transfer location must match the Dispatch handoff location');
        const oldCapRef=db.collection('umnr_agent_capacity').doc(pending.fromAgentId),newCapRef=db.collection('umnr_agent_capacity').doc(pending.toAgentId);
        const [oldCap,newCap,shift]=await Promise.all([tx.get(oldCapRef),tx.get(newCapRef),tx.get(db.collection('wchr_agent_shifts').doc(pending.toAgentId))]);
        if (!shift.exists || String(shift.data().status||'').toUpperCase()!=='ACTIVE' || shift.data().active_report_id) throw Error('Receiving agent not eligible');
        if (Number(newCap.exists?newCap.data().count:0)>=10) throw Error('Receiving agent capacity reached');
        tx.set(oldCapRef,{count:Math.max(0,Number(oldCap.exists?oldCap.data().count:0)-1),updatedAt:now},{merge:true});
        tx.set(newCapRef,{count:Number(newCap.exists?newCap.data().count:0)+1,updatedAt:now},{merge:true});
        tx.update(ref,{agentId:pending.toAgentId,agentName:pending.toAgentName,pendingTransfer:admin.firestore.FieldValue.delete(),lastCustodyAt:now,currentLocation:location,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('CUSTODY_TRANSFER_CONFIRMED',{fromAgentId:pending.fromAgentId,fromAgentName:pending.fromAgentName,toAgentId:pending.toAgentId,toAgentName:pending.toAgentName,reason:pending.reason,location}))});
      });
      return json(200,{ok:true});
    }
    if (action === 'advance' || action === 'custody') {
      const id=text(body.id,150), ref=services.doc(id);
      await db.runTransaction(async tx=>{
        const s=await tx.get(ref);
        if (!s.exists) throw Error('Service not found');
        const item=s.data();
        if(item.archivedAt) throw Error('Service archived');
        if (!isMyService(item) && !(manager && action==='advance' && text(body.status,20).toUpperCase()==='CANCELLED')) throw Error('Not assigned to you');
        
        if (item.pendingTransfer && action==='advance' && text(body.status,20).toUpperCase()!=='CANCELLED') throw Error('Custody transfer pending; complete the handoff first');
        if (action==='custody') {
          if (!isMyService(item) || !['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(item.status)) throw Error('Custody not active or not assigned to you');
          tx.update(ref,{lastCustodyAt:now,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem('CUSTODY_CHECK'))});
          return;
        }
        const next=text(body.status,20).toUpperCase();
        if (!(allowed[item.status] || []).includes(next)) throw Error('Invalid status transition');
        if (next==='CANCELLED' && !manager) throw Error('Only Dispatch can cancel');
        const handoffTo=text(body.handoffTo,120);
        if (next==='DELIVERED' && handoffTo.length<3) throw Error('Authorized receiver required');
        if (next==='DELIVERED' && text(body.handoffLocation,120).length<3) throw Error('Handoff location required');
        if (next==='DELIVERED' && body.handoffConfirmed !== true) throw Error('Confirm authorized handoff');
        if (next==='DELIVERED' && body.receiverAuthorizationVerified !== true) throw Error('Receiver authorization must be verified');
        if (next==='DELIVERED' && body.receiverIdAndFormMatched !== true) throw Error('Agent must confirm physical photo ID, UMNR form, face match and authorized relationship before handoff');
        if (next==='DELIVERED' && !['physicalIdInspected','idNameMatched','idPhotoMatched','authorizedReceiverMatched'].every(k=>body[k]===true)) throw Error('All four receiver verification checks are required');
        const receiverSignature=String(body.receiverSignature || '');
        if(next==='DELIVERED' && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(receiverSignature) || receiverSignature.length>180000 || receiverSignature.length<250)) throw Error('Valid receiver signature required');
        if (['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(next) && text(body.currentLocation,120).length<3) throw Error('Actual current location is required');
        if (next==='REJECTED' && !text(body.reason,250)) throw Error('Rejection reason required');
        const patch={status:next,updatedAt:now,timeline:admin.firestore.FieldValue.arrayUnion(eventItem(next,{reason:text(body.reason,250),agentName:myName,location:text(body.currentLocation || body.handoffLocation,120)}))};
        if (['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(next)) patch.currentLocation=text(body.currentLocation,120);
        if (next==='PICKED_UP') {patch.lastCustodyAt=now;patch.pickedUpAt=now;patch.pickupLocation=text(body.currentLocation,120);}
        if (next==='DELIVERED') patch.currentLocation=text(body.handoffLocation,120);
        if (next==='DELIVERED') { patch.handoffTo=handoffTo; patch.handoffAt=now; patch.receiverSignature=receiverSignature; patch.receiverAuthorizationVerified=true; patch.receiverIdAndFormMatched=true; patch.receiverChecks={physicalIdInspected:true,idNameMatched:true,idPhotoMatched:true,authorizedReceiverMatched:true}; patch.handoffBy=actor; patch.handoffLocation=text(body.handoffLocation,120); }
        if (releaseStates.has(next) && item.agentId) {
          const capRef=db.collection('umnr_agent_capacity').doc(item.agentId);
          const cap=await tx.get(capRef);
          patch.agentId=next==='REJECTED'?'':item.agentId;
          tx.set(capRef,{count:Math.max(0,Number(cap.exists?cap.data().count:0)-1),updatedAt:now,lastReleasedServiceId:id},{merge:true});
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
