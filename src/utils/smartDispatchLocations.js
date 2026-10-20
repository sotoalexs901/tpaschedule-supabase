// src/utils/smartDispatchLocations.js
// Location normalization and advisory matching. No writes or auto-assignments.
// Configure adjacency only after airport operations verifies walking routes.
export const TPA_OPERATIONAL_LOCATIONS = [
  { id: 'WL_COUNTER', label: 'WL Counter', zone: 'MAIN_TERMINAL' },
  { id: 'AV_COUNTER', label: 'AV Counter', zone: 'MAIN_TERMINAL' },
  { id: 'COUNTER', label: 'Counter', zone: 'MAIN_TERMINAL' },
  { id: 'ESA', label: 'ESA', zone: 'MAIN_TERMINAL' },
  { id: 'CBP', label: 'CBP / Customs', zone: 'ARRIVALS' },
  { id: 'BLUE_DOOR_225', label: 'Blue Door 225', zone: 'ARRIVALS' },
  ...Array.from({ length: 13 }, (_, i) => ({ id: `F${i + 78}`, label: `Gate F${i + 78}`, zone: 'AIRSIDE_F' })),
  { id: 'OTHER', label: 'Other (specify)', zone: 'OTHER' },
];
const compact = (s) => String(s ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const known = new Map(TPA_OPERATIONAL_LOCATIONS.filter(x => x.id !== 'OTHER').flatMap(x => [[compact(x.id), x.id], [compact(x.label), x.id]]));
export function normalizeOperationalLocation(raw, catalog = []) {
  const text = String(raw ?? '').trim();
  if (!text) return { id: '', label: '', known: false };
  const dynamic = catalog.find(x => x.active !== false && [x.id, x.locationId, x.name].some(v => compact(v) === compact(text)));
  if (dynamic) return { id: dynamic.id, label: dynamic.name, known: true, dynamic: true };
  const id = known.get(compact(text)) || '';
  return { id, label: id ? TPA_OPERATIONAL_LOCATIONS.find(x => x.id === id).label : text, known: !!id };
}
// QR payload is deliberately a location identifier only, never an assignment or authentication token.
// Encode as: AEROLOCATION:WL_COUNTER (or AEROLOCATION:F83)
export function parseLocationQr(payload) {
  const value = String(payload ?? '').trim();
  if (!/^AEROLOCATION:[A-Z0-9_]+$/i.test(value)) return null;
  const location = normalizeOperationalLocation(value.slice('AEROLOCATION:'.length));
  return location.known ? location : null;
}
export function rankAgentsForService({ serviceLocation, agents = [], isEligible = () => true, adjacency = {}, now = Date.now(), maxAgeMinutes = 20, catalog = [] }) {
  const service = normalizeOperationalLocation(serviceLocation, catalog);
  if (!service.label) return { service, candidates: [], warning: 'Pickup location is missing.' };
  const candidates = agents.filter(isEligible).map(agent => {
    const location = normalizeOperationalLocation(agent.current_location, catalog);
    const exact = !!location.label && compact(location.label) === compact(service.label);
    const nearby = !exact && !!service.id && !!location.id && (adjacency[service.id] || []).includes(location.id);
    const updatedAt = agent.location_updated_at || agent.locationUpdatedAt || agent.updated_at;
    const millis = typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : typeof updatedAt === 'number' ? (updatedAt < 1e11 ? updatedAt * 1000 : updatedAt) : Date.parse(updatedAt || '');
    const ageMinutes = Number.isFinite(millis) ? (now - millis) / 60000 : null;
    const fresh = ageMinutes !== null && ageMinutes >= 0 && ageMinutes <= maxAgeMinutes;
    // Missing timestamp cannot be treated as live evidence.
    const tier = fresh && exact ? 0 : fresh && nearby ? 1 : exact ? 2 : nearby ? 3 : 4;
    return { agent, location: location.label || 'Not reported', exact, nearby, fresh, ageMinutes, tier };
  }).sort((a, b) => a.tier - b.tier || String(a.agent.name || a.agent.agent_name || '').localeCompare(String(b.agent.name || b.agent.agent_name || '')));
  return { service, candidates, warning: 'Recommendations are advisory. Verify location freshness and agent availability; supervisor must confirm the assignment.' };
}


// Phase 4: read-only GPS matching to Duty Manager reference points.
// Distance is straight-line only, not walking distance or indoor gate confirmation.
export function gpsTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const n = typeof value === 'number' ? (value < 1e11 ? value * 1000 : value) : Date.parse(value);
  return Number.isFinite(n) ? n : 0;
}
export function validGpsCoordinates(latitude, longitude) {
  const lat = Number(latitude), lng = Number(longitude);
  return latitude !== null && latitude !== undefined && latitude !== '' &&
    longitude !== null && longitude !== undefined && longitude !== '' &&
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
export function gpsDistanceMeters(lat1, lng1, lat2, lng2) {
  if (!validGpsCoordinates(lat1, lng1) || !validGpsCoordinates(lat2, lng2)) return null;
  const radians = Math.PI / 180;
  const dLat = (Number(lat2) - Number(lat1)) * radians;
  const dLng = (Number(lng2) - Number(lng1)) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(lat1) * radians) * Math.cos(Number(lat2) * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function nearestOperationalLocation(gps, catalog = [], { now = Date.now(), maxAgeMinutes = 3 } = {}) {
  const ageMs = now - gpsTimestampMillis(gps?.recorded_at);
  const fresh = ageMs >= 0 && ageMs <= maxAgeMinutes * 60000;
  if (!gps || !validGpsCoordinates(gps.latitude, gps.longitude)) return { status: 'NO_GPS', fresh: false, nearest: null };
  if (!fresh) return { status: 'STALE', fresh: false, nearest: null, ageMinutes: Math.max(0, ageMs / 60000) };
  const matches = catalog.filter(x => x.active !== false && validGpsCoordinates(x.latitude, x.longitude))
    .map(x => ({ location: x, distanceMeters: gpsDistanceMeters(gps.latitude, gps.longitude, x.latitude, x.longitude) }))
    .filter(x => x.distanceMeters !== null).sort((a, b) => a.distanceMeters - b.distanceMeters);
  return { status: matches.length ? 'ESTIMATED' : 'NO_REFERENCE_POINTS', fresh: true,
    nearest: matches[0] || null, ageMinutes: ageMs / 60000,
    accuracyMeters: Number.isFinite(Number(gps.accuracy_m)) && gps.accuracy_m != null ? Number(gps.accuracy_m) : null };
}
export function gpsRankAgentsForService({ serviceLocation, agents = [], catalog = [], isEligible = () => true, now = Date.now() }) {
  const service = normalizeOperationalLocation(serviceLocation, catalog);
  const reference = catalog.find(x => x.active !== false && validGpsCoordinates(x.latitude, x.longitude) &&
    [x.id, x.locationId, x.name].some(v => compact(v) === compact(serviceLocation) || compact(v) === compact(service.id)));
  if (!reference) return null; // Caller can use legacy advisory ranking.
  const candidates = agents.filter(isEligible).map(agent => {
    const estimate = agent.live_tracking_consent === true ? nearestOperationalLocation(agent.live_gps, catalog, { now }) : { status: 'NO_CONSENT', fresh: false, nearest: null };
    const gps = agent.live_gps;
    const distanceMeters = estimate.fresh ? gpsDistanceMeters(gps.latitude, gps.longitude, reference.latitude, reference.longitude) : null;
    return { agent, location: estimate.nearest?.location?.name || agent.current_location || 'Not reported',
      distanceMeters, gpsEstimate: estimate, exact: false, nearby: false, fresh: estimate.fresh,
      tier: distanceMeters === null ? 1 : 0 };
  }).sort((a,b) => a.tier - b.tier || (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  return { service, reference, candidates, warning: 'GPS distances are straight-line estimates, not walking times or confirmed indoor locations. Review availability and verify before assignment.' };
}
