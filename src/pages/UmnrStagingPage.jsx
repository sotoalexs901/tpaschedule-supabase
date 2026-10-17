import React from 'react';
import { UMNR_ENABLED } from '../config/umnr.js';

/** Safe placeholder. No Firestore, Storage, minor records or client-side persistence. */
export default function UmnrStagingPage() {
  return (
    <main style={{maxWidth:760,margin:'32px auto',padding:24,fontFamily:'system-ui',background:'#f8fafc',border:'1px solid #cbd5e1',borderRadius:16}}>
      <h1 style={{marginTop:0}}>UMNR Operations</h1>
      <p><strong>{UMNR_ENABLED ? 'Configuration review required' : 'Staging — Not Activated'}</strong></p>
      <p>UMNR is not available for live passenger operations. Do not enter personal information, photographs, signatures or travel documents of minors.</p>
      <p>Activation requires verified Firebase Authentication, restricted Firestore and Storage rules, server-side capacity checks, and end-to-end testing.</p>
    </main>
  );
}
