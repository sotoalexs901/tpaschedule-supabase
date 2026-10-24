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
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function departmentAliases(value) {
  const text = normalizeDepartment(value);
  const aliases = new Set();
  if (!text) return aliases;

  aliases.add(text);
  if (/\bwchr\b|wheelchair/.test(text)) aliases.add("wchr");
  if (/avianca|\bav\b/.test(text)) { aliases.add("av"); aliases.add("av ticket counter"); }
  if (/sun country|\bsy\b/.test(text)) { aliases.add("sy"); aliases.add("sy ticket counter"); }
  if (/world atlantic|\bwl\b/.test(text)) { aliases.add("wl"); aliases.add("world atlantic"); }
  if (/aa bso|\bbso\b|american airlines bso/.test(text)) aliases.add("aa bso");
  if (/dl cabin|delta cabin|cabin service/.test(text)) aliases.add("dl cabin service");

  return aliases;
}

function userDepartmentAliases(user) {
  const aliases = new Set();
  [
    user?.department,
    user?.departmentName,
    user?.airline,
    user?.airlineAccount,
    user?.account,
    user?.position,
  ].forEach((value) => departmentAliases(value).forEach((item) => aliases.add(item)));
  return aliases;
}

export function flightVisibleToUser(flight, user) {
  const targets = Array.isArray(flight?.targetDepartments)
    ? flight.targetDepartments
    : [];

  if (!targets.length || targets.some((item) => upper(item) === "ALL")) return true;
  if (["station_manager", "duty_manager"].includes(user?.role)) return true;

  const userAliases = userDepartmentAliases(user);
  if (!userAliases.size) return false;

  return targets.some((target) => {
    const targetAliases = departmentAliases(target);
    for (const candidate of targetAliases) {
      if (userAliases.has(candidate)) return true;
    }
    return false;
  });
}
