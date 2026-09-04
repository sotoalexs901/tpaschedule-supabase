// netlify/functions/send-schedule-decision-push.js

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

function normalizeDecision(value) {
  return normalizeText(value).toLowerCase();
}

function formatScheduleRange(schedule) {
  const weekStart = normalizeText(schedule.weekStart);

  if (!weekStart) {
    return "Weekly Schedule";
  }

  const start = new Date(`${weekStart}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return `Schedule ${weekStart}`;
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
  });

  const startMonth = monthFormatter.format(start);
  const endMonth = monthFormatter.format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `Schedule ${startMonth} ${startDay} to ${endDay}`;
  }

  return `Schedule ${startMonth} ${startDay} to ${endMonth} ${endDay}`;
}

async function findSubmittedUser(db, schedule) {
  const submittedByUserId =
    normalizeText(schedule.submittedByUserId);

  if (submittedByUserId) {
    const userRef = db
      .collection("users")
      .doc(submittedByUserId);

    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return {
        id: userSnap.id,
        ref: userRef,
        data: userSnap.data() || {},
      };
    }
  }

  const submittedByUsername =
    normalizeText(
      schedule.submittedByUsername ||
      schedule.createdBy
    );

  if (submittedByUsername) {
    for (const field of ["username", "loginUsername"]) {
      const snap = await db
        .collection("users")
        .where(field, "==", submittedByUsername)
        .limit(1)
        .get();

      if (!snap.empty) {
        const userDoc = snap.docs[0];

        return {
          id: userDoc.id,
          ref: userDoc.ref,
          data: userDoc.data() || {},
        };
      }
    }
  }

  return null;
}

async function getEnabledTokensForUser(db, userId) {
  const tokenSnap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return tokenSnap.docs
    .map((tokenDoc) => ({
      token: normalizeText(tokenDoc.data()?.token),
      ref: tokenDoc.ref,
      userId,
    }))
    .filter((item) => item.token);
}

async function getAllEnabledTokens(db, excludedUserIds = []) {
  const excluded = new Set(
    (excludedUserIds || []).map((value) =>
      normalizeText(value)
    )
  );

  const usersSnap = await db
    .collection("users")
    .get();

  const tokenMap = new Map();

  await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      if (excluded.has(userDoc.id)) {
        return;
      }

      const tokenSnap = await userDoc.ref
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      tokenSnap.docs.forEach((tokenDoc) => {
        const data = tokenDoc.data() || {};
        const token = normalizeText(data.token);

        if (!token || tokenMap.has(token)) {
          return;
        }

        tokenMap.set(token, {
          token,
          ref: tokenDoc.ref,
          userId: userDoc.id,
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

async function sendPush(tokenItems, payload, urgency = "normal") {
  if (!tokenItems.length) {
    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  const result = await admin
    .messaging()
    .sendEachForMulticast({
      tokens: tokenItems.map((item) => item.token),

      data: {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        type: payload.type,
        scheduleId: payload.scheduleId,
        scheduleLabel: payload.scheduleLabel,
        decision: payload.decision || "",
      },

      webpush: {
        headers: {
          Urgency: urgency,
        },
      },
    });

  await disableInvalidTokens(
    tokenItems,
    result.responses
  );

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, {
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  let scheduleId = "";
  let requestedDecision = "";

  try {
    const body = JSON.parse(event.body || "{}");

    scheduleId = normalizeText(body.scheduleId);
    requestedDecision = normalizeDecision(body.decision);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!scheduleId) {
    return json(400, {
      ok: false,
      error: "Missing scheduleId.",
    });
  }

  if (
    requestedDecision !== "approved" &&
    requestedDecision !== "returned"
  ) {
    return json(400, {
      ok: false,
      error:
        "Decision must be approved or returned.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const scheduleRef = db
      .collection("schedules")
      .doc(scheduleId);

    const scheduleSnap = await scheduleRef.get();

    if (!scheduleSnap.exists) {
      return json(404, {
        ok: false,
        error: "Schedule not found.",
      });
    }

    const schedule = scheduleSnap.data() || {};

    const actualStatus =
      normalizeDecision(schedule.status);

    if (actualStatus !== requestedDecision) {
      return json(409, {
        ok: false,
        error:
          "Schedule status does not match requested Push decision.",
        actualStatus,
        requestedDecision,
      });
    }

    if (
      schedule.decisionPushStatus === "SENT" &&
      normalizeDecision(schedule.decisionPushDecision) === requestedDecision
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        scheduleId,
        decision: requestedDecision,
      });
    }

    const scheduleLabel =
      formatScheduleRange(schedule);

    const submittedUser =
      await findSubmittedUser(db, schedule);

    let submitterResult = {
      successCount: 0,
      failureCount: 0,
    };

    if (submittedUser) {
      const submitterTokens =
        await getEnabledTokensForUser(
          db,
          submittedUser.id
        );

      if (requestedDecision === "approved") {
        submitterResult = await sendPush(
          submitterTokens,
          {
            title: "Schedule Approved",
            body: `Your ${scheduleLabel} has been approved and processed. It is now available in AeroStation Hub.`,
            url: "/my-schedule",
            type: "schedule_approved",
            scheduleId,
            scheduleLabel,
            decision: requestedDecision,
          },
          "normal"
        );
      } else {
        const note =
          normalizeText(schedule.reviewNotes);

        const base =
          `Your ${scheduleLabel} was returned for correction.`;

        submitterResult = await sendPush(
          submitterTokens,
          {
            title: "Schedule Returned",
            body: note
              ? `${base} Reason: ${note}`.slice(0, 220)
              : `${base} Please review the manager's comments.`,
            url: "/schedules/create",
            type: "schedule_returned",
            scheduleId,
            scheduleLabel,
            decision: requestedDecision,
          },
          "high"
        );
      }
    }

    let broadcastResult = {
      successCount: 0,
      failureCount: 0,
    };

    if (requestedDecision === "approved") {
      const broadcastTokens =
        await getAllEnabledTokens(
          db,
          submittedUser ? [submittedUser.id] : []
        );

      broadcastResult = await sendPush(
        broadcastTokens,
        {
          title: "New Schedule Available",
          body: `${scheduleLabel} has been approved and processed. Please review your personalized schedule in AeroStation Hub.`,
          url: "/my-schedule",
          type: "schedule_published",
          scheduleId,
          scheduleLabel,
          decision: requestedDecision,
        },
        "normal"
      );
    }

    const totalSuccess =
      submitterResult.successCount +
      broadcastResult.successCount;

    const totalFailure =
      submitterResult.failureCount +
      broadcastResult.failureCount;

    await scheduleRef.set(
      {
        decisionPushStatus:
          totalSuccess > 0 ? "SENT" : "NO_TOKENS",

        decisionPushDecision:
          requestedDecision,

        decisionPushSubmitterUserId:
          submittedUser?.id || "",

        decisionPushSubmitterSuccessCount:
          submitterResult.successCount,

        decisionPushSubmitterFailureCount:
          submitterResult.failureCount,

        decisionPushBroadcastSuccessCount:
          broadcastResult.successCount,

        decisionPushBroadcastFailureCount:
          broadcastResult.failureCount,

        decisionPushTotalSuccessCount:
          totalSuccess,

        decisionPushTotalFailureCount:
          totalFailure,

        decisionPushSentAt:
          totalSuccess > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        decisionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      scheduleId,
      decision: requestedDecision,
      scheduleLabel,
      submittedUserId:
        submittedUser?.id || "",
      submitterSuccessCount:
        submitterResult.successCount,
      broadcastSuccessCount:
        broadcastResult.successCount,
      totalSuccessCount:
        totalSuccess,
      totalFailureCount:
        totalFailure,
    });
  } catch (error) {
    console.error(
      "send-schedule-decision-push error:",
      error
    );

    try {
      if (scheduleId && admin.apps.length) {
        await admin
          .firestore()
          .collection("schedules")
          .doc(scheduleId)
          .set(
            {
              decisionPushStatus: "FAILED",
              decisionPushDecision:
                requestedDecision,
              decisionPushError:
                error?.message ||
                "Unexpected Push error.",
              decisionPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Schedule decision Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      scheduleId,
      decision: requestedDecision,
      error:
        error?.message ||
        "Unexpected Schedule decision Push error.",
    });
  }
};

// END send-schedule-decision-push.js
