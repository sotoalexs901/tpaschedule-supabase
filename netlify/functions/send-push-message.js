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

    // Important:
    // The function does NOT trust message text or recipient details
    // sent by the browser. It reads the saved Firestore message itself.
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

    const tokenSnap = await db
      .collection("users")
      .doc(receiverId)
      .collection("pushTokens")
      .where("enabled", "==", true)
      .get();

    const tokenRows = tokenSnap.docs
      .map((snap) => ({
        ref: snap.ref,
        token: clean(snap.data()?.token),
      }))
      .filter((item) => item.token);

    if (!tokenRows.length) {
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

    let successCount = 0;
    let failureCount = 0;
    const staleRefs = [];

    for (let i = 0; i < tokenRows.length; i += 500) {
      const chunk = tokenRows.slice(i, i + 500);

      const result = await getMessaging().sendEachForMulticast({
        tokens: chunk.map((item) => item.token),

        // Data-only notification:
        // public/sw.js decides how the notification is displayed.
        data: {
          title,
          body: preview,
          type: "message",
          url: "/messages",
          conversationId,
          senderId,
        },

        webpush: {
          headers: {
            Urgency: "high",
          },
        },
      });

      successCount += result.successCount;
      failureCount += result.failureCount;

      result.responses.forEach((response, index) => {
        if (response.success) return;

        const code = clean(response.error?.code);

        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          staleRefs.push(chunk[index].ref);
        }
      });
    }

    if (staleRefs.length) {
      await Promise.allSettled(
        staleRefs.map((ref) => ref.delete())
      );
    }

    return jsonResponse(200, {
      ok: true,
      sent: successCount,
      failed: failureCount,
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
