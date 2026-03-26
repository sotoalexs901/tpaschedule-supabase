import {
  addDoc,
  collection,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

export async function saveCabinWeeklySchedule({
  weekStartDate,
  weeklyFlights,
  weeklyDemandBlocks,
  weeklySlots,
  createdBy,
}) {
  const scheduleRef = await addDoc(collection(db, "cabinSchedules"), {
    type: "weekly",
    department: "CABIN",
    weekStartDate,
    createdBy: createdBy || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    uploadedDays: Object.keys(weeklyFlights || {}),
    totalFlights: Object.values(weeklyFlights || {}).reduce(
      (sum, flights) => sum + flights.length,
      0
    ),
    totalSlots: Object.values(weeklySlots || {}).flat().length,
    status: "draft",
  });

  const batch = writeBatch(db);

  Object.entries(weeklyFlights || {}).forEach(([dayKey, flights]) => {
    flights.forEach((flight, index) => {
      const ref = doc(collection(db, "cabinScheduleFlights"));
      batch.set(ref, {
        scheduleId: scheduleRef.id,
        dayKey,
        index,
        ...flight,
        createdAt: serverTimestamp(),
      });
    });
  });

  Object.entries(weeklyDemandBlocks || {}).forEach(([dayKey, blocks]) => {
    blocks.forEach((block, index) => {
      const ref = doc(collection(db, "cabinScheduleDemandBlocks"));
      batch.set(ref, {
        scheduleId: scheduleRef.id,
        dayKey,
        index,
        ...block,
        createdAt: serverTimestamp(),
      });
    });
  });

  Object.entries(weeklySlots || {}).forEach(([dayKey, slots]) => {
    slots.forEach((slot, index) => {
      const ref = doc(collection(db, "cabinScheduleSlots"));
      batch.set(ref, {
        scheduleId: scheduleRef.id,
        dayKey,
        index,
        ...slot,
        status: slot.employeeId ? "assigned" : "open",
        createdAt: serverTimestamp(),
      });
    });
  });

  await batch.commit();

  return scheduleRef.id;
}
