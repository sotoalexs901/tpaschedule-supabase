// netlify/functions/send-direct-message-push.js

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

async function findUserByIdOrUsername(
  db,
  userId,
  username
) {
  const cleanId = normalizeText(userId);

  if (cleanId) {
    const ref = db
      .collection("users")
      .doc(cleanId);

    const snap = await ref.get();

    if (snap.exists) {
      return {
        id: snap.id,
        ref,
        data: snap.data() || {},
      };
    }
  }

  const cleanUsername = normalizeText(username);

  if (cleanUsername) {
    for (const field of [
      "username",
      "loginUsername",
    ]) {
      const snap = await db
        .collection("users")
        .where(field, "==", cleanUsername)
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

function getUserLabel(userData) {
  return (
    normalizeText(userData?.displayName) ||
    normalizeText(userData?.fullName) ||
    normalizeText(userData?.name) ||
    normalizeText(userData?.username) ||
    normalizeText(userData?.loginUsername) ||
    "AeroStation Hub"
  );
}

async function getEnabledTokens(
  db,
  userId
) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .where("enabled", "==", true)
    .get();

  return snap.docs
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

  let conversationId = "";
  let messageId = "";

  try {
    const body = JSON.parse(event.body || "{}");

    conversationId =
      normalizeText(body.conversationId);

    messageId =
      normalizeText(body.messageId);
  } catch {
    return json(400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  if (!conversationId || !messageId) {
    return json(400, {
      ok: false,
      error:
        "Missing conversationId or messageId.",
    });
  }

  try {
    getAdminApp();

    const db = admin.firestore();

    const conversationRef = db
      .collection("conversations")
      .doc(conversationId);

    const conversationSnap =
      await conversationRef.get();

    if (!conversationSnap.exists) {
      return json(404, {
        ok: false,
        error: "Conversation not found.",
      });
    }

    const conversation =
      conversationSnap.data() || {};

    const messageRef =
      conversationRef
        .collection("messages")
        .doc(messageId);

    const messageSnap =
      await messageRef.get();

    if (!messageSnap.exists) {
      return json(404, {
        ok: false,
        error: "Message not found.",
      });
    }

    const message =
      messageSnap.data() || {};

    if (message.pushStatus === "SENT") {
      return json(200, {
        ok: true,
        skipped: true,
        reason: "already-sent",
        conversationId,
        messageId,
      });
    }

    const senderId =
      normalizeText(message.senderId);

    const receiverId =
      normalizeText(message.receiverId);

    if (!senderId || !receiverId) {
      return json(409, {
        ok: false,
        error:
          "Stored message is missing senderId or receiverId.",
      });
    }

    const participants =
      Array.isArray(conversation.participants)
        ? conversation.participants.map(
            normalizeText
          )
        : [];

    if (
      !participants.includes(senderId) ||
      !participants.includes(receiverId)
    ) {
      return json(409, {
        ok: false,
        error:
          "Stored message users do not match the conversation participants.",
      });
    }

    const recipient =
      await findUserByIdOrUsername(
        db,
        receiverId,
        message.receiverUsername
      );

    if (!recipient) {
      await messageRef.set(
        {
          pushStatus: "NO_USER",
          pushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason: "recipient-not-found",
        conversationId,
        messageId,
      });
    }

    const sender =
      await findUserByIdOrUsername(
        db,
        senderId,
        message.senderUsername
      );

    const tokenItems =
      await getEnabledTokens(
        db,
        recipient.id
      );

    if (!tokenItems.length) {
      await messageRef.set(
        {
          pushStatus: "NO_TOKENS",
          pushTargetUserId:
            recipient.id,
          pushSuccessCount: 0,
          pushFailureCount: 0,
          pushUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return json(200, {
        ok: true,
        skipped: true,
        reason:
          "recipient-has-no-enabled-tokens",
        conversationId,
        messageId,
        targetUserId: recipient.id,
      });
    }

    const senderName = sender
      ? getUserLabel(sender.data)
      : normalizeText(
          message.senderUsername
        ) || "New message";

    const messageText =
      normalizeText(message.text);

    const title = senderName;
    const body = messageText
      ? messageText.slice(0, 220)
      : "You have a new direct message.";

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
            url: "/messages",
            type: "direct_message",
            conversationId,
            messageId,
            senderId,
          },

          webpush: {
            headers: {
              Urgency: "high",
            },
          },
        });

    await disableInvalidTokens(
      tokenItems,
      result.responses
    );

    await messageRef.set(
      {
        pushStatus:
          result.successCount > 0
            ? "SENT"
            : "FAILED",

        pushTargetUserId:
          recipient.id,

        pushSuccessCount:
          result.successCount,

        pushFailureCount:
          result.failureCount,

        pushSentAt:
          result.successCount > 0
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,

        pushUpdatedAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json(200, {
      ok: true,
      conversationId,
      messageId,
      targetUserId: recipient.id,
      tokenCount: tokenItems.length,
      successCount:
        result.successCount,
      failureCount:
        result.failureCount,
    });
  } catch (error) {
    console.error(
      "send-direct-message-push error:",
      error
    );

    try {
      if (
        conversationId &&
        messageId &&
        admin.apps.length
      ) {
        await admin
          .firestore()
          .collection("conversations")
          .doc(conversationId)
          .collection("messages")
          .doc(messageId)
          .set(
            {
              pushStatus: "FAILED",
              pushError:
                error?.message ||
                "Unexpected Push error.",
              pushUpdatedAt:
                admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    } catch (writeError) {
      console.error(
        "Could not record direct message Push failure:",
        writeError
      );
    }

    return json(500, {
      ok: false,
      conversationId,
      messageId,
      error:
        error?.message ||
        "Unexpected direct message Push error.",
    });
  }
};

// END send-direct-message-push.js
