// Operational Chat server foundation. This endpoint is intentionally gated.
// It never trusts the user ID or role sent by the browser.
// Enable only after the station's identity/session migration is complete.
const admin = require("firebase-admin");
const crypto = require("node:crypto");
function response(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
}
function app() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    const data = JSON.parse(raw);
    return admin.initializeApp({ credential: admin.credential.cert({ projectId: data.project_id, clientEmail: data.client_email, privateKey: String(data.private_key).replace(/\\n/g, "\n") }) });
  }
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: key } = process.env;
  if (!projectId || !clientEmail || !key) throw new Error("Firebase Admin credentials missing");
  return admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey: key.replace(/\\n/g, "\n") }) });
}
function text(value, max = 200) { return String(value || "").trim().slice(0, max); }
function roleAllowed(role, channel) {
  if (channel.audience === "supervisors") return ["supervisor", "duty_manager", "station_manager"].includes(role);
  if (channel.audience === "dutys") return ["duty_manager", "station_manager"].includes(role);
  return true;
}
async function identity(event) {
  // Firebase ID token must be verified by the Admin SDK, not a localStorage user.
  const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
  if (!match) return null;
  const decoded = await admin.auth().verifyIdToken(match[1], true);
  const snap = await admin.firestore().collection("users").doc(decoded.uid).get();
  if (!snap.exists || snap.data()?.status === "inactive") return null;
  return { uid: decoded.uid, role: text(snap.data()?.role, 60), name: text(snap.data()?.displayName || snap.data()?.name || snap.data()?.username, 100) };
}
async function member(db, chatId, uid) {
  const ref = db.collection("operationalChats").doc(chatId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!(data.memberIds || []).includes(uid)) return null;
  return { ref, data };
}
exports.handler = async (event) => {
  if (process.env.OPERATIONAL_CHAT_ENABLED !== "true") return response(503, { error: "Operational Chat live service is not enabled." });
  if (event.httpMethod !== "POST") return response(405, { error: "POST required" });
  try {
    app();
    const user = await identity(event);
    if (!user) return response(401, { error: "Verified employee sign-in required." });
    const db = admin.firestore();
    const body = JSON.parse(event.body || "{}");
    const action = text(body.action, 40);
    if (action === "list") {
      const snap = await db.collection("operationalChats").where("memberIds", "array-contains", user.uid).limit(100).get();
      return response(200, { chats: snap.docs.filter(d => roleAllowed(user.role, d.data())).map(d => ({ id: d.id, name: d.data().name, audience: d.data().audience, memberIds: d.data().memberIds })) });
    }
    if (action === "create") {
      if (!["station_manager", "duty_manager", "supervisor"].includes(user.role)) return response(403, { error: "Not authorized to create chats." });
      const name = text(body.name, 80);
      const audience = text(body.audience, 20) || "invited";
      if (!name || !["invited", "supervisors", "dutys"].includes(audience)) return response(400, { error: "Invalid chat." });
      if (audience === "dutys" && !["station_manager", "duty_manager"].includes(user.role)) return response(403, { error: "Not authorized." });
      const invitees = [...new Set((Array.isArray(body.inviteeIds) ? body.inviteeIds : []).map(x => text(x, 128)))].filter(Boolean).slice(0, 40);
      const docs = await Promise.all(invitees.map(id => db.collection("users").doc(id).get()));
      if (docs.some(d => !d.exists || d.data()?.status === "inactive")) return response(400, { error: "Unknown or inactive employee." });
      if (docs.some(d => !roleAllowed(text(d.data().role, 60), { audience }))) return response(400, { error: "Invitee role is not permitted in this chat." });
      const ref = db.collection("operationalChats").doc();
      const now = admin.firestore.FieldValue.serverTimestamp();
      await ref.set({ name, audience, ownerId: user.uid, memberIds: [user.uid], invitedIds: invitees.filter(id => id !== user.uid), createdAt: now, updatedAt: now });
      return response(201, { id: ref.id, status: "created", invitations: invitees.length });
    }
    if (action === "invitations") {
      const snap = await db.collection("operationalChats").where("invitedIds", "array-contains", user.uid).limit(100).get();
      return response(200, { invitations: snap.docs.filter(d => roleAllowed(user.role, d.data())).map(d => ({ id: d.id, name: d.data().name })) });
    }
    const chatId = text(body.chatId, 128);
    if (!chatId || chatId.includes("/")) return response(400, { error: "Invalid chat ID." });
    if (action === "accept" || action === "decline") {
      const ref = db.collection("operationalChats").doc(chatId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || !(snap.data().invitedIds || []).includes(user.uid) || !roleAllowed(user.role, snap.data())) throw new Error("Invitation unavailable.");
        tx.update(ref, { invitedIds: admin.firestore.FieldValue.arrayRemove(user.uid), ...(action === "accept" ? { memberIds: admin.firestore.FieldValue.arrayUnion(user.uid) } : {}), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      return response(200, { ok: true });
    }
    const chat = await member(db, chatId, user.uid);
    if (!chat || !roleAllowed(user.role, chat.data)) return response(403, { error: "Not a member." });
    if (action === "messages") {
      const snap = await chat.ref.collection("messages").orderBy("createdAt", "desc").limit(100).get();
      return response(200, { messages: snap.docs.reverse().map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null, editedAt: d.data().editedAt?.toDate?.()?.toISOString() || null })) });
    }
    if (action === "send") {
      const message = text(body.text, 3000);
      if (!message) return response(400, { error: "Empty message." });
      const ref = await chat.ref.collection("messages").add({ senderId: user.uid, senderName: user.name, text: message, reactions: {}, deleted: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await chat.ref.update({ updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return response(201, { id: ref.id });
    }
    if (["edit", "delete", "react"].includes(action)) {
      const messageId = text(body.messageId, 128);
      if (!messageId || messageId.includes("/")) return response(400, { error: "Invalid message." });
      const ref = chat.ref.collection("messages").doc(messageId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().deleted) throw new Error("Message unavailable.");
        const msg = snap.data();
        if (action === "react") {
          const emoji = text(body.emoji, 8);
          if (!["👍", "❤️", "✅", "⚠️"].includes(emoji)) throw new Error("Invalid reaction.");
          const reactions = msg.reactions || {};
          const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
          reactions[emoji] = users.includes(user.uid) ? users.filter(id => id !== user.uid) : [...users, user.uid];
          tx.update(ref, { reactions });
        } else {
          if (msg.senderId !== user.uid && !(action === "delete" && user.role === "station_manager")) throw new Error("Not authorized.");
          if (action === "edit") {
            const next = text(body.text, 3000);
            if (!next) throw new Error("Empty message.");
            tx.update(ref, { text: next, editedAt: admin.firestore.FieldValue.serverTimestamp(), editHistory: admin.firestore.FieldValue.arrayUnion({ text: msg.text, editedAt: new Date().toISOString(), editedBy: user.uid }) });
          } else {
            tx.update(ref, { deleted: true, text: "", deletedBy: user.uid, deletedAt: admin.firestore.FieldValue.serverTimestamp() });
          }
        }
      });
      return response(200, { ok: true });
    }
    return response(400, { error: "Unknown action." });
  } catch (error) {
    console.error("Operational chat request failed:", error?.code || error?.message);
    return response(400, { error: "Request could not be completed." });
  }
};
