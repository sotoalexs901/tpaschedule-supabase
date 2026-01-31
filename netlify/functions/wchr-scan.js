// netlify/functions/wchr-scan.js

function safeUpper(s) {
  return String(s || "").toUpperCase();
}

function normalizeSpaces(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function extractFirst(regex, text, groupIndex = 1) {
  const m = text.match(regex);
  if (!m) return "";
  return (m[groupIndex] || m[0] || "").trim();
}

function monthToNumber(mon) {
  const m = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };
  return m[mon] || "";
}

function parseDateToISO(up) {
  // Prefer "DATE 01JAN26" or any DDMMMYY
  const d1 = up.match(/\bDATE[: ]*\s*(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\b/);
  if (d1) {
    const dd = d1[1];
    const mon = monthToNumber(d1[2]);
    const yy = d1[3];
    return `20${yy}-${mon}-${dd}`;
  }

  const d2 = up.match(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\b/);
  if (d2) {
    const dd = d2[1];
    const mon = monthToNumber(d2[2]);
    const yy = d2[3];
    return `20${yy}-${mon}-${dd}`;
  }

  // ISO already
  const iso = extractFirst(/\b(20\d{2}-\d{2}-\d{2})\b/, up, 1);
  if (iso) return iso;

  // MM-DD-YYYY or MM/DD/YYYY
  const mdy = up.match(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/);
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`;

  return "";
}

function parseAirportOrCity(up, label) {
  // label = FROM or TO
  // Try 3-letter code first
  const code = extractFirst(new RegExp(`\\b${label}[: ]+\\s*([A-Z]{3})\\b`), up, 1);
  if (code) return code;

  // Try city words (TAMPA, MINNEAPOLIS, ST PAUL, etc.)
  // We map common ones (you can extend this list)
  const cityChunk = extractFirst(new RegExp(`\\b${label}[: ]+\\s*([A-Z][A-Z\\. ]{2,40})\\b`), up, 1);
  const city = normalizeSpaces(cityChunk).replace(/,$/, "");

  const cityMap = {
    "TAMPA": "TPA",
    "TAMPA FL": "TPA",
    "TAMPA, FL": "TPA",
    "TAMPA FLORIDA": "TPA",

    "MINNEAPOLIS": "MSP",
    "MINNEAPOLIS ST PAUL": "MSP",
    "MINNEAPOLIS/ST PAUL": "MSP",
    "ST PAUL": "MSP",
    "ST. PAUL": "MSP",
    "MINNEAPOLIS, ST PAUL": "MSP",
    "MINNEAPOLIS ST. PAUL": "MSP",
  };

  if (city) {
    // normalize punctuation
    const clean = city
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+MN\b/g, "")
      .replace(/\s+FL\b/g, "")
      .replace(/\./g, "")
      .trim();

    // try direct map
    if (cityMap[clean]) return cityMap[clean];

    // try contains
    for (const key of Object.keys(cityMap)) {
      const k = key.replace(/[.,]/g, "");
      if (clean.includes(k)) return cityMap[key];
    }
  }

  return "";
}

function parseAirlineAndFlight(up) {
  // Prefer explicit "FLIGHT SY 218" or "FLIGHT: SY 218"
  let airline = extractFirst(/\bFLIGHT[: ]+\s*([A-Z0-9]{2})\s*(\d{1,4})\b/, up, 1);
  let flight_number = extractFirst(/\bFLIGHT[: ]+\s*([A-Z0-9]{2})\s*(\d{1,4})\b/, up, 2);

  // Or "SY 218" anywhere
  if (!airline || !flight_number) {
    airline = airline || extractFirst(/\b([A-Z0-9]{2})\s*(\d{1,4})\b/, up, 1);
    flight_number = flight_number || extractFirst(/\b([A-Z0-9]{2})\s*(\d{1,4})\b/, up, 2);
  }

  // Safety: avoid picking "TO 218" etc. (rare)
  airline = (airline || "").trim();
  flight_number = (flight_number || "").trim();

  // Very short guardrails
  if (airline.length !== 2) airline = "";
  if (flight_number && flight_number.length > 4) flight_number = "";

  return { airline, flight_number };
}

function parseSeat(up) {
  // Prefer "SEAT 7F"
  const s1 = extractFirst(/\bSEAT[: ]+\s*([0-9]{1,2}[A-Z])\b/, up, 1);
  if (s1) return s1;

  // fallback: first seat-like token, but avoid "ZONE 5" etc.
  const all = up.match(/\b[0-9]{1,2}[A-Z]\b/g) || [];
  return all.length ? all[0] : "";
}

function parseGate(up) {
  // Prefer "GATE A15"
  const g1 = extractFirst(/\bGATE[: ]+\s*([A-Z]\d{1,3})\b/, up, 1);
  if (g1) return g1;

  // fallback: look for pattern " A15 " near "GATE"
  const g2 = extractFirst(/\b([A-Z]\d{1,3})\b/, up, 1);
  return g2 || "";
}

function parsePassenger(up) {
  // Prefer "NAME HAUER/KARALYN"
  let name =
    extractFirst(/\bNAME[: ]+\s*([A-Z' -]+\/[A-Z' -]+)\b/, up, 1) ||
    extractFirst(/\bPASSENGER[: ]+\s*([A-Z' -]+\/[A-Z' -]+)\b/, up, 1);

  name = normalizeSpaces(name);

  // Remove trailing junk if OCR attaches extra words
  // Cut at these markers if present
  const cutMarkers = [" FROM ", " TO ", " DATE ", " FLIGHT ", " GATE ", " SEAT ", " ZONE ", " CLASS "];
  for (const mk of cutMarkers) {
    const idx = safeUpper(name).indexOf(mk.trim());
    if (idx > 0) {
      name = name.slice(0, idx).trim();
    }
  }

  // Another guardrail: if name contains "FROM", split
  name = name.split(" FROM ")[0].trim();

  return name;
}

function parsePNR(up) {
  // Prefer explicit PNR label
  let pnr =
    extractFirst(/\bPNR[: ]+\s*([A-Z0-9]{5,8})\b/, up, 1) ||
    extractFirst(/\bRECORD LOCATOR[: ]+\s*([A-Z0-9]{5,8})\b/, up, 1) ||
    extractFirst(/\bLOCATOR[: ]+\s*([A-Z0-9]{5,8})\b/, up, 1) ||
    extractFirst(/\bCONFIRMATION[: ]+\s*([A-Z0-9]{5,8})\b/, up, 1) ||
    extractFirst(/\bCONF[: ]+\s*([A-Z0-9]{5,8})\b/, up, 1);

  if (pnr) return pnr;

  // Fallback: take the LAST 6-alnum token (common locator printed near barcode)
  // But avoid obvious non-locators
  const tokens = up.match(/\b[A-Z0-9]{6}\b/g) || [];
  const blacklist = new Set(["FLIGHT", "BOARDI", "BOARDP", "TICKET", "SCHEDULE"]);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!blacklist.has(t)) return t;
  }

  return "";
}

function parseBoardingPassText(rawText) {
  const text = normalizeSpaces(rawText);
  const up = safeUpper(text);

  const { airline, flight_number } = parseAirlineAndFlight(up);
  const flight_date = parseDateToISO(up);

  const origin = parseAirportOrCity(up, "FROM");
  const destination = parseAirportOrCity(up, "TO");

  const seat = parseSeat(up);
  const gate = parseGate(up);

  const passenger_name = parsePassenger(up);
  const pnr = parsePNR(up);

  return {
    passenger_name,
    airline,
    flight_number,
    flight_date,
    origin,
    destination,
    seat,
    gate,
    pnr,
    // Puedes encender esto para depurar:
    // debug_text: text,
  };
}

async function callGoogleVisionOCR(imageUrl, credentialsJsonString, languageHints = ["en"]) {
  const creds = JSON.parse(credentialsJsonString);

  const tokenRes = await fetch(`https://oauth2.googleapis.com/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await createJwt(creds),
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Failed to get Google token: ${tokenRes.status} ${t}`);
  }

  const { access_token } = await tokenRes.json();

  const visionRes = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri: imageUrl } },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints },
        },
      ],
    }),
  });

  if (!visionRes.ok) {
    const t = await visionRes.text();
    throw new Error(`Vision OCR failed: ${visionRes.status} ${t}`);
  }

  const data = await visionRes.json();
  const fullText =
    data?.responses?.[0]?.fullTextAnnotation?.text ||
    data?.responses?.[0]?.textAnnotations?.[0]?.description ||
    "";

  return fullText;
}

// Minimal JWT creation for Google service account (no extra deps)
async function createJwt(creds) {
  const header = { alg: "RS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };

  const enc = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${enc(header)}.${enc(payload)}`;

  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();

  const signature = sign
    .sign(creds.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsigned}.${signature}`;
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { image_url } = JSON.parse(event.body || "{}");
    if (!image_url) {
      return { statusCode: 400, body: "Missing image_url" };
    }

    const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credsJson) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Missing GOOGLE_APPLICATION_CREDENTIALS_JSON. Add your Google service account JSON in Netlify env vars.",
        }),
      };
    }

    const hints = (process.env.VISION_OCR_LANGUAGE_HINTS || "en")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const rawText = await callGoogleVisionOCR(image_url, credsJson, hints);
    const fields = parseBoardingPassText(rawText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
}
