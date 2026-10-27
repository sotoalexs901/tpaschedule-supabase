// Netlify Scheduled Function: server-side, independent of browser sessions.
// Requires firebase-admin and GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.
const { schedule } = require('@netlify/functions');
const admin = require('firebase-admin');

function firebase() {
  if (!admin.apps.length) {
    const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is missing');
    const account = JSON.parse(raw);
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  return admin.firestore();
}
const localTime = (d) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const hasAction = a => Boolean(
  a.dutyActionTakenAt || a.responsibleSupervisorSelectedAt ||
  (a.reportReviews && Object.keys(a.reportReviews).length) ||
  a.reviewedAt || a.completedAt || a.closedAt ||
  ['COMPLETED','CLOSED','REVIEWED'].includes(String(a.status || '').toUpperCase())
);
const safeId = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

exports.handler = schedule('*/5 * * * *', async () => {
  const db = firebase();
  const now = localTime(new Date());
  // Today's assignments plus yesterday's, to catch shifts ending after midnight.
  const today = now.slice(0, 10);
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  const [todaySnap, yesterdaySnap] = await Promise.all([
    db.collection('smart_intelligence_daily_assignments').where('dateKey', '==', today).get(),
    db.collection('smart_intelligence_daily_assignments').where('dateKey', '==', yesterday).get()
  ]);
  const docs = new Map([...todaySnap.docs, ...yesterdaySnap.docs].map(d => [d.id, d]));
  let created = 0;
  for (const snap of docs.values()) {
    const a = snap.data();
    if (!a.assignedDutyManagerId || !a.assignedShiftEndLocal ||
        a.assignedShiftEndLocal > now || hasAction(a)) continue;
    const id = safeId(`${snap.id}__${a.assignedDutyManagerId}__${a.assignedShiftEndLocal}_no_action`);
    const alertRef = db.collection('smart_intelligence_alerts').doc(id);
    const auditRef = db.collection('smart_intelligence_audit').doc(id);
    const made = await db.runTransaction(async tx => {
      const existing = await tx.get(alertRef);
      if (existing.exists) return false;
      // Re-read to avoid alerting on an action registered while this run was processing.
      const latest = await tx.get(snap.ref);
      if (!latest.exists || hasAction(latest.data()) ||
          latest.data().assignedDutyManagerId !== a.assignedDutyManagerId) return false;
      const base = {
        dateKey: a.dateKey || today, assignmentId: snap.id, department: a.department || '',
        assignedDutyManagerId: a.assignedDutyManagerId,
        assignedDutyManagerName: a.assignedDutyManagerName || '',
        shiftEndLocal: a.assignedShiftEndLocal,
        alertType: 'DUTY_SHIFT_ENDED_NO_ACTION',
        source: 'netlify_smart_shift_watch_v1',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      tx.create(alertRef, {
        ...base, active: true, severity: 'HIGH', targetRole: 'station_manager',
        audience: 'STATION_MANAGER',
        title: `${a.department || 'Department'}: Duty Manager ended shift without action`,
        message: `${a.assignedDutyManagerName || 'Duty Manager'} ended the shift at ${a.assignedShiftEndLocal} (Tampa time) without a recorded action.`
      });
      tx.create(auditRef, { ...base, eventType: 'DUTY_SHIFT_ENDED_NO_ACTION' });
      return true;
    });
    if (made) created++;
  }
  console.log(JSON.stringify({ task: 'smart-intelligence-shift-watch', now, inspected: docs.size, alertsCreated: created }));
  return { statusCode: 200 };
});
