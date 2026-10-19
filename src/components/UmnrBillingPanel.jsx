import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {umnrRequest} from '../utils/umnrClient.js';
import {printUmnrReport} from '../utils/umnrReport.js';
const field={padding:8,border:'1px solid #cbd5e1',borderRadius:8};
const fmt=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString():'—'};
export default function UmnrBillingPanel(){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [dateFrom,setDateFrom]=useState(''),[dateTo,setDateTo]=useState(''),[airline,setAirline]=useState('ALL'),[status,setStatus]=useState('DELIVERED');
 const load=useCallback(async()=>{setLoading(true);try{const r=await umnrRequest('billingList');setItems(r.items||[]);setError('');}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{load()},[load]);
 const airlines=useMemo(()=>[...new Set(items.map(x=>x.airline).filter(Boolean))].sort(),[items]);
 const filtered=useMemo(()=>items.filter(x=>{
  const date=String(x.handoffAt||x.createdAt||'').slice(0,10);
  return (airline==='ALL'||x.airline===airline)&&(status==='ALL'||x.status===status)&&(!dateFrom||date>=dateFrom)&&(!dateTo||date<=dateTo);
 }),[items,airline,status,dateFrom,dateTo]);
 const agentName=x=>x.agentName||'Name not recorded';
 const actorName=(t,x)=>t?.actor?.name||t?.agentName||((t?.actor?.employeeId===x.agentId)?agentName(x):'Name not recorded');
 return <section style={{border:'1px solid #dbeafe',borderRadius:16,padding:16,background:'#fff',color:'#0f172a'}}>
 <h2 style={{marginTop:0}}>UMNR · Service Reports & Billing</h2>
 <p style={{fontSize:13,color:'#475569'}}>Separate from WCHR billing. Archived records remain available for audit. No rates are assumed.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
 <label>From <input type="date" style={field} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
 <label>To <input type="date" style={field} value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
 <label>Airline <select style={field} value={airline} onChange={e=>setAirline(e.target.value)}><option value="ALL">All airlines</option>{airlines.map(a=><option key={a}>{a}</option>)}</select></label>
 <label>Status <select style={field} value={status} onChange={e=>setStatus(e.target.value)}><option value="DELIVERED">Delivered</option><option value="ALL">All</option><option value="CANCELLED">Cancelled</option><option value="REJECTED">Rejected</option></select></label>
 <button type="button" style={field} onClick={load} disabled={loading}>{loading?'Loading...':'Refresh UMNR'}</button>
 </div>
 {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
 <p><b>{filtered.length}</b> services · <b>{filtered.filter(x=>x.status==='DELIVERED'&&!x.archived).length}</b> delivered (not archived) · <b>{filtered.filter(x=>x.archived).length}</b> archived</p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Date','Airline / Flight','Direction','Passenger','PNR','Agent','Status','Archive','Report'].map(h=><th key={h} style={{textAlign:'left',padding:8,borderBottom:'1px solid #cbd5e1'}}>{h}</th>)}</tr></thead><tbody>
 {filtered.map(x=><tr key={x.id}>{[fmt(x.handoffAt||x.createdAt),`${x.airline||''} ${x.flightNumber||''}`,x.direction,x.fullName,x.pnr,agentName(x),x.status,x.archived?'Archived':'—'].map((v,i)=><td key={i} style={{padding:8,borderBottom:'1px solid #e2e8f0'}}>{v}</td>)}<td style={{padding:8,borderBottom:'1px solid #e2e8f0'}}><button type="button" style={field} onClick={()=>printUmnrReport(x,()=>agentName(x),(t)=>actorName(t,x),setError)}>Print</button></td></tr>)}
 </tbody></table></div>
 {!filtered.length&&<p>No UMNR records match the filters.</p>}
 </section>;
}
