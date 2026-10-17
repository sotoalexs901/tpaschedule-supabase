// src/components/UmnrOperationsPanel.jsx
// UMNR staging UI. Keep UMNR_ENABLED=false until backend auth/rules/capacity are secured.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { umnrRequest } from '../utils/umnrClient.js';

const button = { padding: '9px 13px', border: '1px solid #bfdbfe', borderRadius: 9, cursor: 'pointer', background: '#eff6ff', fontWeight: 700 };
const input = { padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, width: '100%', boxSizing: 'border-box' };
const terminal = new Set(['DELIVERED', 'CANCELLED']);
const custodyStates = new Set(['PICKED_UP', 'IN_TRANSIT', 'AT_GATE']);
const readableDate = value => {
  if (!value) return null;
  const date = value?.toDate?.() || (typeof value?._seconds === 'number' ? new Date(value._seconds * 1000) : new Date(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const timeLabel = value => readableDate(value)?.toLocaleString() || 'Not recorded';
const minutesSince = (value, now) => {
  const date = readableDate(value);
  return date ? Math.max(0, Math.floor((now - date.getTime()) / 60000)) : null;
};
const formatRemaining = mins => mins === null ? 'Check required' : mins >= 30 ? `Overdue ${mins - 30} min` : `Next check in ${30 - mins} min`;

export default function UmnrOperationsPanel({ mode = 'agent', flights = [], agents = [], employeeId = '' }) {
  const dispatch = mode === 'dispatch';
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [flightId, setFlightId] = useState('');
  const [direction, setDirection] = useState('IB');
  const [fullName, setFullName] = useState('');
  const [pnr, setPnr] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [filter, setFilter] = useState('ACTIVE');

  const refresh = useCallback(async (quiet = false) => {
    try {
      const result = await umnrRequest('list');
      setItems(Array.isArray(result.items) ? result.items : []);
      if (!quiet) setError('');
    } catch (err) {
      if (!quiet) setError(err?.message || 'Unable to load UMNR services.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh(true), 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  const active = useMemo(() => items.filter(item => !terminal.has(item.status) && item.status !== 'REJECTED'), [items]);
  const displayed = useMemo(() => items.filter(item => filter === 'ALL' || (filter === 'ACTIVE' ? !terminal.has(item.status) : terminal.has(item.status))), [items, filter]);
  const overdueCount = active.filter(item => custodyStates.has(item.status) && (minutesSince(item.lastCustodyAt, tick) ?? 30) >= 30).length;

  const run = async (action, fields, success = 'UMNR service updated.') => {
    if (busy) return false;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await umnrRequest(action, fields);
      setMessage(success);
      await refresh(true);
      return true;
    } catch (err) {
      setError(err?.message || 'UMNR operation failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async event => {
    event.preventDefault();
    const name = fullName.trim();
    const code = pnr.trim().toUpperCase();
    if (!flightId || name.length < 2 || !/^[A-Z0-9]{4,8}$/.test(code)) {
      setError('Select a flight, enter a full name, and provide a 4–8 character PNR.');
      return;
    }
    const success = await run('create', { flightId, direction, fullName: name, pnr: code }, 'UMNR service created. Assign an available agent.');
    if (success) { setFullName(''); setPnr(''); }
  };

  const advance = async (item, status) => {
    const fields = { id: item.id, status };
    if (status === 'REJECTED') {
      const reason = window.prompt('Reason for rejecting this UMNR assignment:');
      if (!reason?.trim()) return;
      fields.reason = reason.trim();
    }
    if (status === 'DELIVERED') {
      const receiver = window.prompt(item.direction === 'OB' ? 'Name of authorized crew member receiving UMNR:' : 'Name of authorized person receiving UMNR:');
      if (!receiver?.trim()) return;
      if (!window.confirm(`Confirm that you have independently verified authorization and handed over custody to ${receiver.trim()}?`)) return;
      fields.handoffTo = receiver.trim();
      fields.handoffConfirmed = true;
    }
    if (status === 'CANCELLED' && !window.confirm('Cancel this UMNR service?')) return;
    await run('advance', fields, `UMNR status: ${status}.`);
  };

  return (
    <section style={{ border: '1px solid #bfdbfe', borderRadius: 16, padding: 18, background: '#fff', color: '#0f172a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>UMNR · {dispatch ? 'Dispatch' : 'My Services'}</h2>
          <small>Shared WCHR flights · Inbound / Outbound · 30-minute custody checks</small>
        </div>
        <button type="button" style={button} disabled={busy} onClick={() => refresh()}>Refresh</button>
      </div>
      <p style={{ marginBottom: 6, fontSize: 13 }}>Active: <strong>{active.length}</strong> · Custody checks due: <strong style={{ color: overdueCount ? '#b91c1c' : '#166534' }}>{overdueCount}</strong></p>
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {message && <p role="status" style={{ color: '#15803d' }}>{message}</p>}

      {dispatch && (
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 18, alignItems: 'end' }}>
          <label>Existing WCHR Flight
            <select required style={input} value={flightId} onChange={event => setFlightId(event.target.value)}>
              <option value="">Select flight</option>
              {flights.map(flight => <option key={flight.id} value={flight.id}>{flight.airline} {flight.flight_number} · {flight.gate || 'Gate TBD'}</option>)}
            </select>
          </label>
          <label>IB / OB
            <select style={input} value={direction} onChange={event => setDirection(event.target.value)}><option value="IB">IB</option><option value="OB">OB</option></select>
          </label>
          <label>UMNR Full Name<input required minLength={2} maxLength={120} style={input} value={fullName} onChange={event => setFullName(event.target.value)} /></label>
          <label>PNR<input required minLength={4} maxLength={8} pattern="[A-Za-z0-9]{4,8}" style={input} value={pnr} onChange={event => setPnr(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} /></label>
          <button type="submit" disabled={busy || !flightId} style={button}>Create UMNR</button>
        </form>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <label htmlFor="umnr-filter">Services</label>
        <select id="umnr-filter" style={{ ...input, width: 160 }} value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="ACTIVE">Active / Rejected</option><option value="CLOSED">Closed</option><option value="ALL">All</option>
        </select>
      </div>
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {displayed.length === 0 && <p>No UMNR services in this view.</p>}
        {displayed.map(item => {
          const mins = minutesSince(item.lastCustodyAt, tick);
          const custodyActive = custodyStates.has(item.status);
          const overdue = custodyActive && (mins === null || mins >= 30);
          const assignedToMe = Boolean(employeeId) && item.agentId === employeeId;
          const mayAct = assignedToMe;
          const canCancel = dispatch && ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'AT_GATE', 'REJECTED'].includes(item.status);
          return (
            <article key={item.id} style={{ border: '1px solid #e2e8f0', padding: 14, borderRadius: 12, background: overdue ? '#fff7ed' : '#f8fafc' }}>
              <div><strong>{item.fullName}</strong> · {item.direction} · {item.airline} {item.flightNumber} · PNR {item.pnr}</div>
              <small>Status: <strong>{item.status}</strong> · Agent: {item.agentId || 'Unassigned'}</small>
              {custodyActive && <p role={overdue ? 'alert' : undefined} style={{ margin: '8px 0', color: overdue ? '#b91c1c' : '#166534', fontWeight: 700, fontSize: 13 }}>Custody: {formatRemaining(mins)} · Last check: {timeLabel(item.lastCustodyAt)}</p>}
              {item.status === 'DELIVERED' && <p style={{ fontSize: 13 }}>Handoff to: {item.handoffTo || 'Not recorded'} · {timeLabel(item.handoffAt)}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                {dispatch && ['UNASSIGNED', 'REJECTED'].includes(item.status) && (
                  <select aria-label={`Assign agent for ${item.fullName}`} style={{ ...input, width: 220 }} disabled={busy} value="" onChange={event => { if (event.target.value) run('assign', { id: item.id, agentId: event.target.value }, 'Agent assigned.'); }}>
                    <option value="">Assign agent</option>
                    {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name || agent.employeeName || agent.displayName || agent.id}</option>)}
                  </select>
                )}
                {mayAct && item.status === 'ASSIGNED' && <><button type="button" disabled={busy} style={button} onClick={() => advance(item, 'ACCEPTED')}>Accept</button><button type="button" disabled={busy} style={button} onClick={() => advance(item, 'REJECTED')}>Reject</button></>}
                {mayAct && item.status === 'ACCEPTED' && <button type="button" disabled={busy} style={button} onClick={() => advance(item, 'PICKED_UP')}>Pick Up</button>}
                {mayAct && item.status === 'PICKED_UP' && <button type="button" disabled={busy} style={button} onClick={() => advance(item, 'IN_TRANSIT')}>Start Transit</button>}
                {mayAct && item.status === 'IN_TRANSIT' && <button type="button" disabled={busy} style={button} onClick={() => advance(item, 'AT_GATE')}>At Gate / Handoff Point</button>}
                {mayAct && custodyActive && <><button type="button" disabled={busy} style={button} onClick={() => run('custody', { id: item.id }, 'Custody check recorded.')}>Custody Check</button><button type="button" disabled={busy} style={button} onClick={() => advance(item, 'DELIVERED')}>Authorized Handoff</button></>}
                {canCancel && <button type="button" disabled={busy} style={button} onClick={() => advance(item, 'CANCELLED')}>Cancel</button>}
              </div>
              {dispatch && item.status === 'UNASSIGNED' && <small style={{ display: 'block', marginTop: 8 }}>Cancellation of unassigned services requires a backend update; this action is not enabled here.</small>}
              <details style={{ marginTop: 9 }}><summary>Audit history ({item.timeline?.length || 0})</summary><div style={{ fontSize: 12 }}>{(item.timeline || []).map((event, index) => <p key={index}>{event.at} · {event.type} · {event.actor?.employeeId || event.actor?.id}{event.reason ? ` · ${event.reason}` : ''}</p>)}</div></details>
            </article>
          );
        })}
      </div>
      <p style={{ marginTop: 14, fontSize: 12, color: '#64748b' }}>Availability and authorized receiver identity must be validated by operational procedures and the server. This screen alone does not enforce shared WCHR/UMNR capacity.</p>
    </section>
  );
}
