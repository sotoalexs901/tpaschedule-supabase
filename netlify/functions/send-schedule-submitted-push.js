// netlify/functions/send-schedule-submitted-push.js

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

async function getStationManagers(db) {
  const usersSnap = await db
    .collection("users")
    .get();

  return usersSnap.docs
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
      const tokenSnap = await db
        .collection("users")
        .doc(user.id)
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
      code ===
        "messaging/registration-token-not-registered" ||
      code ===
        "messaging/invalid-registration-token"
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

  let scheduleId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    scheduleId = normalizeText(body.scheduleId);
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

    if (
      normalizeText(schedule.status).toLowerCase() !==
      "pending"
    ) {
      return json(409, {
        ok: false,
        error:
          "Schedule is not currently pending approval.",
      });
    }

    if (
      schedule.approvalSubmissionPushStatus ===
      "SENT"
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        scheduleId,
      });
    }

    const managers =
      await getStationManagers(db);

    const tokenItems =
      await getEnabledTokensForUsers(
        db,
        managers
      );

    if (!tokenItems.length) {
      await scheduleRef.set(
        {
          approvalSubmissionPushStatus:
            "NO_TOKENS",
          approvalSubmissionPushSuccessCount: 0,
          approvalSubmissionPushFailureCount: 0,
          approvalSubmissionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason:
          "no-enabled-station-manager-tokens",
        scheduleId,
      });
    }

    const scheduleLabel =
      formatScheduleRange(schedule);

    const submitter =
      normalizeText(schedule.submittedByName) ||
      normalizeText(schedule.submittedByUsername) ||
      normalizeText(schedule.createdBy) ||
      "A manager";

    const airline =
      normalizeText(
        schedule.airlineDisplayName ||
        schedule.airline
      );

    const department =
      normalizeText(schedule.department);

    const context = [airline, department]
      .filter(Boolean)
      .join(" - ");

    const title =
      "Schedule Submitted for Approval";

    const body = context
      ? `${submitter} submitted ${scheduleLabel} (${context}) for approval.`
      : `${submitter} submitted ${scheduleLabel} for approval.`;

    const result =
      await admin
        .messaging()
        .sendEachForMulticast({
          tokens: tokenItems.map(
            (item) => item.token
          ),

          data: {
            title,
            body,
            url: "/schedules/approvals",
            type: "schedule_submitted",
            scheduleId,
            scheduleLabel,
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

    await scheduleRef.set(
      {
        approvalSubmissionPushStatus:
          result.successCount > 0
            ? "SENT"
            : "FAILED",

        approvalSubmissionPushSuccessCount:
          result.successCount,

        approvalSubmissionPushFailureCount:
          result.failureCount,

        approvalSubmissionPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        approvalSubmissionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      scheduleId,
      targetRole: "station_manager",
      targetUserCount: managers.length,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error(
      "send-schedule-submitted-push error:",
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
              approvalSubmissionPushStatus:
                "FAILED",
              approvalSubmissionPushError:
                error?.message ||
                "Unexpected Push error.",
              approvalSubmissionPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Schedule Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      scheduleId,
      error:
        error?.message ||
        "Unexpected Schedule Push error.",
    });
  }
};

// END send-schedule-submitted-push.js
