// src/components/UmnrOperationsPanel.jsx
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { umnrRequest } from '../utils/umnrClient.js';
import { printUmnrReport } from '../utils/umnrReport.js';
const button={padding:'9px 13px',border:'1px solid #bfdbfe',borderRadius:9,cursor:'pointer',background:'#eff6ff',fontWeight:700};
const input={padding:10,border:'1px solid #cbd5e1',borderRadius:8,width:'100%',boxSizing:'border-box'};
const finished=new Set(['DELIVERED','CANCELLED']);
const localTime=v=>{if(!v)return 'Not recorded';const d=new Date(v);return Number.isNaN(d.getTime())?'Not recorded':d.toLocaleString();};
const duration=(start,end)=>{if(!start)return 'Not started';const a=new Date(start).getTime(),b=new Date(end).getTime();if(!Number.isFinite(a)||!Number.isFinite(b))return 'Not available';const s=Math.max(0,Math.floor((b-a)/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};


function SignaturePad({onSave,onCancel,busy}) {
  const canvasRef=useRef(null),drawing=useRef(false),signed=useRef(false);
  const point=e=>{const c=canvasRef.current,r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
  const start=e=>{if(busy)return;const c=canvasRef.current,p=point(e),ctx=c.getContext('2d');drawing.current=true;c.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=2.5;ctx.lineCap='round';ctx.strokeStyle='#0f172a';};
  const move=e=>{if(!drawing.current)return;const p=point(e),ctx=canvasRef.current.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke();signed.current=true;};
  const stop=()=>{drawing.current=false;};
  const clear=()=>{const c=canvasRef.current;c.getContext('2d').clearRect(0,0,c.width,c.height);signed.current=false;};
  return <div style={{marginTop:12,padding:12,background:'#fff',border:'1px solid #cbd5e1',borderRadius:10}}>
    <strong>Receiver signature</strong><p style={{fontSize:12}}>The authorized receiver signs below. No ID photograph is requested or stored.</p>
    <canvas ref={canvasRef} width={540} height={170} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} style={{width:'100%',maxWidth:540,height:170,touchAction:'none',border:'1px solid #94a3b8',borderRadius:8,background:'white'}} aria-label="Receiver signature area" />
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
      <button type="button" style={button} disabled={busy} onClick={clear}>Clear signature</button>
      <button type="button" style={button} disabled={busy} onClick={onCancel}>Cancel handoff</button>
      <button type="button" style={button} disabled={busy} onClick={()=>{if(!signed.current){window.alert('Receiver signature is required.');return;}onSave(canvasRef.current.toDataURL('image/png'));}}>Confirm signed handoff</button>
    </div>
  </div>;
}

export default function UmnrOperationsPanel({mode='agent',flights=[],agents=[],employeeId=''}){
  const dispatch=mode==='dispatch';
  const agentLabel=useCallback((agentId,storedName)=>{
    const agent=agents.find(a=>String(a.id)===String(agentId));
    const name=agent?.agent_name||agent?.employee_name||agent?.display_name||agent?.name||agent?.fullName||agent?.employeeName||agent?.displayName||agent?.login_username||agent?.loginUsername;
    // Prefer a resolved roster name over an opaque stored Firebase identifier.
    if(name&&String(name).trim()!==String(agentId))return String(name).trim();
    if(storedName&&String(storedName).trim()!==String(agentId))return String(storedName).trim();
    return agentId?'Agent name unavailable':'Unassigned';
  },[agents]);
  const [items,setItems]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [flightId,setFlightId]=useState(''),[direction,setDirection]=useState('IB');
  const [fullName,setFullName]=useState(''),[pnr,setPnr]=useState('');
  const [tick,setTick]=useState(Date.now());
  const [handoff,setHandoff]=useState(null);
  const [dismissedAssignments,setDismissedAssignments]=useState([]);
  const [transferId,setTransferId]=useState('');
  const [transferAgent,setTransferAgent]=useState('');
  const [transferReason,setTransferReason]=useState('');
  const [transferLocation,setTransferLocation]=useState('');
  const [receiverName,setReceiverName]=useState('');
  const [receiverChecks,setReceiverChecks]=useState({physicalIdInspected:false,idNameMatched:false,idPhotoMatched:false,authorizedReceiverMatched:false});
  const [handoffLocation,setHandoffLocation]=useState('');
  const refresh=useCallback(async()=>{try{const r=await umnrRequest('list');setItems(r.items||[]);setError('');}catch(e){setError(e.message)}},[]);
  useEffect(()=>{refresh();const interval=setInterval(refresh,15000);return()=>clearInterval(interval)},[refresh]);
  useEffect(()=>{const interval=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(interval)},[]);
  const visible=useMemo(()=>dispatch?items:items.filter(x=>String(employeeId).trim() && (String(x.agentId)===String(employeeId)||String(x.pendingTransfer?.toAgentId)===String(employeeId))),[dispatch,items,employeeId]);
  const active=useMemo(()=>visible.filter(x=>!finished.has(x.status)),[visible]);
  const pendingAssignment=!dispatch?active.find(x=>x.status==='ASSIGNED'&&String(x.agentId)===String(employeeId)&&!dismissedAssignments.includes(x.id)):null;
  const pendingCustody=!dispatch?active.find(x=>x.pendingTransfer&&String(x.pendingTransfer.toAgentId)===String(employeeId)):null;
  const run=async(action,fields)=>{setBusy(true);setError('');setMessage('');try{await umnrRequest(action,fields);setMessage('UMNR updated.');await refresh();return true;}catch(e){setError(e.message);return false;}finally{setBusy(false)}};
  const create=async(e)=>{e.preventDefault();const ok=await run('create',{flightId,direction,fullName,pnr});if(ok){setFullName('');setPnr('');}};
  const next=(x,status)=>{
    let fields={id:x.id,status};
    if(['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(status)){
      const location=window.prompt('Enter the actual current location (do not enter an assumed location):',x.currentLocation||'');
      if(location===null)return;
      if(location.trim().length<3){setError('Actual current location is required.');return;}
      fields.currentLocation=location.trim();
    }
    if(status==='REJECTED'){const reason=window.prompt('Reason for rejecting this UMNR assignment:');if(!reason)return;fields.reason=reason}
    if(status==='DELIVERED'){setHandoff(x.id);setReceiverName('');setReceiverChecks({physicalIdInspected:false,idNameMatched:false,idPhotoMatched:false,authorizedReceiverMatched:false});setHandoffLocation(x.direction==='IB'?'Customs exit / authorized pickup point':'Gate / authorized crew handoff point');return;}
    if(status==='CANCELLED'&&!window.confirm('Cancel this UMNR service?'))return;
    run('advance',fields);
  };
  const actorLabel=(t,x)=>{
    const id=String(t?.actor?.employeeId||t?.actor?.id||'');
    if(t?.actor?.name)return t.actor.name;
    if(t?.agentName && t.type!=='ASSIGNED')return t.agentName;
    if(t?.type==='ASSIGNED')return 'Dispatch (name not recorded)';
    if(id && id===String(x.agentId))return agentLabel(x.agentId,x.agentName);
    return 'Name not recorded';
  };
  const printReport=(x)=>printUmnrReport(x,agentLabel,actorLabel,setError);
  const archiveService=async(x)=>{
    if(!['DELIVERED','CANCELLED'].includes(x.status))return;
    const reason=window.prompt('Archive this completed UMNR service? Enter the reason (minimum 8 characters). The record will remain available to Management for billing and audit:');
    if(reason===null)return;
    if(reason.trim().length<8){setError('Please enter an archive reason of at least 8 characters.');return;}
    if(!window.confirm('Confirm archive? The service will disappear from Dispatch but remain in Management billing history.'))return;
    await run('archive',{id:x.id,reason:reason.trim()});
  };

  return <section style={{border:'1px solid #bfdbfe',borderRadius:16,padding:18,background:'#fff',color:'#0f172a'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div><h2 style={{margin:0}}>UMNR · {dispatch?'Dispatch':'My Services'}</h2><small>Shared WCHR flights · Inbound / Outbound · 30-minute custody checks</small></div>
      <button style={button} disabled={busy} onClick={refresh}>Refresh</button>
    </div>
    {pendingAssignment&&<div role="dialog" aria-modal="true" aria-label="New UMNR assignment" style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(15,23,42,.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{width:'100%',maxWidth:480,background:'white',borderRadius:18,padding:24,boxShadow:'0 20px 70px #0005'}}><h2 style={{marginTop:0}}>New UMNR Assignment</h2><p><b>{pendingAssignment.fullName}</b> · {pendingAssignment.direction} · {pendingAssignment.airline} {pendingAssignment.flightNumber}</p><p>PNR: {pendingAssignment.pnr} · Gate: {pendingAssignment.gate||'TBD'}</p><p>Route: {pendingAssignment.pickupLocation||'Pickup to be confirmed'} → {pendingAssignment.direction==='OB'?'Gate / Crew':'Authorized receiver'}</p><p style={{fontSize:13}}>Accepting the assignment does not start the service timer. Confirm Pick Up when you physically receive the minor.</p><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button style={button} disabled={busy} onClick={async()=>{const ok=await run('advance',{id:pendingAssignment.id,status:'ACCEPTED'});if(ok)setDismissedAssignments(v=>[...v,pendingAssignment.id]);}}>Accept Assignment</button><button style={button} disabled={busy} onClick={async()=>{const reason=window.prompt('Reason for rejecting this UMNR assignment:');if(!reason?.trim())return;const ok=await run('advance',{id:pendingAssignment.id,status:'REJECTED',reason:reason.trim()});if(ok)setDismissedAssignments(v=>[...v,pendingAssignment.id]);}}>Reject Assignment</button></div></div></div>}
    {pendingCustody&&<div role="dialog" aria-modal="true" aria-label="UMNR custody transfer" style={{position:'fixed',inset:0,zIndex:99998,background:'rgba(15,23,42,.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{maxWidth:480,background:'white',borderRadius:18,padding:24}}><h2>UMNR Custody Transfer</h2><p><b>{pendingCustody.fullName}</b> · From {pendingCustody.pendingTransfer.fromAgentName}</p><p>Required handoff location: <b>{pendingCustody.pendingTransfer.location}</b></p><p>Confirm ONLY after physically receiving the minor from the current custodian at this location.</p><button disabled={busy} style={button} onClick={()=>{if(!window.confirm('I confirm I am physically with the minor and received custody from the previous agent at the specified location.'))return;run('confirmTransfer',{id:pendingCustody.id,location:pendingCustody.pendingTransfer.location,physicalCustodyConfirmed:true});}}>Confirm Physical Custody</button></div></div>}
    {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{message&&<p style={{color:'#15803d'}}>{message}</p>}
    {dispatch&&<form onSubmit={create} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginTop:18,alignItems:'end'}}>
      <label>Existing WCHR Flight<select required style={input} value={flightId} onChange={e=>setFlightId(e.target.value)}><option value="">Select flight</option>{flights.map(f=><option key={f.id} value={f.id}>{f.airline} {f.flight_number} · {f.gate||'Gate TBD'}</option>)}</select></label>
      <label>IB / OB<select style={input} value={direction} onChange={e=>setDirection(e.target.value)}><option>IB</option><option>OB</option></select></label>
      <label>UMNR Full Name<input required style={input} value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
      <label>PNR<input required maxLength={8} style={input} value={pnr} onChange={e=>setPnr(e.target.value.toUpperCase())}/></label>
      <button disabled={busy||!flightId} style={button}>Create UMNR</button>
    </form>}
    <div style={{marginTop:16,display:'grid',gap:10}}>{active.length===0?<p>No active UMNR services.</p>:active.map(x=>{
      const stamp=x.lastCustodyAt?new Date(x.lastCustodyAt._seconds?x.lastCustodyAt._seconds*1000:x.lastCustodyAt):null;
      const mayAct=!dispatch&&String(employeeId).trim()!==''&&String(x.agentId)===String(employeeId)&&!x.pendingTransfer;
      const overdue=['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&(!stamp||tick-stamp.getTime()>=30*60000);
      return <article key={x.id} style={{border:'1px solid #e2e8f0',padding:14,borderRadius:12,background:overdue?'#fff7ed':'#f8fafc'}}>
        <div><b>{x.fullName}</b> · {x.direction} · {x.airline} {x.flightNumber} · PNR {x.pnr}</div><div style={{fontSize:13,marginTop:5}}>Gate: {x.gate||'TBD'} · Assigned to: {agentLabel(x.agentId,x.agentName)}</div>
        <small>Status: <b>{x.status}</b> · Agent: {agentLabel(x.agentId,x.agentName)}{overdue?' · CUSTODY CHECK DUE':''}</small>
        <div style={{fontSize:13,marginTop:8,padding:9,background:'#eef6ff',borderRadius:8}}>
          <strong>Service Route:</strong> {x.pickupLocation||'Pickup not recorded'} → {x.direction==='OB'?(x.gate?`Gate ${x.gate}`:'Gate not recorded'):(x.handoffLocation||'Authorized pickup point not recorded')}
          <div>Current location: {x.currentLocation||'Not recorded'}</div>
          <div><strong>Service Timer:</strong> {duration(x.pickedUpAt,x.handoffAt||tick)} {x.status==='DELIVERED'?'(completed)':x.pickedUpAt?'(running)':''}</div>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>
          {dispatch&&['UNASSIGNED','REJECTED'].includes(x.status)&&<select style={{...input,width:200}} disabled={busy} defaultValue="" onChange={e=>{if(e.target.value)run('assign',{id:x.id,agentId:e.target.value})}}><option value="">Assign agent</option>{agents.map(a=><option key={a.id} value={a.id}>{agentLabel(a.id,a.name)}</option>)}</select>}
          {dispatch&&['ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&!x.pendingTransfer&&<button type="button" disabled={busy} style={button} onClick={()=>{setTransferId(transferId===x.id?'':x.id);setTransferAgent('');setTransferReason('');setTransferLocation(x.currentLocation||'');}}>Transfer UMNR</button>}
          {x.pendingTransfer&&<small style={{color:'#9a3412'}}>Custody transfer pending: {x.pendingTransfer.fromAgentName} → {x.pendingTransfer.toAgentName} · {x.pendingTransfer.location}</small>}
          {mayAct&&x.status==='ASSIGNED' &&<><button disabled={busy} style={button} onClick={()=>next(x,'ACCEPTED')}>Accept</button><button disabled={busy} style={button} onClick={()=>next(x,'REJECTED')}>Reject</button></>}
          {mayAct&&x.status==='ACCEPTED'&&<button disabled={busy} style={button} onClick={()=>next(x,'PICKED_UP')}>Pick Up</button>}
          {mayAct&&x.status==='PICKED_UP'&&<button disabled={busy} style={button} onClick={()=>next(x,'IN_TRANSIT')}>Start Transit</button>}
          {mayAct&&x.status==='IN_TRANSIT'&&<button disabled={busy} style={button} onClick={()=>next(x,'AT_GATE')}>At Gate / Handoff Point</button>}
          {mayAct&&['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&<button disabled={busy} style={button} onClick={()=>run('custody',{id:x.id})}>Custody Check</button>}{mayAct&&x.status==='AT_GATE'&&<button disabled={busy} style={button} onClick={()=>next(x,'DELIVERED')}>Authorized Handoff</button>}{x.status==='DELIVERED'&&<button type="button" style={button} onClick={()=>printReport(x)}>Print Final Report</button>}
          {dispatch&&finished.has(x.status)&&<button disabled={busy} style={{...button,color:'#991b1b'}} onClick={()=>archiveService(x)}>Archive Service (Station Manager)</button>}
           {dispatch&&!finished.has(x.status)&&x.status!=='REJECTED'&&<button disabled={busy} style={button} onClick={()=>next(x,'CANCELLED')}>Cancel</button>}
        </div>
        {dispatch&&transferId===x.id&&<div style={{padding:12,marginTop:10,border:'1px solid #bfdbfe',borderRadius:10,display:'grid',gap:8}}><strong>Transfer UMNR to another agent</strong><select style={input} value={transferAgent} onChange={e=>setTransferAgent(e.target.value)}><option value="">Select receiving agent</option>{agents.filter(a=>String(a.id)!==String(x.agentId)).map(a=><option key={a.id} value={a.id}>{agentLabel(a.id,a.name)}</option>)}</select><input style={input} placeholder="Transfer reason (minimum 8 characters)" value={transferReason} onChange={e=>setTransferReason(e.target.value)}/>{['PICKED_UP','IN_TRANSIT','AT_GATE'].includes(x.status)&&<input style={input} placeholder="Actual physical handoff location" value={transferLocation} onChange={e=>setTransferLocation(e.target.value)}/>}<p style={{fontSize:12,margin:0}}>After pickup, the current agent retains custody until the receiving agent confirms physical handoff.</p><div style={{display:'flex',gap:8}}><button type="button" style={button} disabled={busy||!transferAgent||transferReason.trim().length<8} onClick={async()=>{const ok=await run('transfer',{id:x.id,agentId:transferAgent,reason:transferReason.trim(),location:transferLocation.trim()});if(ok)setTransferId('');}}>Submit Transfer</button><button type="button" style={button} onClick={()=>setTransferId('')}>Cancel</button></div></div>}
        {handoff===x.id&&<div style={{marginTop:12,padding:12,borderRadius:12,border:'1px solid #bfdbfe',background:'#eff6ff'}}>
          <label>Authorized receiver full name<input style={input} maxLength={120} value={receiverName} onChange={e=>setReceiverName(e.target.value)} /></label>
          <label>Handoff location<input style={input} maxLength={120} value={handoffLocation} onChange={e=>setHandoffLocation(e.target.value)} /></label>
          <p style={{fontSize:12}}>Verify the original physical photo ID and airline UMNR authorization. Never photograph or record ID numbers.</p>
          {[
            ['physicalIdInspected','I personally inspected the physical photo ID'],
            ['idNameMatched','The ID name matches the authorized receiver on the airline UMNR form'],
            ['idPhotoMatched','The ID photo matches the person receiving the minor'],
            ['authorizedReceiverMatched',x.direction==='IB'?'The receiver is an authorized guardian/family member under airline procedure':'The receiver is an authorized crew member under airline procedure']
          ].map(([key,label])=><label key={key} style={{display:'flex',gap:8,marginTop:8,alignItems:'flex-start'}}><input type="checkbox" checked={receiverChecks[key]} onChange={e=>setReceiverChecks(c=>({...c,[key]:e.target.checked}))}/><span>{label}</span></label>)}
          <SignaturePad busy={busy} onCancel={()=>setHandoff(null)} onSave={async signature=>{
            if(receiverName.trim().length<3||handoffLocation.trim().length<3||!Object.values(receiverChecks).every(Boolean)){setError('Receiver name and mandatory photo ID, UMNR form, and authorization verification are required.');return;}
            const ok=await run('advance',{id:x.id,status:'DELIVERED',handoffTo:receiverName.trim(),handoffConfirmed:true,receiverAuthorizationVerified:true,receiverIdAndFormMatched:true,...receiverChecks,handoffLocation:handoffLocation.trim(),receiverSignature:signature});
            if(ok)setHandoff(null);
          }}/>
        </div>}
        <details style={{marginTop:9}}><summary>Audit history ({x.timeline?.length||0})</summary><div style={{fontSize:12}}>{(x.timeline||[]).map((t,i)=><p key={i}>{localTime(t.at)} · {t.type} · {actorLabel(t,x)}{t.location?` · ${t.location}`:''}</p>)}</div></details>
      </article>
    })}</div>
    {dispatch&&visible.some(x=>finished.has(x.status))&&<div style={{marginTop:20}}>
      <h3>Completed services · Pending archive</h3>
      {visible.filter(x=>finished.has(x.status)).map(x=><div key={x.id} style={{padding:12,border:'1px solid #cbd5e1',borderRadius:9,marginBottom:8}}>
        <b>{x.fullName}</b> · {x.flightNumber} · {x.status}{' '}
        <button type="button" style={button} onClick={()=>printReport(x)}>Print Final Report</button>{' '}
        <button type="button" disabled={busy} style={button} onClick={()=>archiveService(x)}>Archive (Station Manager)</button>
      </div>)}
    </div>}
  </section>;
}
