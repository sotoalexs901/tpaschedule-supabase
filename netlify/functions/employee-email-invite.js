const admin = require("firebase-admin");
const crypto = require("node:crypto");
const reply = (statusCode, data) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(data) });
function init() {
  if (admin.apps.length) return;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    const s = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert({ projectId: s.project_id, clientEmail: s.client_email, privateKey: String(s.private_key).replace(/\\n/g, "\n") }) });
  } else {
    const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
    if (!projectId || !clientEmail || !privateKey) throw Error("Firebase Admin credentials missing");
    admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }) });
  }
}
const emailOf = v => String(v || "").trim().toLowerCase();
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const digest = v => crypto.createHash("sha256").update(v).digest("hex");
exports.handler = async event => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
  if (process.env.AEROSTATION_INVITES_ENABLED !== "true") return reply(503, { error: "Invitations are not enabled" });
  try {
    init();
    const input = JSON.parse(event.body || "{}");
    const action = String(input.action || "");
    const store = admin.firestore();
    if (action === "send") {
      const bearer = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
      if (!bearer) return reply(401, { error: "Firebase manager sign-in required" });
      const identity = await admin.auth().verifyIdToken(bearer[1], true);
      if (!identity.email_verified) return reply(403, { error: "Manager email must be verified" });
      const managerDocs = await store.collection("users").where("authUid", "==", identity.uid).limit(2).get();
      if (managerDocs.size !== 1) return reply(403, { error: "Manager identity not linked" });
      const manager = managerDocs.docs[0].data();
      if (manager.role !== "station_manager" || manager.status !== "active" || emailOf(manager.email) !== emailOf(identity.email))
        return reply(403, { error: "Station Manager access required" });
      const userId = String(input.userId || "");
      const newEmail = emailOf(input.email);
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(userId) || !validEmail(newEmail)) return reply(400, { error: "Invalid user or email" });
      const ref = store.collection("users").doc(userId);
      const userSnap = await ref.get();
      if (!userSnap.exists) return reply(404, { error: "Employee not found" });
      const employee = userSnap.data();
      if (employee.status === "inactive") return reply(403, { error: "Inactive employee" });
      if (employee.authUid === identity.uid) return reply(403, { error: "Manager cannot change own email using invitation" });
      const duplicate = await store.collection("users").where("email", "==", newEmail).limit(2).get();
      if (duplicate.docs.some(d => d.id !== userId)) return reply(409, { error: "Email already belongs to another profile" });
      try {
        const existing = await admin.auth().getUserByEmail(newEmail);
        if (existing.uid !== employee.authUid) return reply(409, { error: "Email already used by another login" });
      } catch (err) { if (err.code !== "auth/user-not-found") throw err; }
      const key = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      const url = "https://tpaschedule-supabase.netlify.app/activate-email?userId=" + encodeURIComponent(userId) + "&token=" + encodeURIComponent(key);
      const sender = process.env.AEROSTATION_INVITE_FROM;
      if (!process.env.RESEND_API_KEY || !sender) return reply(503, { error: "Invitation email service not configured" });
      const name = String(employee.displayName || employee.username || "Team member").slice(0, 120);
      const inviteRef = store.collection("employeeEmailInvites").doc(userId);
      await inviteRef.set({ userId, email: newEmail, tokenHash: digest(key), expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt), status: "pending_delivery", sentBy: managerDocs.docs[0].id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ from: sender, to: [newEmail], subject: "AeroStation Hub - Set your account password", html: '<p>Hello ' + name.replace(/[&<>"]/g, "") + ',</p><p>Your Station Manager has invited you to activate your AeroStation Hub email login.</p><p><a href="' + url + '">Set your password and activate</a></p><p>This link expires in 24 hours. If you did not expect this message, contact station management.</p>' })
      });
      if (!res.ok) { console.error("Resend invitation failure", res.status); await inviteRef.update({ status: "delivery_failed", tokenHash: admin.firestore.FieldValue.delete() }); return reply(502, { error: "Email delivery service rejected the invitation" }); }
      await inviteRef.update({ status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() });
      return reply(200, { status: "sent", email: newEmail });
    }
    if (action === "activate") {
      const userId = String(input.userId || "");
      const token = String(input.token || "");
      const password = String(input.password || "");
      if (!/^[a-zA-Z0-9_-]{1,160}$/.test(userId) || token.length < 30 || password.length < 12 || password.length > 128)
        return reply(400, { error: "Invalid invitation or password (minimum 12 characters)" });
      const invitationRef = store.collection("employeeEmailInvites").doc(userId);
      const inviteSnap = await invitationRef.get();
      if (!inviteSnap.exists) return reply(404, { error: "Invitation not found" });
      const invite = inviteSnap.data();
      if (invite.status !== "sent" || !invite.tokenHash || invite.expiresAt.toMillis() < Date.now() || !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(invite.tokenHash)))
        return reply(403, { error: "Invitation expired or invalid" });
      const userRef = store.collection("users").doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists || userSnap.data().status === "inactive") return reply(403, { error: "Employee unavailable" });
      const employee = userSnap.data();
      if (employee.authUid) {
        await admin.auth().updateUser(employee.authUid, { email: invite.email, password, emailVerified: true });
        await admin.auth().revokeRefreshTokens(employee.authUid);
      } else {
        const account = await admin.auth().createUser({ email: invite.email, password, emailVerified: true, disabled: false });
        await userRef.update({ authUid: account.uid });
      }
      await userRef.update({ email: invite.email, emailActivatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await invitationRef.update({ status: "activated", activatedAt: admin.firestore.FieldValue.serverTimestamp(), tokenHash: admin.firestore.FieldValue.delete() });
      return reply(200, { status: "activated" });
    }
    return reply(400, { error: "Unsupported action" });
  } catch (err) {
    console.error("Invitation error", err.code || err.message);
    return reply(500, { error: "Invitation could not be processed" });
  }
};
