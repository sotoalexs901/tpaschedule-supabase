// netlify/functions/send-training-notice-push.js

const admin = require("firebase-admin");

function initializeFirebaseAdmin() {
  if (admin.apps.length) {
    return admin.app();
  }

  const rawCredentials =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    "";

  if (rawCredentials) {
    try {
      const serviceAccount = JSON.parse(rawCredentials);

      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (err) {
      console.error(
        "Could not parse Firebase Admin credentials:",
        err
      );
    }
  }

  return admin.initializeApp();
}

initializeFirebaseAdmin();

const db = admin.firestore();
const messaging = admin.messaging();

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const parts = raw.split("-");

  if (parts.length !== 3) {
    return raw;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    return raw;
  }

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function findTargetUser(notice) {
  const employeeId = String(
    notice?.employeeId || ""
  ).trim();

  const employeeLoginUsername = normalizeText(
    notice?.employeeLoginUsername
  );

  let employeeData = null;

  if (employeeId) {
    try {
      const employeeSnap = await db
        .collection("employees")
        .doc(employeeId)
        .get();

      if (employeeSnap.exists) {
        employeeData = {
          id: employeeSnap.id,
          ...employeeSnap.data(),
        };
      }
    } catch (err) {
      console.warn(
        "Could not read employee profile for Training Notice Push:",
        err
      );
    }
  }

  const linkedUserId = String(
    employeeData?.linkedUserId ||
      employeeData?.userId ||
      ""
  ).trim();

  if (linkedUserId) {
    const userSnap = await db
      .collection("users")
      .doc(linkedUserId)
      .get();

    if (userSnap.exists) {
      return {
        id: userSnap.id,
        ...userSnap.data(),
      };
    }
  }

  if (employeeId) {
    const byEmployeeIdSnap = await db
      .collection("users")
      .where(
        "employeeId",
        "==",
        employeeId
      )
      .limit(1)
      .get();

    if (!byEmployeeIdSnap.empty) {
      const docSnap =
        byEmployeeIdSnap.docs[0];

      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    }
  }

  const usernameCandidates = Array.from(
    new Set(
      [
        employeeData?.loginUsername,
        employeeData?.username,
        employeeLoginUsername,
      ]
        .map(normalizeText)
        .filter(Boolean)
    )
  );

  for (const username of usernameCandidates) {
    const fields = [
      "username",
      "loginUsername",
    ];

    for (const field of fields) {
      const userSnap = await db
        .collection("users")
        .where(
          field,
          "==",
          username
        )
        .limit(1)
        .get();

      if (!userSnap.empty) {
        const docSnap =
          userSnap.docs[0];

        return {
          id: docSnap.id,
          ...docSnap.data(),
        };
      }
    }
  }

  return null;
}

async function getEnabledTokens(userId) {
  const tokensSnap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .get();

  return tokensSnap.docs
    .map((docSnap) => ({
      ref: docSnap.ref,
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .filter(
      (item) =>
        item.enabled !== false &&
        String(item.token || "").trim()
    );
}

async function disableBadTokens(
  tokenRecords,
  response
) {
  if (
    !response ||
    !Array.isArray(response.responses)
  ) {
    return;
  }

  const invalidCodes = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ]);

  const updates = [];

  response.responses.forEach(
    (item, index) => {
      if (item.success) return;

      const code =
        item.error?.code || "";

      if (
        !invalidCodes.has(code)
      ) {
        return;
      }

      const record =
        tokenRecords[index];

      if (!record?.ref) {
        return;
      }

      updates.push(
        record.ref.set(
          {
            enabled: false,
            disabledAt:
              admin.firestore.FieldValue.serverTimestamp(),
            disabledReason:
              code,
          },
          {
            merge: true,
          }
        )
      );
    }
  );

  if (updates.length) {
    await Promise.allSettled(
      updates
    );
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        ok: false,
        error: "Method not allowed",
      }),
    };
  }

  let body = {};

  try {
    body = JSON.parse(
      event.body || "{}"
    );
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({
        ok: false,
        error: "Invalid JSON body",
      }),
    };
  }

  const noticeId = String(
    body?.noticeId || ""
  ).trim();

  if (!noticeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        ok: false,
        error: "Missing noticeId",
      }),
    };
  }

  const noticeRef = db
    .collection("training_notices")
    .doc(noticeId);

  try {
    const noticeSnap =
      await noticeRef.get();

    if (!noticeSnap.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          ok: false,
          error:
            "Training Notice not found",
        }),
      };
    }

    const notice =
      noticeSnap.data() || {};

    if (
      normalizeText(
        notice.visibility || "active"
      ) === "archived"
    ) {
      await noticeRef.set(
        {
          pushStatus: "SKIPPED",
          pushError:
            "Notice is archived.",
          pushProcessedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          status: "SKIPPED",
        }),
      };
    }

    if (
      normalizeText(
        notice.pushStatus
      ) === "sent"
    ) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          status: "ALREADY_SENT",
        }),
      };
    }

    const targetUser =
      await findTargetUser(
        notice
      );

    if (!targetUser?.id) {
      await noticeRef.set(
        {
          pushStatus:
            "FAILED",
          pushError:
            "No linked AeroStation Hub user found for employee.",
          pushProcessedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: false,
          status: "NO_USER",
        }),
      };
    }

    const employeeName =
      notice.employeeName ||
      targetUser.displayName ||
      targetUser.fullName ||
      targetUser.name ||
      targetUser.username ||
      "Employee";

    const trainingName =
      notice.trainingName ||
      notice.title ||
      "Training Required";

    const dueDateText =
      formatDate(
        notice.dueDate
      );

    const title =
      "Training Required";

    const pushBody = dueDateText
      ? `${trainingName} has been assigned to you. Due ${dueDateText}.`
      : `${trainingName} has been assigned to you.`;

    // Persist an unread notification so the in-app Notifications counter
    // and AeroStation badge remain synchronized after the app opens.
    let notificationId =
      String(
        notice.notificationId ||
          ""
      ).trim();

    if (!notificationId) {
      const notificationRef =
        await db
          .collection(
            "notifications"
          )
          .add({
            userId:
              targetUser.id,
            title,
            message:
              pushBody,
            body:
              pushBody,
            type:
              "TRAINING_NOTICE",
            category:
              "TRAINING",
            read:
              false,
            route:
              "/training-notices",
            source:
              "training_notices",
            sourceId:
              noticeId,
            trainingNoticeId:
              noticeId,
            employeeId:
              notice.employeeId ||
              "",
            employeeName,
            trainingName,
            dueDate:
              notice.dueDate ||
              "",
            createdAt:
              admin.firestore.FieldValue.serverTimestamp(),
          });

      notificationId =
        notificationRef.id;

      await noticeRef.set(
        {
          notificationId,
          notificationUserId:
            targetUser.id,
        },
        {
          merge: true,
        }
      );
    }

    const tokenRecords =
      await getEnabledTokens(
        targetUser.id
      );

    if (!tokenRecords.length) {
      await noticeRef.set(
        {
          pushStatus:
            "NO_TOKENS",
          pushError:
            "",
          pushTargetUserId:
            targetUser.id,
          pushProcessedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          status:
            "NO_TOKENS",
          userId:
            targetUser.id,
          notificationId,
        }),
      };
    }

    const messagePayload = {
      tokens: tokenRecords.map(
        (record) =>
          record.token
      ),
      notification: {
        title,
        body: pushBody,
      },
      data: {
        type:
          "TRAINING_NOTICE",
        route:
          "/training-notices",
        noticeId,
        notificationId,
        employeeId:
          String(
            notice.employeeId ||
              ""
          ),
        trainingName:
          String(
            trainingName
          ),
        dueDate:
          String(
            notice.dueDate ||
              ""
          ),
      },
      webpush: {
        notification: {
          title,
          body: pushBody,
          icon:
            "/icons/aerostation-icon.png",
          badge:
            "/icons/aerostation-icon.png",
          tag:
            `training-notice-${noticeId}`,
          renotify:
            true,
        },
        fcmOptions: {
          link:
            "/training-notices",
        },
      },
    };

    const response =
      await messaging.sendEachForMulticast(
        messagePayload
      );

    await disableBadTokens(
      tokenRecords,
      response
    );

    const status =
      response.successCount > 0
        ? "SENT"
        : "FAILED";

    await noticeRef.set(
      {
        pushStatus:
          status,
        pushError:
          status === "FAILED"
            ? "Firebase Cloud Messaging did not accept any active token."
            : "",
        pushTargetUserId:
          targetUser.id,
        pushSuccessCount:
          response.successCount,
        pushFailureCount:
          response.failureCount,
        pushProcessedAt:
          admin.firestore.FieldValue.serverTimestamp(),
        pushSentAt:
          status === "SENT"
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
      },
      {
        merge: true,
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok:
          status ===
          "SENT",
        status,
        successCount:
          response.successCount,
        failureCount:
          response.failureCount,
        userId:
          targetUser.id,
        notificationId,
      }),
    };
  } catch (err) {
    console.error(
      "Training Notice Push function error:",
      err
    );

    try {
      await noticeRef.set(
        {
          pushStatus:
            "FAILED",
          pushError:
            String(
              err?.message ||
                err ||
                "Unknown Push error"
            ).slice(
              0,
              1000
            ),
          pushProcessedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        {
          merge: true,
        }
      );
    } catch {
      // Do not mask the original error.
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error:
          "Training Notice Push failed",
      }),
    };
  }
};

// END send-training-notice-push
