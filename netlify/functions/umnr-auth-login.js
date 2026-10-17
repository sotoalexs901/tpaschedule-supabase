// Save as netlify/functions/umnr-auth-login.js
// Dedicated UMNR authentication. Does not change existing WCHR login.
// Requires UMNR_AUTH_ENABLED=true, Firebase Admin credentials, and
// per-user umnrPinHash (scrypt format produced by the provisioning script).
const admin = require('firebase-admin');
const crypto = require('node:crypto');

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  let credentials;
  if (raw) credentials = JSON.parse(raw);
  else credentials = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw new Error('Missing Firebase Admin credentials');
  return admin.initializeApp({ credential: admin.credential.cert({
    projectId: credentials.project_id,
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
  }) });
}
const reply = (statusCode, body) => ({ statusCode, headers: {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.UMNR_ALLOWED_ORIGIN || 'https://invalid.example',
  'Vary': 'Origin',
}, body: JSON.stringify(body) });
const digest = (pin, salt) => crypto.scryptSync(pin + process.env.UMNR_PIN_PEPPER, salt, 64);
function validHash(pin, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length !== 16 || expected.length !== 64) return false;
  return crypto.timingSafeEqual(digest(pin, salt), expected);
}
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (process.env.UMNR_AUTH_ENABLED !== 'true') return reply(503, { error: 'UMNR authentication not enabled' });
  if (!process.env.UMNR_PIN_PEPPER || process.env.UMNR_PIN_PEPPER.length < 32) return reply(503, { error: 'UMNR authentication not configured' });
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin || origin !== process.env.UMNR_ALLOWED_ORIGIN) return reply(403, { error: 'Forbidden origin' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid JSON' }); }
  const username = String(body.username || '').trim().toLowerCase();
  const pin = String(body.pin || '');
  if (!/^[a-z0-9._-]{2,60}$/.test(username) || !/^\d{4}$/.test(pin)) return reply(401, { error: 'Invalid credentials' });
  try {
    const db = getApp().firestore();
    // Shared rate-limit document: fail closed on storage errors; keyed by username + IP hash.
    const ip = String(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown').slice(0, 100);
    const key = crypto.createHash('sha256').update(username + ':' + ip).digest('hex');
    const limiter = db.collection('umnr_auth_attempts').doc(key);
    const now = Date.now();
    const allowed = await db.runTransaction(async tx => {
      const snap = await tx.get(limiter);
      const value = snap.exists ? snap.data() : {};
      const until = Number(value.until || 0);
      if (until > now) return false;
      const attempts = Number(value.resetAt || 0) > now ? Number(value.attempts || 0) : 0;
      if (attempts >= 5) { tx.set(limiter, { attempts, resetAt: now + 15 * 60000, until: now + 15 * 60000 }); return false; }
      tx.set(limiter, { attempts: attempts + 1, resetAt: now + 15 * 60000, until: 0 });
      return true;
    });
    if (!allowed) return reply(429, { error: 'Too many attempts. Try later.' });
    const found = await db.collection('users').where('username', '==', username).limit(2).get();
    if (found.size !== 1) return reply(401, { error: 'Invalid credentials' });
    const userDoc = found.docs[0];
    const user = userDoc.data();
    if (user.umnrAccessEnabled !== true || user.active === false || !validHash(pin, user.umnrPinHash)) return reply(401, { error: 'Invalid credentials' });
    const role = String(user.role || '').toLowerCase();
    if (!['agent', 'supervisor', 'duty_manager', 'station_manager'].includes(role)) return reply(403, { error: 'Not authorized' });
    // Never trust role supplied by client. Claims are derived from server-side user record.
    const uid = 'umnr_' + userDoc.id;
    const token = await getApp().auth().createCustomToken(uid, { umnr: true, umnrRole: role, userDocId: userDoc.id });
    await limiter.delete();
    return reply(200, { token, userId: userDoc.id, role });
  } catch (error) {
    console.error('UMNR auth failure', error.message);
    return reply(503, { error: 'Authentication temporarily unavailable' });
  }
};
