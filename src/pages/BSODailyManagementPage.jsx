// src/pages/BSODailyManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function useViewport() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return { isMobile: w < 768 };
}
function Card({ children, style = {} }) { return <div style={{ background: "#fff", border: "1px solid #dbeafe", borderRadius: 20, boxShadow: "0 14px 34px rgba(15,23,42,.06)", padding: 18, minWidth: 0, ...style }}>{children}</div>; }
function Label({ children }) { return <label style={{ display: "block", marginBottom: 6, fontSize: 11, fontWeight: 850, color: "#475569", textTransform: "uppercase" }}>{children}</label>; }
function Input(props) { return <input {...props} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", minHeight: 44, fontSize: 13.5, ...props.style }} />; }
function Select(props) { return <select {...props} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", minHeight: 44, fontSize: 13.5, background: "#fff", ...props.style }}>{props.children}</select>; }
function Button({ children, onClick, variant = "primary", disabled = false }) {
  const v = { primary: { background: "linear-gradient(135deg,#0f4c81,#1769aa 58%,#5aa9e6)", color: "#fff", border: "none" }, secondary: { background: "#fff", color: "#1769aa", border: "1px solid #cfe7fb" }, danger: { background: "#dc2626", color: "#fff", border: "none" }, dark: { background: "#0f172a", color: "#fff", border: "none" } }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius: 11, padding: "9px 13px", fontSize: 12.5, fontWeight: 850, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .65 : 1, ...v }}>{children}</button>;
}
function Metric({ label, value, tone = "default" }) {
  const t = { default: ["#f8fbff", "#dbeafe", "#0f172a"], green: ["#ecfdf5", "#a7f3d0", "#166534"], amber: ["#fff7ed", "#fdba74", "#9a3412"], red: ["#fff1f2", "#fecdd3", "#9f1239"], blue: ["#edf7ff", "#cfe7fb", "#1769aa"] }[tone];
  return <div style={{ background: t[0], border: `1px solid ${t[1]}`, borderRadius: 16, padding: "13px 15px" }}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 5, fontSize: 23, fontWeight: 900, color: t[2] }}>{value}</div></div>;
}
function formatTs(v) { try { return v?.toDate ? v.toDate().toLocaleString() : v ? new Date(v).toLocaleString() : "-"; } catch { return "-"; } }
function downloadCsv(name, rows) {
  const text = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function recalc(events) {
  const code24Events = events.filter(e => e.eventType === "CODE_24");
  const code24Created = code24Events.filter(e => e.code24Created === true).length;
  const code39 = events.filter(e => e.eventType === "CODE_39");
  return {
    totalEvents: events.length,
    code24BagReturnEvents: code24Events.length,
    code24CreatedCount: code24Created,
    code24Rate: code24Events.length ? Number((code24Created / code24Events.length * 100).toFixed(2)) : 0,
    code39Count: code39.length,
    otherCount: events.filter(e => e.eventType === "OTHER").length,
    code39BagsAffected: code39.reduce((s,e) => s + (Number(e.bagsChecked) || 0), 0),
  };
}

export default function BSODailyManagementPage() {
  const { user } = useUser();
  const { isMobile } = useViewport();
  const canAccess = ["duty_manager", "station_manager"].includes(user?.role);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [working, setWorking] = useState("");
  const [filters, setFilters] = useState({ startDate: "", endDate: "", shift: "all", eventType: "all", supervisor: "", employee: "", status: "all", faultStation: "", lossCode: "", search: "" });

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "bso_daily_reports"), orderBy("createdAt", "desc")));
        setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); setMessage("Could not load BSO Daily Reports."); }
      finally { setLoading(false); }
    })();
  }, []);

  const flat = useMemo(() => reports.flatMap(r => (Array.isArray(r.events) ? r.events : []).map((e, idx) => ({ ...e, eventIndex: idx, reportIdDoc: r.id, reportDate: r.reportDate, shift: r.shift, supervisorName: r.supervisorName, reportStatus: r.status, reviewStatus: r.reviewStatus, createdAt: r.createdAt, reportNotes: r.notes }))), [reports]);

  const filtered = useMemo(() => flat.filter(e => {
    if (filters.startDate && e.reportDate < filters.startDate) return false;
    if (filters.endDate && e.reportDate > filters.endDate) return false;
    if (filters.shift !== "all" && e.shift !== filters.shift) return false;
    if (filters.eventType !== "all" && e.eventType !== filters.eventType) return false;
    if (filters.status !== "all" && String(e.status || e.reportStatus || "").toLowerCase() !== filters.status) return false;
    if (filters.supervisor && !String(e.supervisorName || "").toLowerCase().includes(filters.supervisor.toLowerCase())) return false;
    if (filters.employee && !String(e.employee || "").toLowerCase().includes(filters.employee.toLowerCase())) return false;
    if (filters.faultStation && !String(e.faultStation || "").toLowerCase().includes(filters.faultStation.toLowerCase())) return false;
    if (filters.lossCode && !String(e.lossCode || "").toLowerCase().includes(filters.lossCode.toLowerCase())) return false;
    const q = filters.search.trim().toLowerCase();
    if (q) {
      const hay = [e.passengerName,e.pnr,e.flightNumber,e.bagTags,e.reportId,e.worldTracerId,e.employee,e.supervisorName,e.comments,e.otherDescription].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [flat, filters]);

  const totals = useMemo(() => {
    const code24Events = filtered.filter(e => e.eventType === "CODE_24");
    const code24Created = code24Events.filter(e => e.code24Created === true).length;
    const code39 = filtered.filter(e => e.eventType === "CODE_39");
    return {
      total: filtered.length,
      code24Events: code24Events.length,
      code24Created,
      code24Rate: code24Events.length ? code24Created / code24Events.length * 100 : 0,
      code39: code39.length,
      code39Bags: code39.reduce((s,e) => s + (Number(e.bagsChecked) || 0), 0),
      other: filtered.filter(e => e.eventType === "OTHER").length,
      followUp: filtered.filter(e => e.followUpRequired === true || e.supervisorReview === "Follow-up required").length,
    };
  }, [filtered]);

  const selectedReport = useMemo(() => reports.find(r => r.id === selectedId) || null, [reports, selectedId]);

  async function deleteReport(reportId) {
    if (!window.confirm("Delete this entire BSO Daily Report permanently?")) return;
    try { setWorking(reportId); await deleteDoc(doc(db, "bso_daily_reports", reportId)); setReports(p => p.filter(r => r.id !== reportId)); if (selectedId === reportId) setSelectedId(""); setMessage("Report deleted successfully."); }
    catch (e) { console.error(e); setMessage("Could not delete report."); } finally { setWorking(""); }
  }
  async function deleteEvent(reportId, eventIndex) {
    if (!window.confirm("Delete this BSO event permanently?")) return;
    const report = reports.find(r => r.id === reportId); if (!report) return;
    const events = (report.events || []).filter((_, i) => i !== eventIndex);
    try {
      setWorking(`${reportId}-${eventIndex}`);
      if (!events.length) {
        await deleteDoc(doc(db, "bso_daily_reports", reportId));
        setReports(p => p.filter(r => r.id !== reportId));
        if (selectedId === reportId) setSelectedId("");
      } else {
        const summary = recalc(events);
        await updateDoc(doc(db, "bso_daily_reports", reportId), { events, ...summary, updatedAt: serverTimestamp() });
        setReports(p => p.map(r => r.id === reportId ? { ...r, events, ...summary, updatedAt: new Date() } : r));
      }
      setMessage("Event deleted successfully.");
    } catch (e) { console.error(e); setMessage("Could not delete event."); } finally { setWorking(""); }
  }
  async function markReviewed(reportId) {
    try { setWorking(reportId); await updateDoc(doc(db, "bso_daily_reports", reportId), { reviewStatus: "reviewed", reviewedAt: serverTimestamp(), reviewedBy: user?.username || user?.name || "" }); setReports(p => p.map(r => r.id === reportId ? { ...r, reviewStatus: "reviewed", reviewedAt: new Date(), reviewedBy: user?.username || user?.name || "" } : r)); setMessage("Report marked as reviewed."); }
    catch (e) { console.error(e); setMessage("Could not update report."); } finally { setWorking(""); }
  }
  function exportCsv() {
    const rows = [["Date","Shift","Type","Supervisor","Employee","Passenger","PNR","Flight","Bag Tags","Code 24 Created","BCC Referral","Code 24 Reason","Code 39 Report ID","Fault Station","Loss Code","Bag Type","Bags Checked","Bags Received","World Tracer ID","Status","Review","Comments"], ...filtered.map(e => [e.reportDate,e.shift,e.eventType,e.supervisorName,e.employee,e.passengerName,e.pnr,e.flightNumber,e.bagTags,e.code24Created === true ? "YES" : "NO",e.bccReferral === true ? "YES" : "NO",e.code24Reason,e.reportId,e.faultStation,e.lossCode,e.bagType,e.bagsChecked,e.bagsReceived,e.worldTracerId,e.status || e.reportStatus,e.supervisorReview,e.comments])];
    downloadCsv("bso-daily-management.csv", rows);
  }

  if (!canAccess) return <Card><h2>Access denied</h2></Card>;
  const grid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(190px,1fr))", gap: 10 };
  const th = { padding: "9px 10px", fontSize: 10.5, textTransform: "uppercase", color: "#475569", borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "10px", fontSize: 12.5, borderBottom: "1px solid #eef2f7", verticalAlign: "top" };

  return <div style={{ display: "grid", gap: 16, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
    <div style={{ background: "linear-gradient(135deg,#0f5c91,#1f7cc1 45%,#6ec6e8)", borderRadius: 22, padding: isMobile ? 15 : 22, color: "#fff" }}><div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase", opacity: .8 }}>AEROSTATION HUB | AA BSO</div><h1 style={{ margin: "7px 0 5px", fontSize: isMobile ? 22 : 30 }}>BSO Daily Management</h1><div style={{ fontSize: 13, opacity: .9 }}>KPI dashboard for Code 24 / Bag Returns, Code 39 and other office events.</div></div>

    {message && <Card style={{ padding: 12 }}><div style={{ fontWeight: 800, color: "#1769aa" }}>{message}</div></Card>}

    <Card><div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}><h2 style={{ margin: 0 }}>Filters</h2><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button variant="dark" onClick={() => window.print()}>Print</Button></div></div>
      <div style={grid}>
        <div><Label>Start Date</Label><Input type="date" value={filters.startDate} onChange={e => setFilters(p => ({ ...p, startDate: e.target.value }))} /></div>
        <div><Label>End Date</Label><Input type="date" value={filters.endDate} onChange={e => setFilters(p => ({ ...p, endDate: e.target.value }))} /></div>
        <div><Label>Shift</Label><Select value={filters.shift} onChange={e => setFilters(p => ({ ...p, shift: e.target.value }))}><option value="all">All</option><option>AM</option><option>PM</option><option>MID</option></Select></div>
        <div><Label>Event Type</Label><Select value={filters.eventType} onChange={e => setFilters(p => ({ ...p, eventType: e.target.value }))}><option value="all">All</option><option value="CODE_24">Code 24 / Bag Return</option><option value="CODE_39">Code 39</option><option value="OTHER">Other</option></Select></div>
        <div><Label>Supervisor</Label><Input value={filters.supervisor} onChange={e => setFilters(p => ({ ...p, supervisor: e.target.value }))} /></div>
        <div><Label>Employee</Label><Input value={filters.employee} onChange={e => setFilters(p => ({ ...p, employee: e.target.value }))} /></div>
        <div><Label>Fault Station</Label><Input value={filters.faultStation} onChange={e => setFilters(p => ({ ...p, faultStation: e.target.value }))} /></div>
        <div><Label>Loss Code</Label><Input value={filters.lossCode} onChange={e => setFilters(p => ({ ...p, lossCode: e.target.value }))} /></div>
        <div><Label>Status</Label><Select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}><option value="all">All</option><option value="open">Open</option><option value="closed">Closed</option><option value="pending">Pending</option><option value="submitted">Submitted</option></Select></div>
        <div><Label>Quick Search</Label><Input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="PNR, bag tag, report ID, passenger..." /></div>
      </div>
      <div style={{ marginTop: 12, textAlign: "right" }}><Button variant="secondary" onClick={() => setFilters({ startDate: "", endDate: "", shift: "all", eventType: "all", supervisor: "", employee: "", status: "all", faultStation: "", lossCode: "", search: "" })}>Clear Filters</Button></div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(8,minmax(0,1fr))", gap: 8 }}>
      <Metric label="Total Events" value={totals.total} tone="blue" />
      <Metric label="Bag Return Events" value={totals.code24Events} />
      <Metric label="Code 24 Created" value={totals.code24Created} tone="amber" />
      <Metric label="Code 24 Rate" value={`${totals.code24Rate.toFixed(1)}%`} tone="amber" />
      <Metric label="Code 39" value={totals.code39} tone="red" />
      <Metric label="Code 39 Bags" value={totals.code39Bags} tone="red" />
      <Metric label="Other" value={totals.other} tone="green" />
      <Metric label="Follow-up" value={totals.followUp} tone={totals.followUp ? "amber" : "green"} />
    </div>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}><h2 style={{ margin: 0 }}>BSO Events</h2><div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{loading ? "Loading..." : `${filtered.length} event(s)`}</div></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1250 }}><thead><tr style={{ background: "#f8fbff" }}><th style={th}>Date</th><th style={th}>Type</th><th style={th}>Employee</th><th style={th}>Passenger / PNR</th><th style={th}>Flight</th><th style={th}>Bag Tags</th><th style={th}>Code 24</th><th style={th}>Code 39 ID</th><th style={th}>Fault / Loss</th><th style={th}>Supervisor</th><th style={th}>Actions</th></tr></thead><tbody>
        {!filtered.length ? <tr><td colSpan={11} style={td}>{loading ? "Loading..." : "No data found."}</td></tr> : filtered.map((e, i) => <tr key={`${e.reportIdDoc}-${e.eventIndex}-${i}`}><td style={td}>{e.reportDate}<br/><span style={{ color: "#64748b" }}>{e.shift}</span></td><td style={td}><b>{e.eventType === "CODE_24" ? "Code 24 / Bag Return" : e.eventType === "CODE_39" ? "Code 39" : "Other"}</b></td><td style={td}>{e.employee || "-"}</td><td style={td}>{e.passengerName || "-"}<br/><b>{e.pnr || "-"}</b></td><td style={td}>{e.flightNumber || "-"}</td><td style={td}>{e.bagTags || "-"}</td><td style={td}>{e.eventType === "CODE_24" ? (e.code24Created === true ? "Created" : "Avoided") : "-"}</td><td style={td}>{e.reportId || "-"}</td><td style={td}>{e.faultStation || "-"}<br/>{e.lossCode || "-"}</td><td style={td}>{e.supervisorName || "-"}</td><td style={td}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Button variant="secondary" onClick={() => setSelectedId(e.reportIdDoc)}>View</Button><Button variant="danger" disabled={working === `${e.reportIdDoc}-${e.eventIndex}`} onClick={() => deleteEvent(e.reportIdDoc, e.eventIndex)}>Delete Event</Button></div></td></tr>)}
      </tbody></table></div>
    </Card>

    {selectedReport && <Card style={{ border: "1px solid #bfdbfe" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}><div><div style={{ fontSize: 10, color: "#1769aa", fontWeight: 900, textTransform: "uppercase" }}>Selected Shift Report</div><h2 style={{ margin: "3px 0" }}>{selectedReport.reportDate} · {selectedReport.shift}</h2><div style={{ color: "#64748b", fontSize: 12.5 }}>Supervisor: {selectedReport.supervisorName || "-"} · Created: {formatTs(selectedReport.createdAt)}</div></div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><Button variant="secondary" onClick={() => setSelectedId("")}>Close</Button><Button onClick={() => markReviewed(selectedReport.id)} disabled={working === selectedReport.id}>Mark Reviewed</Button><Button variant="danger" onClick={() => deleteReport(selectedReport.id)} disabled={working === selectedReport.id}>Delete Report</Button></div></div>
      <div style={{ marginBottom: 12, fontSize: 12.5, color: "#475569" }}>Review Status: <b>{selectedReport.reviewStatus || "submitted"}</b>{selectedReport.notes ? ` · Notes: ${selectedReport.notes}` : ""}</div>
      <div style={{ display: "grid", gap: 10 }}>{(selectedReport.events || []).map((e, idx) => <div key={idx} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 13, background: "#f8fbff" }}><div style={{ fontWeight: 900 }}>{idx + 1}. {e.eventType === "CODE_24" ? "Code 24 / Bag Return" : e.eventType === "CODE_39" ? "Code 39" : "Other"}</div><div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.6, color: "#334155" }}><b>Employee:</b> {e.employee || "-"} · <b>Passenger:</b> {e.passengerName || "-"} · <b>PNR:</b> {e.pnr || "-"} · <b>Bag Tags:</b> {e.bagTags || "-"}{e.eventType === "CODE_24" && <> · <b>Code 24:</b> {e.code24Created ? "Created" : "Avoided"} · <b>BCC:</b> {e.bccReferral ? "Yes" : "No"}</>}{e.eventType === "CODE_39" && <> · <b>Report ID:</b> {e.reportId || "-"} · <b>Fault:</b> {e.faultStation || "-"} · <b>Loss:</b> {e.lossCode || "-"} · <b>Bags:</b> {e.bagsChecked ?? 0}</>}<br/><b>Review:</b> {e.supervisorReview || "-"}{e.comments ? <> · <b>Comments:</b> {e.comments}</> : null}</div></div>)}</div>
    </Card>}
  </div>;
}
