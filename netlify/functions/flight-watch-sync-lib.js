const admin = require("firebase-admin");

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";
const ACTIVE_STATUSES = new Set(["AIRBORNE", "APPROACHING"]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/ticket counter/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const credentialsJson = clean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (credentialsJson) {
    const serviceAccount = JSON.parse(credentialsJson);
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: clean(serviceAccount.private_key).replace(/\\n/g, "\n"),
      }),
    });
  }
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not configured.");
}

function millis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function minutesBetween(a, b) {
  const aa = millis(a);
  const bb = millis(b);
  if (!aa || !bb) return 0;
  return Math.round((aa - bb) / 60000);
}

function airportCode(airport) {
  if (!airport) return "";
  if (typeof airport === "string") return upper(airport).replace(/^K(?=[A-Z]{3}$)/, "");
  return upper(airport.code_iata || airport.code || airport.code_icao || "").replace(/^K(?=[A-Z]{3}$)/, "");
}

function flightTimeCandidates(flight) {
  return [
    flight.scheduled_out,
    flight.scheduled_off,
    flight.estimated_out,
    flight.actual_out,
    flight.scheduled_in,
    flight.estimated_in,
    flight.actual_in,
  ].map(millis).filter(Boolean);
}

function selectFlight(flights, watch) {
  if (!Array.isArray(flights) || !flights.length) return null;
  const wantedOrigin = upper(watch.origin);
  const wantedDestination = upper(watch.destination || "TPA");
  const targetDate = watch.flightDate ? new Date(`${watch.flightDate}T12:00:00Z`).getTime() : Date.now();

  const scored = flights.map((flight) => {
    let score = 0;
    const origin = airportCode(flight.origin);
    const destination = airportCode(flight.destination);
    if (wantedOrigin && origin === wantedOrigin) score += 100;
    if (wantedDestination && destination === wantedDestination) score += 100;
    const times = flightTimeCandidates(flight);
    if (times.length) {
      const closest = Math.min(...times.map((time) => Math.abs(time - targetDate)));
      score -= closest / 3600000;
    }
    return { flight, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].flight;
}

function deriveStatus(flight) {
  if (!flight) return "MONITORING";
  if (flight.cancelled) return "CANCELLED";
  if (flight.diverted) return "DIVERTED";
  if (flight.actual_in) return "ARRIVED";
  if (flight.actual_on) return "LANDED";
  if (flight.actual_off || flight.actual_out) return "AIRBORNE";

  const delay = minutesBetween(flight.estimated_out || flight.predicted_out, flight.scheduled_out);
  if (delay >= 15) return "DELAYED";
  return upper(flight.status || "SCHEDULED").includes("DELAY") ? "DELAYED" : "SCHEDULED";
}

function nextPollMinutes(status) {
  if (ACTIVE_STATUSES.has(status)) return 5;
  if (["DELAYED", "SCHEDULED", "MONITORING"].includes(status)) return 15;
  if (["LANDED"].includes(status)) return 5;
  return 60;
}

function shouldPoll(watch) {
  const last = millis(watch.syncedAt);
  if (!last) return true;
  const interval = Number(watch.nextPollMinutes || nextPollMinutes(upper(watch.status)));
  return Date.now() - last >= Math.max(5, interval) * 60000 - 15000;
}

async function fetchFlight(ident, watch) {
  const apiKey = clean(process.env.FLIGHTAWARE_API_KEY);
  if (!apiKey) throw new Error("FLIGHTAWARE_API_KEY is not configured.");

  const url = new URL(`${AEROAPI_BASE}/flights/${encodeURIComponent(ident)}`);
  url.searchParams.set("max_pages", "1");

  const response = await fetch(url, {
    headers: { "x-apikey": apiKey, Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FlightAware ${response.status}: ${body.slice(0, 180)}`);
  }

  const data = await response.json();
  return selectFlight(data.flights || [], watch);
}

function eventEnabled(watch, key) {
  return watch?.notifyEvents?.[key] !== false;
}

function buildEvents(previous, next, watch) {
  const events = [];
  const prevStatus = upper(previous.status);
  const nextStatus = upper(next.status);
  const eventMap = {
    DELAYED: "delayed",
    AIRBORNE: "airborne",
    LANDED: "landed",
    ARRIVED: "arrived",
    CANCELLED: "cancelled",
    DIVERTED: "diverted",
  };

  if (nextStatus && nextStatus !== prevStatus && eventMap[nextStatus] && eventEnabled(watch, eventMap[nextStatus])) {
    events.push({ type: eventMap[nextStatus], status: nextStatus });
  }

  const previousEta = previous.eta || previous.estimatedIn;
  const nextEta = next.eta || next.estimatedIn;
  const etaShift = Math.abs(minutesBetween(nextEta, previousEta));
  const etaThreshold = Number(watch.etaChangeMinutes || 10);
  if (previousEta && nextEta && etaShift >= etaThreshold && eventEnabled(watch, "etaChanged")) {
    events.push({ type: "etaChanged", minutes: minutesBetween(nextEta, previousEta) });
  }

  const etaMs = millis(nextEta);
  const approachingMinutes = Number(watch.approachingMinutes || 30);
  const minutesToArrival = etaMs ? Math.round((etaMs - Date.now()) / 60000) : null;
  if (
    ACTIVE_STATUSES.has(nextStatus) &&
    minutesToArrival !== null &&
    minutesToArrival >= 0 &&
    minutesToArrival <= approachingMinutes &&
    !previous.approachingNotified &&
    eventEnabled(watch, "approaching")
  ) {
    events.push({ type: "approaching", minutes: minutesToArrival });
  }

  return events;
}

function formatTime(value) {
  const ms = millis(value);
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function notificationCopy(watch, event, next) {
  const flight = upper(watch.flightNumber);
  const eta = formatTime(next.eta || next.estimatedIn);
  switch (event.type) {
    case "delayed": return { title: `${flight} delayed`, body: `A delay has been detected. Current ETA TPA: ${eta}.` };
    case "airborne": return { title: `${flight} is airborne`, body: `${flight} has departed ${watch.origin || "origin"}. ETA TPA: ${eta}.` };
    case "etaChanged": return { title: `${flight} ETA changed`, body: `New ETA TPA: ${eta} (${event.minutes > 0 ? "+" : ""}${event.minutes} min change).` };
    case "approaching": return { title: `${flight} approaching TPA`, body: `Expected at TPA in approximately ${Math.max(0, event.minutes)} minutes. ETA: ${eta}.` };
    case "landed": return { title: `${flight} landed`, body: `${flight} has landed at TPA.` };
    case "arrived": return { title: `${flight} arrived`, body: `${flight} has arrived at the gate.` };
    case "cancelled": return { title: `${flight} cancelled`, body: `${flight} is showing as cancelled.` };
    case "diverted": return { title: `${flight} diverted`, body: `${flight} is showing as diverted. Review the live flight status.` };
    default: return { title: `${flight} update`, body: `Flight status updated to ${next.status}.` };
  }
}

function userMatchesTargets(userData, targetDepartments) {
  if (!Array.isArray(targetDepartments) || !targetDepartments.length) return true;
  if (targetDepartments.some((item) => upper(item) === "ALL")) return true;
  const role = clean(userData.role);
  if (["station_manager", "duty_manager"].includes(role)) return true;
  const department = normalize(userData.department);
  if (!department) return false;
  return targetDepartments.some((target) => {
    const normalized = normalize(target);
    return normalized === department || normalized.includes(department) || department.includes(normalized);
  });
}

async function targetUsers(db, watch) {
  const snap = await db.collection("users").get();
  return snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter((item) => userMatchesTargets(item.data, watch.targetDepartments));
}

async function createInAppNotifications(db, users, watch, event, copy) {
  const batch = db.batch();
  users.forEach((user) => {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      userId: user.id,
      type: "flight_watch",
      title: copy.title,
      message: copy.body,
      link: "/dashboard",
      read: false,
      createdBy: "AeroStation Flight Watch",
      entityId: watch.id,
      entityType: "flight_watch",
      eventType: event.type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

async function pushNotifications(db, users, watch, event, copy) {
  const tokenItems = [];
  await Promise.all(users.map(async (user) => {
    const tokenSnap = await db.collection("users").doc(user.id).collection("pushTokens").where("enabled", "==", true).get();
    tokenSnap.docs.forEach((tokenDoc) => {
      const token = clean(tokenDoc.data()?.token);
      if (token) tokenItems.push({ token, ref: tokenDoc.ref });
    });
  }));
  const unique = Array.from(new Map(tokenItems.map((item) => [item.token, item])).values());
  if (!unique.length) return { successCount: 0, failureCount: 0 };

  let successCount = 0;
  let failureCount = 0;
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const result = await admin.messaging().sendEachForMulticast({
      tokens: batch.map((item) => item.token),
      data: {
        title: copy.title,
        body: copy.body,
        url: "/dashboard",
        type: "flight_watch",
        flightWatchId: watch.id,
        flightNumber: upper(watch.flightNumber),
        eventType: event.type,
      },
      webpush: { headers: { Urgency: ["cancelled", "diverted", "delayed"].includes(event.type) ? "high" : "normal" } },
    });
    successCount += result.successCount;
    failureCount += result.failureCount;
  }
  return { successCount, failureCount };
}

async function notifyEvent(db, watch, event, next) {
  const copy = notificationCopy(watch, event, next);
  const users = await targetUsers(db, watch);
  if (!users.length) return;
  await createInAppNotifications(db, users, watch, event, copy);
  await pushNotifications(db, users, watch, event, copy);
}

function normalizeFlight(flight, watch) {
  const status = deriveStatus(flight);
  const scheduledIn = flight.scheduled_in || null;
  const estimatedIn = flight.estimated_in || flight.predicted_in || scheduledIn || null;
  const scheduledOut = flight.scheduled_out || null;
  const estimatedOut = flight.estimated_out || flight.predicted_out || scheduledOut || null;
  const delayMinutes = Math.max(0, minutesBetween(estimatedOut, scheduledOut));

  return {
    status,
    provider: "flightaware",
    faFlightId: clean(flight.fa_flight_id),
    origin: airportCode(flight.origin) || upper(watch.origin),
    destination: airportCode(flight.destination) || upper(watch.destination || "TPA"),
    sta: scheduledIn,
    eta: estimatedIn,
    std: scheduledOut,
    etd: estimatedOut,
    atd: flight.actual_out || flight.actual_off || null,
    ata: flight.actual_in || flight.actual_on || null,
    scheduledIn,
    estimatedIn,
    scheduledOut,
    estimatedOut,
    actualOut: flight.actual_out || null,
    actualOff: flight.actual_off || null,
    actualOn: flight.actual_on || null,
    actualIn: flight.actual_in || null,
    delayMinutes,
    progressPercent: Number(flight.progress_percent || 0),
    routeDistance: Number(flight.route_distance || 0),
    lastProviderUpdate: flight.last_position?.timestamp || flight.actual_off || flight.estimated_in || null,
    nextPollMinutes: nextPollMinutes(status),
  };
}

async function syncWatch(db, docSnap) {
  const watch = { id: docSnap.id, ...(docSnap.data() || {}) };
  if (watch.enabled === false || !shouldPoll(watch)) return { id: watch.id, skipped: true };

  try {
    const flight = await fetchFlight(watch.flightNumber, watch);
    if (!flight) {
      await docSnap.ref.set({ syncError: "No matching flight found.", syncedAt: admin.firestore.FieldValue.serverTimestamp(), nextPollMinutes: 30 }, { merge: true });
      return { id: watch.id, found: false };
    }

    const next = normalizeFlight(flight, watch);
    const events = buildEvents(watch, next, watch);
    const approachingNotified = watch.approachingNotified || events.some((event) => event.type === "approaching");

    await docSnap.ref.set({
      ...next,
      approachingNotified,
      syncError: "",
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    for (const event of events) {
      await notifyEvent(db, watch, event, next);
    }

    return { id: watch.id, status: next.status, events: events.map((event) => event.type) };
  } catch (error) {
    console.error(`Flight Watch sync failed for ${watch.flightNumber}:`, error);
    await docSnap.ref.set({
      syncError: clean(error?.message || error).slice(0, 500),
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      nextPollMinutes: 30,
    }, { merge: true });
    return { id: watch.id, error: clean(error?.message || error) };
  }
}

async function runFlightWatchSync() {
  getAdminApp();
  const db = admin.firestore();
  const snap = await db.collection("flight_watchlist").where("enabled", "==", true).limit(25).get();
  const results = [];
  for (const docSnap of snap.docs) {
    results.push(await syncWatch(db, docSnap));
  }
  return { ok: true, checked: snap.size, results };
}

module.exports = { runFlightWatchSync };
