import React from "react";

export const card={background:'#fff',border:'1px solid #dbe5f0',borderRadius:18,padding:20,boxShadow:'0 8px 24px #1234560a'};
export const field={padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,width:'100%',boxSizing:'border-box',background:'#fff',fontSize:14};
export const btn={padding:'12px 17px',border:0,borderRadius:11,background:'#1769aa',color:'white',fontWeight:800,cursor:'pointer'};
export const airlines=[{value:'AV',label:'Avianca (AV)'},{value:'WL',label:'World Atlantic (WL)'},{value:'SY',label:'Sun Country (SY)'},{value:'G4',label:'Allegiant (G4)'}];
export const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export const timeNow=()=>new Date().toTimeString().slice(0,5);
export const displayName=u=>u?.displayName||u?.fullName||u?.name||u?.username||'Unknown';
export function Header({title,subtitle}){return <header style={{background:'linear-gradient(120deg,#082f54,#1769aa)',color:'white',borderRadius:22,padding:24}}><div style={{fontSize:12,letterSpacing:2,fontWeight:800}}>TPA • AEROSTATION HUB</div><h1 style={{margin:'9px 0',fontSize:29}}>{title}</h1><div style={{opacity:.9}}>{subtitle}</div></header>}
export function Field({label,children}){return <label style={{display:'grid',gap:6,fontSize:12,fontWeight:800,color:'#475569'}}>{label}{children}</label>}
export function AirlineSelect({value,onChange}){return <select style={field} value={value} onChange={e=>onChange(e.target.value)}><option value="">Select airline</option>{airlines.map(a=><option key={a.value} value={a.value}>{a.label}</option>)}</select>}
export function PanelLink({to,icon,title,desc}){return <a href={to} style={{...card,textDecoration:'none',color:'#0f172a',display:'grid',gap:8}}><div style={{fontSize:29}}>{icon}</div><strong style={{fontSize:17}}>{title}</strong><span style={{fontSize:13,color:'#64748b'}}>{desc}</span></a>}
