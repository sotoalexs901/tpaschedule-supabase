// Firebase-verified admin invitations, delivered through Resend.
// Secrets are server-only: RESEND_API_KEY, AEROSTATION_INVITE_FROM,
// Firebase Admin credentials. Existing PIN sessions cannot call this API.
const admin = require("firebase-admin");
const TEST_EMAIL = "alexs.napoles90@gmail.com";
const reply = (statusCode, value) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(value) });
function initialize() {
  if (admin.apps.length) return;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    const s = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert({ projectId: s.project_id, clientEmail: s.client_email, privateKey: String(s.private_key).replace(/\\n/g, "\n") }) });
    return;
  }
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = process.env;
  if (!projectId || !clientEmail || !privateKey) throw Error("Firebase Admin configuration missing");
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") }) });
}
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST required" });
  if (process.env.AEROSTATION_INVITES_ENABLED !== "true") return reply(503, { error: "Invitations are disabled" });
  if (!process.env.RESEND_API_KEY || !process.env.AEROSTATION_INVITE_FROM) return reply(503, { error: "Resend sender is not configured" });
  try {
    initialize();
    const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!match) return reply(401, { error: "Firebase admin session required" });
    const actor = await admin.auth().verifyIdToken(match[1], true);
    const actorSnap = await admin.firestore().collection("users").doc(actor.uid).get();
    if (!actorSnap.exists || actorSnap.data().role !== "station_manager" || actorSnap.data().status !== "active") return reply(403, { error: "Station Manager access required" });
    if (Buffer.byteLength(event.body || "") > 4096) return reply(413, { error: "Request too large" });
    const data = JSON.parse(event.body || "{}");
    const email = String(data.email || "").trim().toLowerCase();
    const first = String(data.first || "").trim().slice(0, 80);
    const last = String(data.last || "").trim().slice(0, 80);
    const phone = String(data.phone || "").trim().slice(0, 30);
    if (email !== TEST_EMAIL && process.env.AEROSTATION_INVITES_TEST_ONLY !== "false") return reply(403, { error: "Only the approved test recipient is enabled" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !first || !last) return reply(400, { error: "Valid name and email required" });
    // Refuse any collision: account migration must explicitly link existing employees.
    const existing = await admin.firestore().collection("users").where("email", "==", email).limit(1).get();
    if (!existing.empty) return reply(409, { error: "Existing employee requires account linking, not a new invitation" });
    let account;
    try { account = await admin.auth().getUserByEmail(email); }
    catch (err) { if (err.code !== "auth/user-not-found") throw err; }
    if (account) return reply(409, { error: "Firebase account already exists; use account linking" });
    const created = await admin.auth().createUser({ email, displayName: [first,last].join(" "), disabled: true });
    // The invite is recorded, but activation remains disabled until a secure
    // acceptance endpoint verifies email ownership and privacy consent.
    await admin.firestore().collection("employeeInvitations").doc(created.uid).set({
      uid: created.uid, email, first, last, phone, status: "pending_setup",
      createdBy: actor.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return reply(202, { status: "pending_setup", message: "Invitation reserved. Email delivery requires the verified acceptance workflow." });
  } catch (err) {
    console.error("Employee invitation error", err);
    return reply(500, { error: "Invitation could not be prepared" });
  }
};
