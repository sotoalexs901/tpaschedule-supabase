// netlify/functions/send-timeoff-submitted-push.js

const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  const credentialsJson = String(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || ""
  ).trim();

  if (credentialsJson) {
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(credentialsJson);
    } catch {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON contains invalid JSON."
      );
    }

    if (
      !serviceAccount?.project_id ||
      !serviceAccount?.client_email ||
      !serviceAccount?.private_key
    ) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_JSON is missing required Firebase service account fields."
      );
    }

    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: String(
          serviceAccount.private_key || ""
        ).replace(/\\n/g, "\n"),
      }),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(
    process.env.FIREBASE_PRIVATE_KEY || ""
  ).replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured."
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

function normalizeRole(value) {
  return normalizeText(value).toLowerCase();
}

function formatDate(value) {
  const raw = normalizeText(value);

  if (!raw) return "";

  const d = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return raw;
  }

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRange(request) {
  const start = normalizeText(request.startDate);
  const end = normalizeText(request.endDate || request.startDate);

  if (!start) {
    return "";
  }

  if (!end || end === start) {
    return formatDate(start);
  }

  return `${formatDate(start)} to ${formatDate(end)}`;
}

async function getManagementUsers(db) {
  const snap = await db
    .collection("users")
    .get();

  return snap.docs
    .map((userDoc) => ({
      id: userDoc.id,
      data: userDoc.data() || {},
    }))
    .filter((user) => {
      const role = normalizeRole(user.data.role);

      return (
        role === "station_manager" ||
        role === "duty_manager"
      );
    });
}

async function getEnabledTokensForUsers(db, users) {
  const tokenMap = new Map();

  await Promise.all(
    users.map(async (user) => {
      const snap = await db
        .collection("users")
        .doc(user.id)
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      snap.docs.forEach((tokenDoc) => {
        const token = normalizeText(tokenDoc.data()?.token);

        if (!token || tokenMap.has(token)) {
          return;
        }

        tokenMap.set(token, {
          token,
          ref: tokenDoc.ref,
          userId: user.id,
        });
      });
    })
  );

  return Array.from(tokenMap.values());
}

async function disableInvalidTokens(tokenItems, responses) {
  const invalidItems = [];

  responses.forEach((response, index) => {
    if (response.success) {
      return;
    }

    const code = response.error?.code || "";

    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidItems.push(tokenItems[index]);
    }
  });

  if (!invalidItems.length) {
    return;
  }

  await Promise.all(
    invalidItems.map((item) =>
      item.ref.set(
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

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  let requestId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    requestId = normalizeText(body.requestId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!requestId) {
    return json(400, {
      ok: false,
      error: "Missing requestId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const requestRef = db
      .collection("timeOffRequests")
      .doc(requestId);

    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return json(404, {
        ok: false,
        error: "Time Off request not found.",
      });
    }

    const request = requestSnap.data() || {};

    if (
      normalizeText(request.status).toLowerCase() !== "pending"
    ) {
      return json(409, {
        ok: false,
        error: "Time Off request is not pending.",
      });
    }

    if (request.managementSubmissionPushStatus === "SENT") {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        requestId,
      });
    }

    const managers = await getManagementUsers(db);

    const tokenItems = await getEnabledTokensForUsers(
      db,
      managers
    );

    if (!tokenItems.length) {
      await requestRef.set(
        {
          managementSubmissionPushStatus: "NO_TOKENS",
          managementSubmissionPushSuccessCount: 0,
          managementSubmissionPushFailureCount: 0,
          managementSubmissionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-management-tokens",
        requestId,
      });
    }

    const employeeName =
      normalizeText(request.employeeName) || "Employee";

    const reasonType =
      normalizeText(request.reasonType) || "Time Off";

    const range = formatRange(request);

    const title = `${reasonType} Request Submitted`;

    const body = range
      ? `${employeeName} submitted a ${reasonType} request for ${range}.`
      : `${employeeName} submitted a ${reasonType} request.`;

    const result = await admin
      .messaging()
      .sendEachForMulticast({
        tokens: tokenItems.map((item) => item.token),

        data: {
          title,
          body,
          url: "/time-off/manage",
          type: "timeoff_submitted",
          requestId,
          employeeId: normalizeText(request.employeeId),
          reasonType,
        },

        webpush: {
          headers: {
            Urgency: "normal",
          },
        },
      });

    await disableInvalidTokens(
      tokenItems,
      result.responses
    );

    await requestRef.set(
      {
        managementSubmissionPushStatus:
          result.successCount > 0 ? "SENT" : "FAILED",

        managementSubmissionPushSuccessCount:
          result.successCount,

        managementSubmissionPushFailureCount:
          result.failureCount,

        managementSubmissionPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        managementSubmissionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      requestId,
      targetRoles: ["station_manager", "duty_manager"],
      targetUserCount: managers.length,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error(
      "send-timeoff-submitted-push error:",
      error
    );

    try {
      if (requestId && admin.apps.length) {
        await admin
          .firestore()
          .collection("timeOffRequests")
          .doc(requestId)
          .set(
            {
              managementSubmissionPushStatus: "FAILED",
              managementSubmissionPushError:
                error?.message ||
                "Unexpected Push error.",
              managementSubmissionPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Time Off Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      requestId,
      error:
        error?.message ||
        "Unexpected Time Off Push error.",
    });
  }
};

// END send-timeoff-submitted-push.js
