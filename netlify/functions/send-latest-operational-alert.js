// netlify/functions/send-latest-operational-alert.js

const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(
    process.env.FIREBASE_PRIVATE_KEY || ""
  ).replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin environment variables are not fully configured."
    );
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

function timestampMs(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAlertActive(data = {}) {
  if (data.active === false || data.isActive === false) {
    return false;
  }

  if (data.closed === true || data.resolved === true) {
    return false;
  }

  const status = normalizeText(
    data.status ||
      data.alertStatus ||
      data.state
  ).toUpperCase();

  if (
    [
      "CLOSED",
      "RESOLVED",
      "COMPLETED",
      "CANCELLED",
      "CANCELED",
      "ARCHIVED",
      "INACTIVE",
    ].includes(status)
  ) {
    return false;
  }

  return true;
}

function getAlertTime(data = {}) {
  return Math.max(
    timestampMs(data.updatedAt),
    timestampMs(data.createdAt),
    timestampMs(data.timestamp),
    timestampMs(data.date),
    timestampMs(data.alertDate)
  );
}

function buildAlertTitle(data = {}) {
  return (
    normalizeText(data.pushTitle) ||
    normalizeText(data.title) ||
    normalizeText(data.alertTitle) ||
    normalizeText(data.type) ||
    normalizeText(data.category) ||
    "Operational Alert"
  );
}

function buildAlertBody(data = {}) {
  const primary =
    normalizeText(data.pushBody) ||
    normalizeText(data.message) ||
    normalizeText(data.description) ||
    normalizeText(data.details) ||
    normalizeText(data.summary) ||
    normalizeText(data.note);

  const flight =
    normalizeText(data.flightNumber) ||
    normalizeText(data.flight) ||
    normalizeText(data.flight_number);

  const airline =
    normalizeText(data.airline) ||
    normalizeText(data.carrier);

  const gate =
    normalizeText(data.gate) ||
    normalizeText(data.location);

  const context = [
    airline,
    flight,
    gate ? `Gate ${gate}` : "",
  ]
    .filter(Boolean)
    .join(" \u00B7 ");

  if (primary && context) {
    return `${context} - ${primary}`.slice(0, 220);
  }

  if (primary) {
    return primary.slice(0, 220);
  }

  if (context) {
    return context.slice(0, 220);
  }

  return "An active operational alert requires review.";
}

async function findTestUser(db) {
  const username = normalizeText(
    process.env.PUSH_TEST_USERNAME
  );

  if (!username) {
    throw new Error(
      "PUSH_TEST_USERNAME is not configured in Netlify."
    );
  }

  const usersRef = db.collection("users");

  const fields = [
    "username",
    "loginUsername",
  ];

  for (const field of fields) {
    const snap = await usersRef
      .where(field, "==", username)
      .limit(1)
      .get();

    if (!snap.empty) {
      const userDoc = snap.docs[0];

      return {
        id: userDoc.id,
        data: userDoc.data() || {},
      };
    }
  }

  throw new Error(
    `No user was found for PUSH_TEST_USERNAME=${username}.`
  );
}

async function getEnabledTokens(db, userId) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return snap.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};

      return {
        ref: docSnap.ref,
        token: normalizeText(data.token),
      };
    })
    .filter((item) => item.token);
}

async function getLatestActiveAlert(db) {
  const snap = await db
    .collection("operational_alerts")
    .get();

  if (snap.empty) {
    return null;
  }

  const active = snap.docs
    .map((docSnap) => ({
      id: docSnap.id,
      data: docSnap.data() || {},
    }))
    .filter((item) => isAlertActive(item.data))
    .sort(
      (a, b) =>
        getAlertTime(b.data) -
        getAlertTime(a.data)
    );

  return active[0] || null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const testUser = await findTestUser(db);

    const tokenItems = await getEnabledTokens(
      db,
      testUser.id
    );

    if (!tokenItems.length) {
      return json(409, {
        ok: false,
        error:
          "No enabled Push tokens were found for the configured test user.",
        userId: testUser.id,
      });
    }

    const alert = await getLatestActiveAlert(db);

    if (!alert) {
      return json(404, {
        ok: false,
        error:
          "No active Operational Alerts were found.",
      });
    }

    const title = buildAlertTitle(alert.data);
    const body = buildAlertBody(alert.data);

    const message = {
      tokens: tokenItems.map((item) => item.token),

      data: {
        title,
        body,
        url: "/dashboard",
        type: "operational_alert",
        alertId: String(alert.id),
      },

      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    };

    const result =
      await admin
        .messaging()
        .sendEachForMulticast(message);

    const invalidIndexes = [];

    result.responses.forEach(
      (response, index) => {
        if (response.success) return;

        const code =
          response.error?.code || "";

        if (
          code ===
            "messaging/registration-token-not-registered" ||
          code ===
            "messaging/invalid-registration-token"
        ) {
          invalidIndexes.push(index);
        }
      }
    );

    if (invalidIndexes.length) {
      await Promise.all(
        invalidIndexes.map((index) =>
          tokenItems[index].ref.set(
            {
              enabled: false,
              disabledReason: "invalid-token",
              disabledAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
    }

    return json(200, {
      ok: true,
      userId: testUser.id,
      username:
        testUser.data.username ||
        testUser.data.loginUsername ||
        process.env.PUSH_TEST_USERNAME,
      alertId: alert.id,
      title,
      body,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error(
      "send-latest-operational-alert error:",
      error
    );

    return json(500, {
      ok: false,
      error:
        error?.message ||
        "Unexpected Push notification error.",
    });
  }
};

// END send-latest-operational-alert.js
