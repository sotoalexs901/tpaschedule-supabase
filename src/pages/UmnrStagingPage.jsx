// src/pages/UmnrStagingPage.jsx
// Offline training simulator: no Firestore, Storage, API or persistence.
import React, { useState } from 'react';
import { UMNR_ENABLED, MAX_UMNR_PER_AGENT } from '../config/umnr.js';
import { canAssignService } from '../utils/umnrCapacity.js';

const INITIAL = [
  { id: 'DEMO-001', status: 'PENDING', lastCheck: null },
  { id: 'DEMO-002', status: 'PENDING', lastCheck: null },
];
const card = { background: '#fff', border: '1px solid #dbeafe', borderRadius: 14, padding: 16 };
const button = { padding: '10px 13px', borderRadius: 10, border: '1px solid #cbd5e1', cursor: 'pointer', background: '#eff6ff', fontWeight: 700 };
export default function UmnrStagingPage() {
  const [items, setItems] = useState(INITIAL);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const active = items.filter(x => ['ACCEPTED', 'IN_TRANSIT', 'AT_GATE'].includes(x.status)).length;
  function change(id, status) {
    const item = items.find(x => x.id === id);
    if (!item) return;
    if (status === 'ACCEPTED' && !canAssignService({ serviceType: 'UMNR', umnrCount: active })) {
      setNotice('Capacity limit reached.'); return;
    }
    if (status === 'REJECTED' && !reason.trim()) { setNotice('A rejection reason is required.'); return; }
    const allowed = { PENDING: ['ACCEPTED','REJECTED'], ACCEPTED: ['IN_TRANSIT'], IN_TRANSIT: ['AT_GATE'], AT_GATE: ['COMPLETED'] };
    if (!(allowed[item.status] || []).includes(status)) { setNotice('Complete the preceding step first.'); return; }
    setItems(prev => prev.map(x => x.id === id ? { ...x, status, lastCheck: status === 'ACCEPTED' ? Date.now() : x.lastCheck } : x));
    setReason(''); setNotice(`${id}: ${status} (local demo only).`);
  }
  function check(id) {
    setItems(prev => prev.map(x => x.id === id && ['ACCEPTED','IN_TRANSIT','AT_GATE'].includes(x.status) ? { ...x, lastCheck: Date.now() } : x));
    setNotice(`${id}: demo custody check recorded in memory only.`);
  }
  return <main style={{ maxWidth: 850, margin: '20px auto', padding: 16, fontFamily: 'system-ui', color: '#0f172a' }}>
    <h1>UMNR Operations — Training Simulator</h1>
    <p style={{ ...card, background: '#fff7ed', borderColor: '#fed7aa' }}><strong>STAGING ONLY — {UMNR_ENABLED ? 'CONFIGURATION REQUIRES REVIEW' : 'LIVE SERVICE DISABLED'}</strong><br />Use fictional demo IDs only. Do not enter real minors' information. This page does not write to Firebase and cannot be used for operational custody tracking.</p>
    <p>Demo capacity: {active}/{MAX_UMNR_PER_AGENT} active UMNR. WCHR and UMNR assignments must not overlap; production capacity requires server-side enforcement.</p>
    {notice && <p role="status" style={{ ...card, background: '#eff6ff' }}>{notice}</p>}
    <label style={{ display: 'block', marginBottom: 12 }}>Rejection reason (demo only)<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Required for Reject" style={{ display: 'block', width: '100%', padding: 10, marginTop: 5, boxSizing: 'border-box' }} /></label>
    <div style={{ display: 'grid', gap: 12 }}>{items.map(item => <section key={item.id} style={card}>
      <h2 style={{ marginTop: 0 }}>{item.id}</h2>
      <p>Status: <strong>{item.status}</strong></p>
      {item.lastCheck && <p>Last demo custody check: {new Date(item.lastCheck).toLocaleTimeString()}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {item.status === 'PENDING' && <><button style={button} onClick={() => change(item.id, 'ACCEPTED')}>Accept</button><button style={button} onClick={() => change(item.id, 'REJECTED')}>Reject</button></>}
        {item.status === 'ACCEPTED' && <button style={button} onClick={() => change(item.id, 'IN_TRANSIT')}>Start Transit</button>}
        {item.status === 'IN_TRANSIT' && <button style={button} onClick={() => change(item.id, 'AT_GATE')}>Arrived at Gate</button>}
        {item.status === 'AT_GATE' && <button style={button} onClick={() => change(item.id, 'COMPLETED')}>Complete Handoff (Demo)</button>}
        {['ACCEPTED','IN_TRANSIT','AT_GATE'].includes(item.status) && <button style={button} onClick={() => check(item.id)}>Record Custody Check (Demo)</button>}
      </div>
    </section>)}</div>
    <button style={{ ...button, marginTop: 16 }} onClick={() => { setItems(INITIAL); setReason(''); setNotice('Demo reset.'); }}>Reset Demo</button>
    <p style={{ fontSize: 12, color: '#64748b' }}>Custody checks are manual and not persisted; no automatic 30-minute reminder or real dispatch integration is included.</p>
  </main>;
}
