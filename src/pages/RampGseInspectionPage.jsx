import React,{useEffect,useMemo,useState} from 'react';
import {addDoc,collection,serverTimestamp} from 'firebase/firestore';
import {db} from '../firebase';
import {useUser} from '../UserContext.jsx';
import {Header,card,field,btn,Field,AirlineSelect,today,timeNow,displayName} from '../components/RampUI.jsx';
import {C615_GROUPS,C615_ORDER,c615GroupForType} from '../components/RampGseC615.js';
import {watchGse} from '../services/gseService.js';
const choices=[['ok','✓ OK'],['defective','✕ Defective'],['na','N/A']];
const itemStyle={display:'grid',gap:9,borderBottom:'1px solid #e2e8f0',padding:'12px 0'};
export default function RampGseInspectionPage(){
 const {user}=useUser();const [equipment,setEquipment]=useState([]);const [loadError,setLoadError]=useState('');const [form,setForm]=useState({date:today(),time:timeNow(),airline:'',equipmentId:'',group:'',assetNumber:'',answers:{},remarks:'',taggedOut:false,repairScheduled:false,repairDate:''});const [saving,setSaving]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>watchGse(setEquipment,e=>setLoadError(e?.message||'Unable to load GSE inventory')) ,[]);
 const change=(k,v)=>setForm(p=>({...p,[k]:v}));
 const selected=useMemo(()=>equipment.find(e=>e.id===form.equipmentId),[equipment,form.equipmentId]);
 const group=C615_GROUPS[form.group];const questions=group?.questions||[];const incomplete=questions.some((_,i)=>!form.answers[i]);const defects=questions.map((q,i)=>({question:q,result:form.answers[i]})).filter(a=>a.result==='defective');
 const options=equipment.filter(e=>!form.group||c615GroupForType(e.type||e.equipmentType)===form.group);
 function pickEquipment(id){const e=equipment.find(x=>x.id===id);setForm(p=>({...p,equipmentId:id,group:c615GroupForType(e?.type||e?.equipmentType)||p.group,assetNumber:e?.code||e?.equipmentNumber||e?.assetNumber||id,answers:{}}));}
 async function save(ev){ev.preventDefault();if(!group||incomplete){setMessage('Select a category and answer every question.');return}if(defects.length&&!form.remarks.trim()){setMessage('Explain each defect in the remarks.');return}if(defects.length&&!form.taggedOut){setMessage('Defective equipment must be tagged out of service before submitting.');return}
 setSaving(true);setMessage('');try{await addDoc(collection(db,'ramp_gse_inspections'),{...form,station:'TPA',equipmentType:selected?.type||selected?.equipmentType||'',equipmentName:selected?.name||selected?.description||'',groupTitle:group.title,questionResults:questions.map((question,i)=>({question,result:form.answers[i]})),defects,defectCount:defects.length,status:defects.length?'defective':'passed',submittedBy:displayName(user),submittedById:user?.id||'',submittedByLogin:user?.username||'',createdAt:serverTimestamp()});setMessage(defects.length?'Inspection saved with defects. Notify management and ensure GSE Inventory reflects out-of-service status.':'Inspection saved successfully.');setForm(p=>({...p,time:timeNow(),equipmentId:'',assetNumber:'',answers:{},remarks:'',taggedOut:false,repairScheduled:false,repairDate:''}));}catch(err){console.error(err);setMessage(`Could not save: ${err?.message||'Check Firebase permissions'}`)}finally{setSaving(false)}}
 return <main style={{display:'grid',gap:16,maxWidth:1000,margin:'auto'}}><Header title="Daily GSE Safety Inspection" subtitle="Simple daily inspection • Based on Allegiant C615 (09/07/23)"/>
 <form onSubmit={save} style={{...card,display:'grid',gap:17}}>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
 <Field label="Date"><input type="date" required style={field} value={form.date} onChange={e=>change('date',e.target.value)}/></Field><Field label="Time"><input type="time" required style={field} value={form.time} onChange={e=>change('time',e.target.value)}/></Field>
 <Field label="Airline"><AirlineSelect value={form.airline} onChange={v=>change('airline',v)}/></Field>
 <Field label="Equipment Category"><select required style={field} value={form.group} onChange={e=>setForm(p=>({...p,group:e.target.value,equipmentId:'',assetNumber:'',answers:{}}))}><option value="">Select category</option>{C615_ORDER.map(k=><option key={k} value={k}>{C615_GROUPS[k].title}</option>)}</select></Field>
 <Field label="Registered Equipment (optional)"><select style={field} value={form.equipmentId} onChange={e=>pickEquipment(e.target.value)}><option value="">Select registered equipment</option>{options.map(e=><option key={e.id} value={e.id}>{e.code||e.equipmentNumber||e.assetNumber||e.id} · {e.type||e.equipmentType||'GSE'}</option>)}</select></Field>
 <Field label="Asset Number"><input required style={field} value={form.assetNumber} onChange={e=>change('assetNumber',e.target.value)} placeholder="GSE-001"/></Field></div>
 {loadError&&<p role="alert" style={{color:'#b91c1c'}}>{loadError}</p>}
 {group&&<><h3 style={{margin:0}}>{group.title} — Daily Safety Questions</h3><p style={{margin:0,color:'#64748b',fontSize:13}}>Answer OK, Defective or N/A. All applicable checks must be completed before the equipment is used.</p>
 {questions.map((q,i)=><div key={q} style={itemStyle}><strong style={{fontSize:14}}>{i+1}. {q}</strong><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{choices.map(([value,label])=><label key={value} style={{padding:'8px 10px',border:'1px solid '+(form.answers[i]===value?'#1769aa':'#dbe5f0'),borderRadius:10,background:form.answers[i]===value?'#eff6ff':'white',cursor:'pointer',fontSize:13}}><input type="radio" name={'question-'+i} checked={form.answers[i]===value} onChange={()=>change('answers',{...form.answers,[i]:value})}/> {label}</label>)}</div></div>)}</>}
 {defects.length>0&&<section style={{padding:14,border:'1px solid #f59e0b',borderRadius:12,background:'#fffbeb'}}><strong>{defects.length} defective item(s) — corrective action required</strong><p style={{fontSize:13}}>Report discrepancies to station management immediately. Do not operate defective equipment.</p><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={form.taggedOut} onChange={e=>change('taggedOut',e.target.checked)}/> Equipment tagged OUT OF SERVICE</label></section>}
 <Field label="Remarks / Discrepancy Notes"><textarea style={{...field,minHeight:90}} value={form.remarks} onChange={e=>change('remarks',e.target.value)} placeholder="Describe any defect, who was notified, and corrective action"/></Field>
 <label><input type="checkbox" checked={form.repairScheduled} onChange={e=>change('repairScheduled',e.target.checked)}/> Repair scheduled</label>
 {form.repairScheduled&&<Field label="Scheduled Repair Date"><input type="date" style={field} value={form.repairDate} onChange={e=>change('repairDate',e.target.value)}/></Field>}
 <div style={{fontSize:13,color:'#64748b'}}>Inspector: {displayName(user)} · Station: TPA</div>{message&&<p role="status" style={{color:'#1769aa',fontWeight:700}}>{message}</p>}
 <button style={btn} disabled={saving||!form.airline||!form.assetNumber.trim()||!group||incomplete}>{saving?'Saving...':'Submit Daily GSE Inspection'}</button>
 </form><p style={{fontSize:12,color:'#64748b'}}>Safety note: This form records the inspection; it does not automatically change GSE Inventory status. Supervisors must confirm out-of-service status in GSE Inventory. Use airline-approved procedures and required record-retention policies.</p></main>
}
