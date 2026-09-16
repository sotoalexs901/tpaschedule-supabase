// netlify/functions/send-epr-event-push.js

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
        privateKey: String(serviceAccount.private_key || "").replace(/\\n/g, "\n"),
      }),
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
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

function normalizeRole(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function formatMonth(value) {
  const [year, month] = clean(value).split("-").map(Number);
  if (!year || !month) return clean(value);
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

async function getUserById(db, userId) {
  if (!userId) return null;
  const snap = await db.collection("users").doc(userId).get();
  return snap.exists ? { id: snap.id, data: snap.data() || {} } : null;
}

async function getManagementUsers(db, includeDuty = true, includeStation = true) {
  const snap = await db.collection("users").get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() || {} }))
    .filter((u) => {
      const role = normalizeRole(u.data.role);
      return (
        (includeDuty && role === "duty_manager") ||
        (includeStation && role === "station_manager")
      );
    });
}

async function getEnabledTokens(db, users) {
  const tokenMap = new Map();

  await Promise.all(
    users.map(async (user) => {
      if (!user?.id) return;
      const snap = await db
        .collection("users")
        .doc(user.id)
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      snap.docs.forEach((tokenDoc) => {
        const token = clean(tokenDoc.data()?.token);
        if (token) tokenMap.set(token, { token, ref: tokenDoc.ref, userId: user.id });
      });
    })
  );

  return Array.from(tokenMap.values());
}

async function disableInvalidTokens(tokenItems, responses) {
  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  await Promise.all(
    responses.map(async (response, index) => {
      if (response.success) return;
      if (!invalidCodes.has(response.error?.code || "")) return;
      const item = tokenItems[index];
      if (!item?.ref) return;
      await item.ref.set(
        {
          enabled: false,
          disabledReason: "invalid-token",
          disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

function dedupeUsers(users) {
  const map = new Map();
  users.filter(Boolean).forEach((user) => {
    if (user?.id) map.set(user.id, user);
  });
  return Array.from(map.values());
}

async function resolveEmployeeUser(db, report) {
  const employeeId = clean(report.employeeId);
  if (!employeeId) return null;

  const directUser = await getUserById(db, employeeId);
  if (directUser) return directUser;

  const employeeSnap = await db.collection("employees").doc(employeeId).get();
  const employee = employeeSnap.exists ? employeeSnap.data() || {} : {};
  const employeeUsername = normalizeRole(
    employee.loginUsername || employee.username || employee.userName || ""
  );
  const employeeName = clean(
    employee.name ||
      employee.fullName ||
      employee.employeeName ||
      employee.displayName ||
      report.employeeName ||
      ""
  ).toLowerCase();

  const usersSnap = await db.collection("users").get();
  const match = usersSnap.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    const linkedEmployeeId = clean(data.employeeId || data.employee_id);
    if (linkedEmployeeId && linkedEmployeeId === employeeId) return true;

    const userUsername = normalizeRole(data.username || data.loginUsername || "");
    if (employeeUsername && userUsername && employeeUsername === userUsername) return true;

    const userName = clean(
      data.displayName || data.fullName || data.name || data.employeeName || ""
    ).toLowerCase();
    return Boolean(employeeName && userName && employeeName === userName);
  });

  return match ? { id: match.id, data: match.data() || {} } : null;
}

function buildNotification(eventType, report) {
  const employeeName = clean(report.employeeName) || "Employee";
  const monthLabel = formatMonth(report.month) || "Monthly EPR";
  const supervisorName = clean(report.supervisorName) || "Supervisor";
  const dutyManagerName =
    clean(report.followUpDutyManagerName) ||
    clean(report.assignedDutyManagerName) ||
    "Duty Manager";

  const returnReason = clean(report.returnReason);

  switch (eventType) {
    case "submitted":
      return {
        title: "New EPR Submitted",
        body: `${supervisorName} submitted an EPR for ${employeeName} (${monthLabel}).`,
        url: "/employee-performance-management",
        urgency: "normal",
      };
    case "under_review":
      return {
        title: "EPR Under Review",
        body: `${employeeName} (${monthLabel}) was opened by Station Management and is now under review.`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "normal",
      };
    case "resubmitted_to_manager":
      return {
        title: "EPR Resubmitted",
        body: `${supervisorName} corrected and resubmitted the EPR for ${employeeName} (${monthLabel}).`,
        url: "/employee-performance-management",
        urgency: "high",
      };
    case "assigned":
      return {
        title: "EPR Follow Up Assigned",
        body: `You were assigned the EPR follow-up for ${employeeName} (${monthLabel}).`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=followup`,
        urgency: "high",
      };
    case "reassigned":
      return {
        title: "EPR Follow Up Reassigned",
        body: `The EPR follow-up for ${employeeName} (${monthLabel}) was reassigned to you.`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=followup`,
        urgency: "high",
      };
    case "accepted":
      return {
        title: "EPR Follow Up Accepted",
        body: `${dutyManagerName} accepted the follow-up case for ${employeeName} (${monthLabel}).`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "normal",
      };
    case "progress":
      return {
        title: "EPR Follow Up Updated",
        body: `${dutyManagerName} added a follow-up update for ${employeeName} (${monthLabel}).`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "normal",
      };
    case "returned":
      return {
        title: "EPR Returned for Correction",
        body: returnReason
          ? `${employeeName} (${monthLabel}) was returned for correction. Reason: ${returnReason}`.slice(0, 220)
          : `${employeeName} (${monthLabel}) was returned for correction.`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "high",
      };
    case "follow_up_resubmitted":
      return {
        title: "EPR Follow Up Ready for Review",
        body: `${dutyManagerName} completed follow-up work for ${employeeName} (${monthLabel}) and sent it for management review.`,
        url: "/employee-performance-management",
        urgency: "high",
      };
    case "approved":
      return {
        title: "EPR Approved",
        body: `${employeeName} (${monthLabel}) has been approved.`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "normal",
      };
    case "recognized":
      return {
        title: "Great EPR!",
        body: `Excellent EPR for ${monthLabel} - way to go!`,
        url: "/notifications",
        urgency: "normal",
      };
    case "closed":
      return {
        title: "EPR Case Closed",
        body: `${employeeName} (${monthLabel}) has been closed by management.`,
        url: `/monthly-employee-performance-report?reportId=${report.id || ""}&action=myreports`,
        urgency: "normal",
      };
    default:
      return null;
  }
}

async function resolveRecipients(db, eventType, report) {
  const supervisor = await getUserById(db, clean(report.supervisorId));
  const dutyUserId =
    clean(report.followUpDutyManagerUserId) || clean(report.assignedDutyManagerUserId);
  const assignedDuty = await getUserById(db, dutyUserId);
  const employeeUser = await resolveEmployeeUser(db, report);

  if (eventType === "submitted" || eventType === "resubmitted_to_manager") {
    return dedupeUsers(await getManagementUsers(db, true, true));
  }

  if (eventType === "assigned" || eventType === "reassigned") {
    return dedupeUsers([assignedDuty]);
  }

  if (
    eventType === "under_review" ||
    eventType === "accepted" ||
    eventType === "progress" ||
    eventType === "returned"
  ) {
    return dedupeUsers([supervisor]);
  }

  if (eventType === "follow_up_resubmitted") {
    const stations = await getManagementUsers(db, false, true);
    return dedupeUsers([...stations, supervisor]);
  }

  if (eventType === "approved" || eventType === "closed") {
    return dedupeUsers([supervisor]);
  }

  if (eventType === "recognized") {
    return dedupeUsers([employeeUser]);
  }

  return [];
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed. Use POST." });
  }

  let reportId = "";
  let eventType = "";

  try {
    const body = JSON.parse(event.body || "{}");
    reportId = clean(body.reportId);
    eventType = clean(body.eventType).toLowerCase();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const allowed = new Set([
    "submitted",
    "under_review",
    "resubmitted_to_manager",
    "assigned",
    "reassigned",
    "accepted",
    "progress",
    "returned",
    "follow_up_resubmitted",
    "approved",
    "recognized",
    "closed",
  ]);

  if (!reportId || !allowed.has(eventType)) {
    return json(400, { ok: false, error: "Missing reportId or invalid eventType." });
  }

  try {
    getAdminApp();
    const db = admin.firestore();

    const reportRef = db.collection("employeePerformanceReports").doc(reportId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      return json(404, { ok: false, error: "EPR report not found." });
    }

    const report = { id: reportSnap.id, ...(reportSnap.data() || {}) };
    const recipients = await resolveRecipients(db, eventType, report);

    if (!recipients.length) {
      await reportRef.set(
        {
          eprPushLastEvent: eventType,
          eprPushLastStatus: "NO_RECIPIENTS",
          eprPushLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, { ok: true, skipped: true, reason: "no-recipients" });
    }

    const tokenItems = await getEnabledTokens(db, recipients);

    if (!tokenItems.length) {
      await reportRef.set(
        {
          eprPushLastEvent: eventType,
          eprPushLastStatus: "NO_TOKENS",
          eprPushLastTargetUserIds: recipients.map((u) => u.id),
          eprPushLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "no-enabled-tokens",
        targetUserIds: recipients.map((u) => u.id),
      });
    }

    const notification = buildNotification(eventType, report);
    if (!notification) {
      return json(400, { ok: false, error: "Unsupported EPR Push event." });
    }

    const result = await admin.messaging().sendEachForMulticast({
      tokens: tokenItems.map((item) => item.token),
      data: {
        title: notification.title,
        body: notification.body,
        url: notification.url,
        route: notification.url,
        type: `epr_${eventType}`,
        reportId,
        eventType,
        employeeName: clean(report.employeeName),
        month: clean(report.month),
      },
      webpush: {
        headers: {
          Urgency: notification.urgency || "normal",
        },
        fcmOptions: {
          link: notification.url,
        },
      },
    });

    await disableInvalidTokens(tokenItems, result.responses);

    await reportRef.set(
      {
        eprPushLastEvent: eventType,
        eprPushLastStatus: result.successCount > 0 ? "SENT" : "FAILED",
        eprPushLastTargetUserIds: recipients.map((u) => u.id),
        eprPushLastSuccessCount: result.successCount,
        eprPushLastFailureCount: result.failureCount,
        eprPushLastSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        eprPushLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      reportId,
      eventType,
      targetUserCount: recipients.length,
      tokenCount: tokenItems.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    console.error("send-epr-event-push error:", error);
    return json(500, {
      ok: false,
      reportId,
      eventType,
      error: error?.message || "Unexpected EPR Push error.",
    });
  }
};

// END netlify/functions/send-epr-event-push.js
