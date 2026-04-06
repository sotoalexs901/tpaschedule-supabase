import {
  addDoc,
  collection,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

function safeString(value) {
  return String(value || "").trim();
}

function prettifyCodeName(value) {
  const clean = safeString(value);
  if (!clean) return "";

  if (
    clean.includes(" ") &&
    !clean.includes("_") &&
    !clean.includes(".") &&
    !/@/.test(clean)
  ) {
    return clean;
  }

  if (/^[a-z]+\.[a-z]+$/i.test(clean)) {
    return clean
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  if (/^[a-z]+_[a-z]+$/i.test(clean)) {
    return clean
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  if (/@/.test(clean)) {
    const left = clean.split("@")[0] || clean;
    return prettifyCodeName(left);
  }

  if (/^[a-z]+[0-9]*$/i.test(clean) && clean === clean.toLowerCase()) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean;
}

function toMinutes(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function calcCalendarHours(start, end) {
  if (!start || !end) return 0;

  let s = toMinutes(start);
  let e = toMinutes(end);

  if (e <= s) e += 24 * 60;

  return Number(((e - s) / 60).toFixed(2));
}

function calcPaidHours(start, end) {
  if (!start || !end) return 0;

  let s = toMinutes(start);
  let e = toMinutes(end);

  if (e <= s) e += 24 * 60;

  let minutes = e - s;

  if (minutes >= 361) {
    minutes -= 30;
  }

  return Number((minutes / 60).toFixed(2));
}

function normalizeRole(role) {
  const value = safeString(role);
  if (!value) return "Agent";

  const lower = value.toLowerCase();

  if (lower === "supervisor") return "Supervisor";
  if (lower === "lav") return "LAV";
  return "Agent";
}

function normalizeFlightRow(row, scheduleId, dayKey) {
  return {
    scheduleId,
    dayKey,
    flightNumber: safeString(row.flightNumber),
    scheduledTime: safeString(row.scheduledTime),
    route: safeString(row.route),
    aircraft: safeString(row.aircraft),
    gate: safeString(row.gate),
    movementType: safeString(row.movementType),
    rawText: safeString(row.rawText),
    createdAt: serverTimestamp(),
  };
}

function normalizeDemandRow(row, scheduleId, dayKey) {
  return {
    scheduleId,
    dayKey,
    startTime: safeString(row.startTime),
    endTime: safeString(row.endTime),
    recommendedAgents: Number(row.recommendedAgents || 0),
    flightsCovered: Array.isArray(row.flightsCovered) ? row.flightsCovered : [],
    createdAt: serverTimestamp(),
  };
}

function normalizeSlotRow(row, scheduleId, dayKey) {
  const start = safeString(row.start);
  const end = safeString(row.end);
  const employeeId = safeString(row.employeeId);
  const employeeName = prettifyCodeName(row.employeeName);
  const role = normalizeRole(row.role);

  return {
    scheduleId,
    dayKey,
    slotLocalId: safeString(row.id),
    source: safeString(row.source) || "generated",
    start,
    end,
    role,
    employeeId,
    employeeName,
    calendarHours:
      row.calendarHours !== undefined && row.calendarHours !== null
        ? Number(row.calendarHours)
        : calcCalendarHours(start, end),
    paidHours:
      row.paidHours !== undefined && row.paidHours !== null
        ? Number(row.paidHours)
        : calcPaidHours(start, end),
    status: employeeId || employeeName ? "assigned" : "open",
    createdAt: serverTimestamp(),
  };
}

function countFlights(weeklyFlights = {}) {
  return Object.values(weeklyFlights).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

function countSlots(weeklySlots = {}) {
  return Object.values(weeklySlots).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0
  );
}

function getUploadedDays(weeklyFlights = {}, weeklySlots = {}) {
  const set = new Set();

  Object.entries(weeklyFlights).forEach(([dayKey, rows]) => {
    if (Array.isArray(rows) && rows.length > 0) set.add(dayKey);
  });

  Object.entries(weeklySlots).forEach(([dayKey, rows]) => {
    if (Array.isArray(rows) && rows.length > 0) set.add(dayKey);
  });

  return Array.from(set);
}

export async function saveCabinWeeklySchedule({
  weekStartDate,
  weeklyFlights = {},
  weeklyDemandBlocks = {},
  weeklySlots = {},
  createdBy = "",
  status = "draft",
}) {
  const cleanWeekStart = safeString(weekStartDate);

  if (!cleanWeekStart) {
    throw new Error("Week start date is required.");
  }

  const uploadedDays = getUploadedDays(weeklyFlights, weeklySlots);
  const totalFlights = countFlights(weeklyFlights);
  const totalSlots = countSlots(weeklySlots);

  const cleanCreatedBy = prettifyCodeName(createdBy) || "Unknown User";

  const scheduleRef = await addDoc(collection(db, "cabinSchedules"), {
    weekStartDate: cleanWeekStart,
    createdBy: cleanCreatedBy,
    status: safeString(status) || "draft",
    uploadedDays,
    totalFlights,
    totalSlots,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const scheduleId = scheduleRef.id;

  const batch = writeBatch(db);

  Object.entries(weeklyFlights).forEach(([dayKey, rows]) => {
    (rows || []).forEach((row) => {
      const ref = doc(collection(db, "cabinScheduleFlights"));
      batch.set(ref, normalizeFlightRow(row, scheduleId, dayKey));
    });
  });

  Object.entries(weeklyDemandBlocks).forEach(([dayKey, rows]) => {
    (rows || []).forEach((row) => {
      const ref = doc(collection(db, "cabinScheduleDemandBlocks"));
      batch.set(ref, normalizeDemandRow(row, scheduleId, dayKey));
    });
  });

  Object.entries(weeklySlots).forEach(([dayKey, rows]) => {
    (rows || []).forEach((row) => {
      const ref = doc(collection(db, "cabinScheduleSlots"));
      batch.set(ref, normalizeSlotRow(row, scheduleId, dayKey));
    });
  });

  await batch.commit();

  return scheduleId;
}
