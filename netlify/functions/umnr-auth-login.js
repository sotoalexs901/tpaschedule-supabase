// netlify/functions/umnr-auth-login.js
// Dedicated UMNR authentication. Does not change the existing AeroStation login.
// Requires:
//   UMNR_AUTH_ENABLED=true
//   UMNR_PIN_PEPPER (32+ chars)
//   UMNR_ALLOWED_ORIGIN=https://aerostationhub.com
//   Firebase Admin credentials
//
// Transitional behavior:
// - If an authorized user's umnrPinHash is missing, this function validates the
//   existing legacy 4-digit PIN once, creates a scrypt UMNR hash, stores it, and
//   continues the login.
// - After the hash exists, UMNR authentication uses the hash instead of the
//   legacy PIN field.

const admin = require('firebase-admin');
const crypto = require('node:crypto');

function getApp() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  let credentials;

  if (raw) {
    credentials = JSON.parse(raw);
  } else {
    credentials = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
  }

  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error('Missing Firebase Admin credentials');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: credentials.project_id,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key,
    }),
  });
}

const reply = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.UMNR_ALLOWED_ORIGIN || 'https://invalid.example',
    'Vary': 'Origin',
  },
  body: JSON.stringify(body),
});

function getPepper() {
  return String(process.env.UMNR_PIN_PEPPER || '');
}

function digest(pin, salt) {
  return crypto.scryptSync(pin + getPepper(), salt, 64);
}

function createHash(pin) {
  const salt = crypto.randomBytes(16);
  const hash = digest(pin, salt);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function validHash(pin, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');

    if (salt.length !== 16 || expected.length !== 64) return false;

    return crypto.timingSafeEqual(digest(pin, salt), expected);
  } catch {
    return false;
  }
}

function legacyPinMatches(pin, storedPin) {
  const a = crypto.createHash('sha256').update(String(pin || '')).digest();
  const b = crypto.createHash('sha256').update(String(storedPin || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method not allowed' });
  }

  if (process.env.UMNR_AUTH_ENABLED !== 'true') {
    console.warn('UMNR_AUTH_FAIL stage=auth_enabled'); return reply(503, { error: 'UMNR authentication not enabled' });
  }

  if (getPepper().length < 32) {
    console.warn('UMNR_AUTH_FAIL stage=pepper_length'); return reply(503, { error: 'UMNR authentication not configured' });
  }

  const origin = event.headers.origin || event.headers.Origin;
  if (!origin || origin !== process.env.UMNR_ALLOWED_ORIGIN) {
    console.warn('UMNR_AUTH_FAIL stage=origin', { origin, expected: process.env.UMNR_ALLOWED_ORIGIN || '' }); return reply(403, { error: 'Forbidden origin' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }

  const username = String(body.username || '').trim().toLowerCase();
  const pin = String(body.pin || '');

  if (!/^[a-z0-9._-]{2,60}$/.test(username) || !/^\d{4}$/.test(pin)) {
    console.warn('UMNR_AUTH_FAIL stage=input_format', { usernameValid: /^[a-z0-9._-]{2,60}$/.test(username), pinLength: pin.length }); return reply(401, { error: 'Invalid credentials' });
  }

  try {
    const firebase = getApp();
    const db = firebase.firestore();

    // Shared rate-limit document. Client access to this collection should remain denied.
    const ip = String(
      event.headers['x-nf-client-connection-ip'] ||
      event.headers['client-ip'] ||
      'unknown'
    ).slice(0, 100);

    const key = crypto
      .createHash('sha256')
      .update(username + ':' + ip)
      .digest('hex');

    const limiter = db.collection('umnr_auth_attempts').doc(key);
    const now = Date.now();

    const allowedAttempt = await db.runTransaction(async (tx) => {
      const snap = await tx.get(limiter);
      const value = snap.exists ? snap.data() : {};
      const until = Number(value.until || 0);

      if (until > now) return false;

      const attempts = Number(value.resetAt || 0) > now
        ? Number(value.attempts || 0)
        : 0;

      if (attempts >= 5) {
        tx.set(limiter, {
          attempts,
          resetAt: now + 15 * 60 * 1000,
          until: now + 15 * 60 * 1000,
        });
        return false;
      }

      tx.set(limiter, {
        attempts: attempts + 1,
        resetAt: now + 15 * 60 * 1000,
        until: 0,
      });

      return true;
    });

    if (!allowedAttempt) {
      console.warn('UMNR_AUTH_FAIL stage=rate_limit', { username });
      return reply(429, { error: 'Too many attempts. Try later.' });
    }

    const found = await db
      .collection('users')
      .where('username', '==', username)
      .limit(2)
      .get();

    if (found.size !== 1) {
      console.warn('UMNR_AUTH_FAIL stage=user_lookup', { username, matches: found.size });
      return reply(401, { error: 'Invalid credentials' });
    }

    const userDoc = found.docs[0];
    const user = userDoc.data() || {};

    if (user.umnrAccessEnabled !== true || user.active === false) {
      console.warn('UMNR_AUTH_FAIL stage=user_access', { userDocId: userDoc.id, umnrAccessEnabled: user.umnrAccessEnabled === true, active: user.active !== false });
      return reply(401, { error: 'Invalid credentials' });
    }

    let hashValid = validHash(pin, user.umnrPinHash);

    // One-time controlled migration from the current AeroStation PIN.
    if (!hashValid && !user.umnrPinHash) {
      if (!legacyPinMatches(pin, user.pin)) {
        console.warn('UMNR_AUTH_FAIL stage=legacy_pin_mismatch', { userDocId: userDoc.id });
        return reply(401, { error: 'Invalid credentials' });
      }

      const newHash = createHash(pin);

      await userDoc.ref.update({
        umnrPinHash: newHash,
        umnrPinMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
        umnrPinHashVersion: 'scrypt-v1',
      });

      hashValid = true;
    }

    if (!hashValid) {
      console.warn('UMNR_AUTH_FAIL stage=hash_mismatch', { userDocId: userDoc.id });
      return reply(401, { error: 'Invalid credentials' });
    }

    const role = String(user.role || '').toLowerCase();
    if (!['agent', 'supervisor', 'duty_manager', 'station_manager'].includes(role)) {
      console.warn('UMNR_AUTH_FAIL stage=role', { userDocId: userDoc.id, role });
      return reply(403, { error: 'Not authorized' });
    }

    const uid = 'umnr_' + userDoc.id;
    const token = await firebase.auth().createCustomToken(uid, {
      umnr: true,
      umnrRole: role,
      userDocId: userDoc.id,
    });

    await limiter.delete();

    console.log('UMNR_AUTH_OK', { userDocId: userDoc.id, role });
    return reply(200, {
      token,
      userId: userDoc.id,
      role,
    });
  } catch (error) {
    console.error('UMNR_AUTH_FAIL stage=exception', error.message);
    return reply(503, { error: 'Authentication temporarily unavailable' });
  }
};
