// src/pages/OperationalLocationsPage.jsx
// AeroStation Hub - dynamic operational location registry
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useUser } from '../UserContext.jsx';

const COLLECTION = 'operational_locations';
const AREAS = ['Main Terminal', 'Airside A', 'Airside C', 'Airside E', 'Airside F', 'Rental Car', 'Other'];
const TYPES = ['Counter', 'Gate', 'Lobby', 'Security', 'CBP / Customs', 'Storage', 'Train', 'Other'];
const field = { width: '100%', boxSizing: 'border-box', padding: 11, borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff' };
const button = { padding: '11px 15px', borderRadius: 9, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontWeight: 700 };
const blank = { name: '', area: 'Airside F', otherArea: '', type: 'Counter', otherType: '', notes: '', latitude: '', longitude: '', accuracyMeters: '', radiusMeters: '60', capturedAt: '' };
const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const text = value => String(value || '').trim();
const displayTime = value => { const d = value?.toDate?.() || (value ? new Date(value) : null); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : 'Not available'; };
const userName = u => u?.displayName || u?.fullName || u?.name || u?.username || 'Management';

export default function OperationalLocationsPage() {
  const { user } = useUser();
  const role = String(user?.role || '').toLowerCase();
  const allowed = role === 'station_manager' || role === 'duty_manager';
  const manager = role === 'station_manager';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [existingPhotoUrl, setExistingPhotoUrl] = useState('');
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const change = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const resetPhoto = () => { setPhotoFile(null); setPhotoPreview(''); setExistingPhotoUrl(''); setPhotoRemoved(false); };
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(''); return undefined; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);
  const selectPhoto = e => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Use a JPG, PNG or WebP photo.'); e.target.value = ''; return; }
    if (file.size > 8 * 1024 * 1024) { setError('Photo must be 8 MB or smaller.'); e.target.value = ''; return; }
    setPhotoFile(file); setPhotoRemoved(false);
    e.target.value = '';
  };

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    return onSnapshot(collection(db, COLLECTION), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setError('');
    }, e => { setLoading(false); setError(`Unable to load locations: ${e.message}`); });
  }, [allowed]);

  const visible = useMemo(() => items.filter(x => `${x.name} ${x.area} ${x.type} ${x.id}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (a.area || '').localeCompare(b.area || '') || (a.name || '').localeCompare(b.name || '')), [items, search]);

  const capture = () => {
    setMessage(''); setError('');
    if (!navigator.geolocation) { setError('Geolocation is unavailable on this device.'); return; }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      setForm(old => ({ ...old, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7), accuracyMeters: Math.round(accuracy), capturedAt: new Date().toISOString() }));
      setCapturing(false);
      setMessage('GPS captured. Verify the location name and accuracy before saving.');
    }, e => { setCapturing(false); setError(`Location capture failed: ${e.message}. Allow location access and try again.`); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const save = async e => {
    e.preventDefault(); setError(''); setMessage('');
    if (!allowed) return;
    const name = text(form.name);
    const area = form.area === 'Other' ? text(form.otherArea) : form.area;
    const type = form.type === 'Other' ? text(form.otherType) : form.type;
    const lat = Number(form.latitude), lng = Number(form.longitude), accuracy = Number(form.accuracyMeters), radius = Number(form.radiusMeters);
    if (name.length < 3 || !area || !type) { setError('Provide a location name, area, and type.'); return; }
    if (form.latitude === '' || form.longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('Capture valid GPS coordinates first.'); return; }
    if (form.accuracyMeters === '' || !Number.isFinite(accuracy) || accuracy < 0) { setError('GPS accuracy is required.'); return; }
    if (!Number.isFinite(radius) || radius < 15 || radius > 300) { setError('Detection radius must be between 15 and 300 meters.'); return; }
    if (!form.capturedAt && !editingId) { setError('Capture the GPS location before saving.'); return; }
    const id = editingId || slug(`${area}_${name}`);
    if (!id) { setError('Invalid location ID.'); return; }
    const identity = user?.uid || user?.id || user?.employeeId || '';
    const data = { name, area, type, notes: text(form.notes), latitude: lat, longitude: lng, accuracyMeters: accuracy, radiusMeters: radius, gpsCapturedAt: form.capturedAt || null, updatedById: String(identity), updatedByName: userName(user), updatedAt: serverTimestamp() };
    setBusy(true);
    try {
      let photoUrl = photoRemoved ? null : existingPhotoUrl || null;
      let photoPath = null;
      if (photoFile) {
        setUploading(true);
        const extension = photoFile.type === 'image/png' ? 'png' : photoFile.type === 'image/webp' ? 'webp' : 'jpg';
        const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;
        photoPath = `operational_locations/${id}/${uniqueName}`;
        const object = storageRef(getStorage(), photoPath);
        await uploadBytes(object, photoFile, { contentType: photoFile.type, customMetadata: { locationId: id } });
        photoUrl = await getDownloadURL(object);
      }
      await runTransaction(db, async tx => {
        const ref = doc(db, COLLECTION, id);
        const existing = await tx.get(ref);
        if (!editingId && existing.exists()) throw new Error('A location with this ID already exists. Edit the existing record instead.');
        if (editingId && !existing.exists()) throw new Error('This location was removed. Refresh and retry.');
        const photoFields = photoFile || photoRemoved
          ? { photoUrl, photoPath: photoPath || null, photoUpdatedAt: serverTimestamp(), photoUpdatedByName: userName(user) }
          : {};
        if (existing.exists()) tx.update(ref, { ...data, ...photoFields });
        else tx.set(ref, { ...data, ...photoFields, locationId: id, active: true, createdById: String(identity), createdByName: userName(user), createdAt: serverTimestamp() });
      });
      setForm(blank); setEditingId(''); resetPhoto(); setMessage(`Location ${editingId ? 'updated' : 'registered'} successfully.`);
    } catch (e) { setError(`Save failed: ${e.message}. Firestore permissions may need review.`); }
    finally { setBusy(false); setUploading(false); }
  };

  const edit = item => {
    setEditingId(item.id);
    setPhotoFile(null); setPhotoPreview(''); setExistingPhotoUrl(item.photoUrl || ''); setPhotoRemoved(false);
    setForm({ name: item.name || '', area: AREAS.includes(item.area) ? item.area : 'Other', otherArea: AREAS.includes(item.area) ? '' : item.area || '', type: TYPES.includes(item.type) ? item.type : 'Other', otherType: TYPES.includes(item.type) ? '' : item.type || '', notes: item.notes || '', latitude: String(item.latitude ?? ''), longitude: String(item.longitude ?? ''), accuracyMeters: String(item.accuracyMeters ?? ''), radiusMeters: String(item.radiusMeters ?? 60), capturedAt: item.gpsCapturedAt || '' });
    setError(''); setMessage('Editing an existing location. Capture GPS again if the position has changed.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = async item => {
    if (!manager || busy) return;
    if (!window.confirm(`${item.active === false ? 'Reactivate' : 'Deactivate'} ${item.name}? Historical records will be preserved.`)) return;
    setBusy(true); setError('');
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, COLLECTION, item.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Location no longer exists.');
        tx.update(ref, { active: snap.data().active === false, updatedAt: serverTimestamp(), updatedByName: userName(user) });
      });
    } catch (e) { setError(`Update failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  if (!allowed) return <main style={{padding:24}}><h2>Access restricted</h2><p>Only Station Managers and Duty Managers may manage operational locations.</p></main>;
  return <main style={{maxWidth:1050,margin:'0 auto',padding:'20px 16px',color:'#0f172a'}}>
    <h1 style={{marginBottom:4}}>TPA Location Management</h1>
    <p style={{color:'#64748b',marginTop:0}}>Dynamic location catalog for AeroStation Hub · Station Manager / Duty Manager</p>
    {error && <div role="alert" style={{padding:12,background:'#fff1f2',borderRadius:10,marginBottom:12}}>{error}</div>}
    {message && <div role="status" style={{padding:12,background:'#eff6ff',borderRadius:10,marginBottom:12}}>{message}</div>}
    <form onSubmit={save} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:18,display:'grid',gap:12}}>
      <h2 style={{margin:0,fontSize:20}}>{editingId ? 'Edit Location' : 'Register New Location'}</h2>
      <label>Location name<input style={field} required maxLength={100} placeholder="e.g. WL Counter / Gate F87" value={form.name} onChange={e=>change('name',e.target.value)} /></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
        <label>Airport area<select style={field} value={form.area} onChange={e=>change('area',e.target.value)}>{AREAS.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Location type<select style={field} value={form.type} onChange={e=>change('type',e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      {form.area==='Other' && <label>New area name<input style={field} required value={form.otherArea} onChange={e=>change('otherArea',e.target.value)} /></label>}
      {form.type==='Other' && <label>New type<input style={field} required value={form.otherType} onChange={e=>change('otherType',e.target.value)} /></label>}
      <label>Operational notes (optional)<textarea style={field} rows={2} maxLength={500} placeholder="Level, terminal side, landmark or nearby route" value={form.notes} onChange={e=>change('notes',e.target.value)} /></label>
      <div style={{padding:14,background:'#f8fafc',borderRadius:12,display:'grid',gap:10}}>
        <strong>Location Photo (optional)</strong>
        <p style={{fontSize:13,color:'#475569',margin:0}}>Take a photo with your phone or upload a JPG, PNG or WebP image (maximum 8 MB). Avoid photographing passengers, IDs, badges or restricted security information.</p>
        <label style={{...button,display:'inline-block',width:'fit-content',cursor:busy?'not-allowed':'pointer'}}>
          📷 Take Photo / Upload Photo
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} disabled={busy} style={{position:'absolute',width:1,height:1,opacity:0}} />
        </label>
        {(photoPreview || (existingPhotoUrl && !photoRemoved)) && <div style={{display:'grid',gap:8,justifyItems:'start'}}>
          <img src={photoPreview || existingPhotoUrl} alt="Operational location preview" style={{width:'100%',maxWidth:440,maxHeight:260,objectFit:'contain',borderRadius:10,border:'1px solid #cbd5e1',background:'#fff'}} />
          <button type="button" style={button} disabled={busy} onClick={()=>{setPhotoFile(null);setPhotoPreview('');setExistingPhotoUrl('');setPhotoRemoved(true);}}>Remove Photo</button>
        </div>}
        <small>Photo is stored in Firebase Storage and its reference is saved in the location record. Existing photos are not deleted from Storage when replaced or removed.</small>
      </div>
      <div style={{padding:14,background:'#f8fafc',borderRadius:12}}>
        <button type="button" style={button} disabled={capturing||busy} onClick={capture}>{capturing?'Capturing GPS…':'📍 Capture My Location'}</button>
        <p style={{fontSize:13,color:'#475569'}}>GPS: {form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : 'Not captured'} · Accuracy: {form.accuracyMeters === '' ? 'Unknown' : `±${form.accuracyMeters} m`}</p>
        <label style={{display:'block',marginTop:10}}>Detection radius (meters)<input type="number" min="15" max="300" step="5" style={field} value={form.radiusMeters} onChange={e=>change('radiusMeters',e.target.value)} /></label>
        <small>GPS accuracy indoors may be poor. The registered operational zone is authoritative; coordinates are supporting information. Capture is user-initiated, not continuous tracking.</small>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button style={{...button,background:'#1769aa',color:'#fff'}} disabled={busy||capturing} type="submit">{uploading?'Uploading photo…':busy?'Saving…':editingId?'Save Changes':'Save New Location'}</button>{editingId&&<button type="button" style={button} onClick={()=>{setEditingId('');setForm(blank);resetPhoto();}}>Cancel Edit</button>}</div>
    </form>
    <section style={{marginTop:24}}><h2>Registered Locations ({items.length})</h2><input style={field} placeholder="Search by location, area or ID" value={search} onChange={e=>setSearch(e.target.value)}/>
      {loading ? <p>Loading locations…</p> : visible.length===0 ? <p>No matching locations registered yet.</p> : <div style={{display:'grid',gap:10,marginTop:12}}>{visible.map(item=><article key={item.id} style={{padding:15,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{item.name}</strong><span style={{color:item.active===false?'#b45309':'#15803d'}}>{item.active===false?'Inactive':'Active'}</span></div>
        <div style={{fontSize:13,color:'#475569',marginTop:5}}>{item.area} · {item.type} · ID: {item.id}</div>
        <div style={{fontSize:12,color:'#64748b',marginTop:5}}>GPS: {item.latitude}, {item.longitude} · ±{item.accuracyMeters ?? '?'} m · Radius: {item.radiusMeters ?? 60} m · Updated: {displayTime(item.updatedAt)} · By: {item.updatedByName || item.createdByName || 'Unknown'}</div>
        {item.notes && <p style={{fontSize:13}}>{item.notes}</p>}
        {item.photoUrl && <div style={{marginTop:10}}><img src={item.photoUrl} alt={`Registered location: ${item.name}`} loading="lazy" style={{width:'100%',maxWidth:320,maxHeight:190,objectFit:'cover',borderRadius:10,border:'1px solid #e2e8f0'}} /></div>}
        <div style={{display:'flex',gap:8,marginTop:10}}><button style={button} onClick={()=>edit(item)} disabled={busy}>Edit</button>{manager&&<button style={button} onClick={()=>toggle(item)} disabled={busy}>{item.active===false?'Reactivate':'Deactivate'}</button>}</div>
      </article>)}</div>}
    </section>
  </main>;
}
