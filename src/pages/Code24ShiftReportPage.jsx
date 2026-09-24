// src/pages/Code24ShiftReportPage.jsx

import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const CODE24_REASONS = [
  "Customer insisted on a tracer",
  "DOT requirement",
  "BCC unable to resolve",
  "Supervisor authorization",
  "Operational necessity",
  "Tracer created before supervisor review",
  "Other",
];

const REVIEW_OPTIONS = [
  "Process followed",
  "Coaching provided",
  "Follow-up required",
];

const RETURN_REASONS = [
  "Customer no longer traveling",
  "Customer requested bag return",
  "Flight cancellation / rebooking",
  "Bag requested from operation",
  "Other",
];

function getVisibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "User";
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function todayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function newCase() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    employee: "",
    passengerName: "",
    pnr: "",
    flightNumber: "",
    returnReason: "",
    returnReasonOther: "",
    code24Created: "No",
    code24Reason: "",
    code24ReasonOther: "",
    bccReferral: "No",
    supervisorReview: "Process followed",
    comments: "",
  };
}

function useViewport() {
  const [width, setWidth] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { width, isMobile: width < 768, isTablet: width >= 768 && width < 1100 };
}

function PageCard({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.96)", border: "1px solid #e2e8f0",
      borderRadius: 20, boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
      width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", ...style,
    }}>{children}</div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ display: "block", marginBottom: 6, fontSize: 11, fontWeight: 800,
    color: "#475569", letterSpacing: "0.03em", textTransform: "uppercase" }}>{children}</label>;
}

function TextInput(props) {
  return <input {...props} style={{ width: "100%", minWidth: 0, boxSizing: "border-box",
    border: "1px solid #dbeafe", background: props.disabled ? "#f8fafc" : "#fff",
    borderRadius: 12, padding: "11px 13px", fontSize: 14, color: "#0f172a", outline: "none",
    ...props.style }} />;
}

function SelectInput(props) {
  return <select {...props} style={{ width: "100%", minWidth: 0, boxSizing: "border-box",
    border: "1px solid #dbeafe", background: props.disabled ? "#f8fafc" : "#fff",
    borderRadius: 12, padding: "11px 13px", fontSize: 14, color: "#0f172a", outline: "none",
    ...props.style }}>{props.children}</select>;
}

function TextArea(props) {
  return <textarea {...props} style={{ width: "100%", minWidth: 0, boxSizing: "border-box",
    border: "1px solid #dbeafe", background: props.disabled ? "#f8fafc" : "#fff",
    borderRadius: 12, padding: "11px 13px", fontSize: 14, color: "#0f172a", outline: "none",
    resize: "vertical", minHeight: 82, fontFamily: "inherit", ...props.style }} />;
}

function ActionButton({ children, onClick, variant = "primary", type = "button", disabled = false }) {
  const styles = {
    primary: { background: "linear-gradient(135deg,#0f4c81 0%,#1769aa 55%,#5aa9e6 100%)", color: "#fff", border: "none", boxShadow: "0 10px 20px rgba(23,105,170,.16)" },
    secondary: { background: "#fff", color: "#1769aa", border: "1px solid #cfe7fb", boxShadow: "none" },
    danger: { background: "#fff", color: "#be123c", border: "1px solid #fecdd3", boxShadow: "none" },
  };
  return <button type={type} onClick={onClick} disabled={disabled} style={{ borderRadius: 11,
    padding: "9px 13px", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? .7 : 1, whiteSpace: "nowrap", ...styles[variant] }}>{children}</button>;
}

function MetricCard({ label, value, detail, tone = "blue" }) {
  const tones = {
    blue: ["#eff6ff", "#bfdbfe", "#1d4ed8"],
    amber: ["#fffbeb", "#fde68a", "#b45309"],
    green: ["#ecfdf5", "#a7f3d0", "#047857"],
    slate: ["#f8fafc", "#e2e8f0", "#334155"],
  };
  const [bg, border, color] = tones[tone] || tones.blue;
  return <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "14px 15px", minWidth: 0 }}>
    <div style={{ fontSize: 10.5, fontWeight: 900, color, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    <div style={{ marginTop: 4, fontSize: 25, lineHeight: 1, fontWeight: 900, color: "#0f172a" }}>{value}</div>
    {detail && <div style={{ marginTop: 5, fontSize: 11, color: "#64748b", fontWeight: 700 }}>{detail}</div>}
  </div>;
}

export default function Code24ShiftReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();
  const canAccess = ["supervisor", "duty_manager", "station_manager"].includes(user?.role);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [form, setForm] = useState({
    reportDate: todayLocal(), shift: "", department: "AA BSO",
    supervisorName: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "", certification: false, cases: [newCase()],
  });

  const metrics = useMemo(() => {
    const total = form.cases.length;
    const code24 = form.cases.filter((c) => c.code24Created === "Yes").length;
    const avoided = total - code24;
    const bcc = form.cases.filter((c) => c.bccReferral === "Yes").length;
    const rate = total ? (code24 / total) * 100 : 0;
    return { total, code24, avoided, bcc, rate };
  }, [form.cases]);

  const gridStyle = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fit,minmax(220px,1fr))", gap: isMobile ? 10 : 14 };

  const updateCase = (id, field, value) => {
    setForm((prev) => ({ ...prev, cases: prev.cases.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      if (field === "code24Created" && value === "No") { next.code24Reason = ""; next.code24ReasonOther = ""; }
      if (field === "returnReason" && value !== "Other") next.returnReasonOther = "";
      if (field === "code24Reason" && value !== "Other") next.code24ReasonOther = "";
      return next;
    }) }));
  };

  const addCase = () => setForm((prev) => ({ ...prev, cases: [...prev.cases, newCase()] }));
  const removeCase = (id) => setForm((prev) => ({ ...prev, cases: prev.cases.length === 1 ? prev.cases : prev.cases.filter((c) => c.id !== id) }));

  const validate = () => {
    if (!form.reportDate) return setStatusMessage("Please select the report date."), false;
    if (!form.shift) return setStatusMessage("Please select the shift."), false;
    if (!form.cases.length) return setStatusMessage("Please add at least one bag return request."), false;

    for (let i = 0; i < form.cases.length; i += 1) {
      const c = form.cases[i]; const n = i + 1;
      if (!c.employee.trim()) return setStatusMessage(`Request #${n}: please enter the employee.`), false;
      if (!c.passengerName.trim()) return setStatusMessage(`Request #${n}: please enter the passenger name.`), false;
      if (!c.pnr.trim()) return setStatusMessage(`Request #${n}: please enter the PNR.`), false;
      if (!c.flightNumber.trim()) return setStatusMessage(`Request #${n}: please enter the flight number.`), false;
      if (!c.returnReason) return setStatusMessage(`Request #${n}: please select the bag return reason.`), false;
      if (c.returnReason === "Other" && !c.returnReasonOther.trim()) return setStatusMessage(`Request #${n}: please explain the bag return reason.`), false;
      if (c.code24Created === "Yes" && !c.code24Reason) return setStatusMessage(`Request #${n}: Code 24 was created. Please document why.`), false;
      if (c.code24Reason === "Other" && !c.code24ReasonOther.trim()) return setStatusMessage(`Request #${n}: please explain the Code 24 reason.`), false;
      if (!c.supervisorReview) return setStatusMessage(`Request #${n}: please complete Supervisor Review.`), false;
    }
    if (!form.certification) return setStatusMessage("Please confirm the supervisor certification before submitting."), false;
    return true;
  };

  const handleSubmit = async () => {
    setStatusMessage("");
    if (!validate()) return;
    try {
      setSaving(true);
      const cleanCases = form.cases.map(({ id, ...c }, index) => ({
        sequence: index + 1,
        employee: c.employee.trim(), passengerName: c.passengerName.trim(), pnr: c.pnr.trim().toUpperCase(),
        flightNumber: c.flightNumber.trim().toUpperCase(), returnReason: c.returnReason,
        returnReasonOther: c.returnReason === "Other" ? c.returnReasonOther.trim() : "",
        code24Created: c.code24Created === "Yes", code24Reason: c.code24Created === "Yes" ? c.code24Reason : "",
        code24ReasonOther: c.code24Created === "Yes" && c.code24Reason === "Other" ? c.code24ReasonOther.trim() : "",
        bccReferral: c.bccReferral === "Yes", supervisorReview: c.supervisorReview, comments: c.comments.trim(),
      }));

      await addDoc(collection(db, "code24_shift_reports"), {
        reportDate: form.reportDate, shift: form.shift, department: "AA BSO",
        supervisorName: form.supervisorName.trim() || getVisibleName(user),
        supervisorPosition: form.supervisorPosition || getDefaultPosition(user?.role),
        totalReturnRequests: metrics.total, code24CreatedCount: metrics.code24,
        code24AvoidedCount: metrics.avoided, bccReferralCount: metrics.bcc,
        code24Rate: Number(metrics.rate.toFixed(2)), cases: cleanCases, notes: form.notes.trim(),
        supervisorCertified: true, submittedByUserId: user?.id || "", submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user), submittedByRole: user?.role || "", createdAt: serverTimestamp(),
        status: "submitted", reviewStatus: "submitted",
      });

      setStatusMessage("Code 24 / Bag Return shift report submitted successfully.");
      setForm({ reportDate: todayLocal(), shift: "", department: "AA BSO", supervisorName: getVisibleName(user),
        supervisorPosition: user?.position || getDefaultPosition(user?.role), notes: "", certification: false, cases: [newCase()] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Error saving Code 24 shift report:", err);
      setStatusMessage("Could not submit the Code 24 / Bag Return shift report.");
    } finally { setSaving(false); }
  };

  if (!canAccess) return <div style={{ fontFamily: "Poppins, Inter, system-ui, sans-serif" }}><PageCard style={{ padding: 20 }}><h2 style={{ margin: 0, color: "#0f172a" }}>Access denied</h2><p style={{ color: "#64748b" }}>You do not have permission to submit Code 24 / Bag Return reports.</p></PageCard></div>;

  const statusIsError = statusMessage.toLowerCase().includes("could not") || statusMessage.toLowerCase().includes("please") || statusMessage.includes("Request #");

  return <div style={{ display: "grid", gap: isMobile ? 12 : 18, fontFamily: "Poppins, Inter, system-ui, sans-serif", width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
    <div style={{ background: "linear-gradient(135deg,#0f5c91 0%,#1f7cc1 42%,#6ec6e8 100%)", borderRadius: isMobile ? 18 : 22, padding: isMobile ? 14 : "18px 20px", color: "#fff", boxShadow: "0 18px 42px rgba(23,105,170,.18)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 190, height: 190, borderRadius: 999, background: "rgba(255,255,255,.07)", top: -95, right: -30 }} />
      <div style={{ position: "relative", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <img src="/icons/aerostation-icon.png" alt={APP_NAME} style={{ width: isMobile ? 34 : 40, height: isMobile ? 34 : 40, borderRadius: 10, objectFit: "contain", background: "#fff" }} />
            <p style={{ margin: 0, fontSize: isMobile ? 9 : 10, textTransform: "uppercase", letterSpacing: ".14em", color: "rgba(255,255,255,.78)", fontWeight: 800 }}>{APP_NAME} · AA BSO</p>
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: isMobile ? 20 : 25, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-.035em" }}>Code 24 / Bag Return Shift Report</h1>
          <p style={{ margin: 0, maxWidth: 800, fontSize: isMobile ? 11.5 : 12.5, lineHeight: 1.5, color: "rgba(255,255,255,.9)" }}>Document every bag return request handled during the shift and the operational reason for any Code 24 tracer created.</p>
          <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "rgba(255,255,255,.72)", fontWeight: 700 }}>{APP_SUBTITLE}</p>
        </div>
        <ActionButton variant="secondary" onClick={() => navigate("/dashboard")}>← Back to Dashboard</ActionButton>
      </div>
    </div>

    {statusMessage && <PageCard style={{ padding: isMobile ? 12 : 16 }}><div style={{ background: statusIsError ? "#fff1f2" : "#ecfdf5", border: statusIsError ? "1px solid #fecdd3" : "1px solid #a7f3d0", borderRadius: 14, padding: "12px 14px", color: statusIsError ? "#9f1239" : "#065f46", fontSize: 13, fontWeight: 800 }}>{statusMessage}</div></PageCard>}

    <PageCard style={{ padding: isMobile ? 14 : 20 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: isMobile ? 17 : 19, fontWeight: 800, color: "#0f172a" }}>Shift Header</h2>
      <div style={gridStyle}>
        <div><FieldLabel>Date *</FieldLabel><TextInput type="date" value={form.reportDate} onChange={(e) => setForm((p) => ({ ...p, reportDate: e.target.value }))} /></div>
        <div><FieldLabel>Shift *</FieldLabel><SelectInput value={form.shift} onChange={(e) => setForm((p) => ({ ...p, shift: e.target.value }))}><option value="">Select shift</option><option>AM</option><option>PM</option><option>MID</option></SelectInput></div>
        <div><FieldLabel>Department</FieldLabel><TextInput value="AA BSO" disabled /></div>
        <div><FieldLabel>Supervisor</FieldLabel><TextInput value={form.supervisorName} disabled /></div>
      </div>
    </PageCard>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: isMobile ? 8 : 12 }}>
      <MetricCard label="Return Requests" value={metrics.total} detail="Current shift" tone="blue" />
      <MetricCard label="Code 24 Created" value={metrics.code24} detail="Documented tracers" tone="amber" />
      <MetricCard label="Code 24 Avoided" value={metrics.avoided} detail="Handled without tracer" tone="green" />
      <MetricCard label="Code 24 Rate" value={`${metrics.rate.toFixed(1)}%`} detail={`${metrics.bcc} BCC referral(s)`} tone="slate" />
    </div>

    <div style={{ display: "grid", gap: 14 }}>
      {form.cases.map((item, index) => <PageCard key={item.id} style={{ padding: isMobile ? 14 : 20, border: item.code24Created === "Yes" ? "1px solid #fde68a" : "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div><div style={{ fontSize: 10.5, fontWeight: 900, color: "#1769aa", textTransform: "uppercase", letterSpacing: ".05em" }}>Bag Return Request</div><h2 style={{ margin: "2px 0 0", fontSize: isMobile ? 17 : 19, color: "#0f172a" }}>Request #{index + 1}</h2></div>
          {form.cases.length > 1 && <ActionButton variant="danger" onClick={() => removeCase(item.id)}>Remove Request</ActionButton>}
        </div>

        <div style={gridStyle}>
          <div><FieldLabel>Employee *</FieldLabel><TextInput value={item.employee} onChange={(e) => updateCase(item.id, "employee", e.target.value)} placeholder="Employee handling request" /></div>
          <div><FieldLabel>Passenger Name *</FieldLabel><TextInput value={item.passengerName} onChange={(e) => updateCase(item.id, "passengerName", e.target.value)} placeholder="Passenger name" /></div>
          <div><FieldLabel>PNR *</FieldLabel><TextInput value={item.pnr} onChange={(e) => updateCase(item.id, "pnr", e.target.value)} placeholder="Example: ABC123" /></div>
          <div><FieldLabel>Flight Number *</FieldLabel><TextInput value={item.flightNumber} onChange={(e) => updateCase(item.id, "flightNumber", e.target.value)} placeholder="Example: AA1234" /></div>
          <div><FieldLabel>Bag Return Reason *</FieldLabel><SelectInput value={item.returnReason} onChange={(e) => updateCase(item.id, "returnReason", e.target.value)}><option value="">Select reason</option>{RETURN_REASONS.map((x) => <option key={x}>{x}</option>)}</SelectInput></div>
          <div><FieldLabel>Code 24 Created? *</FieldLabel><SelectInput value={item.code24Created} onChange={(e) => updateCase(item.id, "code24Created", e.target.value)}><option>No</option><option>Yes</option></SelectInput></div>
          <div><FieldLabel>BCC Referral?</FieldLabel><SelectInput value={item.bccReferral} onChange={(e) => updateCase(item.id, "bccReferral", e.target.value)}><option>No</option><option>Yes</option></SelectInput></div>
          <div><FieldLabel>Supervisor Review *</FieldLabel><SelectInput value={item.supervisorReview} onChange={(e) => updateCase(item.id, "supervisorReview", e.target.value)}>{REVIEW_OPTIONS.map((x) => <option key={x}>{x}</option>)}</SelectInput></div>
        </div>

        {item.returnReason === "Other" && <div style={{ marginTop: 12 }}><FieldLabel>Explain Bag Return Reason *</FieldLabel><TextArea value={item.returnReasonOther} onChange={(e) => updateCase(item.id, "returnReasonOther", e.target.value)} /></div>}

        {item.code24Created === "Yes" && <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#92400e", textTransform: "uppercase", marginBottom: 10 }}>Code 24 Documentation Required</div>
          <div style={gridStyle}><div><FieldLabel>Reason Code 24 Was Created *</FieldLabel><SelectInput value={item.code24Reason} onChange={(e) => updateCase(item.id, "code24Reason", e.target.value)}><option value="">Select reason</option>{CODE24_REASONS.map((x) => <option key={x}>{x}</option>)}</SelectInput></div></div>
          {item.code24Reason === "Other" && <div style={{ marginTop: 10 }}><FieldLabel>Explain Code 24 Reason *</FieldLabel><TextArea value={item.code24ReasonOther} onChange={(e) => updateCase(item.id, "code24ReasonOther", e.target.value)} /></div>}
        </div>}

        <div style={{ marginTop: 14 }}><FieldLabel>Comments / Coaching</FieldLabel><TextArea value={item.comments} onChange={(e) => updateCase(item.id, "comments", e.target.value)} placeholder="Document coaching, follow-up, BCC information, or relevant details." /></div>
      </PageCard>)}
    </div>

    <div><ActionButton variant="secondary" onClick={addCase}>+ Add Return Request</ActionButton></div>

    <PageCard style={{ padding: isMobile ? 14 : 20 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: isMobile ? 17 : 19, fontWeight: 800, color: "#0f172a" }}>Shift Notes & Certification</h2>
      <FieldLabel>General Shift Notes</FieldLabel><TextArea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional shift-level notes or recurring trends." />
      <label style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-start", padding: 13, borderRadius: 14, background: "#f8fbff", border: "1px solid #dbeafe", cursor: "pointer" }}>
        <input type="checkbox" checked={form.certification} onChange={(e) => setForm((p) => ({ ...p, certification: e.target.checked }))} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, lineHeight: 1.55, color: "#334155", fontWeight: 700 }}>I confirm that all bag return requests handled during my shift have been reviewed and that any Code 24 tracer created has a documented reason. Any deviation requiring coaching or follow-up has been identified above.</span>
      </label>
    </PageCard>

    <PageCard style={{ padding: isMobile ? 14 : 18 }}><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <ActionButton onClick={handleSubmit} disabled={saving}>{saving ? "Submitting..." : "Submit Code 24 Shift Report"}</ActionButton>
      <ActionButton variant="secondary" onClick={() => navigate("/dashboard")} disabled={saving}>Cancel</ActionButton>
    </div></PageCard>
  </div>;
}
