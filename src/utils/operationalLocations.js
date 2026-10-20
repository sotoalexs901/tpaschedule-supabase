// src/utils/operationalLocations.js
// Shared dynamic location catalog helpers for WCHR, UMNR and Smart Dispatch.
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const OPERATIONAL_LOCATIONS_COLLECTION = 'operational_locations';

export function subscribeOperationalLocations(onLocations, onError = console.error, includeInactive = false) {
  return onSnapshot(collection(db, OPERATIONAL_LOCATIONS_COLLECTION), snapshot => {
    const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onLocations(records.filter(x => includeInactive || x.active !== false).sort((a,b) => (a.area || '').localeCompare(b.area || '') || (a.name || '').localeCompare(b.name || '')));
  }, onError);
}

export function findOperationalLocation(locations, locationIdOrName) {
  const input = String(locationIdOrName || '').trim().toLowerCase();
  if (!input) return null;
  return locations.find(x => x.id.toLowerCase() === input || String(x.name || '').trim().toLowerCase() === input) || null;
}

export function operationalLocationOptions(locations) {
  return locations.map(x => ({ value: x.id, label: `${x.name} (${x.area})` }));
}
