// src/components/UmnrOperationsPanel.jsx
import React,{useCallback,useEffect,useMemo,useState} from 'react';
import { umnrRequest } from '../utils/umnrClient.js';
const button={padding:'9px 13px',border:'1px solid #bfdbfe',borderRadius:9,cursor:'pointer',background:'#eff6ff',fontWeight:700};
const input={padding:10,border:'1px solid #cbd5e1',borderRadius:8,width:'100%',boxSizing:'border-box'};
const finished=new Set(['DELIVERED','CANCELLED','REJECTED']);
export default function UmnrOperationsPanel({mode='agent',flights=[],agents=[],employeeId=''}){
  const dispatch=mode==='dispatch';
  const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [flightId,setFlightId]=useState(''),[direction,setDirection]=useState('IB');
  const [fullName,setFullName]=useState(''),[pnr,setPnr]=useState('');
  const [tick,setTick]=useState(Date.now());
  const refresh=useCallback(async()=>{try{const r=await umnrRequest('list');setItems(r.items||[]);setError('');}catch(e){setError(e.message)}},[]);
  useEffect(()=>{refresh();const interval=setInterval(refresh,15000);return()=>clearInterval(interval)},[refresh]);
  useEffect(()=>{const interval=setInterval(()=>setTick(Date.now()),30000);return()=>clearInterval(interval)},[]);
  const active=useMemo(()=>items.filter(x=>!finished.has(x.status)),[items]);
  const run=async(action,fields)=>{setBusy(true);setError('');setMessage('');try{await umnrRequest(action,fields);setMessage('UMNR updated.');await refresh();}catch(e){setError(e.message)}finally{setBusy(false)}};
  const create=async(e)=>{e.preventDefault();await run('create',{flightId,direction,fullName,pnr});setFullName('');setPnr('')};
  const next=(x,status)=>{
    let fields={id:x.id,status};
    if(status==='REJECTED'){const reason=window.prompt('Reason for rejecting this UMNR assignment:');if(!reason)return;fields.reason=reason}
    if(status==='DELIVERED'){
      const receiver=window.prompt(x.direction==='OB'?'Authorized crew member receiving UMNR:':'Authorized person receiving UMNR:');
      if(!receiver)return;
      if(!window.confirm(`Confirm authorized handoff to ${receiver}?`))return;
      fields.handoffTo=receiver;fields.handoffConfirmed=true;
    }
    if(status==='CANCELLED'&&!window.confirm('Cancel this UMNR service?'))return;
    run('advance',fields);
  };
  return <section style={{border:'1px solid #bfdbfe',borderRadius:16,padding:18,background:'#fff',color:'#0f172a'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div><h2 style={{margin:0}}>UMNR · {dispatch?'Dispatch':'My Services'}</h2><small>Shared WCHR flights · Inbound / Outbound · 30-minute custody checks</small></div>
      <button style={button} disabled={busy} onClick={refresh}>Refresh</button>
    </div>
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p style={{color:'#15803d'}}>{message}</p>}
    {dispatch&&<form onSubmit={create} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginTop:18,alignItems:'end'}}>
      <label>Existing WCHR Flight<select required style={input} value={flightId} onChange={e=>setFlightId(e.target.value)}><option value="">Select flight</option>{flights.map(f=><option key={f.id} value={f.id}>{f.airline} {f.flight_number} · {f.gate||'Gate TBD'}</option>)}</select></label>
      <label>IB / OB<select style={input} value={direction} onChange={e=>setDirection(e.target.value)}><option>IB</option><option>OB</option></select></label>
      <label>UMNR Full Name<input required style={input} value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
      <label>PNR<input required maxLength={8} style={input} value={pnr} onChange={e=>setPnr(e.target.value.toUpperCase())}/></label>
      <button disabled={busy||!flightId} style={button}>Create UMNR</button>
    </form>}
    <div style={{marginTop:16,display:'grid',gap:10}}>{items.length===0?<p>No UMNR services assigned or created.</p>:items.map(x=>{
      const stamp=x.lastCustodyAt?new Date(x.lastCustodyAt._seconds?x.lastCustodyAt._seconds*1000:x.lastCustodyAt):null;
      const mayAct=!dispatch || x.agentId===employeeId;
      const overdue=['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&(!stamp||tick-stamp.getTime()>=30*60000);
      return <article key={x.id} style={{border:'1px solid #e2e8f0',padding:14,borderRadius:12,background:overdue?'#fff7ed':'#f8fafc'}}>
        <div><b>{x.fullName}</b> · {x.direction} · {x.airline} {x.flightNumber} · PNR {x.pnr}</div>
        <small>Status: <b>{x.status}</b> · Agent: {x.agentId||'Unassigned'}{overdue?' · CUSTODY CHECK DUE':''}</small>
        <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>
          {dispatch&&['UNASSIGNED','REJECTED'].includes(x.status)&&<select style={{...input,width:200}} disabled={busy} defaultValue="" onChange={e=>{if(e.target.value)run('assign',{id:x.id,agentId:e.target.value})}}><option value="">Assign agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name||a.employeeName||a.displayName||a.id}</option>)}</select>}
          {mayAct&&x.status==='ASSIGNED'&&<><button disabled={busy} style={button} onClick={()=>next(x,'ACCEPTED')}>Accept</button><button disabled={busy} style={button} onClick={()=>next(x,'REJECTED')}>Reject</button></>}
          {mayAct&&x.status==='ACCEPTED'&&<button disabled={busy} style={button} onClick={()=>next(x,'PICKED_UP')}>Pick Up</button>}
          {mayAct&&x.status==='PICKED_UP'&&<button disabled={busy} style={button} onClick={()=>next(x,'IN_TRANSIT')}>Start Transit</button>}
          {mayAct&&x.status==='IN_TRANSIT'&&<button disabled={busy} style={button} onClick={()=>next(x,'AT_GATE')}>At Gate / Handoff Point</button>}
          {mayAct&&['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&<><button disabled={busy} style={button} onClick={()=>run('custody',{id:x.id})}>Custody Check</button><button disabled={busy} style={button} onClick={()=>next(x,'DELIVERED')}>Authorized Handoff</button></>}
          {dispatch&&!finished.has(x.status)&&<button disabled={busy} style={button} onClick={()=>next(x,'CANCELLED')}>Cancel</button>}
        </div>
        <details style={{marginTop:9}}><summary>Audit history ({x.timeline?.length||0})</summary><div style={{fontSize:12}}>{(x.timeline||[]).map((t,i)=><p key={i}>{t.at} · {t.type} · {t.actor?.employeeId||t.actor?.id}</p>)}</div></details>
      </article>
    })}</div>
  </section>;
}
