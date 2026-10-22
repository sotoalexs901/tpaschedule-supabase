// src/utils/operationalGeofence.js
// Uses saved operational_locations; no additional collection or third-party API.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function matchOperationalLocation(coords, locations) {
  const lat=Number(coords?.latitude), lon=Number(coords?.longitude), accuracy=Number(coords?.accuracy);
  if (!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(accuracy)||accuracy>100) return null;
  const matches=(locations||[]).filter(x=>x.active!==false && Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
    .map(x=>({ ...x, distance_m:distanceMeters(lat,lon,Number(x.latitude),Number(x.longitude)), radius_m:Number(x.radiusMeters)||60 }))
    .filter(x=>x.distance_m<=x.radius_m && accuracy<=Math.max(25,x.radius_m))
    .sort((a,b)=>a.distance_m-b.distance_m);
  // Avoid guessing when adjacent registered areas are indistinguishable within GPS accuracy.
  if(matches.length>1 && matches[1].distance_m-matches[0].distance_m<Math.max(15,accuracy)) return null;
  return matches[0]||null;
}
