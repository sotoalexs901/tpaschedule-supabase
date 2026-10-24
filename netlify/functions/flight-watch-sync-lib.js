const admin = require("firebase-admin");

const FR24_API_BASE = "https://fr24api.flightradar24.com/api";
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

function airportCode(value) {
  if (!value) return "";
  if (typeof value === "string") return upper(value).replace(/^K(?=[A-Z]{3}$)/, "");
  return upper(
    value.iata ||
    value.icao ||
    value.code_iata ||
    value.code_icao ||
    value.code ||
    ""
  ).replace(/^K(?=[A-Z]{3}$)/, "");
}

function parseIso(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function watchDateWindow(watch) {
  const date = clean(watch.flightDate);
  const base = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00Z`)
    : new Date();
  const from = new Date(base.getTime() - 6 * 60 * 60 * 1000);
  const to = new Date(base.getTime() + 30 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 19);
  return { from: fmt(from), to: fmt(to) };
}

function fr24Headers() {
  const token = clean(process.env.FLIGHTRADAR24_API_TOKEN);
  if (!token) throw new Error("FLIGHTRADAR24_API_TOKEN is not configured.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Version": "v1",
  };
}

async function fr24Get(path, params = {}) {
  const url = new URL(`${FR24_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: fr24Headers() });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Flightradar24 ${response.status}: ${body.slice(0, 220)}`);
  }
  return response.json();
}

function sameFlightNumber(candidate, ident) {
  const wanted = upper(ident).replace(/\s+/g, "");
  const flight = upper(candidate?.flight).replace(/\s+/g, "");
  const callsign = upper(candidate?.callsign).replace(/\s+/g, "");
  return flight === wanted || callsign === wanted || flight.endsWith(wanted) || callsign.endsWith(wanted);
}

function routeScore(candidate, watch) {
  let score = 0;
  const wantedOrigin = upper(watch.origin);
  const wantedDestination = upper(watch.destination || "TPA");
  const origin = airportCode(candidate.orig_iata || candidate.orig_icao || candidate.origin_icao);
  const destination = airportCode(candidate.dest_iata || candidate.dest_icao || candidate.destination_icao);
  if (sameFlightNumber(candidate, watch.flightNumber)) score += 200;
  if (wantedOrigin && origin === wantedOrigin) score += 100;
  if (wantedDestination && destination === wantedDestination) score += 100;
  const ts = millis(candidate.timestamp || candidate.first_seen || candidate.datetime_takeoff || candidate.last_seen);
  if (ts) score -= Math.abs(Date.now() - ts) / 3600000;
  return score;
}

function selectBest(candidates, watch) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  return candidates
    .map((candidate) => ({ candidate, score: routeScore(candidate, watch) }))
    .sort((a, b) => b.score - a.score)[0]?.candidate || null;
}

async function fetchLiveFlight(watch) {
  // Explorer supports Live Flight Positions Full. Filtering by flight number keeps
  // returned entities (and credits) small when the flight is already airborne.
  const data = await fr24Get("/live/flight-positions/full", {
    flights: upper(watch.flightNumber),
    limit: 20,
  });
  return selectBest(data.data || [], watch);
}

async function fetchRecentSummary(watch) {
  const { from, to } = watchDateWindow(watch);
  const data = await fr24Get("/flight-summary/light", {
    flight_datetime_from: from,
    flight_datetime_to: to,
    flights: upper(watch.flightNumber),
    limit: 20,
    sort: "desc",
  });
  return selectBest(data.data || [], watch);
}

async function fetchFlight(watch) {
  const live = await fetchLiveFlight(watch);
  if (live) return { kind: "live", data: live };
  const summary = await fetchRecentSummary(watch);
  if (summary) return { kind: "summary", data: summary };
  return null;
}

function deriveStatus(result, watch) {
  if (!result) return "MONITORING";
  const flight = result.data || {};
  const wantedDestination = upper(watch.destination || "TPA");
  const actualDestination = airportCode(flight.dest_iata_actual || flight.destination_icao_actual);
  if (actualDestination && wantedDestination && actualDestination !== wantedDestination) return "DIVERTED";
  if (result.kind === "live") return "AIRBORNE";
  if (flight.datetime_landed) return "LANDED";
  if (flight.flight_ended === false) return "AIRBORNE";
  return "MONITORING";
}

function nextPollMinutes(status) {
  if (ACTIVE_STATUSES.has(status)) return 5;
  if (["MONITORING", "SCHEDULED"].includes(status)) return 15;
  if (["LANDED", "DIVERTED"].includes(status)) return 30;
  return 60;
}

function shouldPoll(watch) {
  const last = millis(watch.syncedAt);
  if (!last) return true;
  const interval = Number(watch.nextPollMinutes || nextPollMinutes(upper(watch.status)));
  return Date.now() - last >= Math.max(5, interval) * 60000 - 15000;
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

function departmentAliases(value) {
  const text = normalize(value);
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

function userMatchesTargets(userData, targetDepartments) {
  if (!Array.isArray(targetDepartments) || !targetDepartments.length) return true;
  if (targetDepartments.some((item) => upper(item) === "ALL")) return true;
  const role = clean(userData.role);
  if (["station_manager", "duty_manager"].includes(role)) return true;

  const userAliases = new Set();
  [userData.department, userData.departmentName, userData.airline, userData.airlineAccount, userData.account, userData.position]
    .forEach((value) => departmentAliases(value).forEach((item) => userAliases.add(item)));
  if (!userAliases.size) return false;

  return targetDepartments.some((target) => {
    const targetAliases = departmentAliases(target);
    for (const candidate of targetAliases) {
      if (userAliases.has(candidate)) return true;
    }
    return false;
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

function normalizeFlight(result, watch) {
  const flight = result?.data || {};
  const status = deriveStatus(result, watch);
  const eta = result?.kind === "live" ? parseIso(flight.eta) : null;
  const atd = parseIso(flight.datetime_takeoff) || (result?.kind === "live" ? parseIso(flight.timestamp) : null);
  const ata = parseIso(flight.datetime_landed);
  const manualSta = parseIso(watch.sta || watch.scheduledArrival || watch.scheduledIn);
  const delayMinutes = eta && manualSta ? Math.max(0, minutesBetween(eta, manualSta)) : 0;

  return {
    status: delayMinutes >= 15 && status === "MONITORING" ? "DELAYED" : status,
    provider: "flightradar24",
    fr24Id: clean(flight.fr24_id),
    origin: airportCode(flight.orig_iata || flight.orig_icao || flight.origin_icao) || upper(watch.origin),
    destination: airportCode(flight.dest_iata || flight.dest_icao || flight.destination_icao) || upper(watch.destination || "TPA"),
    actualDestination: airportCode(flight.dest_iata_actual || flight.destination_icao_actual) || "",
    sta: manualSta || null,
    eta: eta || null,
    std: parseIso(watch.std || watch.scheduledDeparture || watch.scheduledOut) || null,
    etd: null,
    atd: atd || null,
    ata: ata || null,
    scheduledIn: manualSta || null,
    estimatedIn: eta || null,
    scheduledOut: parseIso(watch.std || watch.scheduledDeparture || watch.scheduledOut) || null,
    estimatedOut: null,
    actualOut: atd || null,
    actualOff: atd || null,
    actualOn: ata || null,
    actualIn: ata || null,
    delayMinutes,
    latitude: Number.isFinite(Number(flight.lat)) ? Number(flight.lat) : null,
    longitude: Number.isFinite(Number(flight.lon)) ? Number(flight.lon) : null,
    altitude: Number.isFinite(Number(flight.alt)) ? Number(flight.alt) : null,
    groundSpeed: Number.isFinite(Number(flight.gspeed)) ? Number(flight.gspeed) : null,
    verticalSpeed: Number.isFinite(Number(flight.vspeed)) ? Number(flight.vspeed) : null,
    track: Number.isFinite(Number(flight.track)) ? Number(flight.track) : null,
    aircraftType: clean(flight.type),
    registration: clean(flight.reg),
    callsign: clean(flight.callsign),
    lastProviderUpdate: parseIso(flight.timestamp || flight.last_seen || flight.datetime_landed || flight.datetime_takeoff),
    nextPollMinutes: nextPollMinutes(status),
    providerDataExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function syncWatch(db, docSnap) {
  const watch = { id: docSnap.id, ...(docSnap.data() || {}) };
  if (watch.enabled === false || !shouldPoll(watch)) return { id: watch.id, skipped: true };

  try {
    const flight = await fetchFlight(watch);
    if (!flight) {
      await docSnap.ref.set({
        status: "MONITORING",
        provider: "flightradar24",
        syncError: "Flight is not live yet. FR24 public API exposes the flight once it is being tracked.",
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        nextPollMinutes: 15,
      }, { merge: true });
      return { id: watch.id, found: false, status: "MONITORING" };
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
