// src/utils/umnrClient.js
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { app } from '../firebase';
const auth = getAuth(app);
export async function startUmnrSession(username,pin) {
  await signOut(auth);
  const response=await fetch('/.netlify/functions/umnr-auth-login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username,pin}),credentials:'same-origin'
  });
  if (!response.ok) throw Error('UMNR access unavailable');
  const {token}=await response.json();
  if (!token) throw Error('UMNR token missing');
  await signInWithCustomToken(auth,token);
}
export async function umnrRequest(action,fields={}) {
  const user=auth.currentUser;
  if (!user) throw Error('UMNR authorization unavailable. Sign out and sign in again.');
  const idToken=await user.getIdToken();
  const response=await fetch('/.netlify/functions/umnr-api',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${idToken}`},
    body:JSON.stringify({action,...fields}),credentials:'same-origin'
  });
  const result=await response.json().catch(()=>({error:'Invalid server response'}));
  if (!response.ok) throw Error(result.error || 'UMNR request failed');
  return result;
}
export async function endUmnrSession(){ await signOut(auth); }
