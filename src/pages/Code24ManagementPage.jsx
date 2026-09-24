// src/pages/Code24ManagementPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const fmtDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).split("-");
  return y && m && d ? `${m}/${d}/${y}` : String(value);
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function Card({ children, style = {} }) {
  return <div style={{ background: "rgba(255,255,255,.97)", border: "1px solid #e2e8f0", borderRadius: 20, boxShadow: "0 14px 34px rgba(15,23,42,.055)", minWidth: 0, ...style }}>{children}</div>;
}

function Button({ children, onClick, variant = "primary", disabled = false }) {
  const variants = {
    primary: { background: "linear-gradient(135deg,#0f4c81,#1769aa 55%,#5aa9e6)", color: "#fff", border: "none" },
    secondary: { background: "#fff", color: "#1769aa", border: "1px solid #cfe7fb" },
    green: { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" },
  };
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius: 11, padding: "9px 13px", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .65 : 1, ...variants[variant] }}>{children}</button>;
}

function Metric({ label, value, detail }) {
  return <Card style={{ padding: 15 }}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#1769aa", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div><div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>{value}</div><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 3 }}>{detail}</div></Card>;
}

export default function Code24ManagementPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const canAccess = ["duty_manager", "station_manager"].includes(user?.role);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [savingId, setSavingId] = useState("");
  const [filters, setFilters] = useState({ search: "", shift: "All", status: "All", from: "", to: "" });

  useEffect(() => {
    if (!canAccess) return undefined;
    const unsub = onSnapshot(collection(db, "code24_shift_reports"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => String(b.reportDate || "").localeCompare(String(a.reportDate || "")) || String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0)));
      setReports(rows); setLoading(false); setError("");
    }, (err) => { console.error("Code 24 management listener error:", err); setError("Could not load Code 24 reports."); setLoading(false); });
    return unsub;
  }, [canAccess]);

  const filtered = useMemo(() => reports.filter((r) => {
    const q = filters.search.trim().toLowerCase();
    const haystack = [r.supervisorName, r.shift, r.reportDate, ...(r.cases || []).flatMap((c) => [c.employee, c.passengerName, c.pnr, c.flightNumber])].join(" ").toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (filters.shift !== "All" && r.shift !== filters.shift) return false;
    if (filters.status !== "All" && (r.reviewStatus || "submitted") !== filters.status) return false;
    if (filters.from && String(r.reportDate || "") < filters.from) return false;
    if (filters.to && String(r.reportDate || "") > filters.to) return false;
    return true;
  }), [reports, filters]);

  const metrics = useMemo(() => {
    const requests = filtered.reduce((n, r) => n + Number(r.totalReturnRequests || 0), 0);
    const code24 = filtered.reduce((n, r) => n + Number(r.code24CreatedCount || 0), 0);
    const avoided = filtered.reduce((n, r) => n + Number(r.code24AvoidedCount || 0), 0);
    const bcc = filtered.reduce((n, r) => n + Number(r.bccReferralCount || 0), 0);
    return { reports: filtered.length, requests, code24, avoided, bcc, rate: requests ? (code24 / requests) * 100 : 0 };
  }, [filtered]);

  const markReviewed = async (report) => {
    try {
      setSavingId(report.id);
      await updateDoc(doc(db, "code24_shift_reports", report.id), {
        reviewStatus: "reviewed", reviewedAt: serverTimestamp(), reviewedByUserId: user?.id || "", reviewedByUsername: user?.username || "", reviewedByName: user?.displayName || user?.fullName || user?.name || user?.username || "Manager",
      });
      setSelected((s) => s?.id === report.id ? { ...s, reviewStatus: "reviewed" } : s);
    } catch (err) { console.error("Could not mark Code 24 report reviewed:", err); setError("Could not update the report review status."); }
    finally { setSavingId(""); }
  };

  const exportCsv = () => {
    const header = ["Report Date","Shift","Supervisor","Employee","Passenger","PNR","Flight","Return Reason","Code 24 Created","Code 24 Reason","BCC Referral","Supervisor Review","Comments","Report Status"];
    const lines = [header.map(csvCell).join(",")];
    filtered.forEach((r) => (r.cases || []).forEach((c) => lines.push([
      r.reportDate, r.shift, r.supervisorName, c.employee, c.passengerName, c.pnr, c.flightNumber,
      c.returnReason === "Other" ? c.returnReasonOther : c.returnReason,
      c.code24Created ? "Yes" : "No", c.code24Created ? (c.code24Reason === "Other" ? c.code24ReasonOther : c.code24Reason) : "",
      c.bccReferral ? "Yes" : "No", c.supervisorReview, c.comments, r.reviewStatus || "submitted",
    ].map(csvCell).join(","))));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Code24_Management_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!canAccess) return <Card style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>Access denied</h2><p>You do not have permission to manage Code 24 reports.</p></Card>;

  const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #dbeafe", borderRadius: 11, padding: "10px 11px", fontSize: 13, background: "#fff", color: "#0f172a" };

  return <div style={{ display: "grid", gap: 16, fontFamily: "Poppins, Inter, system-ui, sans-serif", minWidth: 0 }}>
    <div style={{ background: "linear-gradient(135deg,#0f5c91 0%,#1f7cc1 42%,#6ec6e8 100%)", borderRadius: 22, padding: "18px 20px", color: "#fff", boxShadow: "0 18px 42px rgba(23,105,170,.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 800, opacity: .8 }}>{APP_NAME} · AA BSO</div><h1 style={{ margin: "5px 0 4px", fontSize: 25 }}>Code 24 Management</h1><p style={{ margin: 0, fontSize: 12.5, opacity: .9 }}>Review bag return activity, tracer reasons, BCC referrals and supervisor follow-up.</p><div style={{ marginTop: 4, fontSize: 10.5, opacity: .72 }}>{APP_SUBTITLE}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>Export CSV</Button><Button variant="secondary" onClick={() => navigate("/dashboard")}>← Dashboard</Button></div>
      </div>
    </div>

    {error && <Card style={{ padding: 14, color: "#9f1239", background: "#fff1f2", borderColor: "#fecdd3", fontWeight: 800 }}>{error}</Card>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
      <Metric label="Reports" value={metrics.reports} detail="Matching filters" /><Metric label="Return Requests" value={metrics.requests} detail="Total requests" /><Metric label="Code 24 Created" value={metrics.code24} detail={`${metrics.rate.toFixed(1)}% tracer rate`} /><Metric label="Code 24 Avoided" value={metrics.avoided} detail="Handled without tracer" /><Metric label="BCC Referrals" value={metrics.bcc} detail="Documented referrals" />
    </div>

    <Card style={{ padding: 16 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
      <input style={inputStyle} placeholder="Search employee, PNR, flight..." value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
      <select style={inputStyle} value={filters.shift} onChange={(e) => setFilters((p) => ({ ...p, shift: e.target.value }))}><option>All</option><option>AM</option><option>PM</option><option>MID</option></select>
      <select style={inputStyle} value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}><option>All</option><option value="submitted">Submitted</option><option value="reviewed">Reviewed</option></select>
      <input style={inputStyle} type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
      <input style={inputStyle} type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
      <Button variant="secondary" onClick={() => setFilters({ search: "", shift: "All", status: "All", from: "", to: "" })}>Clear Filters</Button>
    </div></Card>

    <Card style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}><thead><tr style={{ background: "#f8fbff" }}>{["Date","Shift","Supervisor","Requests","Code 24","Rate","BCC","Status","Action"].map((h) => <th key={h} style={{ padding: "11px 12px", textAlign: "left", fontSize: 10.5, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan="9" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Loading reports...</td></tr> : !filtered.length ? <tr><td colSpan="9" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>No Code 24 reports match the current filters.</td></tr> : filtered.map((r) => <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: 12, fontWeight: 800 }}>{fmtDate(r.reportDate)}</td><td style={{ padding: 12 }}>{r.shift || "—"}</td><td style={{ padding: 12 }}>{r.supervisorName || "—"}</td><td style={{ padding: 12 }}>{r.totalReturnRequests || 0}</td><td style={{ padding: 12, fontWeight: 900, color: Number(r.code24CreatedCount) ? "#b45309" : "#047857" }}>{r.code24CreatedCount || 0}</td><td style={{ padding: 12 }}>{Number(r.code24Rate || 0).toFixed(1)}%</td><td style={{ padding: 12 }}>{r.bccReferralCount || 0}</td><td style={{ padding: 12 }}><span style={{ padding: "5px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 900, background: (r.reviewStatus || "submitted") === "reviewed" ? "#ecfdf5" : "#eff6ff", color: (r.reviewStatus || "submitted") === "reviewed" ? "#047857" : "#1d4ed8" }}>{(r.reviewStatus || "submitted").toUpperCase()}</span></td><td style={{ padding: 12 }}><Button variant="secondary" onClick={() => setSelected(r)}>View</Button></td></tr>)}</tbody></table></div>
    </Card>

    {selected && <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15,23,42,.48)", display: "grid", placeItems: "center", padding: 16 }}><div onClick={(e) => e.stopPropagation()} style={{ width: "min(1050px,96vw)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 24px 70px rgba(15,23,42,.25)" }}>
      <div style={{ padding: 18, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><div style={{ fontSize: 11, color: "#1769aa", fontWeight: 900, textTransform: "uppercase" }}>Code 24 Shift Report</div><h2 style={{ margin: "3px 0 0" }}>{fmtDate(selected.reportDate)} · {selected.shift}</h2><div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>Supervisor: {selected.supervisorName}</div></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{(selected.reviewStatus || "submitted") !== "reviewed" && <Button variant="green" disabled={savingId === selected.id} onClick={() => markReviewed(selected)}>{savingId === selected.id ? "Saving..." : "Mark Reviewed"}</Button>}<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></div></div>
      <div style={{ padding: 18, display: "grid", gap: 12 }}>{(selected.cases || []).map((c, i) => <Card key={i} style={{ padding: 15, borderColor: c.code24Created ? "#fde68a" : "#e2e8f0" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>Request #{c.sequence || i + 1} · {c.passengerName || "Passenger"}</strong><span style={{ fontWeight: 900, color: c.code24Created ? "#b45309" : "#047857" }}>{c.code24Created ? "CODE 24 CREATED" : "NO CODE 24"}</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12, fontSize: 12.5 }}><div><b>Employee:</b> {c.employee || "—"}</div><div><b>PNR:</b> {c.pnr || "—"}</div><div><b>Flight:</b> {c.flightNumber || "—"}</div><div><b>BCC Referral:</b> {c.bccReferral ? "Yes" : "No"}</div><div><b>Return Reason:</b> {c.returnReason === "Other" ? c.returnReasonOther : c.returnReason}</div><div><b>Supervisor Review:</b> {c.supervisorReview || "—"}</div>{c.code24Created && <div style={{ gridColumn: "1 / -1" }}><b>Code 24 Reason:</b> {c.code24Reason === "Other" ? c.code24ReasonOther : c.code24Reason}</div>}{c.comments && <div style={{ gridColumn: "1 / -1" }}><b>Comments / Coaching:</b> {c.comments}</div>}</div></Card>)}{selected.notes && <Card style={{ padding: 15 }}><b>Shift Notes:</b><div style={{ marginTop: 6, color: "#475569" }}>{selected.notes}</div></Card>}</div>
    </div></div>}
  </div>;
}
