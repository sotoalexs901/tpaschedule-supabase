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
