import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export const FLIGHT_WATCH_COLLECTION = "flight_watchlist";
export const MONITORED_AIRPORTS_COLLECTION = "monitored_airports";

export const FLIGHT_WATCH_DEPARTMENTS = [
  "ALL",
  "AV Ticket Counter",
  "SY Ticket Counter",
  "WL",
  "WCHR",
  "AA BSO",
  "DL Cabin Service",
];

export const DEFAULT_FLIGHT_EVENTS = {
  delayed: true,
  airborne: true,
  etaChanged: true,
  approaching: true,
  landed: true,
  arrived: true,
  cancelled: true,
  diverted: true,
};

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

export function subscribeFlightWatchlist(callback, onError) {
  return onSnapshot(
    collection(db, FLIGHT_WATCH_COLLECTION),
    (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => {
        const aDate = clean(a.flightDate);
        const bDate = clean(b.flightDate);
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return upper(a.flightNumber).localeCompare(upper(b.flightNumber));
      });
      callback(rows);
    },
    onError
  );
}

export function subscribeMonitoredAirports(callback, onError) {
  return onSnapshot(
    collection(db, MONITORED_AIRPORTS_COLLECTION),
    (snapshot) => {
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => upper(a.code).localeCompare(upper(b.code)));
      callback(rows);
    },
    onError
  );
}

export async function createFlightWatch(payload, user) {
  const flightNumber = upper(payload.flightNumber);
  if (!flightNumber) throw new Error("Flight number is required.");

  const targetDepartments = Array.isArray(payload.targetDepartments)
    ? payload.targetDepartments.map(clean).filter(Boolean)
    : [];

  return addDoc(collection(db, FLIGHT_WATCH_COLLECTION), {
    flightNumber,
    flightDate: clean(payload.flightDate),
    origin: upper(payload.origin),
    destination: upper(payload.destination || "TPA"),
    linkedInboundFlightNumber: upper(payload.linkedInboundFlightNumber || ""),
    targetDepartments: targetDepartments.length ? targetDepartments : ["ALL"],
    notifyEvents: {
      ...DEFAULT_FLIGHT_EVENTS,
      ...(payload.notifyEvents || {}),
    },
    etaChangeMinutes: Number(payload.etaChangeMinutes || 10),
    approachingMinutes: Number(payload.approachingMinutes || 30),
    enabled: payload.enabled !== false,
    status: "MONITORING",
    createdBy: clean(user?.username || user?.name || user?.id),
    createdByUserId: clean(user?.id),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateFlightWatch(id, patch) {
  if (!id) return;
  await updateDoc(doc(db, FLIGHT_WATCH_COLLECTION, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFlightWatch(id) {
  if (!id) return;
  await deleteDoc(doc(db, FLIGHT_WATCH_COLLECTION, id));
}

export async function saveMonitoredAirport({ code, label = "", enabled = true }, user) {
  const airportCode = upper(code);
  if (!airportCode) throw new Error("Airport code is required.");

  await setDoc(
    doc(db, MONITORED_AIRPORTS_COLLECTION, airportCode),
    {
      code: airportCode,
      label: clean(label),
      enabled: enabled !== false,
      updatedBy: clean(user?.username || user?.name || user?.id),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteMonitoredAirport(id) {
  if (!id) return;
  await deleteDoc(doc(db, MONITORED_AIRPORTS_COLLECTION, id));
}

export function normalizeDepartment(value) {
  return clean(value)
    .toLowerCase()
    .replace(/ticket counter/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function flightVisibleToUser(flight, user) {
  const targets = Array.isArray(flight?.targetDepartments)
    ? flight.targetDepartments
    : [];

  if (!targets.length || targets.some((item) => upper(item) === "ALL")) return true;
  if (["station_manager", "duty_manager"].includes(user?.role)) return true;

  const userDepartment = normalizeDepartment(user?.department);
  if (!userDepartment) return false;

  return targets.some((target) => {
    const normalized = normalizeDepartment(target);
    return normalized === userDepartment || normalized.includes(userDepartment) || userDepartment.includes(normalized);
  });
}
