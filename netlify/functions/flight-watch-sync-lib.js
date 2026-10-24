const admin = require("firebase-admin");

const FR24_API_BASE = "https://fr24api.flightradar24.com/api";
const AERODATABOX_API_BASE = "https://prod.api.market/api/v1/aedbx/aerodatabox";
const ACTIVE_STATUSES = new Set(["AIRBORNE", "APPROACHING"]);
const TERMINAL_STATUSES = new Set(["ARRIVED", "COMPLETED", "CANCELLED", "DIVERTED"]);

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


function aeroDataBoxHeaders() {
  const key = clean(process.env.AERODATABOX_API_KEY);
  if (!key) throw new Error("AERODATABOX_API_KEY is not configured.");
  return {
    Accept: "application/json",
    "x-api-market-key": key,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastAeroDataBoxRequestAt = 0;

async function waitForAeroDataBoxSlot() {
  const minimumGapMs = 1150;
  const elapsed = Date.now() - lastAeroDataBoxRequestAt;
  if (elapsed < minimumGapMs) await sleep(minimumGapMs - elapsed);
  lastAeroDataBoxRequestAt = Date.now();
}

async function aeroDataBoxGet(path, params = {}) {
  const url = new URL(`${AERODATABOX_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await waitForAeroDataBoxSlot();
    const response = await fetch(url, { headers: aeroDataBoxHeaders() });

    if (response.ok) return response.json();

    const body = await response.text();
    if (response.status === 429 && attempt === 0) {
      let retryMs = 1250;
      try {
        const parsed = JSON.parse(body);
        if (Number.isFinite(Number(parsed?.retryAfterMs))) retryMs = Math.max(1250, Number(parsed.retryAfterMs) + 300);
      } catch (_) {
        const retryAfter = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) retryMs = Math.max(1250, retryAfter * 1000 + 300);
      }
      await sleep(retryMs);
      continue;
    }

    throw new Error(`AeroDataBox ${response.status}: ${body.slice(0, 220)}`);
  }

  throw new Error("AeroDataBox request failed after retry.");
}

function movementAirportCode(movement) {
  return airportCode(movement?.airport || movement?.airport?.iata || movement?.airport?.icao);
}

function movementTime(movement, field) {
  const value = movement?.[field];
  if (!value) return null;
  if (typeof value === "string") return parseIso(value);
  return parseIso(value.utc || value.local || null);
}

function movementLocalDate(movement, field = "scheduledTime") {
  const value = movement?.[field];
  if (!value) return "";
  const local = typeof value === "string" ? value : value.local;
  if (local && /^\d{4}-\d{2}-\d{2}/.test(local)) return local.slice(0, 10);
  const utc = typeof value === "string" ? value : value.utc;
  if (utc) {
    const ms = new Date(utc).getTime();
    if (!Number.isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
}

function normalizeFlightNumber(value) {
  return upper(value).replace(/[^A-Z0-9]/g, "");
}

function candidateFlightNumbers(candidate) {
  const values = new Set();
  const add = (value) => {
    const normalized = normalizeFlightNumber(value);
    if (normalized) values.add(normalized);
  };

  add(candidate?.number);
  add(candidate?.flightNumber);
  add(candidate?.callSign);
  add(candidate?.callsign);

  const airlineIata = upper(candidate?.airline?.iata || candidate?.airline?.iataCode || candidate?.airline?.codeIata);
  const airlineIcao = upper(candidate?.airline?.icao || candidate?.airline?.icaoCode || candidate?.airline?.codeIcao);
  const numeric = clean(candidate?.flightNumberNumber || candidate?.numberOnly || candidate?.flightNumber?.number || candidate?.number?.number);
  if (numeric) {
    if (airlineIata) add(`${airlineIata}${numeric}`);
    if (airlineIcao) add(`${airlineIcao}${numeric}`);
  }

  const codeshares = candidate?.codeshareStatus || candidate?.codeshares || candidate?.codeShares || [];
  if (Array.isArray(codeshares)) {
    codeshares.forEach((item) => {
      if (typeof item === "string") add(item);
      else {
        add(item?.number);
        add(item?.flightNumber);
        const iata = upper(item?.airline?.iata || item?.airline?.iataCode);
        const n = clean(item?.flightNumberNumber || item?.numberOnly || item?.flightNumber?.number || item?.number?.number);
        if (iata && n) add(`${iata}${n}`);
      }
    });
  }

  return Array.from(values);
}

function scheduleRouteScore(candidate, watch) {
  const wanted = normalizeFlightNumber(watch.flightNumber);
  const candidateNumbers = candidateFlightNumbers(candidate);
  const exactNumber = candidateNumbers.includes(wanted);
  if (!exactNumber) return -10000;

  let score = 1000;
  const origin = movementAirportCode(candidate?.departure);
  const destination = movementAirportCode(candidate?.arrival);
  const wantedOrigin = upper(watch.origin);
  const wantedDestination = upper(watch.destination || "TPA");

  if (wantedOrigin) score += origin === wantedOrigin ? 250 : -250;
  if (wantedDestination) score += destination === wantedDestination ? 250 : -250;

  const wantedDate = clean(watch.flightDate);
  const departureDate = movementLocalDate(candidate?.departure, "scheduledTime");
  const arrivalDate = movementLocalDate(candidate?.arrival, "scheduledTime");
  if (wantedDate) {
    if (departureDate === wantedDate) score += 500;
    else if (arrivalDate === wantedDate) score += 150;
    else score -= 700;
  }

  const std = movementTime(candidate?.departure, "scheduledTime");
  if (std) score += 25;
  return score;
}

function scheduleCandidateDiagnostic(candidate, watch, score) {
  if (!candidate) return null;
  return {
    requestedFlight: normalizeFlightNumber(watch.flightNumber),
    candidateNumbers: candidateFlightNumbers(candidate),
    requestedDate: clean(watch.flightDate),
    departureDate: movementLocalDate(candidate?.departure, "scheduledTime"),
    arrivalDate: movementLocalDate(candidate?.arrival, "scheduledTime"),
    requestedOrigin: upper(watch.origin),
    candidateOrigin: movementAirportCode(candidate?.departure),
    requestedDestination: upper(watch.destination || "TPA"),
    candidateDestination: movementAirportCode(candidate?.arrival),
    score,
  };
}

async function fetchAeroDataBoxSchedule(watch) {
  const flightNumber = encodeURIComponent(normalizeFlightNumber(watch.flightNumber));
  const date = clean(watch.flightDate);
  if (!flightNumber || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { candidate: null, diagnostic: { reason: "invalid-flight-or-date" }, rows: 0 };
  }

  const data = await aeroDataBoxGet(`/flights/number/${flightNumber}/${date}`, {
    withAircraftImage: false,
    withLocation: false,
    dateLocalRole: "Both",
  });
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  if (!rows.length) {
    return { candidate: null, diagnostic: { reason: "no-rows-returned", requestedFlight: normalizeFlightNumber(watch.flightNumber), requestedDate: date }, rows: 0 };
  }

  const ranked = rows
    .map((candidate) => ({ candidate, score: scheduleRouteScore(candidate, watch) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 1000) {
    return {
      candidate: null,
      diagnostic: {
        reason: "no-exact-match",
        returnedRows: rows.length,
        topCandidate: best ? scheduleCandidateDiagnostic(best.candidate, watch, best.score) : null,
      },
      rows: rows.length,
    };
  }

  return {
    candidate: best.candidate,
    diagnostic: {
      reason: "matched",
      returnedRows: rows.length,
      selected: scheduleCandidateDiagnostic(best.candidate, watch, best.score),
    },
    rows: rows.length,
  };
}

function normalizeAeroDataBoxSchedule(candidate, watch) {
  if (!candidate) return {};
  const departure = candidate.departure || {};
  const arrival = candidate.arrival || {};
  const std = movementTime(departure, "scheduledTime");
  const sta = movementTime(arrival, "scheduledTime");
  const etd = movementTime(departure, "revisedTime") || movementTime(departure, "predictedTime");
  const eta = movementTime(arrival, "revisedTime") || movementTime(arrival, "predictedTime");
  const providerStatus = upper(candidate.status);
  const providerArrived = providerStatus.includes("ARRIV") || providerStatus.includes("LAND");
  const arrivalRunwayTime = movementTime(arrival, "runwayTime");
  // AeroDataBox renamed actualTime to revisedTime; actualTime is retained as a
  // compatibility fallback for marketplace/schema variations. For arrivals this
  // is the gate/blocks-in time once the provider reports the flight as arrived.
  const arrivalGateTime = providerArrived
    ? (movementTime(arrival, "actualTime") || movementTime(arrival, "revisedTime"))
    : null;

  let scheduleStatus = "SCHEDULED";
  if (providerStatus.includes("CANCEL")) scheduleStatus = "CANCELLED";
  else if (providerStatus.includes("DIVERT")) scheduleStatus = "DIVERTED";
  else if (providerArrived && arrivalGateTime) scheduleStatus = "ARRIVED";
  else if (providerArrived || arrivalRunwayTime) scheduleStatus = "LANDED";
  else if (providerStatus.includes("DELAY")) scheduleStatus = "DELAYED";

  return {
    std: std || null,
    sta: sta || null,
    scheduledOut: std || null,
    scheduledIn: sta || null,
    etd: etd || null,
    estimatedOut: etd || null,
    scheduleEta: eta || null,
    ...(arrivalRunwayTime ? {
      actualOn: arrivalRunwayTime,
      ata: arrivalRunwayTime,
      actualOnSource: "AeroDataBox runwayTime",
    } : {}),
    ...(arrivalGateTime ? {
      actualIn: arrivalGateTime,
      gateArrivedAt: arrivalGateTime,
      actualInSource: "AeroDataBox revised/actual gate time",
    } : {}),
    origin: movementAirportCode(departure) || upper(watch.origin),
    destination: movementAirportCode(arrival) || upper(watch.destination || "TPA"),
    departureTerminal: clean(departure.terminal),
    departureGate: clean(departure.gate),
    arrivalTerminal: clean(arrival.terminal),
    arrivalGate: clean(arrival.gate),
    scheduleProviderStatus: clean(candidate.status),
    scheduleStatus,
    scheduleProvider: "aerodatabox",
    scheduleSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function scheduleSyncDecision(watch) {
  const status = upper(watch.status);
  const hasActualIn = Boolean(watch.actualIn);

  // A LANDED flight is not complete for station operations until we have a true
  // gate/blocks-in time. Keep AeroDataBox alive after touchdown so Gate Checklist
  // can receive separate ON (runway) and IN (gate) timestamps.
  if (status !== "LANDED" && (watch.trackingComplete === true || TERMINAL_STATUSES.has(status))) {
    return { due: false, reason: "terminal-or-complete", retryInMinutes: null };
  }
  if (status === "LANDED" && hasActualIn) {
    return { due: false, reason: "landed-with-actual-in", retryInMinutes: null };
  }

  const date = clean(watch.flightDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { due: false, reason: "invalid-flight-date", retryInMinutes: null };
  }

  const tampa = tampaDateParts();
  if (date < tampa.date) {
    return { due: false, reason: "past-flight-date", retryInMinutes: null };
  }

  const last = millis(watch.scheduleSyncedAt);
  if (!last) return { due: true, reason: "never-attempted", retryInMinutes: 0 };

  const hasSchedule = Boolean(watch.std || watch.sta || watch.scheduledOut || watch.scheduledIn);
  const hadScheduleError = Boolean(clean(watch.scheduleSyncError));
  const ageMs = Date.now() - last;

  if (!hasSchedule || hadScheduleError) {
    const intervalMs = 15 * 60 * 1000;
    const remainingMs = Math.max(0, intervalMs - ageMs);
    return {
      due: ageMs >= intervalMs - 15000,
      reason: ageMs >= intervalMs - 15000 ? "retry-missing-schedule" : "retry-not-due-yet",
      retryInMinutes: Math.ceil(remainingMs / 60000),
    };
  }

  const sameDay = date === tampa.date;

  // Same-day active flights need fresher AeroDataBox data so revised/runway times
  // can become operational ON/IN timestamps without waiting hours.
  let intervalMs;
  if (sameDay && status === "LANDED" && !hasActualIn) {
    intervalMs = 5 * 60 * 1000;
  } else if (sameDay && ACTIVE_STATUSES.has(status)) {
    intervalMs = 15 * 60 * 1000;
  } else {
    const intervalHours = sameDay ? 3 : 24;
    intervalMs = intervalHours * 60 * 60 * 1000;
  }
  const remainingMs = Math.max(0, intervalMs - ageMs);
  return {
    due: ageMs >= intervalMs - 15000,
    reason: ageMs >= intervalMs - 15000 ? "refresh-existing-schedule" : "schedule-cache-valid",
    retryInMinutes: Math.ceil(remainingMs / 60000),
  };
}

function shouldSyncSchedule(watch) {
  return scheduleSyncDecision(watch).due;
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
  if (watch.actualIn) return "ARRIVED";
  if (!result) return "MONITORING";
  const flight = result.data || {};
  const wantedDestination = upper(watch.destination || "TPA");
  const actualDestination = airportCode(flight.dest_iata_actual || flight.destination_icao_actual);

  // Landing is terminal even when the aircraft landed at an alternate airport.
  // This prevents unnecessary FR24 polling after the flight is on the ground.
  if (flight.datetime_landed) return "LANDED";
  if (actualDestination && wantedDestination && actualDestination !== wantedDestination) return "DIVERTED";
  if (result.kind === "live") return "AIRBORNE";
  if (flight.flight_ended === false) return "AIRBORNE";
  return "MONITORING";
}

function nextPollMinutes(status) {
  if (ACTIVE_STATUSES.has(status)) return 5;
  if (["MONITORING", "SCHEDULED"].includes(status)) return 15;
  if (status === "LANDED") return 5;
  if (status === "DIVERTED") return 30;
  return 60;
}

function tampaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function isFlightWatchWindowOpen(watch) {
  const flightDate = clean(watch.flightDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) return true;

  const tampa = tampaDateParts();

  // Future flights remain saved in Firebase but never call FR24 before their day.
  if (flightDate > tampa.date) return false;

  // Do not keep polling old flights once their scheduled day has passed.
  if (flightDate < tampa.date) return false;

  // On the flight date, FR24 polling starts at 07:00 Tampa local time.
  return tampa.hour >= 7;
}

function shouldPoll(watch) {
  if (watch.trackingComplete === true) return false;
  if (TERMINAL_STATUSES.has(upper(watch.status))) return false;
  if (!isFlightWatchWindowOpen(watch)) return false;

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
  const actualOn = ata || parseIso(watch.actualOn);
  const actualIn = parseIso(watch.actualIn);
  const manualSta = parseIso(watch.sta || watch.scheduledArrival || watch.scheduledIn);
  const delayMinutes = eta && manualSta ? Math.max(0, minutesBetween(eta, manualSta)) : 0;

  return {
    status: delayMinutes >= 15 && status === "MONITORING" ? "DELAYED" : status,
    provider: "flightradar24",
    fr24Id: clean(flight.fr24_id),
    origin: airportCode(flight.orig_iata || flight.orig_icao || flight.origin_icao) || upper(watch.origin),
    destination: airportCode(flight.dest_iata || flight.dest_icao || flight.destination_icao) || upper(watch.destination || "TPA"),
    actualDestination: airportCode(flight.dest_iata_actual || flight.destination_icao_actual) || "",
    wasDiverted: Boolean(
      airportCode(flight.dest_iata_actual || flight.destination_icao_actual) &&
      airportCode(flight.dest_iata_actual || flight.destination_icao_actual) !== upper(watch.destination || "TPA")
    ),
    sta: manualSta || null,
    eta: eta || null,
    std: parseIso(watch.std || watch.scheduledDeparture || watch.scheduledOut) || null,
    etd: null,
    atd: atd || null,
    ata: actualOn || null,
    scheduledIn: manualSta || null,
    estimatedIn: eta || null,
    scheduledOut: parseIso(watch.std || watch.scheduledDeparture || watch.scheduledOut) || null,
    estimatedOut: null,
    actualOut: atd || null,
    actualOff: atd || null,
    actualOn: actualOn || null,
    actualIn: actualIn || null,
    actualOnSource: actualOn ? (ata ? "Flightradar24 datetime_landed" : (watch.actualOnSource || "AeroDataBox runwayTime")) : "",
    actualInSource: actualIn ? (watch.actualInSource || "AeroDataBox gate time") : "",
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
  let watch = { id: docSnap.id, ...(docSnap.data() || {}) };
  const initialScheduleDecision = scheduleSyncDecision(watch);
  let scheduleDebug = {
    attempted: false,
    decision: initialScheduleDecision.reason,
    retryInMinutes: initialScheduleDecision.retryInMinutes,
    flightNumber: watch.flightNumber || "",
    flightDate: watch.flightDate || "",
    origin: watch.origin || "",
    destination: watch.destination || "",
    existingStd: watch.std || watch.scheduledOut || null,
    existingSta: watch.sta || watch.scheduledIn || null,
    previousError: clean(watch.scheduleSyncError),
    previousRows: Number(watch.scheduleReturnedRows || 0),
    previousDiagnostic: watch.scheduleMatchDiagnostic || null,
  };
  if (watch.enabled === false) return { id: watch.id, skipped: true, scheduleDebug };

  // Schedule enrichment is independent from FR24 live polling. Future flights can
  // receive STD/STA without spending FR24 credits before their flight day.
  if (initialScheduleDecision.due) {
    try {
      const scheduleResult = await fetchAeroDataBoxSchedule(watch);
      const scheduleCandidate = scheduleResult?.candidate || null;
      scheduleDebug = {
        ...scheduleDebug,
        attempted: true,
        decision: "attempted",
        rows: Number(scheduleResult?.rows || 0),
        diagnostic: scheduleResult?.diagnostic || null,
      };
      const schedule = normalizeAeroDataBoxSchedule(scheduleCandidate, watch);
      if (Object.keys(schedule).length) {
        const previousStatus = upper(watch.status);
        const scheduleStatus = upper(schedule.scheduleStatus);
        const statusPatch = ["CANCELLED", "DELAYED", "DIVERTED"].includes(scheduleStatus) && !ACTIVE_STATUSES.has(previousStatus)
          ? { status: scheduleStatus }
          : (!previousStatus || previousStatus === "MONITORING" ? { status: "SCHEDULED" } : {});
        await docSnap.ref.set({
          ...schedule,
          ...statusPatch,
          scheduleSyncError: "",
          scheduleMatchDiagnostic: scheduleResult?.diagnostic || null,
          scheduleReturnedRows: Number(scheduleResult?.rows || 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        watch = { ...watch, ...schedule, ...statusPatch };
      } else {
        await docSnap.ref.set({
          scheduleSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          scheduleSyncError: "No exact AeroDataBox schedule match found for this flight/date/route.",
          scheduleMatchDiagnostic: scheduleResult?.diagnostic || null,
          scheduleReturnedRows: Number(scheduleResult?.rows || 0),
        }, { merge: true });
      }
    } catch (error) {
      scheduleDebug = {
        ...scheduleDebug,
        attempted: true,
        decision: "request-error",
        error: clean(error?.message || error).slice(0, 500),
      };
      console.error(`AeroDataBox schedule sync failed for ${watch.flightNumber}:`, error);
      await docSnap.ref.set({
        scheduleSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        scheduleSyncError: clean(error?.message || error).slice(0, 500),
      }, { merge: true });
    }
  }

  if (!shouldPoll(watch)) {
    return { id: watch.id, skipped: true, scheduleOnly: true, std: watch.std || null, sta: watch.sta || null, scheduleDebug };
  }

  try {
    const flight = await fetchFlight(watch);
    if (!flight) {
      await docSnap.ref.set({
        status: upper(watch.status) === "SCHEDULED" ? "SCHEDULED" : "MONITORING",
        provider: "flightradar24",
        syncError: "Flight is not live yet. FR24 public API exposes the flight once it is being tracked.",
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        nextPollMinutes: 15,
      }, { merge: true });
      return { id: watch.id, found: false, status: upper(watch.status) === "SCHEDULED" ? "SCHEDULED" : "MONITORING" };
    }

    const next = normalizeFlight(flight, watch);
    const events = buildEvents(watch, next, watch);
    const approachingNotified = watch.approachingNotified || events.some((event) => event.type === "approaching");
    const terminal = TERMINAL_STATUSES.has(upper(next.status));

    await docSnap.ref.set({
      ...next,
      scheduleProvider: watch.scheduleProvider || "aerodatabox",
      scheduleProviderStatus: watch.scheduleProviderStatus || "",
      departureTerminal: watch.departureTerminal || "",
      departureGate: watch.departureGate || "",
      arrivalTerminal: watch.arrivalTerminal || "",
      arrivalGate: watch.arrivalGate || "",
      approachingNotified,
      trackingComplete: terminal,
      ...(terminal ? { trackingCompletedAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      syncError: "",
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    for (const event of events) {
      await notifyEvent(db, watch, event, next);
    }

    return { id: watch.id, status: next.status, events: events.map((event) => event.type), std: next.std, sta: next.sta };
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
