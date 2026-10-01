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
  if (admin.apps.length) {
    return admin.app();
  }

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

async function loadEmployees(db, accountKey) {
  const config = ACCOUNT_CONFIG[accountKey];
  if (!config) return [];

  const snap = await db.collection("employees").get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
    }))
    .filter(({ data }) => {
      const department = normalizeText(data.department).toUpperCase();
      const status = normalizeText(data.status).toLowerCase();

      const isActive =
        data.active === true ||
        status === "active";

      return (
        isActive &&
        config.departments.some(
          (allowed) => department === String(allowed).toUpperCase()
        )
      );
    })
    .map(({ id, data }) => ({
      id,
      name: publicEmployeeName(data),
    }))
    .filter((employee) => employee.name)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

exports.handler = async function handler(event) {
  try {
    getAdminApp();
    const db = admin.firestore();

    if (event.httpMethod === "GET") {
      const accountKey = normalizeText(
        event.queryStringParameters?.account
      ).toLowerCase();

      if (!ACCOUNT_CONFIG[accountKey]) {
        return json(400, {
          ok: false,
          error: "Invalid feedback account.",
        });
      }

      const employees = await loadEmployees(db, accountKey);

      return json(200, {
        ok: true,
        account: accountKey,
        employees,
      });
    }

    if (event.httpMethod !== "POST") {
      return json(405, {
        ok: false,
        error: "Method not allowed.",
      });
    }

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

    let employeeId = normalizeText(body.employeeId);
    let employeeName = normalizeText(body.employeeName);

    if (employeeId) {
      const employeeSnap = await db
        .collection("employees")
        .doc(employeeId)
        .get();

      if (!employeeSnap.exists) {
        employeeId = "";
        employeeName = "";
      } else {
        const employeeData = employeeSnap.data() || {};
        const department = normalizeText(employeeData.department).toUpperCase();
        const validDepartment = accountConfig.departments.some(
          (allowed) => department === String(allowed).toUpperCase()
        );
        const status = normalizeText(employeeData.status).toLowerCase();
        const isActive =
          employeeData.active === true ||
          status === "active";

        if (!validDepartment || !isActive) {
          employeeId = "";
          employeeName = "";
        } else {
          employeeName = publicEmployeeName(employeeData);
        }
      }
    }

    const comment = normalizeText(body.comments).slice(0, 1200);

    const payload = {
      account: accountKey,
      accountLabel: accountConfig.label,
      serviceDate,
      employeeId: employeeId || null,
      employeeName: employeeName || null,
      employeeKnown: Boolean(employeeId),
      rating,
      courteous,
      assistance,
      recommend,
      comment: comment || null,
      language,
      source: "qr",
      schemaVersion: 1,
      enteredManually: true,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db
      .collection("passenger_feedback")
      .add(payload);

    return json(200, {
      ok: true,
      id: ref.id,
    });
  } catch (error) {
    console.error("passenger-feedback error:", error);

    return json(500, {
      ok: false,
      error: error?.message || "Unexpected passenger feedback error.",
    });
  }
};
