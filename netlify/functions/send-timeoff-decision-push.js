// netlify/functions/send-timeoff-decision-push.js

const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.app();

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

function formatDate(value) {
  const raw = clean(value);
  if (!raw) return "";

  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRange(request) {
  const start = clean(request.startDate);
  const end = clean(request.endDate || request.startDate);

  if (!start) return "";
  if (!end || start === end) return formatDate(start);

  return `${formatDate(start)} to ${formatDate(end)}`;
}

async function findUserForEmployee(db, request) {
  const employeeId = clean(request.employeeId);

  if (employeeId) {
    const employeeSnap = await db
      .collection("employees")
      .doc(employeeId)
      .get();

    if (employeeSnap.exists) {
      const employee = employeeSnap.data() || {};
      const linkedUserId = clean(employee.linkedUserId);

      if (linkedUserId) {
        const userSnap = await db
          .collection("users")
          .doc(linkedUserId)
          .get();

        if (userSnap.exists) {
          return {
            id: userSnap.id,
            data: userSnap.data() || {},
          };
        }
      }

      const loginUsername = clean(
        employee.loginUsername || employee.username
      );

      if (loginUsername) {
        for (const field of ["username", "loginUsername"]) {
          const snap = await db
            .collection("users")
            .where(field, "==", loginUsername)
            .limit(1)
            .get();

          if (!snap.empty) {
            return {
              id: snap.docs[0].id,
              data: snap.docs[0].data() || {},
            };
          }
        }
      }
    }

    const linkedByEmployeeId = await db
      .collection("users")
      .where("employeeId", "==", employeeId)
      .limit(1)
      .get();

    if (!linkedByEmployeeId.empty) {
      return {
        id: linkedByEmployeeId.docs[0].id,
        data: linkedByEmployeeId.docs[0].data() || {},
      };
    }
  }

  return null;
}

async function getEnabledTokens(db, userId) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return snap.docs
    .map((tokenDoc) => ({
      ref: tokenDoc.ref,
      token: clean(tokenDoc.data()?.token),
    }))
    .filter((item) => item.token);
}

async function disableInvalidTokens(tokenItems, responses) {
  const invalid = [];

  responses.forEach((response, index) => {
    if (response.success) return;

    const code = response.error?.code || "";

    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalid.push(tokenItems[index]);
    }
  });

  await Promise.all(
    invalid.map((item) =>
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
  let decision = "";

  try {
    const body = JSON.parse(event.body || "{}");
    requestId = clean(body.requestId);
    decision = clean(body.decision).toLowerCase();
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

  if (
    decision !== "approved" &&
    decision !== "rejected" &&
    decision !== "needs_info"
  ) {
    return json(400, {
      ok: false,
      error: "Invalid decision.",
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
    const storedStatus = clean(request.status).toLowerCase();

    if (storedStatus !== decision) {
      return json(409, {
        ok: false,
        error:
          "Stored request status does not match the requested Push decision.",
      });
    }

    if (
      request.decisionPushStatus === "SENT" &&
      clean(request.decisionPushDecision).toLowerCase() === decision
    ) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        requestId,
        decision,
      });
    }

    const targetUser = await findUserForEmployee(db, request);

    if (!targetUser) {
      await requestRef.set(
        {
          decisionPushStatus: "NO_USER",
          decisionPushDecision: decision,
          decisionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "employee-user-not-found",
        requestId,
        decision,
      });
    }

    const tokenItems = await getEnabledTokens(db, targetUser.id);

    if (!tokenItems.length) {
      await requestRef.set(
        {
          decisionPushStatus: "NO_TOKENS",
          decisionPushDecision: decision,
          decisionPushTargetUserId: targetUser.id,
          decisionPushSuccessCount: 0,
          decisionPushFailureCount: 0,
          decisionPushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "employee-has-no-enabled-tokens",
        requestId,
        decision,
        targetUserId: targetUser.id,
      });
    }

    const reasonType = clean(request.reasonType) || "Time Off";
    const range = formatRange(request);
    const managerNote = clean(request.managerNote);

    let title = "Time Off Request Updated";
    let body = `Your ${reasonType} request${range ? ` for ${range}` : ""} was updated.`;
    let urgency = "normal";

    if (decision === "approved") {
      title = `${reasonType} Approved`;
      body = `Your ${reasonType} request${range ? ` for ${range}` : ""} has been approved.`;
    }

    if (decision === "rejected") {
      title = `${reasonType} Request Rejected`;
      body = `Your ${reasonType} request${range ? ` for ${range}` : ""} was not approved.`;
      urgency = "high";
    }

    if (decision === "needs_info") {
      title = `${reasonType} Request Needs Info`;
      body = `Management needs additional information for your ${reasonType} request${range ? ` for ${range}` : ""}.`;
      urgency = "high";
    }

    if (managerNote) {
      body += ` Note: ${managerNote}`;
    }

    body = body.slice(0, 240);

    const result = await admin
      .messaging()
      .sendEachForMulticast({
        tokens: tokenItems.map((item) => item.token),

        data: {
          title,
          body,
          url: "/time-off/status",
          type: `timeoff_${decision}`,
          requestId,
          decision,
          employeeId: clean(request.employeeId),
        },

        webpush: {
          headers: {
            Urgency: urgency,
          },
        },
      });

    await disableInvalidTokens(tokenItems, result.responses);

    await requestRef.set(
      {
        decisionPushStatus:
          result.successCount > 0 ? "SENT" : "FAILED",
        decisionPushDecision: decision,
        decisionPushTargetUserId: targetUser.id,
        decisionPushSuccessCount: result.successCount,
        decisionPushFailureCount: result.failureCount,
        decisionPushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        decisionPushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      requestId,
      decision,
      targetUserId: targetUser.id,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error("send-timeoff-decision-push error:", error);

    try {
      if (requestId && admin.apps.length) {
        await admin
          .firestore()
          .collection("timeOffRequests")
          .doc(requestId)
          .set(
            {
              decisionPushStatus: "FAILED",
              decisionPushDecision: decision,
              decisionPushError:
                error?.message || "Unexpected Push error.",
              decisionPushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record Time Off decision Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      requestId,
      decision,
      error:
        error?.message ||
        "Unexpected Time Off decision Push error.",
    });
  }
};

// END send-timeoff-decision-push.js
