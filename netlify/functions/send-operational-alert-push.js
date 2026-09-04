// netlify/functions/send-operational-alert-push.js

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

  const projectId =
    process.env.FIREBASE_PROJECT_ID;

  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL;

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
      "Content-Type":
        "application/json; charset=utf-8",
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

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter(Boolean)
    )
  );
}

function buildBody(alert = {}) {
  const message =
    normalizeText(alert.message) ||
    normalizeText(alert.description) ||
    "An Operational Alert requires review.";

  const context = [
    normalizeText(alert.airline),
    normalizeText(alert.reportDate),
    normalizeText(alert.department),
  ]
    .filter(Boolean)
    .join(" \u00B7 ");

  if (context && message) {
    return `${context} - ${message}`.slice(0, 220);
  }

  return message.slice(0, 220);
}

async function getTargetUsers(db, targetRoles) {
  const normalizedTargetRoles =
    new Set(targetRoles.map(normalizeRole));

  const usersSnap = await db
    .collection("users")
    .get();

  return usersSnap.docs
    .map((userDoc) => ({
      id: userDoc.id,
      data: userDoc.data() || {},
    }))
    .filter((user) =>
      normalizedTargetRoles.has(
        normalizeRole(user.data.role)
      )
    );
}

async function getEnabledTokensForUsers(
  db,
  users
) {
  const tokenMap = new Map();

  await Promise.all(
    users.map(async (user) => {
      const tokenSnap = await db
        .collection("users")
        .doc(user.id)
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      tokenSnap.docs.forEach((tokenDoc) => {
        const data = tokenDoc.data() || {};
        const token = normalizeText(data.token);

        if (!token) {
          return;
        }

        if (!tokenMap.has(token)) {
          tokenMap.set(token, {
            token,
            ref: tokenDoc.ref,
            userId: user.id,
          });
        }
      });
    })
  );

  return Array.from(tokenMap.values());
}

function chunkArray(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

async function disableInvalidTokens(
  invalidTokenItems
) {
  if (!invalidTokenItems.length) {
    return;
  }

  await Promise.all(
    invalidTokenItems.map((item) =>
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

  let alertId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    alertId = normalizeText(body.alertId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!alertId) {
    return json(400, {
      ok: false,
      error: "Missing alertId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const alertRef = db
      .collection("operational_alerts")
      .doc(alertId);

    const alertSnap = await alertRef.get();

    if (!alertSnap.exists) {
      return json(404, {
        ok: false,
        error: "Operational Alert not found.",
      });
    }

    const alert = alertSnap.data() || {};

    // Prevent repeated sends if the browser retries.
    if (alert.pushStatus === "SENT") {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        alertId,
      });
    }

    const targetRoles = uniqueStrings(
      Array.isArray(alert.targetRoles)
        ? alert.targetRoles
        : ["station_manager", "duty_manager"]
    );

    if (!targetRoles.length) {
      await alertRef.set(
        {
          pushStatus: "SKIPPED",
          pushError:
            "No target roles were configured.",
          pushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-target-roles",
        alertId,
      });
    }

    const users = await getTargetUsers(
      db,
      targetRoles
    );

    const tokenItems =
      await getEnabledTokensForUsers(
        db,
        users
      );

    if (!tokenItems.length) {
      await alertRef.set(
        {
          pushStatus: "NO_TOKENS",
          pushTargetRoles: targetRoles,
          pushTargetUserCount: users.length,
          pushSuccessCount: 0,
          pushFailureCount: 0,
          pushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-tokens",
        alertId,
        targetRoles,
        targetUserCount: users.length,
      });
    }

    const title =
      normalizeText(alert.title) ||
      "Operational Alert";

    const body = buildBody(alert);

    const batches =
      chunkArray(tokenItems, 500);

    let successCount = 0;
    let failureCount = 0;
    const invalidTokenItems = [];

    for (const batch of batches) {
      const result =
        await admin
          .messaging()
          .sendEachForMulticast({
            tokens: batch.map(
              (item) => item.token
            ),

            data: {
              title,
              body,
              url: "/dashboard",
              type: "operational_alert",
              alertId,
              severity:
                normalizeText(alert.severity),
              priority:
                normalizeText(alert.priority),
            },

            webpush: {
              headers: {
                Urgency:
                  String(alert.severity || "")
                    .toUpperCase() === "HIGH"
                    ? "high"
                    : "normal",
              },
            },
          });

      successCount += result.successCount;
      failureCount += result.failureCount;

      result.responses.forEach(
        (response, index) => {
          if (response.success) {
            return;
          }

          const code =
            response.error?.code || "";

          if (
            code ===
              "messaging/registration-token-not-registered" ||
            code ===
              "messaging/invalid-registration-token"
          ) {
            invalidTokenItems.push(
              batch[index]
            );
          }
        }
      );
    }

    await disableInvalidTokens(
      invalidTokenItems
    );

    await alertRef.set(
      {
        pushStatus:
          successCount > 0
            ? "SENT"
            : "FAILED",

        pushTargetRoles: targetRoles,
        pushTargetUserCount: users.length,
        pushTokenCount: tokenItems.length,
        pushSuccessCount: successCount,
        pushFailureCount: failureCount,
        pushSentAt:
          successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        pushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      alertId,
      targetRoles,
      targetUserCount: users.length,
      tokenCount: tokenItems.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    console.error(
      "send-operational-alert-push error:",
      error
    );

    try {
      if (alertId && admin.apps.length) {
        await admin
          .firestore()
          .collection("operational_alerts")
          .doc(alertId)
          .set(
            {
              pushStatus: "FAILED",
              pushError:
                error?.message ||
                "Unexpected Push error.",
              pushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      alertId,
      error:
        error?.message ||
        "Unexpected Push notification error.",
    });
  }
};

// END send-operational-alert-push.js
