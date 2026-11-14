// Authenticated identity bridge for the staged Firebase login migration.
// The existing Firestore document ID is retained; Firebase UID is a separate link.
// Requires Firebase Admin credentials configured on Netlify.
const admin = require("firebase-admin");
const respond = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(data),
});
function init() {
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
  if (!projectId || !clientEmail || !privateKey) throw Error("Firebase Admin credentials missing");
  admin.initializeApp({ credential: admin.credential.cert({
    projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n"),
  }) });
}
exports.handler = async event => {
  if (event.httpMethod !== "GET") return respond(405, { error: "Method not allowed" });
  if (process.env.AEROSTATION_EMAIL_LOGIN_ENABLED !== "true")
    return respond(503, { error: "Email sign-in is not enabled yet" });
  try {
    init();
    const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!match) return respond(401, { error: "Authentication required" });
    const verified = await admin.auth().verifyIdToken(match[1], true);
    if (!verified.email_verified) return respond(403, { error: "Verify your email before signing in" });
    const users = admin.firestore().collection("users");
    const matches = await users.where("authUid", "==", verified.uid).limit(2).get();
    if (matches.size !== 1) return respond(403, { error: "Employee account not linked. Contact station administration." });
    const doc = matches.docs[0], data = doc.data();
    if (data.status && data.status !== "active") return respond(403, { error: "Employee account inactive" });
    if (String(data.email || "").trim().toLowerCase() !== String(verified.email || "").trim().toLowerCase())
      return respond(403, { error: "Email does not match employee profile" });
    if (data.privacyPolicyAccepted !== true || data.privacyPolicyVersion !== "2026.10.20")
      return respond(403, { error: "Privacy policy acknowledgment required" });
    const { pin, password, ...safe } = data;
    return respond(200, { user: { id: doc.id, ...safe, authUid: verified.uid, authMethod: "firebase" } });
  } catch (err) {
    console.error("Employee identity verification failed", err.code || err.message);
    return respond(401, { error: "Could not verify employee session" });
  }
};
