// Netlify Scheduled Function. Requires @netlify/functions and firebase-admin.
// Runs every five minutes; uses Firebase Admin credentials only on server.
const { schedule } = require('@netlify/functions');
const admin = require('firebase-admin');
const TZ = 'America/New_York';
const C = { rules:'smart_intelligence_department_rules', assignments:'smart_intelligence_daily_assignments', ledger:'smart_intelligence_shift_responsibilities', audit:'smart_intelligence_audit', alerts:'smart_intelligence_alerts' };
const str = x => String(x ?? '').trim();
const upper = x => str(x).toUpperCase();
const slug = x => str(x).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-+$/g,'');
const safe = x => str(x).replace(/[^a-zA-Z0-9_-]/g,'_');
const name = u => u.displayName || u.fullName || u.name || u.username || 'Duty Manager';
function db() {
  if (!admin.apps.length) {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON missing');
    const cred = JSON.parse(raw);
    if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g,'\n');
    admin.initializeApp({credential:admin.credential.cert(cred)});
  }
  return admin.firestore();
}
function localParts(d) {
  const a = new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
  const p = Object.fromEntries(a.map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, day:p.weekday.toLowerCase().slice(0,3), minute:(Number(p.hour)%24)*60+Number(p.minute)};
}
function dateOffset(key, offset) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); }
const DAYS=['sun','mon','tue','wed','thu','fri','sat'];
function minute(t) { const m=/^(\d{1,2}):(\d{2})$/.exec(str(t)); if(!m)return null; const h=+m[1], n=+m[2]; return h<24&&n<60?h*60+n:null; }
function covers(schedule,dateKey) {
  const weekday=DAYS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
  const label=str(schedule.days?.[weekday]);
  if (label) { const parts=label.split('/').map(Number); if(parts.length===2 && parts.every(Number.isFinite)) return `${parts[0]}/${parts[1]}`===`${+dateKey.slice(5,7)}/${+dateKey.slice(8,10)}`; }
  const start=str(schedule.weekStart||schedule.weekTag).slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(start) && dateKey>=start && dateKey<=dateOffset(start,6);
}
function title(s) {return [s.name,s.title,s.scheduleName,s.department,s.airline,s.airlineDisplayName,s.account].map(x=>upper(x).replace(/[^A-Z0-9]+/g,' ').trim());}
function isDelta(dep) { const s=upper(dep); return s==='DL'||s.includes('DELTA')||s.includes('CABIN'); }
function scheduleMatch(s,delta) {
  if(upper(s.status||'APPROVED')!=='APPROVED')return false;
  const labels=title(s);
  return delta ? labels.some(x=>['CABIN SERVICE','DL CABIN SERVICE','DELTA CABIN SERVICE'].includes(x)) : labels.some(x=>['EULEN MANAGEMENT DUTYS MANAGERS','EULEN MANAGEMENT DUTY MANAGERS'].includes(x));
}
function findUser(row,employees,users) {
  const emp=employees.get(str(row.employeeId));
  const id=str(row.userId||row.linkedUserId||emp?.linkedUserId);
  let u=users.get(id);
  if(!u && emp) u=[...users.values()].find(x=>str(x.employeeId)===str(emp.id)||str(x.linkedEmployeeId)===str(emp.id));
  return upper(u?.role)==='DUTY_MANAGER'?u:null;
}
function coverage({rule,schedules,employees,users,now}) {
  const here=localParts(now), yesterday=dateOffset(here.date,-1), prevDay=DAYS[(DAYS.indexOf(here.day)+6)%7];
  const matches=schedules.filter(s=>scheduleMatch(s,isDelta(rule.department)));
  const slots=[];
  for(const s of matches) for(const row of (Array.isArray(s.grid)?s.grid:[])) {
    const u=findUser(row,employees,users); if(!u)continue;
    for(const [day,dateKey] of [[here.day,here.date],[prevDay,yesterday]]) {
      if(!covers(s,dateKey))continue;
      for(const shift of (Array.isArray(row[day])?row[day]:[])) {
        const start=minute(shift.start),end=minute(shift.end);
        if(start===null||end===null||start===end)continue;
        const active=day===here.day ? (end>start ? here.minute>=start&&here.minute<end : here.minute>=start) : (end<start&&here.minute<end);
        if(!active)continue;
        const endDate=end<start?dateOffset(dateKey,1):dateKey;
        const endLocal=`${endDate}T${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`;
        slots.push({user:u,endLocal,scheduleId:s.id,shiftStartLocal:`${dateKey}T${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`});
      }
    }
  }
  return {slots, hasApprovedSchedule:matches.length>0};
}
function action(a) {return !!(a.dutyActionTakenAt||a.responsibleSupervisorSelectedAt||a.packageReviewedAt||a.completedAt||a.closedAt||(a.reportReviews&&Object.keys(a.reportReviews).length)||['COMPLETED','CLOSED','REVIEWED'].includes(upper(a.packageReviewStatus)));}
function complete(a) {return ['COMPLETED','CLOSED','REVIEW_COMPLETE'].includes(upper(a.packageReviewStatus||a.reviewStatus));}
function ledgerId(aid,uid,end) {return safe(`${aid}__${uid}__${end}`);}
async function recordPrevious(db,ref,previous) {
  if(!previous?.assignedDutyManagerId||!previous?.assignedShiftEndLocal)return;
  const lid=ledgerId(ref.id,previous.assignedDutyManagerId,previous.assignedShiftEndLocal);
  const lr=db.collection(C.ledger).doc(lid);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(lr); if(existing.exists){tx.update(lr,{hadActionAtHandoff:action(previous),handoffAt:admin.firestore.FieldValue.serverTimestamp()});return;}
    tx.create(lr,{assignmentId:ref.id,dateKey:previous.dateKey||'',department:previous.department||'',assignedDutyManagerId:previous.assignedDutyManagerId,assignedDutyManagerName:previous.assignedDutyManagerName||'',shiftEndLocal:previous.assignedShiftEndLocal,hadActionAtHandoff:action(previous),source:'smart_pool_server_v2',createdAt:admin.firestore.FieldValue.serverTimestamp()});
  });
}
async function run() {
  const store=db(),now=new Date(),here=localParts(now),nowKey=`${here.date}T${String(Math.floor(here.minute/60)).padStart(2,'0')}:${String(here.minute%60).padStart(2,'0')}`;
  const [rs,ss,es,us,as,ls]=await Promise.all([store.collection(C.rules).get(),store.collection('schedules').get(),store.collection('employees').get(),store.collection('users').get(),store.collection(C.assignments).where('dateKey','==',here.date).get(),store.collection(C.ledger).where('shiftEndLocal','<=',nowKey).get()]);
  const rules=rs.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.active!==false&&str(r.department)).sort((a,b)=>str(a.department).localeCompare(str(b.department)));
  const schedules=ss.docs.map(d=>({id:d.id,...d.data()})),employees=new Map(es.docs.map(d=>[d.id,{id:d.id,...d.data()}])),users=new Map(us.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  const existing=new Map(as.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  const load=new Map(),operations=[];let assigned=0,alerts=0,skipped=0;
  // Historical ledger is checked before new assignments. Alert IDs are deterministic.
  for(const d of ls.docs) {
    const l=d.data(); if(l.hadActionAtHandoff || l.alertedAt)continue;
    const id=`${d.id}__no_action`,ar=store.collection(C.alerts).doc(id),audit=store.collection(C.audit).doc(id);
    const made=await store.runTransaction(async tx=>{
      const [ledgerSnap,alertSnap]=await Promise.all([tx.get(d.ref),tx.get(ar)]);
      if(!ledgerSnap.exists||ledgerSnap.data().hadActionAtHandoff||ledgerSnap.data().alertedAt||alertSnap.exists)return false;
      const currentRef=store.collection(C.assignments).doc(l.assignmentId);
      const currentSnap=await tx.get(currentRef);
      const current=currentSnap.exists?currentSnap.data():null;
      if(current&&current.assignedDutyManagerId===l.assignedDutyManagerId&&current.assignedShiftEndLocal===l.shiftEndLocal&&action(current)){
        tx.update(d.ref,{hadActionAtHandoff:true,actionVerifiedAt:admin.firestore.FieldValue.serverTimestamp()});return false;
      }
      const data={dateKey:l.dateKey||'',assignmentId:l.assignmentId||'',department:l.department||'',assignedDutyManagerId:l.assignedDutyManagerId||'',assignedDutyManagerName:l.assignedDutyManagerName||'',shiftEndLocal:l.shiftEndLocal||'',alertType:'DUTY_SHIFT_ENDED_NO_ACTION',source:'smart_pool_server_v2',createdAt:admin.firestore.FieldValue.serverTimestamp()};
      tx.create(ar,{...data,active:true,severity:'HIGH',targetRole:'station_manager',audience:'STATION_MANAGER',title:`${l.department||'Department'}: shift ended without action`,message:`${l.assignedDutyManagerName||'Duty Manager'} ended the shift at ${l.shiftEndLocal} without a recorded action.`});
      tx.create(audit,{...data,eventType:'DUTY_SHIFT_ENDED_NO_ACTION'});
      tx.update(d.ref,{alertedAt:admin.firestore.FieldValue.serverTimestamp()});return true;
    });if(made)alerts++;
  }
  for(const rule of rules) {
    const id=`${here.date}__${slug(rule.id||rule.department)}`,ref=store.collection(C.assignments).doc(id),old=existing.get(id);
    if(old&&complete(old)){skipped++;continue;}
    const {slots,hasApprovedSchedule}=coverage({rule,schedules,employees,users,now});
    // Safety: no verified approved schedule means no server-side mutation.
    if(!hasApprovedSchedule){skipped++;continue;}
    const allowed=slots.filter(s=>upper(rule.reviewMode)!=='DEDICATED'||(rule.dedicatedDutyManagerIds||[]).includes(s.user.id));
    const distinct=[...new Map(allowed.map(s=>[s.user.id,s])).values()];
    distinct.sort((a,b)=>(load.get(a.user.id)||0)-(load.get(b.user.id)||0)||name(a.user).localeCompare(name(b.user)));
    const chosen=distinct[0];
    if(!chosen){skipped++;continue;} // Do not clear assignments outside shift coverage.
    const changed=old?.assignedDutyManagerId!==chosen.user.id||old?.assignedShiftEndLocal!==chosen.endLocal;
    if(old&&changed) await recordPrevious(store,ref,old);
    const lid=ledgerId(id,chosen.user.id,chosen.endLocal),lr=store.collection(C.ledger).doc(lid);
    const payload={dateKey:here.date,ruleId:rule.id,department:rule.department,assignedDutyManagerId:chosen.user.id,assignedDutyManagerName:name(chosen.user),assignedDutyManagerDepartment:chosen.user.department||'',assignedReviewerRole:'duty_manager',assignedShiftEndLocal:chosen.endLocal,dutyScheduleSource:isDelta(rule.department)?'approved_cabin_service_schedule':'approved_eulen_management_dutys_managers',dutyApprovedScheduleIds:[chosen.scheduleId],balancingStrategy:'least_loaded_scheduled_pool_server',assignmentSource:'smart_pool_server_v2',status:'ASSIGNED',updatedAt:admin.firestore.FieldValue.serverTimestamp()};
    if(!old){payload.createdAt=admin.firestore.FieldValue.serverTimestamp();payload.requiredReports=Array.isArray(rule.requiredReports)?rule.requiredReports:[];payload.reviewMode=rule.reviewMode||'GENERAL_POOL';payload.dutyActionTakenAt=null;}
    else if(changed){payload.dutyActionTakenAt=null;}
    // Atomic ownership check: another client may have changed the assignment while we were processing.
    const saved=await store.runTransaction(async tx=>{
      const live=await tx.get(ref);const current=live.exists?live.data():null;
      if(current&&complete(current))return false;
      if(old&&current&&(current.assignedDutyManagerId!==old.assignedDutyManagerId||current.assignedShiftEndLocal!==old.assignedShiftEndLocal))return false;
      if(!old&&current)return false;
      const ledger=await tx.get(lr);
      if(!ledger.exists)tx.create(lr,{assignmentId:id,dateKey:here.date,department:rule.department,assignedDutyManagerId:chosen.user.id,assignedDutyManagerName:name(chosen.user),shiftStartLocal:chosen.shiftStartLocal,shiftEndLocal:chosen.endLocal,hadActionAtHandoff:false,source:'smart_pool_server_v2',createdAt:admin.firestore.FieldValue.serverTimestamp()});
      if(changed||!old)tx.set(ref,payload,{merge:true});return true;
    });
    if(saved){load.set(chosen.user.id,(load.get(chosen.user.id)||0)+1);if(changed||!old)assigned++;}
    operations.push({department:rule.department,dutyManager:name(chosen.user),changed:!!changed});
  }
  // Close out expired responsibilities even if the original daily assignment was rebalanced.
  // A ledger created before a handoff is immutable; mark action at handoff, never infer from a new owner's action.
  console.log(JSON.stringify({task:'smart-intelligence-pool',now:nowKey,rules:rules.length,assigned,alerts,skipped,inspectedLedgers:ls.size}));
  return {statusCode:200};
}
exports.handler=schedule('*/5 * * *',run);
