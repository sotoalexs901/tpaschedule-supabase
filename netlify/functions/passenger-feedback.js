// netlify/functions/passenger-feedback.js

const admin = require("firebase-admin");

const MIN_FEEDBACK_DATE = "2026-07-01";

const ACCOUNT_CONFIG = {
  wchr: {
    label: "WCHR",
    departments: ["WCHR"],
  },
  "sun-country": {
    label: "Sun Country",
    departments: ["SY"],
  },
  "world-atlantic": {
    label: "World Atlantic",
    departments: ["WL"],
  },
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const credentialsJson = String(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || ""
  ).trim();

  if (credentialsJson) {
    const serviceAccount = JSON.parse(credentialsJson);

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: String(serviceAccount.private_key || "").replace(/\\n/g, "\n"),
      }),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(
    process.env.FIREBASE_PRIVATE_KEY || ""
  ).replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeMatch(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function validDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function publicEmployeeName(data) {
  return normalizeText(
    data?.name ||
      data?.fullName ||
      data?.displayName ||
      data?.employeeName
  );
}

function storedFirstName(data) {
  const fullName = publicEmployeeName(data);
  const parts = fullName.split(/\s+/).filter(Boolean);

  // Primary storage convention: LAST NAME + FIRST NAME.
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
}

function employeeNameTokens(data) {
  const fullName = publicEmployeeName(data);

  return fullName
    .split(/\s+/)
    .map((part) => normalizeMatch(part))
    .filter(Boolean);
}

function employeeFirstNameCandidates(data) {
  const fullName = publicEmployeeName(data);
  const parts = fullName.split(/\s+/).filter(Boolean);
  const candidates = new Set();

  // Primary convention: LAST NAME + FIRST NAME.
  if (parts[1]) candidates.add(normalizeMatch(parts[1]));

  // Some legacy/imported records may not strictly follow the convention.
  // Include all name tokens as fallbacks so a passenger-entered first name
  // can still resolve when the record order differs.
  employeeNameTokens(data).forEach((token) => candidates.add(token));

  return candidates;
}

function isEmployeeActive(data) {
  const status = normalizeText(data?.status).toLowerCase();

  if (data?.active === false) return false;
  if (status === "inactive" || status === "terminated") return false;

  return data?.active === true || status === "active" || (!status && data?.active !== false);
}

function employeeBelongsToAccount(data, accountConfig) {
  const department = normalizeText(data?.department).toUpperCase();

  return accountConfig.departments.some(
    (allowed) => department === String(allowed).toUpperCase()
  );
}

async function matchEmployeeByFirstName(db, accountConfig, typedFirstName) {
  const typed = normalizeMatch(typedFirstName);

  if (!typed) {
    return {
      status: "not_provided",
      employeeId: null,
      employeeName: null,
      candidates: [],
    };
  }

  const snap = await db.collection("employees").get();

  const candidates = snap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
    }))
    .filter(({ data }) =>
      isEmployeeActive(data) &&
      employeeBelongsToAccount(data, accountConfig) &&
      employeeFirstNameCandidates(data).has(typed)
    )
    .map(({ id, data }) => ({
      id,
      name: publicEmployeeName(data),
      firstName: storedFirstName(data),
    }));

  if (candidates.length === 1) {
    return {
      status: "matched",
      employeeId: candidates[0].id,
      employeeName: candidates[0].name,
      candidates: [],
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      employeeId: null,
      employeeName: null,
      candidates: candidates.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    };
  }

  return {
    status: "not_found",
    employeeId: null,
    employeeName: null,
    candidates: [],
  };
}

function cleanEmail(value) {
  return normalizeText(value).slice(0, 160);
}

function cleanPhone(value) {
  return normalizeText(value).slice(0, 40);
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, {
        ok: false,
        error: "Method not allowed.",
      });
    }

    getAdminApp();
    const db = admin.firestore();

    const body = JSON.parse(event.body || "{}");

    const accountKey = normalizeText(body.account).toLowerCase();
    const accountConfig = ACCOUNT_CONFIG[accountKey];

    if (!accountConfig) {
      return json(400, {
        ok: false,
        error: "Invalid feedback account.",
      });
    }

    const serviceDate = normalizeText(body.serviceDate);
    const today = todayUtcDateString();

    if (
      !validDateString(serviceDate) ||
      serviceDate < MIN_FEEDBACK_DATE ||
      serviceDate > today
    ) {
      return json(400, {
        ok: false,
        error: "Invalid service date.",
      });
    }

    const rating = Number(body.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json(400, {
        ok: false,
        error: "Invalid rating.",
      });
    }

    const courteous = normalizeText(body.courteous).toLowerCase();
    const assistance = normalizeText(body.assistance).toLowerCase();
    const recommend = normalizeText(body.recommend).toLowerCase();
    const language = normalizeText(body.language).toLowerCase();

    if (!["excellent", "good", "fair", "poor"].includes(courteous)) {
      return json(400, { ok: false, error: "Invalid courtesy response." });
    }

    if (!["yes", "partially", "no"].includes(assistance)) {
      return json(400, { ok: false, error: "Invalid assistance response." });
    }

    if (!["yes", "no"].includes(recommend)) {
      return json(400, { ok: false, error: "Invalid recommendation response." });
    }

    if (!["en", "es", "pt"].includes(language)) {
      return json(400, { ok: false, error: "Invalid language." });
    }

    const passengerName = normalizeText(body.passengerName).slice(0, 120);
    const flightNumber = normalizeText(body.flightNumber)
      .toUpperCase()
      .slice(0, 20);
    const pnr = normalizeText(body.pnr)
      .toUpperCase()
      .replace(/\s+/g, "")
      .slice(0, 20);

    const employeeFirstName = normalizeText(body.employeeFirstName).slice(0, 60);
    const employeeMatch = await matchEmployeeByFirstName(
      db,
      accountConfig,
      employeeFirstName
    );

    const comment = normalizeText(body.comments).slice(0, 1200);

    const contactRequested = body.contactRequested === true;
    const contactEmail = contactRequested ? cleanEmail(body.contactEmail) : "";
    const contactPhone = contactRequested ? cleanPhone(body.contactPhone) : "";

    if (contactRequested && !contactEmail && !contactPhone) {
      return json(400, {
        ok: false,
        error: "At least one contact method is required when contact is requested.",
      });
    }

    if (!isValidEmail(contactEmail)) {
      return json(400, {
        ok: false,
        error: "Invalid email address.",
      });
    }

    const payload = {
      account: accountKey,
      accountLabel: accountConfig.label,
      serviceDate,

      passengerName: passengerName || null,
      flightNumber: flightNumber || null,
      pnr: pnr || null,

      employeeTypedFirstName: employeeFirstName || null,
      employeeMatchStatus: employeeMatch.status,
      employeeId: employeeMatch.employeeId,
      employeeName: employeeMatch.employeeName,
      employeeMatchCandidates:
        employeeMatch.status === "ambiguous"
          ? employeeMatch.candidates
          : [],

      rating,
      courteous,
      assistance,
      recommend,
      comment: comment || null,

      contactRequested,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,

      language,
      source: "qr",
      schemaVersion: 2,
      enteredManually: true,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db
      .collection("passenger_feedback")
      .add(payload);

    return json(200, {
      ok: true,
      id: ref.id,
      employeeMatchStatus: employeeMatch.status,
    });
  } catch (error) {
    console.error("passenger-feedback error:", error);

    return json(500, {
      ok: false,
      error: error?.message || "Unexpected passenger feedback error.",
    });
  }
