const admin = require("firebase-admin");
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
exports.handler = async event => {
  if (event.httpMethod !== "GET") return reply(405, { error: "Method not allowed" });
  try {
    init();
    const match = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!match) return reply(401, { error: "Verified manager login required" });
    const identity = await admin.auth().verifyIdToken(match[1], true);
    if (!identity.email_verified) return reply(403, { error: "Verified email required" });
    const db = admin.firestore();
    const managers = await db.collection("users").where("authUid", "==", identity.uid).limit(2).get();
    if (managers.size !== 1) return reply(403, { error: "Manager profile not linked" });
    const manager = managers.docs[0].data();
    if (manager.role !== "station_manager" || manager.status !== "active" || String(manager.email || "").trim().toLowerCase() !== String(identity.email || "").trim().toLowerCase()) return reply(403, { error: "Station Manager access required" });
    const [invites, accounts] = await Promise.all([db.collection("employeeEmailInvites").get(), db.collection("users").get()]);
    const rows = await Promise.all(accounts.docs.map(async doc => {
      const u = doc.data(), invite = invites.docs.find(d => d.id === doc.id)?.data() || null;
      let authVerified = false;
      if (u.authUid) {
        try { const a = await admin.auth().getUser(u.authUid); authVerified = Boolean(a.emailVerified) && String(a.email || "").toLowerCase() === String(u.email || "").toLowerCase(); }
        catch (e) { if (e.code !== "auth/user-not-found") throw e; }
      }
      const asIso = v => v && typeof v.toDate === "function" ? v.toDate().toISOString() : null;
      return { userId: doc.id, invitationStatus: invite?.status || "not_sent", invitationEmail: invite?.email || null, sentAt: asIso(invite?.sentAt), activatedAt: asIso(invite?.activatedAt || u.emailActivatedAt), authLinked: Boolean(u.authUid), emailVerified: authVerified };
    }));
    return reply(200, { accounts: rows });
  } catch (e) {
    console.error("Account activity lookup failed", e.code || e.message);
    return reply(500, { error: "Account status unavailable" });
  }
};
