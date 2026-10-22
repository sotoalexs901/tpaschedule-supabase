import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUser } from '../UserContext.jsx';
import { GSE_LOCATIONS, getGseCode, inspectGse, watchGse } from '../services/gseService.js';

const field = { width: '100%', padding: 12, border: '1px solid #cbd5e1', borderRadius: 10, boxSizing: 'border-box' };
export default function GseInventoryPage() {
  const { user } = useUser();
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [code, setCode] = useState(getGseCode(params.get('gse')));
  const [condition, setCondition] = useState('IN_SERVICE');
  const [location, setLocation] = useState(GSE_LOCATIONS[0]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => watchGse(setItems, e => setMessage(e.message)), []);
  useEffect(() => setCode(getGseCode(params.get('gse'))), [params]);
  const equipment = items.find(x => x.id === getGseCode(code));
  useEffect(() => { if (equipment?.location && GSE_LOCATIONS.includes(equipment.location)) setLocation(equipment.location); }, [equipment?.id, equipment?.location]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try { await inspectGse({ code, condition, location, notes, user }); setMessage('Inspection saved successfully.'); setNotes(''); }
    catch (err) { setMessage(err.message || 'Could not save inspection.'); }
    finally { setBusy(false); }
  }
  return <div style={{ maxWidth: 740, margin: '0 auto', color: '#0f172a' }}>
    <h1>GSE Inventory</h1><p>Scan the equipment QR with your phone camera or enter the equipment ID to inspect it.</p>
    <form onSubmit={submit} style={{ background: 'white', padding: 22, borderRadius: 18, display: 'grid', gap: 14 }}>
      <label>Equipment QR / ID<input style={field} value={code} onChange={e => setCode(e.target.value)} placeholder="GSE-001" required /></label>
      {equipment ? <div style={{ background: '#eff6ff', padding: 14, borderRadius: 12 }}><strong>{equipment.id} · {equipment.equipmentType}</strong><div>Current status: {equipment.status || 'PENDING_INSPECTION'}</div><div>Current location: {equipment.location || 'Not set'}</div></div> : <p style={{ color: '#b45309' }}>Equipment not found. Management must register it before inspection.</p>}
      <label>Inspection result<select style={field} value={condition} onChange={e => setCondition(e.target.value)}><option value="IN_SERVICE">In Service</option><option value="OUT_OF_SERVICE">Out of Service</option></select></label>
      <label>Parking location<select style={field} value={location} onChange={e => setLocation(e.target.value)}>{GSE_LOCATIONS.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Inspection notes<textarea style={field} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder={condition === 'OUT_OF_SERVICE' ? 'Required: describe the defect' : 'Optional notes'} /></label>
      <button disabled={busy || !equipment || (condition === 'OUT_OF_SERVICE' && !notes.trim())} style={{ padding: 14, background: '#1769aa', color: 'white', border: 0, borderRadius: 12, cursor: 'pointer' }}>{busy ? 'Saving...' : 'Submit Inspection'}</button>
      {message && <p role="status">{message}</p>}
    </form>
    <p style={{ fontSize: 13, color: '#64748b' }}>QR codes should link to /gse/inventory?gse=GSE-001. An inspection is required before the equipment becomes In Service.</p>
  </div>;
}
