import React, { useEffect, useState } from 'react';
import { useUser } from '../UserContext.jsx';
import { GSE_LOCATIONS, registerGse, releaseGse, watchGse } from '../services/gseService.js';
const field = { padding: 10, border: '1px solid #cbd5e1', borderRadius: 9, width: '100%', boxSizing: 'border-box' };
export default function GseManagementPage() {
  const { user } = useUser();
  const [items, setItems] = useState([]);
  const [code, setCode] = useState(''); const [type, setType] = useState('Baggage Cart');
  const [serial, setSerial] = useState(''); const [location, setLocation] = useState(GSE_LOCATIONS[0]);
  const [filter, setFilter] = useState('ALL'); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => watchGse(setItems, e => setMessage(e.message)), []);
  async function add(e) { e.preventDefault(); setBusy(true); setMessage(''); try { await registerGse({ code, type, serialNumber: serial, location, user }); setMessage('Equipment registered.'); setCode(''); setSerial(''); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }
  async function release(equipment) { const notes = window.prompt(`Reason for authorizing inspection of ${equipment.id}:`); if (notes === null) return; setMessage(''); try { await releaseGse({ equipment, user, notes }); setMessage('Equipment released to Pending Inspection. Agent must inspect it before In Service.'); } catch (err) { setMessage(err.message); } }
  const shown = items.filter(x => filter === 'ALL' || x.status === filter);
  return <div style={{ maxWidth: 1100, margin: '0 auto', color: '#0f172a' }}>
    <h1>GSE Management</h1><p>TPA Equipment Inventory · Live Firestore data</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>{[['Total',items.length],['In Service',items.filter(x=>x.status==='IN_SERVICE').length],['Out of Service',items.filter(x=>x.status==='OUT_OF_SERVICE').length],['Pending',items.filter(x=>x.status==='PENDING_INSPECTION').length]].map(([name,n]) => <div key={name} style={{ background: 'white', borderRadius: 12, padding: 16, minWidth: 120 }}><strong style={{ fontSize: 26 }}>{n}</strong><div>{name}</div></div>)}</div>
    <form onSubmit={add} style={{ background: 'white', padding: 18, borderRadius: 16, display: 'grid', gap: 10, marginBottom: 18 }}><h2>Register Equipment</h2>
      <label>Equipment ID<input style={field} required value={code} onChange={e=>setCode(e.target.value)} placeholder="GSE-001" /></label>
      <label>Equipment type<select style={field} value={type} onChange={e=>setType(e.target.value)}>{['Baggage Cart','Baggage Tug','Belt Loader','Pushback Tractor','Dolly','Stairs','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>Serial number<input style={field} value={serial} onChange={e=>setSerial(e.target.value)} /></label>
      <label>Assigned parking<select style={field} value={location} onChange={e=>setLocation(e.target.value)}>{GSE_LOCATIONS.map(x=><option key={x}>{x}</option>)}</select></label>
      <button disabled={busy} style={{ padding: 12, background: '#1769aa', color: 'white', border: 0, borderRadius: 10 }}>Register Equipment</button></form>
    <label>Filter by status <select style={{ ...field, maxWidth: 250 }} value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All</option><option value="IN_SERVICE">In Service</option><option value="OUT_OF_SERVICE">Out of Service</option><option value="PENDING_INSPECTION">Pending Inspection</option></select></label>
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>{shown.map(x=><div key={x.id} style={{ background: 'white', padding: 16, borderRadius: 12, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}><div><strong>{x.id} · {x.equipmentType}</strong><div>{x.location} · {x.status}</div><small>Serial: {x.serialNumber || '—'}</small></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a href={`/gse/inventory?gse=${encodeURIComponent(x.id)}`} target="_blank" rel="noreferrer">Open QR destination</a>{x.status === 'OUT_OF_SERVICE' && <button onClick={()=>release(x)}>Authorize reinspection</button>}</div></div>)}{!shown.length && <p>No equipment in this category.</p>}</div>
    {message && <p role="status">{message}</p>}
    <p style={{ fontSize: 13, color: '#64748b' }}>Management release moves an Out of Service item to Pending Inspection, not directly to In Service. Print QR labels using the equipment destination links.</p>
  </div>;
}
