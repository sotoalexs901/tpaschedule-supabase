const admin = require("firebase-admin");
function init() {
  if (admin.apps.length) return;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const creds = raw ? JSON.parse(raw) : {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
  };
  if (!creds.project_id || !creds.client_email || !creds.private_key) throw new Error("Firebase credentials missing");
  admin.initializeApp({ credential: admin.credential.cert({
    projectId: creds.project_id, clientEmail: creds.client_email,
    privateKey: String(creds.private_key).replace(/\\n/g, "\n"),
  }) });
}
const clean = v => String(v ?? "").trim();
const role = v => clean(v).toLowerCase().replace(/[\s-]+/g, "_");
const displayName = u => clean(u.fullName || u.name || u.displayName || u.username || u.email || "Unknown employee");
function easternDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
async function notifyOnce(db, key, userId, title, message, extra = {}) {
  const ref = db.collection("monthly_compliance_alerts").doc(key);
  const noticeRef = db.collection("notifications").doc(key);
  try {
    await db.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) return;
      tx.create(ref, { userId, title, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...extra });
      tx.create(noticeRef, {
        userId, title, message, body: message, type: "monthly_report_compliance",
        read: false, isRead: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        link: "/monthly-employee-performance-report",
        ...extra,
      });
    });
    return true;
  } catch (e) {
    if (e.code === 6 || e.code === "already-exists") return false;
    throw e;
  }
}
exports.handler = async () => {
  try {
    init();
    const now = easternDate();
    const day = Number(now.day);
    if (![10, 16].includes(day) || Number(now.hour) < 9) return { statusCode: 200, body: JSON.stringify({ skipped: true, day, hour: now.hour }) };
    const reportType = day === 10 ? "SPR" : "EPR";
    const requiredRole = day === 10 ? "duty_manager" : "supervisor";
    const deadline = day === 10 ? 9 : 15;
    const month = now.year + "-" + now.month;
    const db = admin.firestore();
    const [usersSnap, reportsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("employeePerformanceReports").where("month", "==", month).get(),
    ]);
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const qualifying = new Set(reportsSnap.docs.filter(d => {
      const r = d.data();
      return clean(r.reportType).toUpperCase() === reportType &&
        !["draft", "saved_draft"].includes(role(r.managerStatus)) &&
        !!clean(r.supervisorId);
    }).map(d => clean(d.data().supervisorId)));
    const missing = users.filter(u => role(u.role) === requiredRole && role(u.status || "active") === "active" && !qualifying.has(u.id));
    let notices = 0;
    for (const u of missing) {
      const key = `compliance_${month}_${reportType}_${u.id}`;
      if (await notifyOnce(db, key, u.id,
        `${reportType} Overdue — Monthly Submission`,
        `Your monthly ${reportType} was due on the ${deadline}th. No submitted ${reportType} is recorded for ${month}. Please submit your report as soon as possible.`,
        { month, reportType, dueDay: deadline, recipientRole: requiredRole })) notices++;
    }
    // Private station-manager summary: do not publish the list to supervisor/agent dashboards.
    const managers = users.filter(u => role(u.role) === "station_manager" && role(u.status || "active") === "active");
    for (const manager of managers) {
      const names = missing.map(u => displayName(u) + " (" + u.id + ")").join("; ");
      await notifyOnce(db, `compliance_summary_${month}_${reportType}_${manager.id}`, manager.id,
        `${reportType} Compliance — ${month}`,
        `${missing.length} ${requiredRole.replace("_"," ")}(s) have no submitted ${reportType} as of the ${day}th: ${names || "None"}.`,
        { month, reportType, dueDay: deadline, privateManagerSummary: true, missingUserIds: missing.map(u => u.id) });
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, month, reportType, missingCount: missing.length, notices }) };
  } catch (e) {
    console.error("monthly compliance error", e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e.message || e) }) };
  }
};
