import { collection, doc, onSnapshot, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const GSE_STATUS = { PENDING: 'PENDING_INSPECTION', IN: 'IN_SERVICE', OUT: 'OUT_OF_SERVICE' };
export const GSE_LOCATIONS = ['Parking Area 1', 'Parking Area 2', 'Maintenance Area', 'Other'];
export function watchGse(callback, onError) {
  return onSnapshot(collection(db, 'gse_equipment'), snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
export function getGseCode(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return String(url.searchParams.get('gse') || url.pathname.split('/').filter(Boolean).pop() || '').trim().toUpperCase();
  } catch { return value.toUpperCase(); }
}
export async function inspectGse({ code, condition, location, notes, user }) {
  if (!user?.id) throw new Error('User identity is required.');
  const id = getGseCode(code);
  if (!/^[A-Z0-9_-]{3,60}$/.test(id)) throw new Error('Invalid equipment ID.');
  if (!GSE_LOCATIONS.includes(location)) throw new Error('Select a valid location.');
  if (!['IN_SERVICE', 'OUT_OF_SERVICE'].includes(condition)) throw new Error('Invalid condition.');
  if (condition === 'OUT_OF_SERVICE' && !notes?.trim()) throw new Error('A maintenance reason is required.');
  const ref = doc(db, 'gse_equipment', id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Equipment not registered. Ask management to create it first.');
    const current = snap.data();
    if (current.status === GSE_STATUS.OUT && condition === GSE_STATUS.IN) {
      throw new Error('Out of Service equipment requires management release.');
    }
    const event = doc(collection(db, 'gse_inspections'));
    tx.update(ref, { status: condition, location, lastInspectionAt: serverTimestamp(), lastInspectedBy: user.id, updatedAt: serverTimestamp() });
    tx.set(event, { equipmentId: id, condition, location, notes: String(notes || '').trim(), employeeId: user.id, employeeName: user.displayName || user.fullName || user.name || user.username || '', createdAt: serverTimestamp(), eventType: 'INSPECTION' });
  });
}
export async function registerGse({ code, type, serialNumber, location, user }) {
  const id = getGseCode(code);
  if (!/^[A-Z0-9_-]{3,60}$/.test(id)) throw new Error('Equipment ID must contain 3–60 letters, numbers, underscores or hyphens.');
  if (!type.trim() || !GSE_LOCATIONS.includes(location)) throw new Error('Type and location are required.');
  const ref = doc(db, 'gse_equipment', id);
  await runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) throw new Error('Equipment ID already exists.');
    tx.set(ref, { equipmentCode: id, equipmentType: type.trim(), serialNumber: serialNumber.trim(), location, status: GSE_STATUS.PENDING, createdBy: user.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), gpsDeviceId: null });
  });
}
export async function releaseGse({ equipment, user, notes }) {
  if (!notes.trim()) throw new Error('Release notes are required.');
  const ref = doc(db, 'gse_equipment', equipment.id);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== GSE_STATUS.OUT) throw new Error('Equipment is not currently Out of Service.');
    const event = doc(collection(db, 'gse_inspections'));
    tx.update(ref, { status: GSE_STATUS.PENDING, releaseAuthorizedBy: user.id, releaseNotes: notes.trim(), updatedAt: serverTimestamp() });
    tx.set(event, { equipmentId: equipment.id, eventType: 'MANAGEMENT_RELEASE', employeeId: user.id, notes: notes.trim(), createdAt: serverTimestamp() });
  });
}
