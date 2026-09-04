// netlify/functions/send-timesheet-submitted-push.js

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
  const allowedRoles = new Set([
    "station_manager",
    "duty_manager",
  ]);

  const usersSnap = await db
    .collection("users")
    .get();

  return usersSnap.docs
    .map((userDoc) => ({
      id: userDoc.id,
      data: userDoc.data() || {},
    }))
    .filter((user) =>
      allowedRoles.has(
        normalizeRole(user.data.role)
      )
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

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function disableInvalidTokens(items) {
  if (!items.length) {
    return;
  }

  await Promise.all(
    items.map((item) =>
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

  let reportId = "";

  try {
    const body = JSON.parse(event.body || "{}");
    reportId = normalizeText(body.reportId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!reportId) {
    return json(400, {
      ok: false,
      error: "Missing reportId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const reportRef = db
      .collection("timesheet_reports")
      .doc(reportId);

    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      return json(404, {
        ok: false,
        error: "Timesheet report not found.",
      });
    }

    const report = reportSnap.data() || {};

    if (
      normalizeText(report.status).toLowerCase() !== "submitted"
    ) {
      return json(409, {
        ok: false,
        error:
          "Timesheet is not currently in submitted status.",
      });
    }

    // Late initial submissions already create an URGENT Operational Alert,
    // which has its own management Push. Skip this normal Push to avoid
    // sending management two notifications for the same late submission.
    if (report.lateSubmission === true) {
      await reportRef.set(
        {
          managementSubmissionPushStatus:
            "SKIPPED_LATE_ALERT",
          managementSubmissionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "late-submission-operational-alert",
        reportId,
      });
    }

    if (
      report.managementSubmissionPushStatus === "SENT"
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        reportId,
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
      await reportRef.set(
        {
          managementSubmissionPushStatus:
            "NO_TOKENS",
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
        reportId,
      });
    }

    const supervisorName =
      normalizeText(report.submittedByName) ||
      normalizeText(report.supervisorReporting) ||
      normalizeText(report.submittedByUsername) ||
      "A supervisor";

    const airline =
      normalizeText(report.airline) ||
      "Timesheet";

    const reportDate =
      normalizeText(report.reportDate);

    const title = "Timesheet Submitted";

    const body = reportDate
      ? `${supervisorName} submitted the ${airline} timesheet for ${reportDate}.`
      : `${supervisorName} submitted a ${airline} timesheet.`;

    const batches =
      chunkArray(tokenItems, 500);

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

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
              url: "/timesheets/reports",
              type: "timesheet_submitted",
              reportId,
              airline,
              reportDate,
            },

            webpush: {
              headers: {
                Urgency: "normal",
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
            invalidTokens.push(
              batch[index]
            );
          }
        }
      );
    }

    await disableInvalidTokens(
      invalidTokens
    );

    await reportRef.set(
      {
        managementSubmissionPushStatus:
          successCount > 0 ? "SENT" : "FAILED",

        managementSubmissionPushSuccessCount:
          successCount,

        managementSubmissionPushFailureCount:
          failureCount,

        managementSubmissionPushSentAt:
          successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        managementSubmissionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      reportId,
      targetRoles: [
        "station_manager",
        "duty_manager",
      ],
      targetUserCount: managementUsers.length,
      tokenCount: tokenItems.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    console.error(
      "send-timesheet-submitted-push error:",
      error
    );

    try {
      if (reportId && admin.apps.length) {
        await admin
          .firestore()
          .collection("timesheet_reports")
          .doc(reportId)
          .set(
            {
              managementSubmissionPushStatus:
                "FAILED",
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
        "Could not record Timesheet Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      reportId,
      error:
        error?.message ||
        "Unexpected Timesheet Push error.",
    });
  }
};

// END send-timesheet-submitted-push.js
