// netlify/functions/send-wchr-operational-close-push.js

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

async function getManagementUsers(db) {
  const snap = await db.collection("users").get();

  return snap.docs
    .map((userDoc) => ({
      id: userDoc.id,
      ref: userDoc.ref,
      data: userDoc.data() || {},
    }))
    .filter((user) => {
      const role = normalizeRole(user.data.role);

      return (
        role === "duty_manager" ||
        role === "station_manager"
      );
    });
}

async function getEnabledTokensForUsers(db, users) {
  const tokenMap = new Map();

  await Promise.all(
    users.map(async (user) => {
      const tokenSnap = await user.ref
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      tokenSnap.docs.forEach((tokenDoc) => {
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
    if (response.success) return;

    const code = response.error?.code || "";

    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidItems.push(tokenItems[index]);
    }
  });

  if (!invalidItems.length) return;

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

  let operationalDate = "";

  try {
    const body = JSON.parse(event.body || "{}");

    operationalDate = normalizeText(
      body.operationalDate
    );
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!operationalDate) {
    return json(400, {
      ok: false,
      error: "Missing operationalDate.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const closureRef = db
      .collection("wchr_operational_closures")
      .doc(operationalDate);

    const closureSnap = await closureRef.get();

    if (!closureSnap.exists) {
      return json(404, {
        ok: false,
        error: "Operational closure not found.",
      });
    }

    const closure = closureSnap.data() || {};

    if (
      normalizeText(closure.status).toUpperCase() !==
      "CLOSED"
    ) {
      return json(409, {
        ok: false,
        error:
          "Operational closure is not in CLOSED status.",
      });
    }

    if (
      closure.managementPushStatus === "SENT"
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        operationalDate,
      });
    }

    const unresolvedCount =
      Number(closure.unresolvedCount || 0);

    const pendingDeliveryCount =
      Number(closure.pendingDeliveryCount || 0);

    const pendingStorageCount =
      Number(closure.pendingStorageCount || 0);

    const alertCount =
      Number(closure.alertCount || 0);

    if (unresolvedCount <= 0) {
      await closureRef.set(
        {
          managementPushStatus:
            "NOT_REQUIRED",
          managementPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-pending-items",
        operationalDate,
      });
    }

    const managementUsers =
      await getManagementUsers(db);

    const tokenItems =
      await getEnabledTokensForUsers(
        db,
        managementUsers
      );

    if (!tokenItems.length) {
      await closureRef.set(
        {
          managementPushStatus:
            "NO_TOKENS",
          managementPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        operationalDate,
        successCount: 0,
        failureCount: 0,
        noTokens: true,
      });
    }

    const bodyText =
      `Operational day ${operationalDate} closed with ${unresolvedCount} pending WCHR item${unresolvedCount === 1 ? "" : "s"}. ` +
      `Delivery: ${pendingDeliveryCount}. Storage: ${pendingStorageCount}.` +
      (alertCount > 0
        ? ` Alerts: ${alertCount}.`
        : "");

    const result = await admin
      .messaging()
      .sendEachForMulticast({
        tokens: tokenItems.map((item) => item.token),

        data: {
          title: "WCHR Operational Follow-Up",
          body: bodyText,
          url: "/wchr/admin/flights",
          route: "/wchr/admin/flights",
          type: "wchr_operational_close",
          operationalDate,
          unresolvedCount: String(
            unresolvedCount
          ),
          pendingDeliveryCount: String(
            pendingDeliveryCount
          ),
          pendingStorageCount: String(
            pendingStorageCount
          ),
          alertCount: String(
            alertCount
          ),
        },

        webpush: {
          headers: {
            Urgency: "high",
          },
          fcmOptions: {
            link: "/wchr/admin/flights",
          },
        },
      });

    await disableInvalidTokens(
      tokenItems,
      result.responses
    );

    await closureRef.set(
      {
        managementPushStatus:
          result.successCount > 0
            ? "SENT"
            : "NO_TOKENS",

        managementPushSuccessCount:
          result.successCount,

        managementPushFailureCount:
          result.failureCount,

        managementPushTargetRoles: [
          "duty_manager",
          "station_manager",
        ],

        managementPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        managementPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      operationalDate,
      successCount:
        result.successCount,
      failureCount:
        result.failureCount,
      targetUserCount:
        managementUsers.length,
    });
  } catch (error) {
    console.error(
      "send-wchr-operational-close-push error:",
      error
    );

    try {
      if (
        operationalDate &&
        admin.apps.length
      ) {
        await admin
          .firestore()
          .collection(
            "wchr_operational_closures"
          )
          .doc(operationalDate)
          .set(
            {
              managementPushStatus:
                "FAILED",
              managementPushError:
                error?.message ||
                "Unexpected Push error.",
              managementPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record WCHR closure Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      operationalDate,
      error:
        error?.message ||
        "Unexpected WCHR operational close Push error.",
    });
  }
};

// END send-wchr-operational-close-push.js
