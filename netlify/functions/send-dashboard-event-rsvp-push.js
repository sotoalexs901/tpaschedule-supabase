// netlify/functions/send-dashboard-event-rsvp-push.js

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

async function getStationManagers(db) {
  const snap = await db
    .collection("users")
    .get();

  return snap.docs
    .map((userDoc) => ({
      id: userDoc.id,
      data: userDoc.data() || {},
    }))
    .filter(
      (user) =>
        normalizeRole(user.data.role) ===
        "station_manager"
    );
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

function getResponsePresentation(response) {
  const normalized = normalizeText(response).toLowerCase();

  if (normalized === "yes") {
    return {
      label: "Yes",
      emoji: "\u{1F642}",
    };
  }

  if (normalized === "no") {
    return {
      label: "No",
      emoji: "\u{1F641}",
    };
  }

  if (normalized === "maybe") {
    return {
      label: "Maybe",
      emoji: "\u{1F615}",
    };
  }

  if (normalized === "cant") {
    return {
      label: "Sorry, I can't",
      emoji: "\u{1F614}",
    };
  }

  return null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  let eventId = "";
  let userId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    eventId = normalizeText(body.eventId);
    userId = normalizeText(body.userId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!eventId || !userId) {
    return json(400, {
      ok: false,
      error: "Missing eventId or userId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const eventRef = db
      .collection("dashboard_events")
      .doc(eventId);

    const responseRef = eventRef
      .collection("responses")
      .doc(userId);

    const [eventSnap, responseSnap] =
      await Promise.all([
        eventRef.get(),
        responseRef.get(),
      ]);

    if (!eventSnap.exists) {
      return json(404, {
        ok: false,
        error: "Dashboard event not found.",
      });
    }

    if (!responseSnap.exists) {
      return json(404, {
        ok: false,
        error: "Event RSVP response not found.",
      });
    }

    const dashboardEvent = eventSnap.data() || {};
    const responseData = responseSnap.data() || {};

    if (dashboardEvent.rsvpEnabled !== true) {
      return json(409, {
        ok: false,
        error: "RSVP is not enabled for this event.",
      });
    }

    const response = normalizeText(
      responseData.response
    ).toLowerCase();

    const presentation =
      getResponsePresentation(response);

    if (!presentation) {
      return json(409, {
        ok: false,
        error: "Stored RSVP response is invalid.",
      });
    }

    if (
      responseData.managementPushStatus === "SENT" &&
      normalizeText(
        responseData.managementPushResponse
      ).toLowerCase() === response
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "same-response-already-sent",
        eventId,
        userId,
        response,
      });
    }

    const managers = await getStationManagers(db);

    const tokenItems = await getEnabledTokensForUsers(
      db,
      managers
    );

    if (!tokenItems.length) {
      await responseRef.set(
        {
          managementPushStatus: "NO_TOKENS",
          managementPushResponse: response,
          managementPushSuccessCount: 0,
          managementPushFailureCount: 0,
          managementPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-station-manager-tokens",
        eventId,
        userId,
        response,
      });
    }

    const employeeName =
      normalizeText(responseData.employeeName) ||
      normalizeText(responseData.username) ||
      "Employee";

    const eventTitle =
      normalizeText(dashboardEvent.title) ||
      "Station Event";

    const title = "Event RSVP Update";

    const body =
      `${employeeName} responded ${presentation.emoji} ${presentation.label} to ${eventTitle}.`;

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
          type: "dashboard_event_rsvp",
          eventId,
          eventTitle,
          userId,
          employeeName,
          response,
          responseLabel: presentation.label,
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

    await responseRef.set(
      {
        managementPushStatus:
          result.successCount > 0 ? "SENT" : "FAILED",

        managementPushResponse:
          response,

        managementPushSuccessCount:
          result.successCount,

        managementPushFailureCount:
          result.failureCount,

        managementPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        managementPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),

        managementPushRoute:
          targetRoute,
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      eventId,
      userId,
      response,
      targetRoles: ["station_manager"],
      targetUserCount: managers.length,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      route: targetRoute,
    });
  } catch (error) {
    console.error(
      "send-dashboard-event-rsvp-push error:",
      error
    );

    try {
      if (
        eventId &&
        userId &&
        admin.apps.length
      ) {
        await admin
          .firestore()
          .collection("dashboard_events")
          .doc(eventId)
          .collection("responses")
          .doc(userId)
          .set(
            {
              managementPushStatus: "FAILED",
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
        "Could not record RSVP Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      eventId,
      userId,
      error:
        error?.message ||
        "Unexpected RSVP Push error.",
    });
  }
};

// END send-dashboard-event-rsvp-push.js
