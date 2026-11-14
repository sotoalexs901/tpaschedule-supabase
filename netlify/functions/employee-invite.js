// AeroStation Hub employee invitations. Disabled until authenticated station manager
// accounts and the acceptance/login flow are deployed and tested.
// Never accept legacy localStorage sessions or a PIN as administrator proof.
const admin = require("firebase-admin");
const TEST_EMAIL = "alexs.napoles90@gmail.com";
const PRIVACY_VERSION = "2026.10.20";
const reply = (statusCode, value) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(value),
});
function initialize() {
  if (admin.apps.length) return;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    const s = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert({
      projectId: s.project_id, clientEmail: s.client_email,
      privateKey: String(s.private_key).replace(/\\n/g, "\n"),
    }) });
    return;
  }
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) throw Error("Firebase Admin configuration missing");
  admin.initializeApp({ credential: admin.credential.cert({
    projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n"),
  }) });
}
const escapeHtml = v => String(v).replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
async function sendResend({ email, name, link }) {
  const sender = process.env.AEROSTATION_INVITE_FROM;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `aerostation-invite-${Buffer.from(email).toString("hex").slice(0, 80)}`,
    },
    body: JSON.stringify({
      from: sender,
      to: [email],
      subject: "AeroStation Hub | Set up your employee account",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17324d">
        <h2>AeroStation Hub</h2>
        <p>Hello ${escapeHtml(name)},</p>
        <p>You have been invited to set up your AeroStation Hub employee account.</p>
        <p><a href="${escapeHtml(link)}" style="background:#1769aa;color:white;padding:12px 18px;border-radius:7px;text-decoration:none">Set up password</a></p>
        <p>After setting your password, you must review and accept the current privacy policy before accessing station data.</p>
        <p>This invitation was requested by your station administration. If unexpected, contact your supervisor.</p>
        <p style="font-size:12px;color:#64748b">Do not share your setup link.</p></div>`,
    }),
  });
  if (!response.ok) {
    console.error("Resend delivery error", response.status);
    throw new Error("Email delivery failed");
  }
  return response.json();
}
exports.handler = async event => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST required" });
  if (process.env.AEROSTATION_INVITES_ENABLED !== "true") return reply(503, { error: "Invitations are disabled" });
  if (!process.env.RESEND_API_KEY || !process.env.AEROSTATION_INVITE_FROM) return reply(503, { error: "Email sender not configured" });
  try {
    initialize();
    const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!match) return reply(401, { error: "Verified Firebase administrator session required" });
    const actor = await admin.auth().verifyIdToken(match[1], true);
    const actorSnap = await admin.firestore().collection("users").doc(actor.uid).get();
    if (!actorSnap.exists || actorSnap.data().role !== "station_manager" || actorSnap.data().status !== "active")
      return reply(403, { error: "Station Manager access required" });
    if (Buffer.byteLength(event.body || "", "utf8") > 4096) return reply(413, { error: "Request too large" });
    const data = JSON.parse(event.body || "{}");
    const email = String(data.email || "").trim().toLowerCase();
    const first = String(data.first || "").trim().slice(0, 80);
    const last = String(data.last || "").trim().slice(0, 80);
    const phone = String(data.phone || "").trim().slice(0, 30);
    if (email !== TEST_EMAIL && process.env.AEROSTATION_INVITES_TEST_ONLY !== "false")
      return reply(403, { error: "Only the approved test recipient is enabled" });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !first || !last)
      return reply(400, { error: "Valid name and email required" });
    const users = admin.firestore().collection("users");
    const existing = await users.where("email", "==", email).limit(1).get();
    if (!existing.empty) return reply(409, { error: "Existing employee requires account linking" });
    try {
      await admin.auth().getUserByEmail(email);
      return reply(409, { error: "Firebase account already exists; use account linking" });
    } catch (err) {
      if (err.code !== "auth/user-not-found") throw err;
    }
    // New accounts have no station privileges until privacy is accepted and
    // the identity is activated. This endpoint does not activate any account.
    const randomPassword = require("crypto").randomBytes(36).toString("base64url") + "Aa1!";
    const created = await admin.auth().createUser({
      email, displayName: `${first} ${last}`, password: randomPassword, disabled: true,
    });
    const invitationRef = admin.firestore().collection("employeeInvitations").doc(created.uid);
    await invitationRef.set({
      uid: created.uid, email, first, last, phone,
      status: "pending_activation", privacyPolicyVersion: PRIVACY_VERSION,
      createdBy: actor.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Intentionally do NOT send a password reset link to a disabled account.
    // Acceptance must first be implemented with a single-use token, privacy
    // acknowledgment, and an activation transaction. No false "sent" status.
    return reply(202, {
      status: "pending_activation",
      message: "Account reserved, not activated. Email was not sent; secure acceptance workflow is required.",
    });
  } catch (err) {
    console.error("Employee invitation error", err);
    return reply(500, { error: "Invitation could not be prepared" });
  }
};
