// scripts/create-umnr-pin-hash.cjs
// One-time provisioning utility. Run ONLY in a trusted administrator environment.
// Do not run this in the browser or expose Firebase Admin credentials to the client.
// Usage: node scripts/create-umnr-pin-hash.cjs <username>
// Required environment: UMNR_PIN_PEPPER (>=32 characters), plus either
// GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.
// This utility does NOT activate UMNR or change the existing login PIN.

'use strict';
const admin = require('firebase-admin');
const crypto = require('node:crypto');
const readline = require('node:readline');

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const c = raw ? JSON.parse(raw) : {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
  if (!c.project_id || !c.client_email || !c.private_key) {
    throw new Error('Firebase Admin credentials are missing.');
  }
  return admin.initializeApp({ credential: admin.credential.cert({
    projectId: c.project_id, clientEmail: c.client_email, privateKey: c.private_key,
  }) });
}

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('Run in an interactive terminal.'));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = function (value) {
      if (rl.stdoutMuted) {
        if (value.includes('\n')) rl.output.write('\n');
      } else rl.output.write(value);
    };
    rl.question(prompt, answer => { rl.close(); resolve(answer); });
  });
}

async function main() {
  const username = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,60}$/.test(username)) {
    throw new Error('Usage: node scripts/create-umnr-pin-hash.cjs <username>');
  }
  const pepper = process.env.UMNR_PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('UMNR_PIN_PEPPER must be at least 32 characters.');
  const db = getApp().firestore();
  const matches = await db.collection('users').where('username', '==', username).limit(2).get();
  if (matches.size !== 1) throw new Error('Expected exactly one matching user. No changes made.');
  const record = matches.docs[0];
  if (record.data().active === false) throw new Error('User is inactive. No changes made.');
  process.stdout.write(`Provisioning UMNR hash for ${username}. This does not grant UMNR access.\n`);
  const pin = await readSecret('Enter existing 4-digit PIN (input hidden): ');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly four digits. No changes made.');
  // Validate the PIN against the legacy field only during controlled migration.
  // This legacy check must be retired when the main login moves server-side.
  if (!crypto.timingSafeEqual(
    Buffer.from(crypto.createHash('sha256').update(String(record.data().pin || '')).digest()),
    Buffer.from(crypto.createHash('sha256').update(pin).digest())
  )) throw new Error('PIN does not match. No changes made.');
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin + pepper, salt, 64);
  const stored = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
  await record.ref.update({ umnrPinHash: stored });
  process.stdout.write('UMNR PIN hash saved. Existing PIN and access permissions unchanged.\n');
}

main().catch(err => { console.error('Provisioning failed:', err.message); process.exitCode = 1; });
