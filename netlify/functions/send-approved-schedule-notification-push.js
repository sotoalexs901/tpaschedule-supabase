// netlify/functions/send-approved-schedule-notification-push.js

const admin = require("firebase-admin");

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
        privateKey: String(serviceAccount.private_key || "")
          .replace(/\\n/g, "\n"),
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

function clean(value) {
  return String(value ?? "").trim();
}

function safeKey(value) {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function formatWeek(weekStart) {
  const start = new Date(`${weekStart}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return weekStart;
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startText = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const endText = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${startText} to ${endText}`;
}

async function getEnabledTokensForUsers(db, userIds) {
  const tokenMap = new Map();

  await Promise.all(
    userIds.map(async (userId) => {
      const snap = await db
        .collection("users")
        .doc(userId)
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      snap.docs.forEach((tokenDoc) => {
        const token = clean(tokenDoc.data()?.token);

        if (!token || tokenMap.has(token)) return;

        tokenMap.set(token, {
          token,
          ref: tokenDoc.ref,
          userId,
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

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  const weekStart = clean(body.weekStart);

  const requestedUserIds = Array.from(
    new Set(
      (Array.isArray(body.userIds) ? body.userIds : [])
        .map(clean)
        .filter(Boolean)
    )
  );

  const scheduleIds = Array.from(
    new Set(
      (Array.isArray(body.scheduleIds) ? body.scheduleIds : [])
        .map(clean)
        .filter(Boolean)
    )
  );

  const departments = Array.from(
    new Set(
      (Array.isArray(body.departments) ? body.departments : [])
        .map(clean)
        .filter(Boolean)
    )
  );

  if (!weekStart || !requestedUserIds.length) {
    return json(400, {
      ok: false,
      error: "Missing weekStart or userIds.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();
    const deliveryCollection =
      db.collection("schedule_notification_deliveries");

    const alreadySentUserIds = [];
    const pendingUserIds = [];

    for (const userId of requestedUserIds) {
      const deliveryId =
        `approved__${safeKey(weekStart)}__${safeKey(userId)}`;

      const deliveryRef =
        deliveryCollection.doc(deliveryId);

      const deliverySnap = await deliveryRef.get();

      if (
        deliverySnap.exists &&
        clean(deliverySnap.data()?.status) === "SENT"
      ) {
        alreadySentUserIds.push(userId);
      } else {
        pendingUserIds.push(userId);
      }
    }

    const batchRef =
      db.collection("schedule_notification_batches").doc();

    if (!pendingUserIds.length) {
      await batchRef.set({
        type: "approved_schedule",
        weekStart,
        scheduleIds,
        departments,
        requestedUserIds,
        sentUserIds: [],
        alreadySentUserIds,
        status: "SKIPPED_ALREADY_SENT",
        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),
      });

      return json(200, {
        ok: true,
        batchId: batchRef.id,
        weekStart,
        requestedCount: requestedUserIds.length,
        sentUserCount: 0,
        alreadySentUserIds,
        noTokenUserIds: [],
        successCount: 0,
        failureCount: 0,
      });
    }

    const tokenItems =
      await getEnabledTokensForUsers(db, pendingUserIds);

    const usersWithTokens =
      new Set(tokenItems.map((item) => item.userId));

    const noTokenUserIds =
      pendingUserIds.filter(
        (userId) => !usersWithTokens.has(userId)
      );

    const weekLabel = formatWeek(weekStart);

    let result = {
      responses: [],
      successCount: 0,
      failureCount: 0,
    };

    if (tokenItems.length) {
      result = await admin.messaging().sendEachForMulticast({
        tokens: tokenItems.map((item) => item.token),

        data: {
          title: "New Schedule Available",
          body:
            `Your work schedule for ${weekLabel} is approved and available in AeroStation Hub.`,
          url: "/my-schedule",
          route: "/my-schedule",
          type: "schedule_published_manual",
          weekStart,
          batchId: batchRef.id,
        },

        webpush: {
          headers: {
            Urgency: "normal",
          },
          fcmOptions: {
            link: "/my-schedule",
          },
        },
      });

      await disableInvalidTokens(
        tokenItems,
        result.responses
      );
    }

    const successfulUserIds = new Set();

    result.responses.forEach((response, index) => {
      if (response.success) {
        successfulUserIds.add(
          tokenItems[index].userId
        );
      }
    });

    await Promise.all(
      pendingUserIds.map(async (userId) => {
        const deliveryId =
          `approved__${safeKey(weekStart)}__${safeKey(userId)}`;

        const status = successfulUserIds.has(userId)
          ? "SENT"
          : noTokenUserIds.includes(userId)
          ? "NO_TOKENS"
          : "FAILED";

        await deliveryCollection.doc(deliveryId).set(
          {
            type: "approved_schedule",
            weekStart,
            userId,
            status,
            batchId: batchRef.id,
            scheduleIds,
            departments,
            updatedAt:
              admin.firestore.FieldValue.serverTimestamp(),
            sentAt:
              status === "SENT"
                ? admin.firestore.FieldValue.serverTimestamp()
                : null,
          },
          { merge: true }
        );
      })
    );

    const sentUserIds =
      Array.from(successfulUserIds);

    await batchRef.set({
      type: "approved_schedule",
      weekStart,
      scheduleIds,
      departments,
      requestedUserIds,
      attemptedUserIds: pendingUserIds,
      sentUserIds,
      alreadySentUserIds,
      noTokenUserIds,
      status:
        sentUserIds.length > 0
          ? "SENT"
          : "NO_DELIVERY",
      successCount:
        result.successCount || 0,
      failureCount:
        result.failureCount || 0,
      createdAt:
        admin.firestore.FieldValue.serverTimestamp(),
      sentAt:
        sentUserIds.length > 0
          ? admin.firestore.FieldValue.serverTimestamp()
          : null,
    });

    return json(200, {
      ok: true,
      batchId: batchRef.id,
      weekStart,
      requestedCount: requestedUserIds.length,
      sentUserCount: sentUserIds.length,
      sentUserIds,
      alreadySentUserIds,
      noTokenUserIds,
      successCount:
        result.successCount || 0,
      failureCount:
        result.failureCount || 0,
    });
  } catch (error) {
    console.error(
      "send-approved-schedule-notification-push error:",
      error
    );

    return json(500, {
      ok: false,
      error:
        error?.message ||
        "Unexpected approved schedule notification error.",
    });
  }
};

// END send-approved-schedule-notification-push.js
