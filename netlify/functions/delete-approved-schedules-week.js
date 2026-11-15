const admin = require("firebase-admin");
const respond = (statusCode, payload) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(payload) });
function initialize() {
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
const normalizeWeek = v => {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}` : "";
};
exports.handler = async event => {
  if (event.httpMethod !== "POST") return respond(405, { error: "Method not allowed" });
  try {
    initialize();
    const bearer = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!bearer) return respond(401, { error: "Verified manager login required" });
    const identity = await admin.auth().verifyIdToken(bearer[1], true);
    if (!identity.email_verified) return respond(403, { error: "Verified email required" });
    const db = admin.firestore();
    const managerSnap = await db.collection("users").where("authUid", "==", identity.uid).limit(2).get();
    if (managerSnap.size !== 1) return respond(403, { error: "Manager profile not linked" });
    const manager = managerSnap.docs[0].data();
    if (manager.role !== "station_manager" || manager.status !== "active" || String(manager.email || "").toLowerCase() !== String(identity.email || "").toLowerCase()) return respond(403, { error: "Station Manager access required" });
    const payload = JSON.parse(event.body || "{}");
    const week = normalizeWeek(payload.weekStart);
    const ids = payload.scheduleIds;
    if (!week || !Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== "string" || !id || id.includes("/")) || new Set(ids).size !== ids.length) return respond(400, { error: "Invalid week or schedule IDs" });
    const refs = ids.map(id => db.collection("schedules").doc(id));
    const docs = await db.getAll(...refs);
    if (docs.some(d => !d.exists || d.data().status !== "approved" || normalizeWeek(d.data().weekStart || d.data().weekTag) !== week)) return respond(409, { error: "Schedule list changed. Refresh before deleting." });
    // Preserve an auditable backup of every removed schedule before deleting the originals.
    const auditRef = db.collection("schedule_deletion_audit").doc();
    const batch = db.batch();
    batch.set(auditRef, { weekStart: week, deletedBy: identity.uid, deletedByEmail: identity.email, deletedAt: admin.firestore.FieldValue.serverTimestamp(), scheduleIds: ids, schedules: docs.map(d => ({ id: d.id, data: d.data() })) });
    refs.forEach(ref => batch.delete(ref));
    await batch.commit();
    return respond(200, { deleted: ids.length, weekStart: week, auditId: auditRef.id });
  } catch (error) {
    console.error("Bulk approved schedule delete failed", error.code || error.message);
    return respond(500, { error: "Unable to delete schedules" });
  }
};
