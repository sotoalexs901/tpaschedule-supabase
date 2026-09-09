// netlify/functions/send-wchr-assignment-push.js

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

function lower(value) {
  return clean(value).toLowerCase();
}

async function findTargetUsers(db, { userId, employeeId, username }) {
  const found = new Map();

  async function addSnapshot(snap) {
    snap.docs.forEach((d) => {
      found.set(d.id, { id: d.id, ref: d.ref, data: d.data() || {} });
    });
  }

  if (clean(userId)) {
    const direct = await db.collection("users").doc(clean(userId)).get();
    if (direct.exists) {
      found.set(direct.id, {
        id: direct.id,
        ref: direct.ref,
        data: direct.data() || {},
      });
    }
  }

  const usernameValue = lower(username);
  const employeeValue = clean(employeeId);

  const allUsers = await db.collection("users").get();

  allUsers.docs.forEach((d) => {
    const data = d.data() || {};

    const usernames = [
      data.username,
      data.login_username,
      data.loginUsername,
    ].map(lower).filter(Boolean);

    const employeeIds = [
      data.employeeId,
      data.employee_id,
      data.employeeNumber,
      data.employee_number,
    ].map(clean).filter(Boolean);

    if (
      (usernameValue && usernames.includes(usernameValue)) ||
      (employeeValue && employeeIds.includes(employeeValue))
    ) {
      found.set(d.id, { id: d.id, ref: d.ref, data });
    }
  });

  return Array.from(found.values());
}

async function getEnabledTokens(users) {
  const tokenMap = new Map();

  await Promise.all(
    users.map(async (user) => {
      const snap = await user.ref
        .collection("pushTokens")
        .where("enabled", "==", true)
        .get();

      snap.docs.forEach((tokenDoc) => {
        const token = clean(tokenDoc.data()?.token);
        if (!token || tokenMap.has(token)) return;

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
          disabledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    )
  );
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed. Use POST." });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const type = clean(body.type).toUpperCase();

  if (!["WCHR_ASSIGNMENT", "WCHR_DELIVERED_TO_GATE"].includes(type)) {
    return json(400, { ok: false, error: "Unsupported WCHR push type." });
  }

  try {
    getAdminApp();
    const db = admin.firestore();

    const targets = await findTargetUsers(db, {
      userId: body.userId,
      employeeId: type === "WCHR_ASSIGNMENT" ? body.employeeId : "",
      username: body.username,
    });

    if (!targets.length) {
      return json(200, {
        ok: true,
        successCount: 0,
        failureCount: 0,
        noUsers: true,
        error: "No matching AeroStation user found.",
      });
    }

    const tokenItems = await getEnabledTokens(targets);

    if (!tokenItems.length) {
      return json(200, {
        ok: true,
        successCount: 0,
        failureCount: 0,
        noTokens: true,
        targetUserCount: targets.length,
      });
    }

    const defaultTitle =
      type === "WCHR_ASSIGNMENT"
        ? "New WCHR Assignment"
        : "WCHR Delivered to Gate";

    const defaultRoute =
      type === "WCHR_ASSIGNMENT"
        ? "/wchr/agent-operations"
        : "/wchr/dispatch";

    const title = clean(body.title) || defaultTitle;
    const messageBody = clean(body.body) || defaultTitle;
    const route = clean(body.targetPath) || defaultRoute;

    const data = {
      title,
      body: messageBody,
      url: route,
      route,
      type: type.toLowerCase(),
      reportId: clean(body.reportId || body.reportDocId),
      wheelchairNumber: clean(body.wheelchairNumber),
      passengerName: clean(body.passengerName),
      flightNumber: clean(body.flightNumber),
      pickupLocation: clean(body.pickupLocation),
      gateLocation: clean(body.gateLocation),
      agentName: clean(body.agentName),
    };

    const result = await admin.messaging().sendEachForMulticast({
      tokens: tokenItems.map((item) => item.token),
      data,
      webpush: {
        headers: {
          Urgency: "high",
        },
        fcmOptions: {
          link: route,
        },
      },
    });

    await disableInvalidTokens(tokenItems, result.responses);

    return json(200, {
      ok: true,
      type,
      successCount: result.successCount,
      failureCount: result.failureCount,
      targetUserCount: targets.length,
      tokenCount: tokenItems.length,
    });
  } catch (error) {
    console.error("send-wchr-assignment-push error:", error);

    return json(500, {
      ok: false,
      error: error?.message || "Unexpected WCHR push error.",
    });
  }
};

// END send-wchr-assignment-push.js
