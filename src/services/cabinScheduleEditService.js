import {
  doc,
  updateDoc,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export async function updateCabinSlot(slotId, updates) {
  const ref = doc(db, "cabinScheduleSlots", slotId);
  await updateDoc(ref, updates);
}

export async function bulkUpdateCabinSlots(slotUpdates) {
  const batch = writeBatch(db);

  slotUpdates.forEach(({ id, updates }) => {
    const ref = doc(db, "cabinScheduleSlots", id);
    batch.update(ref, updates);
  });

  await batch.commit();
}

export async function deleteCabinSlot(slotId) {
  const ref = doc(db, "cabinScheduleSlots", slotId);
  await deleteDoc(ref);
}

export async function deleteManyCabinSlots(slotIds = []) {
  const batch = writeBatch(db);

  slotIds.forEach((slotId) => {
    const ref = doc(db, "cabinScheduleSlots", slotId);
    batch.delete(ref);
  });

  await batch.commit();
}

export async function deleteCabinSchedule(scheduleId) {
  const scheduleRef = doc(db, "cabinSchedules", scheduleId);

  const [slotsSnap, flightsSnap, demandSnap] = await Promise.all([
    getDocs(
      query(collection(db, "cabinScheduleSlots"), where("scheduleId", "==", scheduleId))
    ),
    getDocs(
      query(collection(db, "cabinScheduleFlights"), where("scheduleId", "==", scheduleId))
    ),
    getDocs(
      query(
        collection(db, "cabinScheduleDemandBlocks"),
        where("scheduleId", "==", scheduleId)
      )
    ),
  ]);

  const batch = writeBatch(db);

  slotsSnap.forEach((d) => batch.delete(d.ref));
  flightsSnap.forEach((d) => batch.delete(d.ref));
  demandSnap.forEach((d) => batch.delete(d.ref));
  batch.delete(scheduleRef);

  await batch.commit();
}
