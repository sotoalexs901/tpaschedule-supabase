import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";

const COLORS = { SY:"#F28C28", WL:"#3A7BD5", AV:"#D22630", WCHR:"#7D39C7", CABIN:"#1FA86A", BSO:"#A8A8A8" };
const accentFor = s => {
  const value = String(s.department || s.airline || "").toUpperCase();
  if (value.includes("CABIN")) return COLORS.CABIN;
  if (value.includes("BSO")) return COLORS.BSO;
  if (value.includes("WCHR")) return COLORS.WCHR;
  if (value.startsWith("SY")) return COLORS.SY;
  if (value.startsWith("AV")) return COLORS.AV;
  return COLORS.WL;
};
const tint = (hex, factor = 0.88) => {
  const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  return "rgb(" + rgb.map(n => Math.round(n+(255-n)*factor)).join(",") + ")";
};
const time = v => {
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return Date.parse(v || "") || 0;
};
const week = s => String(s.weekStart || s.weekTag || s.startDate || "").trim();

export default function WeeklyDepartmentSchedulesGallery() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const [approved, staff] = await Promise.all([
        getDocs(query(collection(db,"schedules"),where("status","==","approved"))),
        getDocs(collection(db,"employees")),
      ]);
      const latest = new Map();
      approved.docs.forEach(d => {
        const s = { id:d.id, ...d.data() };
        const key = [String(s.airline || s.airlineCode || "").trim().toLowerCase(),String(s.department || "").trim().toLowerCase(),week(s) || d.id].join("|");
        const previous = latest.get(key);
        if (!previous || time(s.updatedAt || s.approvedAt || s.createdAt) > time(previous.updatedAt || previous.approvedAt || previous.createdAt) ||
          (time(s.updatedAt || s.approvedAt || s.createdAt) === time(previous.updatedAt || previous.approvedAt || previous.createdAt) && s.id > previous.id)) latest.set(key,s);
      });
      setSchedules([...latest.values()].sort((a,b) => week(b).localeCompare(week(a)) || String(a.department || a.airline || "").localeCompare(String(b.department || b.airline || "")) || String(a.airline || "").localeCompare(String(b.airline || ""))));
      setEmployees(staff.docs.map(d => ({ id:d.id, ...d.data() })));
      setIndex(0);
      setError("");
    } catch (e) {
      console.error("Weekly schedule gallery load failed",e);
      setError("Unable to load approved schedules.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const s = schedules[index % Math.max(schedules.length,1)];
  const color = s ? accentFor(s) : COLORS.WL;
  const department = s ? String(s.department || s.airline || "Department") : "";
  const next = () => setIndex(i => (i+1) % schedules.length);
  const prev = () => setIndex(i => (i+schedules.length-1) % schedules.length);
  return <section style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:16,marginBottom:18,minWidth:0,boxShadow:"0 10px 30px rgba(15,23,42,.06)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
      <strong style={{fontSize:18,color:"#0f172a"}}>📅 Weekly Department Schedules</strong>
      <button type="button" onClick={load} disabled={loading} style={{padding:"7px 12px",background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,color:"#1769aa",cursor:"pointer"}}>Refresh</button>
    </div>
    {loading ? <p>Loading approved schedules...</p> : error ? <p role="alert">{error}</p> : !s ? <p>No approved schedules available.</p> : <>
      <div style={{background:"#f8fafc",border:"1px solid #dbeafe",borderRadius:12,padding:10,minWidth:0}}>
        <div style={{fontWeight:800,color,marginBottom:8}}>{department} · {week(s)}</div>
        {Array.isArray(s.grid) && s.grid.length ? <div style={{maxWidth:"100%",overflowX:"auto",WebkitOverflowScrolling:"touch",border:"1px solid "+color,borderRadius:6}}>
          <table style={{width:"100%",minWidth:790,tableLayout:"fixed",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:color,color:"#fff"}}><th style={{width:"19%",padding:6,textAlign:"left"}}>EMP</th>{["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d=><th key={d} style={{padding:6}}>{d}</th>)}</tr></thead>
            <tbody>{s.grid.slice(0,16).map((row,i)=>{
              const employee = employees.find(e => String(e.id)===String(row.employeeId) || String(e.employeeId || "")===String(row.employeeId));
              const name = employee?.name || employee?.fullName || employee?.employeeName || row.name || row.employeeName || row.fullName || "Employee";
              return <tr key={row.employeeId || i}>
                <td title={name} style={{padding:"6px 4px",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",background:tint(color,.78)}}>{name}</td>
                {["mon","tue","wed","thu","fri","sat","sun"].map(d=>{
                  const shifts = Array.isArray(row[d]) ? row[d] : [];
                  const label = shifts.filter(x=>x?.start && x.start!=="OFF").map(x=>x.end ? x.start+"–"+x.end : x.start).join(", ") || "OFF";
                  return <td key={d} style={{padding:"5px 2px",textAlign:"center",whiteSpace:"nowrap",background:label==="OFF"?"#f8fafc":tint(color,.92),borderLeft:"1px solid #e2e8f0"}}>{label}</td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div> : <div style={{padding:15}}>Approved schedule available. Open full schedule to view details.</div>}
        {Array.isArray(s.grid) && s.grid.length>16 && <div style={{fontSize:11,marginTop:6,color:"#64748b"}}>+{s.grid.length-16} more employees</div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:10}}>
        <button type="button" onClick={prev} style={{border:0,background:"transparent",color:"#1769aa",cursor:"pointer"}}>← Previous</button>
        <strong style={{fontSize:12}}>{department} · {index+1} / {schedules.length}</strong>
        <button type="button" onClick={next} style={{border:0,background:"transparent",color:"#1769aa",cursor:"pointer"}}>Next →</button>
      </div>
      <div style={{textAlign:"center",marginTop:8}}><button type="button" onClick={()=>navigate("/approved/"+s.id)} style={{border:0,background:"transparent",color:"#1769aa",cursor:"pointer"}}>Open full schedule</button></div>
    </>}
  </section>;
}
