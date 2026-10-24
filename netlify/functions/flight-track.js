const admin = require("firebase-admin");

const FR24_API_BASE = "https://fr24api.flightradar24.com/api";

function clean(value) {
  return String(value ?? "").trim();
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

function fr24Headers() {
  const token = clean(process.env.FLIGHTRADAR24_API_TOKEN);
  if (!token) throw new Error("FLIGHTRADAR24_API_TOKEN is not configured.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Version": "v1",
  };
}

function normalizeTrackPayload(payload) {
  const candidates = [];
  if (Array.isArray(payload)) candidates.push(...payload);
  if (Array.isArray(payload?.data)) candidates.push(...payload.data);
  if (payload?.data && !Array.isArray(payload.data)) candidates.push(payload.data);
  if (payload && typeof payload === "object") candidates.push(payload);

  let rawPoints = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate?.tracks)) {
      rawPoints = candidate.tracks;
      break;
    }
    if (Array.isArray(candidate?.track)) {
      rawPoints = candidate.track;
      break;
    }
    if (Array.isArray(candidate?.positions)) {
      rawPoints = candidate.positions;
      break;
    }
  }

  const points = rawPoints
    .map((point) => ({
      lat: Number(point?.lat),
      lon: Number(point?.lon),
      alt: Number.isFinite(Number(point?.alt)) ? Number(point.alt) : null,
      speed: Number.isFinite(Number(point?.gspeed ?? point?.speed)) ? Number(point.gspeed ?? point.speed) : null,
      timestamp: clean(point?.timestamp || point?.time || point?.datetime),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));

  if (points.length <= 120) return points;
  const step = Math.ceil(points.length / 120);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed." }) };
  }

  const flightId = clean(event.queryStringParameters?.flight_id);
  if (!/^[a-f0-9]{6,16}$/i.test(flightId)) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid FR24 flight_id is required." }) };
  }

  try {
    getAdminApp();
    const db = admin.firestore();

    const watchSnap = await db
      .collection("flight_watchlist")
      .where("fr24Id", "==", flightId)
      .limit(1)
      .get();

    if (watchSnap.empty || watchSnap.docs[0].data()?.enabled === false) {
      return { statusCode: 404, body: JSON.stringify({ error: "Flight is not in the active AeroStation watchlist." }) };
    }

    const url = new URL(`${FR24_API_BASE}/flight-tracks`);
    url.searchParams.set("flight_id", flightId);
    const response = await fetch(url, { headers: fr24Headers() });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Flightradar24 ${response.status}: ${body.slice(0, 220)}`);
    }

    const payload = await response.json();
    const points = normalizeTrackPayload(payload);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=120",
      },
      body: JSON.stringify({ ok: true, flightId, points }),
    };
  } catch (error) {
    console.error("Flight track request failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: clean(error?.message || error) || "Unable to load flight track." }),
    };
  }
};
