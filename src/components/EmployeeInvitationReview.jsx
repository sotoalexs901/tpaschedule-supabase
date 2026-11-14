import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const field = { padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 9, minWidth: 0, width: "100%", boxSizing: "border-box" };
const button = { padding: "10px 14px", border: "1px solid #93c5fd", borderRadius: 9, background: "#eff6ff", color: "#1e40af", fontWeight: 700, cursor: "pointer" };
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const clean = v => String(v ?? "").trim();
const normalize = row => {
  const keys = Object.fromEntries(Object.entries(row).map(([k,v]) => [k.toLowerCase().replace(/[^a-z]/g,""),v]));
  const first = clean(keys.firstname || keys.nombre || "");
  const last = clean(keys.lastname || keys.apellido || "");
  const full = clean(keys.name || keys.fullname || "");
  const email = clean(keys.email || keys.emailaddress).toLowerCase();
  const phone = clean(keys.phone || keys.mobile || keys.cell || keys.telefono || keys.phonenumber);
  return { first: first || (full ? full.split(/\s+/)[0] : ""), last: last || (full ? full.split(/\s+/).slice(1).join(" ") : ""), email, phone, selected: true };
};
export default function EmployeeInvitationReview() {
  const [rows, setRows] = useState([]);
  const [manual, setManual] = useState({ first: "", last: "", email: "", phone: "" });
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const counts = useMemo(() => {
    const seen = new Set();
    return rows.map(r => {
      const errors = [];
      if (!r.first || !r.last) errors.push("Name required");
      if (!emailValid(r.email)) errors.push("Invalid email");
      if (seen.has(r.email)) errors.push("Duplicate email");
      if (r.email) seen.add(r.email);
      return { ...r, errors };
    });
  }, [rows]);
  const ready = counts.filter(r => r.selected && !r.errors.length);
  function append(row) { setRows(old => [...old, { ...row, selected: true }]); setReviewed(false); }
  async function loadFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("Maximum file size: 2 MB.");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" });
      if (!data.length || data.length > 500) throw Error("Use a sheet containing 1 to 500 employees.");
      setRows(data.map(normalize)); setReviewed(false);
    } catch (err) { setError(err.message || "Could not read Excel file."); }
    e.target.value = "";
  }
  function edit(index, key, value) { setRows(old => old.map((r,i) => i === index ? { ...r, [key]: value } : r)); setReviewed(false); }
  return <section style={{ padding: 20, borderRadius: 22, background: "#fff", border: "1px solid #dbeafe", marginBottom: 22 }}>
    <h2 style={{ marginTop: 0 }}>Employee invitations · Email & password</h2>
    <p style={{ color: "#475569", fontSize: 13 }}>Prepare employees individually or import an Excel file. Review all details before sending invitations.</p>
    <p style={{ padding: 10, background: "#fff7ed", borderRadius: 9, fontSize: 12 }}>Review-only pilot: invitation delivery and account activation are not yet enabled. No emails or user accounts are created here.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 8 }}>
      {["first","last","email","phone"].map(key => <input key={key} style={field} placeholder={{first:"First name",last:"Last name",email:"Email",phone:"Cell number"}[key]} value={manual[key]} onChange={e => setManual(v => ({ ...v, [key]: e.target.value }))}/>)}
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
      <button type="button" style={button} onClick={() => { append({ ...manual, email: manual.email.toLowerCase() }); setManual({first:"",last:"",email:"",phone:""}); }}>＋ Add to review</button>
      <label style={{ ...button, display: "inline-block" }}>Upload Excel (.xlsx, .xls)<input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={loadFile}/></label>
      <button type="button" style={button} onClick={() => { setRows([{ first: "TEST", last: "EMPLOYEE", email: "alexs.napoles90@gmail.com", phone: "8135275594", selected: true }]); setReviewed(false); }}>Load test employee</button>
    </div>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {!!rows.length && <>
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 690, fontSize: 13 }}>
          <thead><tr>{["Include","First name","Last name","Email","Cell","Validation",""].map(v => <th key={v} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>{v}</th>)}</tr></thead>
          <tbody>{counts.map((r,i) => <tr key={i}>
            <td><input type="checkbox" checked={r.selected} onChange={e => edit(i,"selected",e.target.checked)}/></td>
            {["first","last","email","phone"].map(k => <td key={k}><input style={{ ...field, padding: 6, fontSize: 12 }} value={r[k]} onChange={e => edit(i,k,e.target.value)}/></td>)}
            <td style={{ color: r.errors.length ? "#b91c1c" : "#15803d" }}>{r.errors.join(", ") || "Ready"}</td>
            <td><button type="button" onClick={() => { setRows(old => old.filter((_,j) => i !== j)); setReviewed(false); }}>Remove</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p style={{ fontSize: 13 }}>{ready.length} valid employees selected · {counts.filter(r => r.errors.length).length} records need correction</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={button} onClick={() => { setRows(old => old.map(r => ({ ...r, selected: true }))); setReviewed(false); }}>Select all</button>
        <button type="button" style={button} onClick={() => { setRows(old => old.map(r => ({ ...r, selected: false }))); setReviewed(false); }}>Clear selection</button>
        <button type="button" style={button} disabled={!ready.length} onClick={() => setReviewed(true)}>Approve review ({ready.length})</button>
        <button type="button" style={{ ...button, opacity: .5, cursor: "not-allowed" }} disabled title="Available after verified admin invitation service is connected">Send invitations (not enabled)</button>
      </div>
      {reviewed && <p role="status" style={{ color: "#166534" }}>Review approved locally for {ready.length} employees. No invitations have been sent.</p>}
    </>}
  </section>;
}
