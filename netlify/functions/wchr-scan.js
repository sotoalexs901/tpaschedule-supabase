// netlify/functions/wchr-scan.js

function safeUpper(s) {
  return String(s || "").toUpperCase();
}

function normalizeSpaces(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function extractFirst(regex, text) {
  const m = text.match(regex);
  return m ? (m[1] || m[0]) : "";
}

function parseBoardingPassText(rawText) {
  const text = normalizeSpaces(rawText);
  const up = safeUpper(text);

  // Airline / carrier code
  // Ej: "SUNCountry Airlines" no trae IATA directo, pero suele aparecer "SY 218"
  const airline = extractFirst(/\b([A-Z0-9]{2})\s?\d{1,4}\b/, up); // "SY" from "SY 218"

  // Flight number
  const flight_number = extractFirst(/\b[A-Z0-9]{2}\s?(\d{1,4})\b/, up); // "218"

  // Date formats common: 01JAN26, 08JAN26, 01-07-2026, 2026-01-07
  let flight_date = "";
  const d1 = up.match(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})\b/);
  if (d1) {
    const dd = d1[1];
    const mon = d1[2];
    const yy = d1[3];
    const monthMap = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    };
    const yyyy = `20${yy}`;
    flight_date = `${yyyy}-${monthMap[mon]}-${dd}`; // ISO para tu app
  } else {
    // fallback ISO already
    const dIso = extractFirst(/\b(20\d{2}-\d{2}-\d{2})\b/, up);
    if (dIso) flight_date = dIso;
    else {
      // fallback MM-DD-YYYY
      const dMDY = up.match(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/);
      if (dMDY) flight_date = `${dMDY[3]}-${dMDY[1]}-${dMDY[2]}`;
    }
  }

  // Origin/Destination (3-letter)
  // Often "FROM TPA" "TO MSP" or just "TPA MSP"
  const origin = extractFirst(/\bFROM[: ]\s*([A-Z]{3})\b/, up) || "";
  const destination = extractFirst(/\bTO[: ]\s*([A-Z]{3})\b/, up) || "";

  // Seat (e.g., 7F, 19A)
  const seat = extractFirst(/\bSEAT[: ]\s*([0-9]{1,2}[A-Z])\b/, up) || extractFirst(/\b([0-9]{1,2}[A-Z])\b/, up);

  // Gate (A15, F88, etc.)
  const gate = extractFirst(/\bGATE[: ]\s*([A-Z]\d{1,3})\b/, up);

  // PNR / Record Locator (often 6 alnum)
  const pnr = extractFirst(/\b(PNR|CONF|CONFIRMATION|RECORD LOCATOR|LOCATOR)[: ]\s*([A-Z0-9]{5,8})\b/, up)
    ? extractFirst(/\b(?:PNR|CONF|CONFIRMATION|RECORD LOCATOR|LOCATOR)[: ]\s*([A-Z0-9]{5,8})\b/, up)
    : extractFirst(/\b([A-Z0-9]{6})\b/, up); // fallback (can be noisy)

  // Passenger name:
  // Many passes have LAST/FIRST or "NAME: HAJLER/KARALYN"
  let passenger_name =
    extractFirst(/\bNAME[: ]\s*([A-Z' -]+\/[A-Z' -]+)\b/, up) ||
    extractFirst(/\bPASSENGER[: ]\s*([A-Z' -]+\/[A-Z' -]+)\b/, up);

  passenger_name = normalizeSpaces(passenger_name);

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
    // raw for debugging if needed:
    // rawText: rawText
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

  // Sign using WebCrypto if available
  // Netlify Node runtime supports crypto
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
