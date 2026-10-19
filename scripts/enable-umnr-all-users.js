// One-time admin migration: node enable-umnr-all-users.js
// Uses the same server-only Firebase Admin credentials as the UMNR API.
// Does not change Firebase security rules, custom claims, or other profile fields.
const admin = require('firebase-admin');
const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const credentials = raw ? JSON.parse(raw) : {
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};
if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw Error('Admin credentials missing');
admin.initializeApp({credential:admin.credential.cert({projectId:credentials.project_id,clientEmail:credentials.client_email,privateKey:credentials.private_key})});
(async()=>{
  const db=admin.firestore();
  let last=null,updated=0,skipped=0;
  while(true){
    let q=db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(300);
    if(last)q=q.startAfter(last);
    const snap=await q.get();
    if(snap.empty)break;
    const batch=db.batch();let changes=0;
    for(const doc of snap.docs){
      const u=doc.data();
      // Respect deactivated accounts: they never receive enabled UMNR access.
      const enabled=u.active!==false;
      if(u.umnrAccessEnabled!==enabled){batch.update(doc.ref,{umnrAccessEnabled:enabled});changes++;}
      else skipped++;
    }
    if(changes)await batch.commit();
    updated+=changes;last=snap.docs[snap.docs.length-1];
    if(snap.size<300)break;
  }
  console.log(`Finished: ${updated} profiles updated, ${skipped} already correct.`);
})().catch(e=>{console.error(e);process.exitCode=1});
