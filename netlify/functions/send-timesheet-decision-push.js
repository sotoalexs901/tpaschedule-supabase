// netlify/functions/send-timesheet-decision-push.js

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

function normalizeDecision(value) {
  return normalizeText(value).toLowerCase();
}

async function findSubmittedUser(db, report) {
  const submittedByUserId =
    normalizeText(report.submittedByUserId);

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
    normalizeText(report.submittedByUsername);

  if (submittedByUsername) {
    const usernameFields = [
      "username",
      "loginUsername",
    ];

    for (const field of usernameFields) {
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

async function getEnabledTokens(db, userId) {
  const tokenSnap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return tokenSnap.docs
    .map((tokenDoc) => ({
      ref: tokenDoc.ref,
      token: normalizeText(
        tokenDoc.data()?.token
      ),
    }))
    .filter((item) => item.token);
}

async function disableInvalidTokens(
  tokenItems,
  responses
) {
  const invalidItems = [];

  responses.forEach((response, index) => {
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

  let reportId = "";
  let requestedDecision = "";

  try {
    const body = JSON.parse(event.body || "{}");

    reportId = normalizeText(body.reportId);
    requestedDecision = normalizeDecision(
      body.decision
    );
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

    const actualStatus = normalizeDecision(
      report.status
    );

    // The browser cannot claim a decision that is not already stored.
    if (actualStatus !== requestedDecision) {
      return json(409, {
        ok: false,
        error:
          "Timesheet status does not match the requested Push decision.",
        actualStatus,
        requestedDecision,
      });
    }

    const submittedUser =
      await findSubmittedUser(db, report);

    if (!submittedUser) {
      await reportRef.set(
        {
          supervisorDecisionPushStatus:
            "NO_USER",
          supervisorDecisionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "submitted-user-not-found",
        reportId,
      });
    }

    // User requested this workflow specifically for supervisors.
    // If another role ever submits a report, do not send this decision Push.
    if (
      normalizeRole(submittedUser.data.role) !==
      "supervisor"
    ) {
      await reportRef.set(
        {
          supervisorDecisionPushStatus:
            "SKIPPED_NON_SUPERVISOR",
          supervisorDecisionPushTargetUserId:
            submittedUser.id,
          supervisorDecisionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "submitter-is-not-supervisor",
        reportId,
        targetUserId: submittedUser.id,
      });
    }

    const sentDecision =
      normalizeDecision(
        report.supervisorDecisionPushDecision
      );

    if (
      report.supervisorDecisionPushStatus ===
        "SENT" &&
      sentDecision === requestedDecision
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        reportId,
        decision: requestedDecision,
      });
    }

    const tokenItems =
      await getEnabledTokens(
        db,
        submittedUser.id
      );

    if (!tokenItems.length) {
      await reportRef.set(
        {
          supervisorDecisionPushStatus:
            "NO_TOKENS",
          supervisorDecisionPushDecision:
            requestedDecision,
          supervisorDecisionPushTargetUserId:
            submittedUser.id,
          supervisorDecisionPushSuccessCount:
            0,
          supervisorDecisionPushFailureCount:
            0,
          supervisorDecisionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-tokens",
        reportId,
        decision: requestedDecision,
        targetUserId: submittedUser.id,
      });
    }

    const airline =
      normalizeText(report.airline) ||
      "Timesheet";

    const reportDate =
      normalizeText(report.reportDate);

    let title = "";
    let body = "";
    let urgency = "normal";

    if (requestedDecision === "approved") {
      title = "Timesheet Approved";

      body = reportDate
        ? `Your ${airline} timesheet for ${reportDate} has been approved.`
        : `Your ${airline} timesheet has been approved.`;
    } else {
      title = "Timesheet Returned";
      urgency = "high";

      const reason =
        normalizeText(report.returnedReason);

      const base = reportDate
        ? `Your ${airline} timesheet for ${reportDate} was returned for correction.`
        : `Your ${airline} timesheet was returned for correction.`;

      body = reason
        ? `${base} Reason: ${reason}`.slice(
            0,
            220
          )
        : `${base} Open AeroStation Hub to review the requested changes.`;
    }

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
            url: "/timesheets/submit",
            type:
              requestedDecision === "approved"
                ? "timesheet_approved"
                : "timesheet_returned",
            reportId,
            decision: requestedDecision,
            airline,
            reportDate,
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

    await reportRef.set(
      {
        supervisorDecisionPushStatus:
          result.successCount > 0
            ? "SENT"
            : "FAILED",

        supervisorDecisionPushDecision:
          requestedDecision,

        supervisorDecisionPushTargetUserId:
          submittedUser.id,

        supervisorDecisionPushSuccessCount:
          result.successCount,

        supervisorDecisionPushFailureCount:
          result.failureCount,

        supervisorDecisionPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        supervisorDecisionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      reportId,
      decision: requestedDecision,
      targetUserId: submittedUser.id,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error(
      "send-timesheet-decision-push error:",
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
              supervisorDecisionPushStatus:
                "FAILED",
              supervisorDecisionPushDecision:
                requestedDecision,
              supervisorDecisionPushError:
                error?.message ||
                "Unexpected Push error.",
              supervisorDecisionPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Timesheet decision Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      reportId,
      decision: requestedDecision,
      error:
        error?.message ||
        "Unexpected Timesheet decision Push error.",
    });
  }
};

// END send-timesheet-decision-push.js
