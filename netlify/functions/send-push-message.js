// netlify/functions/send-push-message.js

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function clean(value) {
  return String(value || "").trim();
}

async function resolveUserName(db, userId, fallback = "Station Team") {
  if (!userId) return fallback;

  try {
    const snap = await db.collection("users").doc(userId).get();

    if (!snap.exists) return fallback;

    const data = snap.data() || {};

    return (
      clean(
        data.displayName ||
          data.fullName ||
          data.name ||
          data.username ||
          data.loginUsername
      ) || fallback
    );
  } catch {
    return fallback;
  }
}

function isStaleTokenError(response) {
  const code = clean(response?.error?.code);

  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}

async function getEnabledTokens(db, userId, collectionName) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection(collectionName)
    .where("enabled", "==", true)
    .get();

  return snap.docs
    .map((docSnap) => ({
      ref: docSnap.ref,
      token: clean(docSnap.data()?.token),
    }))
    .filter((item) => item.token);
}

async function sendWebPush(tokens, payload) {
  let sent = 0;
  let failed = 0;
  const staleRefs = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);

    const result = await getMessaging().sendEachForMulticast({
      tokens: chunk.map((item) => item.token),
      data: payload,
      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    });

    sent += result.successCount;
    failed += result.failureCount;

    result.responses.forEach((response, index) => {
      if (!response.success && isStaleTokenError(response)) {
        staleRefs.push(chunk[index].ref);
      }
    });
  }

  return { sent, failed, staleRefs };
}

async function sendNativePush(tokens, title, body, data) {
  let sent = 0;
  let failed = 0;
  const staleRefs = [];

  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);

    const result = await getMessaging().sendEachForMulticast({
      tokens: chunk.map((item) => item.token),

      notification: {
        title,
        body,
      },

      data,

      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
          },
        },
      },

      android: {
        priority: "high",
        notification: {
          sound: "default",
        },
      },
    });

    sent += result.successCount;
    failed += result.failureCount;

    result.responses.forEach((response, index) => {
      if (!response.success && isStaleTokenError(response)) {
        staleRefs.push(chunk[index].ref);
      }
    });
  }

  return { sent, failed, staleRefs };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: "Method not allowed.",
    });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const conversationId = clean(body.conversationId);
    const messageId = clean(body.messageId);

    if (!conversationId || !messageId) {
      return jsonResponse(400, {
        ok: false,
        error: "conversationId and messageId are required.",
      });
    }

    getAdminApp();
    const db = getFirestore();

    const messageRef = db
      .collection("conversations")
      .doc(conversationId)
      .collection("messages")
      .doc(messageId);

    const messageSnap = await messageRef.get();

    if (!messageSnap.exists) {
      return jsonResponse(404, {
        ok: false,
        error: "Message was not found.",
      });
    }

    const message = messageSnap.data() || {};

    const senderId = clean(message.senderId);
    const receiverId = clean(message.receiverId);
    const messageText = clean(message.text);

    if (!receiverId || receiverId === senderId) {
      return jsonResponse(200, {
        ok: true,
        sent: 0,
        reason: "No valid receiver.",
      });
    }

    const senderName = await resolveUserName(
      db,
      senderId,
      clean(message.senderUsername) || "Station Team"
    );

    const [webTokens, nativeTokens] = await Promise.all([
      getEnabledTokens(db, receiverId, "pushTokens"),
      getEnabledTokens(db, receiverId, "nativePushTokens"),
    ]);

    if (!webTokens.length && !nativeTokens.length) {
      return jsonResponse(200, {
        ok: true,
        sent: 0,
        reason: "Receiver has no enabled push tokens.",
      });
    }

    const preview =
      messageText.length > 140
        ? `${messageText.slice(0, 137)}...`
        : messageText || "You received a new message.";

    const title = `Message from ${senderName}`;

    const data = {
      title,
      body: preview,
      type: "message",
      url: "/messages",
      conversationId,
      senderId,
    };

    const [webResult, nativeResult] = await Promise.all([
      webTokens.length
        ? sendWebPush(webTokens, data)
        : Promise.resolve({ sent: 0, failed: 0, staleRefs: [] }),
      nativeTokens.length
        ? sendNativePush(nativeTokens, title, preview, data)
        : Promise.resolve({ sent: 0, failed: 0, staleRefs: [] }),
    ]);

    const staleRefs = [
      ...webResult.staleRefs,
      ...nativeResult.staleRefs,
    ];

    if (staleRefs.length) {
      await Promise.allSettled(
        staleRefs.map((ref) => ref.delete())
      );
    }

    return jsonResponse(200, {
      ok: true,
      sent: webResult.sent + nativeResult.sent,
      failed: webResult.failed + nativeResult.failed,
      webSent: webResult.sent,
      nativeSent: nativeResult.sent,
      staleTokensRemoved: staleRefs.length,
    });
  } catch (error) {
    console.error("send-push-message failed:", error);

    return jsonResponse(500, {
      ok: false,
      error: error?.message || "Push notification failed.",
    });
  }
};

// END send-push-message
