// netlify/functions/send-dashboard-event-created-push.js

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

async function getAllUsers(db) {
  const snap = await db
    .collection("users")
    .get();

  return snap.docs.map((userDoc) => ({
    id: userDoc.id,
    data: userDoc.data() || {},
  }));
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

  let eventId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    eventId = normalizeText(body.eventId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!eventId) {
    return json(400, {
      ok: false,
      error: "Missing eventId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const eventRef = db
      .collection("dashboard_events")
      .doc(eventId);

    const eventSnap = await eventRef.get();

    if (!eventSnap.exists) {
      return json(404, {
        ok: false,
        error: "Dashboard event not found.",
      });
    }

    const dashboardEvent = eventSnap.data() || {};

    if (dashboardEvent.creationPushStatus === "SENT") {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        eventId,
      });
    }

    const users = await getAllUsers(db);

    const tokenItems = await getEnabledTokensForUsers(
      db,
      users
    );

    if (!tokenItems.length) {
      await eventRef.set(
        {
          creationPushStatus: "NO_TOKENS",
          creationPushSuccessCount: 0,
          creationPushFailureCount: 0,
          creationPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-user-tokens",
        eventId,
      });
    }

    const eventTitle =
      normalizeText(dashboardEvent.title) ||
      "Station Event";

    const eventDate = formatDate(
      dashboardEvent.date
    );

    const eventTime =
      normalizeText(dashboardEvent.time);

    const when = [eventDate, eventTime]
      .filter(Boolean)
      .join(" at ");

    const title = "New Station Event";

    const body = when
      ? `${eventTitle} - ${when}. Open AeroStation Hub to view details${dashboardEvent.rsvpEnabled === true ? " and RSVP." : "."}`
      : `${eventTitle}. Open AeroStation Hub to view details${dashboardEvent.rsvpEnabled === true ? " and RSVP." : "."}`;

    const targetRoute = "/dashboard";

    const result = await admin
      .messaging()
      .sendEachForMulticast({
        tokens: tokenItems.map((item) => item.token),

        data: {
          title,
          body,
          url: targetRoute,
          route: targetRoute,
          type: "dashboard_event_created",
          eventId,
          eventTitle,
        },

        webpush: {
          headers: {
            Urgency: "normal",
          },
          fcmOptions: {
            link: targetRoute,
          },
        },
      });

    await disableInvalidTokens(
      tokenItems,
      result.responses
    );

    await eventRef.set(
      {
        creationPushStatus:
          result.successCount > 0 ? "SENT" : "FAILED",

        creationPushSuccessCount:
          result.successCount,

        creationPushFailureCount:
          result.failureCount,

        creationPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        creationPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),

        creationPushRoute:
          targetRoute,
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      eventId,
      target: "all-enabled-users",
      targetUserCount: users.length,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      route: targetRoute,
    });
  } catch (error) {
    console.error(
      "send-dashboard-event-created-push error:",
      error
    );

    try {
      if (eventId && admin.apps.length) {
        await admin
          .firestore()
          .collection("dashboard_events")
          .doc(eventId)
          .set(
            {
              creationPushStatus: "FAILED",
              creationPushError:
                error?.message ||
                "Unexpected Push error.",
              creationPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Dashboard Event Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      eventId,
      error:
        error?.message ||
        "Unexpected Dashboard Event Push error.",
    });
  }
};

// END send-dashboard-event-created-push.js
