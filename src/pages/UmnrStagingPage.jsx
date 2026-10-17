// src/pages/UmnrStagingPage.jsx
// ETAPA 022 - Local training only. No Firebase, Storage, API, or persistence.
import React, { useEffect, useState } from 'react';
import { UMNR_ENABLED, MAX_UMNR_PER_AGENT } from '../config/umnr.js';
import { canAssignService } from '../utils/umnrCapacity.js';

const INTERVAL_MS = 30 * 60 * 1000;
const ACTIVE = ['ACCEPTED', 'IN_TRANSIT', 'AT_GATE'];
const INITIAL = [
  { id: 'DEMO-001', status: 'PENDING', lastCheck: null, checks: [], acceptedAt: null, handoffAt: null, rejectionReason: '' },
  { id: 'DEMO-002', status: 'PENDING', lastCheck: null, checks: [], acceptedAt: null, handoffAt: null, rejectionReason: '' },
];
const card = { background: '#fff', border: '1px solid #dbeafe', borderRadius: 16, padding: 16 };
const btn = { padding: '11px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#eff6ff', color: '#0f172a', cursor: 'pointer', fontWeight: 750 };
const formatDuration = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const formatTime = value => value ? new Date(value).toLocaleTimeString() : 'Not recorded';

export default function UmnrStagingPage() {
  const [items, setItems] = useState(INITIAL);
  const [reasons, setReasons] = useState({});
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const activeCount = items.filter(x => ACTIVE.includes(x.status)).length;
  const overdueCount = items.filter(x => ACTIVE.includes(x.status) && x.lastCheck && now - x.lastCheck >= INTERVAL_MS).length;

  function transition(id, next) {
    const current = items.find(x => x.id === id);
    if (!current) return;
    const allowed = { PENDING: ['ACCEPTED', 'REJECTED'], ACCEPTED: ['IN_TRANSIT'], IN_TRANSIT: ['AT_GATE'], AT_GATE: ['COMPLETED'] };
    if (!(allowed[current.status] || []).includes(next)) { setNotice('Complete the previous step first.'); return; }
    if (next === 'ACCEPTED' && !canAssignService({ serviceType: 'UMNR', umnrCount: activeCount })) {
      setNotice('UMNR capacity limit reached.'); return;
    }
    const reason = String(reasons[id] || '').trim();
    if (next === 'REJECTED' && !reason) { setNotice(`${id}: a rejection reason is required.`); return; }
    const timestamp = Date.now();
    setItems(prev => prev.map(x => x.id !== id ? x : {
      ...x, status: next,
      acceptedAt: next === 'ACCEPTED' ? timestamp : x.acceptedAt,
      lastCheck: next === 'ACCEPTED' ? timestamp : x.lastCheck,
      checks: next === 'ACCEPTED' ? [{ at: timestamp, type: 'INITIAL_ACCEPTANCE' }] : x.checks,
      handoffAt: next === 'COMPLETED' ? timestamp : x.handoffAt,
      rejectionReason: next === 'REJECTED' ? reason : x.rejectionReason,
    }));
    if (next === 'REJECTED') setReasons(prev => ({ ...prev, [id]: '' }));
    setNotice(`${id}: ${next} saved in this browser session only.`);
  }

  function custodyCheck(id) {
    const current = items.find(x => x.id === id);
    if (!current || !ACTIVE.includes(current.status)) return;
    const timestamp = Date.now();
    setItems(prev => prev.map(x => x.id === id ? {
      ...x, lastCheck: timestamp,
      checks: [...x.checks, { at: timestamp, type: 'CUSTODY_VERIFIED' }],
    } : x));
    setNotice(`${id}: simulated custody verification recorded.`);
  }

  return (
    <main style={{ maxWidth: 940, margin: '20px auto', padding: 16, fontFamily: 'system-ui, sans-serif', color: '#0f172a' }}>
      <h1 style={{ marginBottom: 8 }}>UMNR Operations — Training Simulator</h1>
      <div style={{ ...card, background: '#fff7ed', borderColor: '#fed7aa', marginBottom: 16 }}>
        <strong>STAGING ONLY — {UMNR_ENABLED ? 'LIVE CONFIGURATION MUST BE DISABLED' : 'LIVE SERVICE DISABLED'}</strong>
        <p style={{ marginBottom: 0 }}>Fictional IDs only. Do not enter names, documents, photographs or personal details of real minors. Nothing here is saved to Firebase or preserved after a refresh.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div style={card}><strong>Active UMNR</strong><div style={{ fontSize: 25, fontWeight: 900 }}>{activeCount} / {MAX_UMNR_PER_AGENT}</div></div>
        <div style={{ ...card, borderColor: overdueCount ? '#fca5a5' : '#dbeafe' }}><strong>Custody checks due</strong><div style={{ fontSize: 25, fontWeight: 900, color: overdueCount ? '#b91c1c' : '#166534' }}>{overdueCount}</div></div>
      </div>
      {notice && <p role="status" style={{ ...card, background: '#eff6ff' }}>{notice}</p>}
      <div style={{ display: 'grid', gap: 14 }}>
        {items.map(item => {
          const active = ACTIVE.includes(item.status);
          const due = active && item.lastCheck && now - item.lastCheck >= INTERVAL_MS;
          const remaining = active && item.lastCheck ? Math.max(0, INTERVAL_MS - (now - item.lastCheck)) : 0;
          return <section key={item.id} style={{ ...card, borderColor: due ? '#ef4444' : '#dbeafe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>{item.id}</h2>
              <span style={{ fontWeight: 800, color: due ? '#b91c1c' : '#1769aa' }}>{item.status}</span>
            </div>
            {active && <div style={{ margin: '12px 0', padding: 12, borderRadius: 12, background: due ? '#fff1f2' : '#f0fdf4' }}>
              <strong>{due ? 'CUSTODY CHECK OVERDUE — VERIFY NOW' : 'Next custody check in'}</strong>
              <div style={{ fontSize: 23, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{due ? `Overdue by ${formatDuration(now - item.lastCheck - INTERVAL_MS)}` : formatDuration(remaining)}</div>
              <div style={{ fontSize: 12 }}>Last verified: {formatTime(item.lastCheck)} · 30-minute training interval</div>
            </div>}
            {item.status === 'PENDING' && <label style={{ display: 'block', margin: '12px 0' }}>Reason for rejection (only required to reject)
              <textarea rows={2} value={reasons[item.id] || ''} onChange={e => setReasons(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Explain why the assignment cannot be accepted" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            </label>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {item.status === 'PENDING' && <><button type="button" style={btn} onClick={() => transition(item.id, 'ACCEPTED')}>Accept</button><button type="button" style={btn} onClick={() => transition(item.id, 'REJECTED')}>Reject</button></>}
              {item.status === 'ACCEPTED' && <button type="button" style={btn} onClick={() => transition(item.id, 'IN_TRANSIT')}>Start Transit</button>}
              {item.status === 'IN_TRANSIT' && <button type="button" style={btn} onClick={() => transition(item.id, 'AT_GATE')}>Arrived at Gate</button>}
              {item.status === 'AT_GATE' && <button type="button" style={btn} onClick={() => transition(item.id, 'COMPLETED')}>Complete Handoff (Demo)</button>}
              {active && <button type="button" style={{ ...btn, background: due ? '#fee2e2' : '#dcfce7' }} onClick={() => custodyCheck(item.id)}>Verify Custody (Demo)</button>}
            </div>
            {item.status === 'REJECTED' && <p><strong>Rejection reason:</strong> {item.rejectionReason}</p>}
            {item.handoffAt && <p><strong>Demo handoff:</strong> {formatTime(item.handoffAt)}</p>}
            {item.checks.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Custody history ({item.checks.length})</summary>
              <ol>{item.checks.map((check, index) => <li key={`${check.at}-${index}`}>{formatTime(check.at)} — {check.type === 'INITIAL_ACCEPTANCE' ? 'Initial acceptance' : 'Custody verified'}</li>)}</ol>
            </details>}
          </section>;
        })}
      </div>
      <button type="button" style={{ ...btn, marginTop: 18 }} onClick={() => { setItems(INITIAL.map(x => ({ ...x, checks: [] }))); setReasons({}); setNotice('Training simulator reset.'); }}>Reset Demo</button>
      <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>Training-only visual countdown. Notifications are visible only while this page is open. This is not an automated alert system or a legally sufficient custody record. Production requires authenticated server-side authorization, durable timestamps, audit logs and tested operational procedures.</p>
    </main>
  );
}
