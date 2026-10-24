const admin = require("firebase-admin");

function clean(v) { return String(v ?? "").trim(); }
function upper(v) { return clean(v).toUpperCase().replace(/\s+/g, ""); }
function displayUpper(v) { return clean(v).toUpperCase(); }
function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = clean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (!raw) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not configured.");
  const sa = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: clean(sa.private_key).replace(/\\n/g, "\n") }) });
}
function tampaDateKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function millis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  const n = new Date(v).getTime();
  return Number.isNaN(n) ? 0 : n;
}
function distanceMeters(a, b) {
  const lat1 = Number(a?.latitude), lon1 = Number(a?.longitude), lat2 = Number(b?.latitude), lon2 = Number(b?.longitude);
  if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return null;
  const r = Math.PI / 180, dLat = (lat2-lat1)*r, dLon=(lon2-lon1)*r;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0,1-x)));
}
function gateNumber(v) { const m = displayUpper(v).match(/(?:GATE\s*)?F\s*(\d{2,3})/); return m ? Number(m[1]) : null; }
function normalizeGate(v) { const n = gateNumber(v); return n ? `F${n}` : displayUpper(v).replace(/^GATE\s+/, ""); }
function flightTokens(obj) {
  const num = upper(obj.flight_number || obj.flightNumber || "");
  const airline = upper(obj.airline || "");
  const full = upper(obj.flightNumber || `${airline}${num}`);
  const set = new Set([num, full]);
  if (airline && num && !num.startsWith(airline)) set.add(`${airline}${num}`);
  return set;
}
function flightsMatch(a,b) { const aa=flightTokens(a), bb=flightTokens(b); for (const x of aa) if (x && bb.has(x)) return true; return false; }
function currentLocation(agent) { return clean(agent.current_location || agent.location || agent.ready_location || ""); }
function isEligible(agent, umnrCount) {
  return displayUpper(agent.status) === "ACTIVE" && displayUpper(agent.availability_status) === "AVAILABLE" && !clean(agent.active_report_id) && !clean(agent.active_wheelchair_number) && Number(umnrCount || 0) === 0 && displayUpper(agent.shift_mode || "WCHR_AGENT") !== "LOBBY_AGENT";
}
function findGateLocation(locations, gate) {
  const target = normalizeGate(gate);
  return locations.find(l => l.active !== false && [l.id,l.locationId,l.name].some(v => normalizeGate(v) === target)) || null;
}
function locationMatches(location, value) {
  const target=upper(value);
  if(!target) return false;
  return [location?.id,location?.locationId,location?.name].some(v=>upper(v)===target);
}
function nearestLocationForGps(gps, locations) {
  let best=null;
  for(const location of locations){
    const d=distanceMeters(gps,location);
    if(d===null) continue;
    if(!best || d<best.distance) best={location,distance:d};
  }
  return best;
}
function routeAggregate(routes, originId, destinationId, mode="WCHR") {
  const direct=routes.filter(r=>displayUpper(r.status)==="COMPLETED" && displayUpper(r.routeMode||"WCHR")===displayUpper(mode) && clean(r.originLocationId)===clean(originId) && clean(r.destinationLocationId)===clean(destinationId));
  if(direct.length){
    const seconds=Math.round(direct.reduce((sum,r)=>sum+Number(r.durationSeconds||0),0)/direct.length);
    return {seconds,samples:direct.length,method:"recorded_route",confidence:direct.length>=3?"HIGH":"MEDIUM"};
  }
  const reverse=routes.filter(r=>displayUpper(r.status)==="COMPLETED" && displayUpper(r.routeMode||"WCHR")===displayUpper(mode) && clean(r.originLocationId)===clean(destinationId) && clean(r.destinationLocationId)===clean(originId));
  if(reverse.length){
    const seconds=Math.round(reverse.reduce((sum,r)=>sum+Number(r.durationSeconds||0),0)/reverse.length);
    return {seconds,samples:reverse.length,method:"reverse_recorded_route",confidence:"MEDIUM"};
  }
  return null;
}
function rankAgent(agent, gate, gateLocation, locations, routes) {
  const loc = currentLocation(agent);
  const targetGate = gateNumber(gate), agentGate = gateNumber(loc);
  let score = 999999, method = "reported", distance = null, routeEtaSeconds = null, routeSamples = 0, routeConfidence = "UNKNOWN", routeOriginName = "";
  const gps = agent.live_gps || {};
  const age = Date.now() - millis(gps.recorded_at);
  let originLocation = locations.find(location => locationMatches(location, loc)) || null;
  if (!originLocation && agent.live_tracking_consent === true && age >= 0 && age <= 3*60000) {
    originLocation = nearestLocationForGps(gps, locations)?.location || null;
  }
  if (originLocation && gateLocation) {
    if (clean(originLocation.id) === clean(gateLocation.id)) {
      score = 0; method = "same_location"; routeEtaSeconds = 0; routeConfidence = "HIGH"; routeOriginName = clean(originLocation.name);
    } else {
      const route = routeAggregate(routes, originLocation.id, gateLocation.id, "WCHR");
      if (route && Number.isFinite(route.seconds) && route.seconds > 0) {
        routeEtaSeconds = route.seconds; routeSamples = route.samples; routeConfidence = route.confidence; routeOriginName = clean(originLocation.name);
        score = Math.min(score, route.seconds); method = route.method;
      }
    }
  }
  if (agent.live_tracking_consent === true && age >= 0 && age <= 3*60000 && gateLocation) {
    distance = distanceMeters(gps, gateLocation);
    if (distance !== null && !Number.isFinite(routeEtaSeconds)) { score = Math.min(score, 5000 + distance); method = "gps"; }
  }
  if (normalizeGate(loc) && normalizeGate(loc) === normalizeGate(gate)) { score = Math.min(score, 0); method = "same_gate"; routeEtaSeconds = 0; routeConfidence = "HIGH"; }
  else if (targetGate && agentGate && !Number.isFinite(routeEtaSeconds)) { score = Math.min(score, 10000 + Math.abs(targetGate-agentGate)*110); method = method === "gps" ? method : "gate_proximity"; }
  else if ((/AIRSIDE\s*F/i.test(loc) || /^F\d+/i.test(loc)) && !Number.isFinite(routeEtaSeconds)) { score = Math.min(score, 15000); }
  return { score, method, distance, routeEtaSeconds, routeSamples, routeConfidence, routeOriginName };
}
function makeCandidate(agent, ranked) {
  return {
    agent_id: clean(agent.agent_id || agent.id),
    agent_name: clean(agent.agent_name || agent.name || agent.displayName || agent.username || "WCHR Agent"),
    user_id: clean(agent.user_id || agent.userId || agent.aerostation_user_id || ""),
    employee_id: clean(agent.employee_id || agent.agent_id || agent.id || ""),
    username: clean(agent.login_username || agent.loginUsername || agent.username || ""),
    location: currentLocation(agent) || "Location not reported",
    distance_meters: ranked.distance,
    proximity_method: ranked.method,
    route_eta_seconds: ranked.routeEtaSeconds,
    route_eta_minutes: Number.isFinite(ranked.routeEtaSeconds) ? Math.max(0, Math.round(ranked.routeEtaSeconds / 60)) : null,
    route_samples: ranked.routeSamples || 0,
    route_confidence: ranked.routeConfidence || "UNKNOWN",
    route_origin_name: ranked.routeOriginName || "",
    score: ranked.score,
  };
}
function stageFor(minutes, eligible, near, confirmed, flightStatus) {
  const fs = displayUpper(flightStatus);
  if (["LANDED","ARRIVED","COMPLETED","CANCELLED"].includes(fs)) return "COMPLETE";
  if (confirmed) return "READY";
  if (minutes === null || minutes > 30) return "MONITORING";
  if (!eligible) return "NO_COVERAGE";
  if (minutes <= 10) return "ACTION_REQUIRED";
  if (minutes <= 15) return "STAGE_NOW";
  return "PREPARE";
}
async function usersByRole(db, roles) {
  const snap = await db.collection("users").get();
  return snap.docs.map(d=>({id:d.id,data:d.data()||{}})).filter(u=>roles.includes(clean(u.data.role).toLowerCase()));
}
async function notifyUsers(db, userIds, copy, readinessId, urgency="normal") {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const batch = db.batch();
  ids.forEach(id => {
    const ref = db.collection("notifications").doc();
    batch.set(ref, { userId:id, type:"arrival_readiness", title:copy.title, message:copy.body, link:"/wchr/dispatch", read:false, createdBy:"AeroStation Arrival Readiness", entityId:readinessId, entityType:"arrival_readiness", createdAt:admin.firestore.FieldValue.serverTimestamp(), updatedAt:admin.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
  const tokens=[];
  await Promise.all(ids.map(async id=>{ const snap=await db.collection("users").doc(id).collection("pushTokens").where("enabled","==",true).get(); snap.docs.forEach(d=>{const t=clean(d.data()?.token);if(t)tokens.push(t);}); }));
  const uniq=[...new Set(tokens)];
  for(let i=0;i<uniq.length;i+=500){
    await admin.messaging().sendEachForMulticast({ tokens:uniq.slice(i,i+500), data:{title:copy.title,body:copy.body,url:"/wchr/dispatch",type:"arrival_readiness",arrivalReadinessId:readinessId}, webpush:{headers:{Urgency:urgency}} });
  }
}
function alertCopy(stage, flightLabel, gate, minutes, count, candidates) {
  const names=candidates.slice(0,2).map(x=>x.agent_name).filter(Boolean).join(" and ");
  if(stage==="PREPARE") return {title:`${flightLabel} WCHR preparation`,body:`ETA ${minutes} min · Gate ${gate}. ${count} WCHR service${count===1?"":"s"} expected. Review staffing and staging.`};
  if(stage==="STAGE_NOW") return {title:`${flightLabel} approaching · Gate ${gate}`,body:`ETA ${minutes} min. ${names ? `${names} are the nearest available WCHR agents. `:""}Prepare for arrival; supervisor confirms assignment.`};
  if(stage==="NO_COVERAGE") return {title:`${flightLabel} WCHR coverage required`,body:`ETA ${minutes} min · Gate ${gate}. No eligible punched-in WCHR agent is currently available.`};
  if(stage==="ACTION_REQUIRED") return {title:`${flightLabel} action required`,body:`ETA ${minutes} min · Gate ${gate}. No nearby WCHR staging is confirmed. Supervisor/Duty Manager review required.`};
  return null;
}
async function runArrivalReadinessSync() {
  getAdminApp(); const db=admin.firestore(); const today=tampaDateKey();
  const [flightsSnap, watchSnap, shiftsSnap, capSnap, locSnap, routeSnap, reportsSnap, readinessSnap] = await Promise.all([
    db.collection("wchr_daily_flights").where("service_date","==",today).get(),
    db.collection("flight_watchlist").where("enabled","==",true).get(),
    db.collection("wchr_agent_shifts").get(),
    db.collection("umnr_agent_capacity").get(),
    db.collection("operational_locations").get(),
    db.collection("operational_routes").get(),
    db.collection("wch_reports").get(),
    db.collection("arrival_readiness").get(),
  ]);
  const watches=watchSnap.docs.map(d=>({id:d.id,...d.data()}));
  const shifts=shiftsSnap.docs.map(d=>({id:d.id,...d.data()}));
  const caps=new Map(capSnap.docs.map(d=>[d.id,Number(d.data()?.count||0)]));
  const locations=locSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.active!==false);
  const routes=routeSnap.docs.map(d=>({id:d.id,...d.data()}));
  const reports=reportsSnap.docs.map(d=>({id:d.id,...d.data()}));
  const old=new Map(readinessSnap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  const managers=await usersByRole(db,["station_manager","duty_manager","supervisor"]);
  const results=[];
  for(const fdoc of flightsSnap.docs){
    const flight={id:fdoc.id,...fdoc.data()};
    if(flight.active===false || displayUpper(flight.status||"OPEN")==="CLOSED" || !clean(flight.gate)) continue;
    const watch=watches.find(w=>String(w.flightDate||"")===today && flightsMatch(flight,w));
    const etaMs=millis(watch?.eta || watch?.estimatedIn); const minutes=etaMs?Math.round((etaMs-Date.now())/60000):null;
    const gateLocation=findGateLocation(locations,flight.gate);
    const eligible=shifts.filter(a=>isEligible(a,caps.get(a.id))).map(a=>({agent:a,rank:rankAgent(a,flight.gate,gateLocation,locations,routes)})).sort((a,b)=>a.rank.score-b.rank.score);
    const candidates=eligible.slice(0,5).map(x=>makeCandidate(x.agent,x.rank));
    const near=candidates.filter(x => Number.isFinite(Number(x.route_eta_seconds)) ? Number(x.route_eta_seconds) <= 5*60 : (Number.isFinite(Number(x.distance_meters)) && Number(x.distance_meters) <= 900) || ["same_gate","same_location"].includes(x.proximity_method)).length;
    const serviceCount=reports.filter(r=>String(r.flight_date||r.service_date||"")===today && flightsMatch(flight,r) && !["CANCELLED","COMPLETED","DELIVERED"].includes(displayUpper(r.status))).length;
    const prev=old.get(flight.id)||{};
    const status=stageFor(minutes,eligible.length,near,prev.staging_confirmed===true,watch?.status);
    const flightLabel=`${displayUpper(flight.airline)} ${displayUpper(flight.flight_number)}`.trim();
    const payload={ service_date:today, flight_id:flight.id, flight_label:flightLabel, airline:displayUpper(flight.airline), flight_number:displayUpper(flight.flight_number), gate:displayUpper(flight.gate), flight_watch_id:watch?.id||"", flight_status:displayUpper(watch?.status||"MONITORING"), eta:watch?.eta||watch?.estimatedIn||null, minutes_to_arrival:minutes, expected_wchr_count:serviceCount, eligible_agent_count:eligible.length, near_gate_count:near, recommended_agents:candidates, status, active:!["COMPLETE"].includes(status), updated_at:admin.firestore.FieldValue.serverTimestamp() };
    await db.collection("arrival_readiness").doc(flight.id).set(payload,{merge:true});
    const alertStages=new Set(["PREPARE","STAGE_NOW","NO_COVERAGE","ACTION_REQUIRED"]);
    if(alertStages.has(status) && prev.last_alert_stage!==status){
      const copy=alertCopy(status,flightLabel,flight.gate,minutes,serviceCount,candidates);
      if(copy){
        let ids=managers.map(u=>u.id);
        if(status==="STAGE_NOW") ids=ids.concat(candidates.slice(0,2).map(c=>c.user_id));
        await notifyUsers(db,ids,copy,flight.id,["NO_COVERAGE","ACTION_REQUIRED"].includes(status)?"high":"normal");
      }
      await db.collection("arrival_readiness").doc(flight.id).set({last_alert_stage:status,last_alert_at:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    results.push({flight:flightLabel,status,minutes,candidates:candidates.length,near});
  }
  return {ok:true,date:today,checked:flightsSnap.size,results};
}
module.exports={runArrivalReadinessSync};
