const admin = require("firebase-admin");

const AWC_BASE = "https://aviationweather.gov/api/data";
const NWS_BASE = "https://api.weather.gov";
const AIRPORTS_COLLECTION = "monitored_airports";
const WEATHER_COLLECTION = "airport_weather_status";
const OP_ALERTS_COLLECTION = "operational_alerts";

const ICAO_OVERRIDES = {
  TPA: { icao: "KTPA", us: true },
  ATL: { icao: "KATL", us: true },
  MSP: { icao: "KMSP", us: true },
  MIA: { icao: "KMIA", us: true },
  MCO: { icao: "KMCO", us: true },
  FLL: { icao: "KFLL", us: true },
  JFK: { icao: "KJFK", us: true },
  LGA: { icao: "KLGA", us: true },
  EWR: { icao: "KEWR", us: true },
  DFW: { icao: "KDFW", us: true },
  CLT: { icao: "KCLT", us: true },
  ORD: { icao: "KORD", us: true },
  PHX: { icao: "KPHX", us: true },
  BOG: { icao: "SKBO", us: false },
  HAV: { icao: "MUHA", us: false },
  SAL: { icao: "MSLP", us: false },
  SJU: { icao: "TJSJ", us: true },
};

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function canonicalAirportCode(value) {
  const code = upper(value);
  if (code === "KTPA") return "TPA";
  return code;
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const credentialsJson = clean(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  if (!credentialsJson) throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not configured.");
  const serviceAccount = JSON.parse(credentialsJson);
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: clean(serviceAccount.private_key).replace(/\\n/g, "\n"),
    }),
  });
}

function stationFor(code) {
  const value = upper(code);
  if (ICAO_OVERRIDES[value]) return { code: value, ...ICAO_OVERRIDES[value] };
  if (/^[A-Z]{4}$/.test(value)) return { code: value, icao: value, us: /^K|^P[AHTG]|^TJ/.test(value) };
  if (/^[A-Z]{3}$/.test(value)) return { code: value, icao: value, us: false };
  return { code: value, icao: value, us: false };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AeroStationHub/2.0 station-operations",
      ...headers,
    },
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text.slice(0, 180)}`);
  }
  return response.json();
}

async function awc(path, params) {
  const url = new URL(`${AWC_BASE}/${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return fetchJson(url);
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseVisibility(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\+/g, "");
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function cloudCeiling(metar) {
  const clouds = Array.isArray(metar?.clouds) ? metar.clouds : [];
  const candidates = clouds
    .filter((item) => ["BKN", "OVC", "VV"].includes(upper(item?.cover)))
    .map((item) => Number(item?.base))
    .filter(Number.isFinite);
  return candidates.length ? Math.min(...candidates) : null;
}

function weatherRisk(metar, nwsAlerts) {
  const category = upper(metar?.fltCat || metar?.flightCategory || "");
  const gust = numberOrNull(metar?.wgst ?? metar?.windGust);
  const wind = numberOrNull(metar?.wspd ?? metar?.windSpeed);
  const vis = parseVisibility(metar?.visib ?? metar?.visibility);
  const wx = upper(metar?.wxString || metar?.wx || "");
  const severeNws = (nwsAlerts || []).some((a) => ["EXTREME", "SEVERE"].includes(upper(a?.severity)));

  if (severeNws || category === "LIFR" || (gust !== null && gust >= 40)) return "CRITICAL";
  if (category === "IFR" || (gust !== null && gust >= 30) || /\bTS|FZRA|SN\b/.test(wx) || (vis !== null && vis <= 3)) return "HIGH";
  if (category === "MVFR" || (gust !== null && gust >= 20) || (wind !== null && wind >= 25) || /RA|SHRA|BR|FG/.test(wx) || (vis !== null && vis <= 5)) return "MEDIUM";
  return "LOW";
}

function riskRank(level) {
  return ({ LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 })[upper(level)] || 1;
}

function summarizeTaf(taf) {
  if (!taf) return "";
  const raw = clean(taf.rawTAF || taf.rawTaf || taf.rawText || "");
  if (!raw) return "Forecast available";
  return raw.length > 230 ? `${raw.slice(0, 227)}…` : raw;
}

async function getNwsAlerts(lat, lon, enabled) {
  if (!enabled || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return [];
  try {
    const data = await fetchJson(`${NWS_BASE}/alerts/active?point=${Number(lat)},${Number(lon)}`, {
      Accept: "application/geo+json",
    });
    return (data?.features || []).slice(0, 5).map((feature) => ({
      id: clean(feature?.id),
      event: clean(feature?.properties?.event),
      severity: clean(feature?.properties?.severity),
      certainty: clean(feature?.properties?.certainty),
      urgency: clean(feature?.properties?.urgency),
      headline: clean(feature?.properties?.headline),
      expires: clean(feature?.properties?.expires),
    }));
  } catch (error) {
    console.warn("NWS alert lookup failed:", error.message);
    return [];
  }
}

async function maybeCreateOperationalAlert(db, airport, previous, next) {
  if (riskRank(next.riskLevel) < 3) return;
  const signature = `${airport.code}|${next.riskLevel}|${next.flightCategory || ""}|${next.weatherText || ""}|${next.activeAlerts?.[0]?.event || ""}`;
  if (previous?.lastAlertSignature === signature) return;

  const alertTitle = `${airport.code} Weather ${next.riskLevel === "CRITICAL" ? "Alert" : "Advisory"}`;
  const details = [];
  if (next.flightCategory) details.push(`Flight category: ${next.flightCategory}`);
  if (next.weatherText) details.push(next.weatherText);
  if (next.windSpeedKt !== null) details.push(`Wind ${next.windSpeedKt} kt${next.windGustKt ? ` gust ${next.windGustKt}` : ""}`);
  if (next.activeAlerts?.[0]?.event) details.push(next.activeAlerts[0].event);

  await db.collection(OP_ALERTS_COLLECTION).add({
    alertType: "WEATHER",
    category: "STATION_INTELLIGENCE",
    severity: next.riskLevel === "CRITICAL" ? "HIGH" : "MEDIUM",
    priority: next.riskLevel === "CRITICAL" ? "URGENT" : "MEDIUM",
    status: "OPEN",
    title: alertTitle,
    message: `${details.join(" · ")}. Potential operational impact; this is not a confirmed flight delay.`,
    source: "Airport Weather Intelligence",
    sourceId: airport.code,
    sourcePath: "/dashboard",
    airline: "",
    department: "",
    reportDate: new Date().toISOString().slice(0, 10),
    targetRoles: ["station_manager", "duty_manager"],
    createdByUserId: "system",
    createdByUsername: "aerostation-weather",
    createdByName: "AeroStation Hub",
    createdByRole: "system",
    metadata: {
      airport: airport.code,
      icao: next.icao,
      riskLevel: next.riskLevel,
      flightCategory: next.flightCategory,
      weatherText: next.weatherText,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  next.lastAlertSignature = signature;
}

async function syncAirport(db, airport) {
  const station = stationFor(airport.code);
  if (!station.icao) return { code: airport.code, skipped: true, reason: "NO_STATION" };

  let metar = null;
  let taf = null;
  try {
    const metars = await awc("metar", { ids: station.icao, format: "json", taf: "false" });
    metar = Array.isArray(metars) ? metars[0] : metars?.data?.[0] || null;
  } catch (error) {
    console.warn(`METAR ${station.icao} failed:`, error.message);
  }

  try {
    const tafs = await awc("taf", { ids: station.icao, format: "json" });
    taf = Array.isArray(tafs) ? tafs[0] : tafs?.data?.[0] || null;
  } catch (error) {
    console.warn(`TAF ${station.icao} failed:`, error.message);
  }

  const lat = numberOrNull(metar?.lat ?? metar?.latitude);
  const lon = numberOrNull(metar?.lon ?? metar?.longitude);
  const activeAlerts = await getNwsAlerts(lat, lon, station.us);
  const riskLevel = weatherRisk(metar, activeAlerts);
  const ref = db.collection(WEATHER_COLLECTION).doc(airport.code);
  const previousSnap = await ref.get();
  const previous = previousSnap.exists ? previousSnap.data() : {};

  const next = {
    code: airport.code,
    icao: station.icao,
    label: clean(airport.label),
    enabled: airport.enabled !== false,
    airportName: clean(metar?.name || taf?.name || ""),
    latitude: lat,
    longitude: lon,
    flightCategory: upper(metar?.fltCat || metar?.flightCategory || ""),
    weatherText: clean(metar?.wxString || metar?.wx || ""),
    temperatureC: numberOrNull(metar?.temp ?? metar?.temperature),
    dewpointC: numberOrNull(metar?.dewp ?? metar?.dewpoint),
    windDirection: clean(metar?.wdir ?? metar?.windDirection ?? ""),
    windSpeedKt: numberOrNull(metar?.wspd ?? metar?.windSpeed),
    windGustKt: numberOrNull(metar?.wgst ?? metar?.windGust),
    visibilitySm: parseVisibility(metar?.visib ?? metar?.visibility),
    ceilingFt: cloudCeiling(metar),
    altimeter: numberOrNull(metar?.altim ?? metar?.altimeter),
    rawMetar: clean(metar?.rawOb || metar?.rawMETAR || metar?.rawText || ""),
    tafSummary: summarizeTaf(taf),
    rawTaf: clean(taf?.rawTAF || taf?.rawTaf || taf?.rawText || ""),
    activeAlerts,
    riskLevel,
    observedAt: clean(metar?.reportTime || metar?.obsTime || metar?.receiptTime || ""),
    source: "AviationWeather.gov / NWS",
    lastSyncOk: Boolean(metar || taf),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastAlertSignature: previous?.lastAlertSignature || "",
  };

  await maybeCreateOperationalAlert(db, airport, previous, next);
  await ref.set(next, { merge: true });
  return { code: airport.code, icao: station.icao, riskLevel, ok: Boolean(metar || taf) };
}

async function runAirportWeatherSync() {
  getAdminApp();
  const db = admin.firestore();
  const snapshot = await db.collection(AIRPORTS_COLLECTION).get();
  const configured = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => item.enabled !== false && clean(item.code));

  const airportsByCode = new Map();
  for (const item of configured) {
    const code = canonicalAirportCode(item.code);
    if (!code) continue;
    const existing = airportsByCode.get(code);
    airportsByCode.set(code, {
      ...(existing || {}),
      ...item,
      code,
      label: code === "TPA" ? "Tampa International Airport" : clean(item.label),
    });
  }

  // TPA is the station home airport and is always monitored exactly once.
  if (!airportsByCode.has("TPA")) {
    airportsByCode.set("TPA", { code: "TPA", label: "Tampa International Airport", enabled: true });
  }

  // Remove stale weather-cache documents for airports no longer monitored, and
  // remove legacy KTPA because TPA/KTPA represent the same airport in the UI.
  const activeCodes = new Set(airportsByCode.keys());
  const weatherSnapshot = await db.collection(WEATHER_COLLECTION).get();
  const cleanup = [];
  for (const weatherDoc of weatherSnapshot.docs) {
    const data = weatherDoc.data() || {};
    const rawCode = upper(data.code || weatherDoc.id);
    const canonical = canonicalAirportCode(rawCode);
    if (rawCode === "KTPA" || !activeCodes.has(canonical)) {
      cleanup.push(weatherDoc.ref.delete());
    }
  }
  if (cleanup.length) await Promise.all(cleanup);

  const results = [];
  for (const airport of airportsByCode.values()) {
    try {
      results.push(await syncAirport(db, airport));
    } catch (error) {
      console.error(`Weather sync failed for ${airport.code}:`, error);
      results.push({ code: airport.code, ok: false, error: String(error?.message || error) });
    }
  }
  return { ok: true, count: results.length, results };
}

module.exports = { runAirportWeatherSync };
