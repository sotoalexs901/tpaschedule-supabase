import React,{useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useUser} from '../UserContext.jsx';
import {getGseCode,inspectGse,watchGse,watchGseLocations,nearestGseLocation,uploadGsePhotos,GSE_TYPES,GSE_FUEL_TYPES,registerAndInspectGse,updateGseEquipment,archiveGseEquipment} from '../services/gseService.js';
const field={width:'100%',padding:12,border:'1px solid #cbd5e1',borderRadius:10,boxSizing:'border-box',background:'#fff'};
const empty=()=>({code:'',type:'Baggage Cart',serial:'',motorized:false,equipmentNumber:'',vin:'',year:'',fuel:'GASOLINE',locationId:'',condition:'IN_SERVICE',notes:'',estimate:''});
export default function GseInventoryPage(){
 const {user}=useUser();const [params]=useSearchParams();
 const [items,setItems]=useState([]),[locations,setLocations]=useState([]),[form,setForm]=useState(empty),[mode,setMode]=useState('new'),[editing,setEditing]=useState(null),[photos,setPhotos]=useState([]),[gps,setGps]=useState(null),[busy,setBusy]=useState(false),[capturing,setCapturing]=useState(false),[message,setMessage]=useState(''),[reason,setReason]=useState('');
 const canManage=['station_manager','duty_manager'].includes(String(user?.role||'').toLowerCase());
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 useEffect(()=>watchGse(setItems,e=>setMessage(e.message)),[]);
 useEffect(()=>watchGseLocations(setLocations,e=>setMessage(e.message)),[]);
 useEffect(()=>{const id=getGseCode(params.get('gse'));if(id){setMode('inspect');setForm(f=>({...f,code:id}));}},[params]);
 const activeLocations=useMemo(()=>locations.filter(x=>x.active!==false),[locations]);
 const equipment=items.find(x=>x.id===getGseCode(form.code));
 const suggested=useMemo(()=>nearestGseLocation(gps,activeLocations),[gps,activeLocations]);
 const location=activeLocations.find(x=>x.id===form.locationId);
 function reset(next='new'){setForm(empty());setMode(next);setEditing(null);setPhotos([]);setGps(null);setReason('');setMessage('');}
 function selectExisting(item,next='inspect'){
   setMode(next);setEditing(next==='edit'?item:null);setPhotos([]);setGps(null);setReason('');setMessage('');
   setForm({code:item.id,type:item.equipmentType||'Other',serial:item.serialNumber||'',motorized:item.motorized===true,equipmentNumber:item.equipmentNumber||'',vin:item.vinNumber||'',year:String(item.year||''),fuel:item.fuelType||'GASOLINE',locationId:item.locationId||'',condition:item.status==='OUT_OF_SERVICE'?'OUT_OF_SERVICE':'IN_SERVICE',notes:'',estimate:''});
   window.scrollTo({top:0,behavior:'smooth'});
 }
 function capture(){if(!navigator.geolocation){setMessage('GPS unavailable. Select a saved location.');return;}setCapturing(true);setMessage('');navigator.geolocation.getCurrentPosition(p=>{const point={latitude:Number(p.coords.latitude.toFixed(7)),longitude:Number(p.coords.longitude.toFixed(7)),accuracyMeters:Math.round(p.coords.accuracy||0),capturedAt:new Date().toISOString()};setGps(point);const near=nearestGseLocation(point,activeLocations);if(near)change('locationId',near.id);setMessage(near?`GPS suggested ${near.name}. Confirm the parking location.`:'GPS captured. Select the correct TPA parking location.');setCapturing(false);},e=>{setMessage(`GPS unavailable: ${e.message}. Select location manually.`);setCapturing(false);},{enableHighAccuracy:true,timeout:20000,maximumAge:0});}
 function selectPhotos(e){const files=Array.from(e.target.files||[]);if(files.length>2||files.some(f=>f.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))){setPhotos([]);setMessage('Select 1–2 JPG, PNG or WebP images, up to 8 MB each.');e.target.value='';return;}setPhotos(files);setMessage('');}
 async function save(e){e.preventDefault();setBusy(true);setMessage('');try{
   if(!location)throw new Error('Select a registered TPA parking location.');
   if(mode==='edit'){
     if(!canManage||!editing)throw new Error('Management permission required.');
     await updateGseEquipment({equipment:editing,user,type:form.type,serialNumber:form.serial,location:location.name,locationId:location.id,motorized:form.motorized,equipmentNumber:form.equipmentNumber,vinNumber:form.vin,year:form.year,fuelType:form.fuel,reason});
     setMessage(`${editing.id} updated. Audit history saved.`);setMode('inspect');setEditing(null);return;
   }
   if(!photos.length||photos.length>2)throw new Error('Add 1 or 2 equipment photos.');
   if(form.condition==='OUT_OF_SERVICE'&&(!form.notes.trim()||form.estimate===''||!Number.isFinite(Number(form.estimate))||Number(form.estimate)<0))throw new Error('Defect description and repair estimate are required.');
   if(mode==='new'&&!canManage)throw new Error('Management permission required to register new equipment.');
   if(mode==='inspect'&&!equipment)throw new Error('Equipment not found. Register it first.');
   // Validate asset fields before photo upload, preventing unnecessary Storage uploads.
   if(mode==='new'&&form.motorized&&(!form.vin.trim()||!form.year||!GSE_FUEL_TYPES.includes(form.fuel)))throw new Error('Motorized equipment requires VIN, year and fuel.');
   const uploaded=await uploadGsePhotos(form.code,photos);
   const common={code:form.code,condition:form.condition,location:location.name,locationId:location.id,gps,notes:form.notes,photos:uploaded,estimatedRepairCost:form.estimate,user};
   if(mode==='new')await registerAndInspectGse({...common,type:form.type,serialNumber:form.serial,motorized:form.motorized,equipmentNumber:form.equipmentNumber,equipmentNumber:form.equipmentNumber,vinNumber:form.vin,year:form.year,fuelType:form.fuel});
   else await inspectGse(common);
   const savedCode=getGseCode(form.code);reset('inspect');change('code',savedCode);setMessage(mode==='new'?`Equipment ${savedCode} registered and inspected successfully.`:`Inspection for ${savedCode} saved.`);
 }catch(err){setMessage(err.message||'Unable to save. Uploaded photos may need cleanup if the Firestore write failed.');}finally{setBusy(false);}}
 async function archive(item){if(!window.confirm(`Archive ${item.id}? Inspection and repair history will be preserved.`))return;const why=window.prompt('Reason for archiving:');if(why===null)return;setBusy(true);try{await archiveGseEquipment({equipment:item,user,reason:why});reset();setMessage(`${item.id} archived.`);}catch(err){setMessage(err.message);}finally{setBusy(false);}}
 return <main style={{maxWidth:850,margin:'0 auto',padding:16,color:'#0f172a'}}>
  <h1 style={{marginBottom:4}}>GSE Inventory</h1><p style={{color:'#64748b'}}>One form for registration, equipment condition, photos and TPA parking location.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
    {canManage&&<button type="button" onClick={()=>reset('new')} style={{padding:10,borderRadius:9,background:mode==='new'?'#1769aa':'#e2e8f0',color:mode==='new'?'#fff':'#0f172a',border:0}}>+ New Equipment</button>}
    <button type="button" onClick={()=>reset('inspect')} style={{padding:10,borderRadius:9,background:mode==='inspect'?'#1769aa':'#e2e8f0',color:mode==='inspect'?'#fff':'#0f172a',border:0}}>Inspect Existing / QR</button>
    {mode==='edit'&&<strong style={{padding:10}}>Editing {editing?.id}</strong>}
  </div>
  <form onSubmit={save} style={{background:'#fff',border:'1px solid #dbeafe',borderRadius:16,padding:20,display:'grid',gap:14}}>
    <h2 style={{margin:0}}>{mode==='new'?'Register & Inspect New Equipment':mode==='edit'?`Edit Equipment · ${editing?.id}`:'Inspect Existing Equipment'}</h2>
    <label>Equipment ID / QR<input style={field} required disabled={mode==='edit'} value={form.code} onChange={e=>change('code',e.target.value)} placeholder="GSE-001" /></label>
    {mode==='inspect'&&<div style={{padding:12,borderRadius:10,background:equipment?'#eff6ff':'#fff7ed'}}>{equipment?<><strong>{equipment.id} · {equipment.equipmentType}</strong><div>Current status: {equipment.status||'PENDING_INSPECTION'}</div></>:'Select a registered equipment ID to inspect.'}</div>}
    {mode!=='inspect'&&<>
      <label>Equipment Type<select style={field} value={form.type} onChange={e=>change('type',e.target.value)}>{GSE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Serial Number<input style={field} value={form.serial} onChange={e=>change('serial',e.target.value)}/></label>
      <label>Motorized Equipment?<select style={field} value={form.motorized?'YES':'NO'} onChange={e=>change('motorized',e.target.value==='YES')}><option value="NO">No — Non-Motorized</option><option value="YES">Yes — Motorized</option></select></label>
      {form.motorized&&<>
        <label>Equipment / Fleet Number<input style={field} required value={form.equipmentNumber} onChange={e=>change('equipmentNumber',e.target.value)} placeholder="e.g. TUG-12" /></label>
        <label>VIN / Chassis Number<input style={field} required value={form.vin} onChange={e=>change('vin',e.target.value)} maxLength={60}/></label>
        <label>Year<input style={field} required type="number" min="1950" max={new Date().getFullYear()+1} value={form.year} onChange={e=>change('year',e.target.value)}/></label>
        <label>Fuel Type<select style={field} value={form.fuel} onChange={e=>change('fuel',e.target.value)}>{GSE_FUEL_TYPES.map(f=><option key={f} value={f}>{f==='GASOLINE'?'Gasoline (Gas)':'Diesel (Petroleum)'}</option>)}</select></label>
      </>}
    </>}
    {mode!=='edit'&&<>
      <label>Equipment Condition<select style={field} value={form.condition} onChange={e=>change('condition',e.target.value)}><option value="IN_SERVICE">Good / Fair — In Service</option><option value="OUT_OF_SERVICE">Poor / Unsafe — Out of Service</option></select></label>
      {form.condition==='OUT_OF_SERVICE'&&<label>Estimated Repair Cost (USD)<input style={field} required type="number" min="0" step="0.01" value={form.estimate} onChange={e=>change('estimate',e.target.value)} placeholder="0.00"/></label>}
      <label>Equipment Photos (1–2 required, max 8 MB each)<input style={field} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectPhotos}/></label>
      {!!photos.length&&<small>{photos.map(f=>f.name).join(' · ')}</small>}
    </>}
    <label>Saved TPA Parking Location<select style={field} required value={form.locationId} onChange={e=>change('locationId',e.target.value)}><option value="">Select saved location</option>{activeLocations.map(l=><option key={l.id} value={l.id}>{l.name} · {l.area}</option>)}</select></label>
    {mode!=='edit'&&<><button type="button" disabled={capturing||busy} onClick={capture} style={{padding:12,borderRadius:10}}>{capturing?'Capturing GPS…':'📍 Capture GPS / Suggest Location'}</button>{gps&&<small>GPS: {gps.latitude}, {gps.longitude} · Accuracy ±{gps.accuracyMeters} m {suggested?`· Suggested: ${suggested.name}`:''}</small>}
      <label>Inspection Notes / Defect Description<textarea style={field} rows={3} required={form.condition==='OUT_OF_SERVICE'} value={form.notes} onChange={e=>change('notes',e.target.value)} placeholder={form.condition==='OUT_OF_SERVICE'?'Required: describe damage':'Optional notes'}/></label></>}
    {mode==='edit'&&<label>Reason for Edit<input style={field} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this equipment record changing?"/></label>}
    <button disabled={busy||(mode==='inspect'&&!equipment)||(mode!=='edit'&&!photos.length)} style={{padding:14,background:'#1769aa',color:'#fff',border:0,borderRadius:10,fontWeight:700}}>{busy?'Saving…':mode==='new'?'Register Equipment & Save Inspection':mode==='edit'?'Save Equipment Changes':'Submit Inspection'}</button>
    {message&&<p role="status" style={{margin:0,color:'#1d4ed8'}}>{message}</p>}
  </form>
  {canManage&&<section style={{background:'#fff',borderRadius:16,padding:16,marginTop:18}}><h2>Registered Equipment ({items.length})</h2><div style={{display:'grid',gap:9}}>{items.map(item=><div key={item.id} style={{borderTop:'1px solid #e2e8f0',paddingTop:10,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong>{item.id}</strong> · {item.equipmentType}<div style={{fontSize:12,color:'#64748b'}}>{item.motorized?'Motorized':'Non-Motorized'} · {item.location||'Location not set'} · {item.status||'Pending'}</div></div><div style={{display:'flex',gap:8}}><button type="button" onClick={()=>selectExisting(item)}>Inspect</button><button type="button" onClick={()=>selectExisting(item,'edit')}>Edit</button>{String(user?.role||'').toLowerCase()==='station_manager'&&<button type="button" style={{color:'#b91c1c'}} onClick={()=>archive(item)}>Archive</button>}</div></div>)}</div></section>}
  <p style={{fontSize:12,color:'#64748b'}}>Out of Service equipment requires management authorization and a new inspection before return to service. GPS capture is user-initiated; indoor accuracy varies. Avoid photographing badges, passengers or restricted information.</p>
 </main>;
}
