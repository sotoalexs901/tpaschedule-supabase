// src/pages/BSODailyReportPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const EVENT_TYPES = [
  { value: "CODE_24", label: "Code 24 / Bag Return" },
  { value: "CODE_39", label: "Code 39" },
  { value: "EXCEPTION_DELIVERY", label: "Exception Delivery" },
  { value: "OTHER", label: "Other" },
];

const CODE24_REASONS = [
  "Customer insisted on a tracer",
  "DOT requirement",
  "BCC unable to resolve",
  "Supervisor authorization",
  "Operational necessity",
  "Tracer created before supervisor review",
  "Other",
];

const RETURN_REASONS = [
  "Customer no longer traveling",
  "Customer requested bag return",
  "Flight cancellation / rebooking",
  "Bag requested from operation",
  "Other",
];

const REVIEW_OPTIONS = ["Process followed", "Coaching provided", "Follow-up required"];
const EXCEPTION_REASONS = [
  "Vital Medication / Medical Device",
  "Carseat / Stroller",
  "Wedding Attire",
  "Sporting Equipment",
  "Military",
  "Other",
];

const DELIVERY_METHODS = ["FedEx", "SDD", "Other"];


function getVisibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "User";
}
function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  return "Team Member";
}
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function normalizeKey(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}
function splitBagTags(value) {
  return String(value || "")
    .split(/[;,\s]+/)
    .map((x) => normalizeKey(x))
    .filter(Boolean);
}
function timestampToLabel(value) {
  if (!value) return "-";
  try {
    const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    return d.toLocaleString();
  } catch {
    return "-";
  }
}
function newEvent() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    eventType: "CODE_24",
    employee: "",
    passengerName: "",
    pnr: "",
    flightNumber: "",
    bagTags: "",
    supervisorReview: "Process followed",
    comments: "",
    // Code 24
    returnReason: "",
    returnReasonOther: "",
    code24Created: "No",
    code24Reason: "",
    code24ReasonOther: "",
    bccReferral: "No",
    // Code 39
    reportId: "",
    createDate: "",
    status: "Open",
    faultStation: "",
    lossCode: "39",
    bagType: "",
    bagsChecked: "",
    bagsReceived: "",
    worldTracerId: "",
    // Exception Delivery
    netTracerFile: "",
    exceptionDate: todayLocal(),
    agentCode: "",
    exceptionReason: "",
    exceptionReasonOther: "",
    deliveryMethod: "",
    // Other
    otherCategory: "",
    otherDescription: "",
    actionTaken: "",
    followUpRequired: "No",
  };
}
function useViewport() {
  const [width, setWidth] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  React.useEffect(() => {
    const f = () => setWidth(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return { isMobile: width < 768, isTablet: width >= 768 && width < 1100 };
}
function Card({ children, style = {} }) {
  return <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, boxShadow: "0 14px 34px rgba(15,23,42,.055)", padding: 18, minWidth: 0, ...style }}>{children}</div>;
}
function Label({ children }) {
  return <label style={{ display: "block", marginBottom: 6, fontSize: 11, fontWeight: 850, color: "#475569", textTransform: "uppercase", letterSpacing: ".04em" }}>{children}</label>;
}
function Input(props) {
  return <input {...props} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #dbeafe", borderRadius: 12, padding: "11px 13px", fontSize: 14, outline: "none", ...props.style }} />;
}
function Select(props) {
  return <select {...props} style={{ width: "100%", boxSizing: "border-box", border: "1px solid #dbeafe", borderRadius: 12, padding: "11px 13px", fontSize: 14, background: "#fff", outline: "none", ...props.style }}>{props.children}</select>;
}
function Area(props) {
  return <textarea {...props} style={{ width: "100%", minHeight: 82, boxSizing: "border-box", border: "1px solid #dbeafe", borderRadius: 12, padding: "11px 13px", fontSize: 14, resize: "vertical", fontFamily: "inherit", outline: "none", ...props.style }} />;
}
function Button({ children, onClick, variant = "primary", disabled = false }) {
  const v = {
    primary: { background: "linear-gradient(135deg,#0f4c81,#1769aa 58%,#5aa9e6)", color: "#fff", border: "none" },
    secondary: { background: "#fff", color: "#1769aa", border: "1px solid #cfe7fb" },
    danger: { background: "#fff", color: "#be123c", border: "1px solid #fecdd3" },
  }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius: 11, padding: "10px 14px", fontSize: 12.5, fontWeight: 850, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .65 : 1, ...v }}>{children}</button>;
}
function Metric({ label, value, tone = "blue" }) {
  const tones = { blue: ["#eff6ff", "#bfdbfe"], amber: ["#fffbeb", "#fde68a"], red: ["#fff1f2", "#fecdd3"], green: ["#ecfdf5", "#a7f3d0"], slate: ["#f8fafc", "#e2e8f0"] };
  const [bg, border] = tones[tone] || tones.blue;
  return <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "13px 15px" }}><div style={{ fontSize: 10.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase" }}>{label}</div><div style={{ marginTop: 5, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

export default function BSODailyReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();
  const canAccess = ["supervisor", "duty_manager", "station_manager"].includes(user?.role);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    reportDate: todayLocal(), shift: "", department: "AA BSO",
    supervisorName: getVisibleName(user), supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "", certification: false, events: [newEvent()],
  });
  const [activeTab, setActiveTab] = useState("submit");
  const [todayReports, setTodayReports] = useState([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [expandedReportId, setExpandedReportId] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");

  const loadTodayReports = async () => {
    try {
      setLoadingToday(true);
      const q = query(collection(db, "bso_daily_reports"), where("reportDate", "==", todayLocal()));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ad = typeof a.createdAt?.toMillis === "function" ? a.createdAt.toMillis() : 0;
        const bd = typeof b.createdAt?.toMillis === "function" ? b.createdAt.toMillis() : 0;
        return bd - ad;
      });
      setTodayReports(rows);
    } catch (err) {
      console.error("Error loading today's BSO reports:", err);
      setMessage("Could not load today's BSO reports.");
    } finally {
      setLoadingToday(false);
    }
  };

  useEffect(() => {
    loadTodayReports();
  }, []);

  const todayEventRows = useMemo(() => {
    return todayReports.flatMap((report) =>
      (Array.isArray(report.events) ? report.events : []).map((event, index) => ({
        ...event,
        reportIdDoc: report.id,
        reportDate: report.reportDate,
        shift: report.shift,
        supervisorName: report.supervisorName || report.submittedByName || "",
        createdAt: report.createdAt,
        eventIndex: index,
      }))
    );
  }, [todayReports]);

  const todayMetrics = useMemo(() => {
    const events = todayEventRows;
    return {
      total: events.length,
      code24: events.filter((e) => e.eventType === "CODE_24").length,
      code39: events.filter((e) => e.eventType === "CODE_39").length,
      exceptions: events.filter((e) => e.eventType === "EXCEPTION_DELIVERY").length,
      other: events.filter((e) => e.eventType === "OTHER").length,
    };
  }, [todayEventRows]);

  const grid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fit,minmax(220px,1fr))", gap: 12 };
  const metrics = useMemo(() => {
    const code24Events = form.events.filter(e => e.eventType === "CODE_24");
    const code24Created = code24Events.filter(e => e.code24Created === "Yes").length;
    const code39 = form.events.filter(e => e.eventType === "CODE_39").length;
    const exceptions = form.events.filter(e => e.eventType === "EXCEPTION_DELIVERY");
    const other = form.events.filter(e => e.eventType === "OTHER").length;
    const bagsAffected = form.events.filter(e => e.eventType === "CODE_39").reduce((s,e) => s + (Number(e.bagsChecked) || 0), 0);
    return { total: form.events.length, code24Events: code24Events.length, code24Created, code39, exceptions: exceptions.length, fedEx: exceptions.filter(e => e.deliveryMethod === "FedEx").length, sdd: exceptions.filter(e => e.deliveryMethod === "SDD").length, other, bagsAffected, code24Rate: code24Events.length ? code24Created / code24Events.length * 100 : 0 };
  }, [form.events]);

  const updateEvent = (id, field, value) => setForm(p => ({ ...p, events: p.events.map(e => {
    if (e.id !== id) return e;
    const n = { ...e, [field]: value };
    if (field === "eventType") {
      n.supervisorReview = "Process followed";
    }
    if (field === "code24Created" && value === "No") { n.code24Reason = ""; n.code24ReasonOther = ""; }
    if (field === "returnReason" && value !== "Other") n.returnReasonOther = "";
    if (field === "code24Reason" && value !== "Other") n.code24ReasonOther = "";
    if (field === "exceptionReason" && value !== "Other") n.exceptionReasonOther = "";
    return n;
  }) }));

  const addEvent = () => setForm(p => ({ ...p, events: [...p.events, newEvent()] }));
  const removeEvent = id => setForm(p => ({ ...p, events: p.events.length === 1 ? p.events : p.events.filter(e => e.id !== id) }));

  const validate = () => {
    if (!form.reportDate) return setMessage("Please select the report date."), false;
    if (!form.shift) return setMessage("Please select the shift."), false;
    for (let i = 0; i < form.events.length; i++) {
      const e = form.events[i], n = i + 1;
      if (!e.eventType) return setMessage(`Event #${n}: select an event type.`), false;
      if (!e.employee.trim()) return setMessage(`Event #${n}: enter the employee involved.`), false;
      if ((e.eventType === "CODE_24" || e.eventType === "CODE_39") && !e.pnr.trim()) return setMessage(`Event #${n}: enter the PNR.`), false;
      if (e.eventType === "CODE_24") {
        if (!e.passengerName.trim()) return setMessage(`Event #${n}: enter passenger name.`), false;
        if (!e.flightNumber.trim()) return setMessage(`Event #${n}: enter flight number.`), false;
        if (!e.bagTags.trim()) return setMessage(`Event #${n}: enter the bag tag number.`), false;
        if (!e.returnReason) return setMessage(`Event #${n}: select the bag return reason.`), false;
        if (e.returnReason === "Other" && !e.returnReasonOther.trim()) return setMessage(`Event #${n}: explain the bag return reason.`), false;
        if (e.code24Created === "Yes" && !e.code24Reason) return setMessage(`Event #${n}: document why Code 24 was created.`), false;
        if (e.code24Reason === "Other" && !e.code24ReasonOther.trim()) return setMessage(`Event #${n}: explain the Code 24 reason.`), false;
      }
      if (e.eventType === "CODE_39") {
        if (!e.passengerName.trim()) return setMessage(`Event #${n}: enter passenger name.`), false;
        if (!e.reportId.trim()) return setMessage(`Event #${n}: enter Report ID.`), false;
        if (!e.bagTags.trim()) return setMessage(`Event #${n}: enter bag tag number(s).`), false;
        if (!e.faultStation.trim()) return setMessage(`Event #${n}: enter Fault Station.`), false;
        if (!String(e.lossCode).trim()) return setMessage(`Event #${n}: enter Loss Code.`), false;
      }
      if (e.eventType === "EXCEPTION_DELIVERY") {
        if (!e.netTracerFile.trim()) return setMessage(`Event #${n}: enter the NetTracer File.`), false;
        if (!e.bagTags.trim()) return setMessage(`Event #${n}: enter the bag tag number.`), false;
        if (!e.exceptionDate) return setMessage(`Event #${n}: enter the exception delivery date.`), false;
        if (!e.agentCode.trim()) return setMessage(`Event #${n}: enter the Agent Code.`), false;
        if (!e.exceptionReason) return setMessage(`Event #${n}: select the exception reason.`), false;
        if (e.exceptionReason === "Other" && !e.exceptionReasonOther.trim()) return setMessage(`Event #${n}: explain the exception reason.`), false;
        if (!e.deliveryMethod) return setMessage(`Event #${n}: select the delivery method.`), false;
      }
      if (e.eventType === "OTHER" && !e.otherDescription.trim()) return setMessage(`Event #${n}: describe the event.`), false;
    }
    if (!form.certification) return setMessage("Please confirm the supervisor certification."), false;
    return true;
  };

  const findDuplicates = (eventsToCheck, existingReports) => {
    const existingEvents = existingReports.flatMap((report) =>
      (Array.isArray(report.events) ? report.events : []).map((event) => ({
        ...event,
        sourceReportId: report.id,
        sourceShift: report.shift,
        sourceSupervisor: report.supervisorName || report.submittedByName || "",
      }))
    );

    const duplicates = [];
    const localSeen = [];

    eventsToCheck.forEach((event, idx) => {
      const candidates = [...existingEvents, ...localSeen];
      const pnr = normalizeKey(event.pnr);
      const flight = normalizeKey(event.flightNumber);
      const tags = splitBagTags(event.bagTags);
      const reportId = normalizeKey(event.reportId);
      const wt = normalizeKey(event.worldTracerId);
      const netTracer = normalizeKey(event.netTracerFile);

      for (const existing of candidates) {
        if (existing.eventType !== event.eventType) continue;
        const existingTags = splitBagTags(existing.bagTags);
        const sharedTag = tags.find((tag) => existingTags.includes(tag));

        if (event.eventType === "CODE_24") {
          const samePnr = pnr && pnr === normalizeKey(existing.pnr);
          const sameFlight = !flight || !normalizeKey(existing.flightNumber) || flight === normalizeKey(existing.flightNumber);
          if (samePnr && sharedTag && sameFlight) {
            duplicates.push({
              eventNumber: idx + 1,
              eventType: "Code 24",
              reason: `PNR ${event.pnr} and Bag Tag ${sharedTag} already exist${existing.sourceShift ? ` in ${existing.sourceShift} shift` : " in this submission"}.`,
            });
            break;
          }
        }

        if (event.eventType === "CODE_39") {
          const sameReportId = reportId && reportId === normalizeKey(existing.reportId);
          const sameWt = wt && wt === normalizeKey(existing.worldTracerId);
          if (sameReportId || sameWt || sharedTag) {
            const reason = sameReportId
              ? `Report ID ${event.reportId} already exists.`
              : sameWt
              ? `World Tracer ID ${event.worldTracerId} already exists.`
              : `Bag Tag ${sharedTag} already exists in another Code 39.`;
            duplicates.push({ eventNumber: idx + 1, eventType: "Code 39", reason });
            break;
          }
        }

        if (event.eventType === "EXCEPTION_DELIVERY") {
          const sameNetTracer = netTracer && netTracer === normalizeKey(existing.netTracerFile);
          if (sameNetTracer && sharedTag) {
            duplicates.push({
              eventNumber: idx + 1,
              eventType: "Exception Delivery",
              reason: `NetTracer File ${event.netTracerFile} and Bag Tag ${sharedTag} already exist.`,
            });
            break;
          }
        }
      }

      localSeen.push(event);
    });

    return duplicates;
  };

  const buildCleanEvents = () => form.events.map(({ id, ...e }, index) => ({
    sequence: index + 1,
    ...e,
    employee: e.employee.trim(), passengerName: e.passengerName.trim(), pnr: e.pnr.trim().toUpperCase(),
    flightNumber: e.flightNumber.trim().toUpperCase(), bagTags: e.bagTags.trim(), reportId: e.reportId.trim().toUpperCase(),
    faultStation: e.faultStation.trim().toUpperCase(), worldTracerId: e.worldTracerId.trim().toUpperCase(),
    netTracerFile: e.netTracerFile.trim().toUpperCase(), agentCode: e.agentCode.trim().toUpperCase(),
    bagsChecked: e.eventType === "CODE_39" ? Number(e.bagsChecked || 0) : 0,
    bagsReceived: e.eventType === "CODE_39" ? Number(e.bagsReceived || 0) : 0,
    code24Created: e.eventType === "CODE_24" ? e.code24Created === "Yes" : false,
    bccReferral: e.eventType === "CODE_24" ? e.bccReferral === "Yes" : false,
    followUpRequired: e.eventType === "OTHER" ? e.followUpRequired === "Yes" : e.supervisorReview === "Follow-up required",
  }));

  const saveReport = async ({ overrideDuplicate = false } = {}) => {
    const events = buildCleanEvents();

    try {
      // Re-read the selected date immediately before saving so duplicate
      // event/file checks include anything submitted while this page was open.
      const q = query(collection(db, "bso_daily_reports"), where("reportDate", "==", form.reportDate));
      const snap = await getDocs(q);
      const reportsForDate = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (!overrideDuplicate) {
        const duplicates = findDuplicates(events, reportsForDate);
        if (duplicates.length) {
          setDuplicateWarning({ duplicates });
          setDuplicateOverrideReason("");
          return;
        }
      }

      setSaving(true);

      // Multiple BSO Daily Reports are allowed for the same date and shift.
      // We only interrupt submission when an event/file appears to be a duplicate.
      const duplicateOverride = overrideDuplicate
        ? {
            overrideReason: duplicateOverrideReason.trim(),
            overriddenAt: new Date().toISOString(),
            overriddenBy: getVisibleName(user),
          }
        : null;

      const eventsWithOverride = duplicateOverride
        ? events.map((event) => ({ ...event, duplicateOverride }))
        : events;

      await addDoc(collection(db, "bso_daily_reports"), {
        reportDate: form.reportDate, shift: form.shift, department: "AA BSO",
        supervisorName: form.supervisorName, supervisorPosition: form.supervisorPosition,
        notes: form.notes.trim(), events: eventsWithOverride,
        totalEvents: metrics.total, code24BagReturnEvents: metrics.code24Events, code24CreatedCount: metrics.code24Created,
        code24Rate: Number(metrics.code24Rate.toFixed(2)), code39Count: metrics.code39,
        exceptionDeliveryCount: metrics.exceptions, exceptionFedExCount: metrics.fedEx, exceptionSddCount: metrics.sdd,
        exceptionOtherMethodCount: metrics.exceptions - metrics.fedEx - metrics.sdd, otherCount: metrics.other,
        code39BagsAffected: metrics.bagsAffected,
        submittedByUserId: user?.id || "", submittedByUsername: user?.username || "", submittedByName: getVisibleName(user), submittedByRole: user?.role || "",
        createdAt: serverTimestamp(), status: "submitted", reviewStatus: "submitted",
      });

      setMessage("BSO Daily Report submitted successfully. You may submit additional reports for the same day or shift as long as the event/file is not duplicated.");
      setDuplicateWarning(null);
      setDuplicateOverrideReason("");
      setForm({ reportDate: todayLocal(), shift: "", department: "AA BSO", supervisorName: getVisibleName(user), supervisorPosition: user?.position || getDefaultPosition(user?.role), notes: "", certification: false, events: [newEvent()] });
      await loadTodayReports();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Error saving BSO Daily Report:", err);
      setMessage("Could not submit the BSO Daily Report.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    setMessage("");
    if (!validate()) return;
    await saveReport({ overrideDuplicate: false });
  };

  const continueDuplicate = async () => {
    if (!duplicateOverrideReason.trim()) {
      setMessage("Please explain why this is not a duplicate before continuing.");
      return;
    }
    setDuplicateWarning(null);
    await saveReport({ overrideDuplicate: true });
  };


  if (!canAccess) return <Card><h2>Access denied</h2></Card>;
  const error = /please|could not|event #/i.test(message);

  return <div style={{ display: "grid", gap: 16, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
    <div style={{ background: "linear-gradient(135deg,#0f5c91,#1f7cc1 45%,#6ec6e8)", borderRadius: 22, padding: isMobile ? 15 : 20, color: "#fff", boxShadow: "0 18px 42px rgba(23,105,170,.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase", opacity: .8 }}>{APP_NAME} Â· AA BSO</div><h1 style={{ margin: "7px 0 4px", fontSize: isMobile ? 21 : 27 }}>BSO Daily Report</h1><div style={{ fontSize: 12.5, opacity: .9 }}>Daily office activity tracking for Code 24 / Bag Returns, Code 39, Exception Delivery and other BSO events.</div><div style={{ marginTop: 4, fontSize: 10.5, opacity: .7 }}>{APP_SUBTITLE}</div></div>
        <Button variant="secondary" onClick={() => navigate("/dashboard")}>â Back to Dashboard</Button>
      </div>
    </div>

    {message && <Card style={{ padding: 13 }}><div style={{ padding: 11, borderRadius: 12, background: error ? "#fff1f2" : "#ecfdf5", border: `1px solid ${error ? "#fecdd3" : "#a7f3d0"}`, color: error ? "#9f1239" : "#065f46", fontWeight: 800, fontSize: 13 }}>{message}</div></Card>}

    <Card style={{ padding: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button type="button" onClick={() => setActiveTab("submit")} style={{ border: activeTab === "submit" ? "1px solid #9ecdf3" : "1px solid #e2e8f0", background: activeTab === "submit" ? "linear-gradient(135deg,#e7f4ff,#f4faff)" : "#fff", color: activeTab === "submit" ? "#0f4c81" : "#64748b", borderRadius: 13, padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}>Submit Report</button>
        <button type="button" onClick={() => setActiveTab("today")} style={{ border: activeTab === "today" ? "1px solid #9ecdf3" : "1px solid #e2e8f0", background: activeTab === "today" ? "linear-gradient(135deg,#e7f4ff,#f4faff)" : "#fff", color: activeTab === "today" ? "#0f4c81" : "#64748b", borderRadius: 13, padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}>BSO Reports Today ({todayMetrics.total})</button>
      </div>
    </Card>

    {activeTab === "submit" && <>
    <Card><h2 style={{ marginTop: 0 }}>Shift Header</h2><div style={grid}>
      <div><Label>Date *</Label><Input type="date" value={form.reportDate} onChange={e => setForm(p => ({ ...p, reportDate: e.target.value }))} /></div>
      <div><Label>Shift *</Label><Select value={form.shift} onChange={e => setForm(p => ({ ...p, shift: e.target.value }))}><option value="">Select shift</option><option>AM</option><option>PM</option><option>MID</option></Select></div>
      <div><Label>Department</Label><Input value="AA BSO" disabled /></div>
      <div><Label>Supervisor</Label><Input value={form.supervisorName} disabled /></div>
    </div></Card>


    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(8,minmax(0,1fr))", gap: 9 }}>
      <Metric label="Total Events" value={metrics.total} />
      <Metric label="Code 24 Created" value={metrics.code24Created} tone="amber" />
      <Metric label="Code 24 Rate" value={`${metrics.code24Rate.toFixed(1)}%`} tone="slate" />
      <Metric label="Code 39" value={metrics.code39} tone="red" />
      <Metric label="Code 39 Bags" value={metrics.bagsAffected} tone="red" />
      <Metric label="Exception Delivery" value={metrics.exceptions} tone="blue" />
      <Metric label="FedEx / SDD" value={`${metrics.fedEx} / ${metrics.sdd}`} tone="slate" />
      <Metric label="Other" value={metrics.other} tone="green" />
    </div>

    {form.events.map((e, i) => <Card key={e.id} style={{ border: e.eventType === "CODE_39" ? "1px solid #fecdd3" : e.eventType === "CODE_24" ? "1px solid #fde68a" : e.eventType === "EXCEPTION_DELIVERY" ? "1px solid #bae6fd" : "1px solid #dbeafe" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}><div><div style={{ fontSize: 10, fontWeight: 900, color: "#1769aa", textTransform: "uppercase" }}>BSO Event</div><h2 style={{ margin: "2px 0 0" }}>Event #{i + 1}</h2></div>{form.events.length > 1 && <Button variant="danger" onClick={() => removeEvent(e.id)}>Remove</Button>}</div>
      <div style={grid}>
        <div><Label>Event Type *</Label><Select value={e.eventType} onChange={x => updateEvent(e.id, "eventType", x.target.value)}>{EVENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></div>
        <div><Label>Employee Involved *</Label><Input value={e.employee} onChange={x => updateEvent(e.id, "employee", x.target.value)} /></div>
        <div><Label>Passenger Name{(e.eventType === "CODE_24" || e.eventType === "CODE_39") ? " *" : ""}</Label><Input value={e.passengerName} onChange={x => updateEvent(e.id, "passengerName", x.target.value)} /></div>
        <div><Label>PNR{(e.eventType === "CODE_24" || e.eventType === "CODE_39") ? " *" : ""}</Label><Input value={e.pnr} onChange={x => updateEvent(e.id, "pnr", x.target.value)} /></div>
        <div><Label>Flight Number</Label><Input value={e.flightNumber} onChange={x => updateEvent(e.id, "flightNumber", x.target.value)} /></div>
        <div><Label>Supervisor Review *</Label><Select value={e.supervisorReview} onChange={x => updateEvent(e.id, "supervisorReview", x.target.value)}>{REVIEW_OPTIONS.map(o => <option key={o}>{o}</option>)}</Select></div>
      </div>

      {e.eventType === "CODE_24" && <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#fffbeb", border: "1px solid #fde68a" }}>
        <h3 style={{ margin: "0 0 12px", color: "#92400e" }}>Code 24 / Bag Return Details</h3>
        <div style={grid}>
          <div><Label>Bag Tag Number(s) *</Label><Input value={e.bagTags} onChange={x => updateEvent(e.id, "bagTags", x.target.value)} placeholder="Example: 8001835788" /></div>
          <div><Label>Bag Return Reason *</Label><Select value={e.returnReason} onChange={x => updateEvent(e.id, "returnReason", x.target.value)}><option value="">Select</option>{RETURN_REASONS.map(o => <option key={o}>{o}</option>)}</Select></div>
          <div><Label>Code 24 Created?</Label><Select value={e.code24Created} onChange={x => updateEvent(e.id, "code24Created", x.target.value)}><option>No</option><option>Yes</option></Select></div>
          <div><Label>BCC Referral?</Label><Select value={e.bccReferral} onChange={x => updateEvent(e.id, "bccReferral", x.target.value)}><option>No</option><option>Yes</option></Select></div>
          {e.code24Created === "Yes" && <div><Label>Why was Code 24 created? *</Label><Select value={e.code24Reason} onChange={x => updateEvent(e.id, "code24Reason", x.target.value)}><option value="">Select</option>{CODE24_REASONS.map(o => <option key={o}>{o}</option>)}</Select></div>}
        </div>
        {e.returnReason === "Other" && <div style={{ marginTop: 10 }}><Label>Explain Return Reason *</Label><Area value={e.returnReasonOther} onChange={x => updateEvent(e.id, "returnReasonOther", x.target.value)} /></div>}
        {e.code24Reason === "Other" && <div style={{ marginTop: 10 }}><Label>Explain Code 24 Reason *</Label><Area value={e.code24ReasonOther} onChange={x => updateEvent(e.id, "code24ReasonOther", x.target.value)} /></div>}
      </div>}

      {e.eventType === "CODE_39" && <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#fff1f2", border: "1px solid #fecdd3" }}>
        <h3 style={{ margin: "0 0 5px", color: "#9f1239" }}>Code 39 Details</h3>
        <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 12 }}>Fields mirror the Code 39 tracking sheet used by AA BSO.</div>
        <div style={grid}>
          <div><Label>Report ID *</Label><Input value={e.reportId} onChange={x => updateEvent(e.id, "reportId", x.target.value)} placeholder="TPAAA..." /></div>
          <div><Label>Create Date</Label><Input type="datetime-local" value={e.createDate} onChange={x => updateEvent(e.id, "createDate", x.target.value)} /></div>
          <div><Label>Status</Label><Select value={e.status} onChange={x => updateEvent(e.id, "status", x.target.value)}><option>Open</option><option>Closed</option><option>Pending</option></Select></div>
          <div><Label>Fault Station *</Label><Input value={e.faultStation} onChange={x => updateEvent(e.id, "faultStation", x.target.value)} /></div>
          <div><Label>Loss Code *</Label><Input value={e.lossCode} onChange={x => updateEvent(e.id, "lossCode", x.target.value)} /></div>
          <div><Label>Bag Type</Label><Input value={e.bagType} onChange={x => updateEvent(e.id, "bagType", x.target.value)} placeholder="Example: 02" /></div>
          <div><Label>Bag Tag Number(s) *</Label><Input value={e.bagTags} onChange={x => updateEvent(e.id, "bagTags", x.target.value)} placeholder="Comma-separated if multiple" /></div>
          <div><Label>Bags Checked</Label><Input type="number" min="0" value={e.bagsChecked} onChange={x => updateEvent(e.id, "bagsChecked", x.target.value)} /></div>
          <div><Label>Bags Received</Label><Input type="number" min="0" value={e.bagsReceived} onChange={x => updateEvent(e.id, "bagsReceived", x.target.value)} /></div>
          <div><Label>World Tracer ID</Label><Input value={e.worldTracerId} onChange={x => updateEvent(e.id, "worldTracerId", x.target.value)} /></div>
        </div>
      </div>}

      {e.eventType === "EXCEPTION_DELIVERY" && <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
        <h3 style={{ margin: "0 0 12px", color: "#075985" }}>Exception Delivery Details</h3>
        <div style={grid}>
          <div><Label>NetTracer File *</Label><Input value={e.netTracerFile} onChange={x => updateEvent(e.id, "netTracerFile", x.target.value)} placeholder="NetTracer file number" /></div>
          <div><Label>Bag Tag Number *</Label><Input value={e.bagTags} onChange={x => updateEvent(e.id, "bagTags", x.target.value)} placeholder="Bag tag number" /></div>
          <div><Label>Date *</Label><Input type="date" value={e.exceptionDate} onChange={x => updateEvent(e.id, "exceptionDate", x.target.value)} /></div>
          <div><Label>Agent Code *</Label><Input value={e.agentCode} onChange={x => updateEvent(e.id, "agentCode", x.target.value)} placeholder="Agent code" /></div>
          <div><Label>Exception Reason *</Label><Select value={e.exceptionReason} onChange={x => updateEvent(e.id, "exceptionReason", x.target.value)}><option value="">Select reason</option>{EXCEPTION_REASONS.map(o => <option key={o}>{o}</option>)}</Select></div>
          <div><Label>Delivery Method *</Label><Select value={e.deliveryMethod} onChange={x => updateEvent(e.id, "deliveryMethod", x.target.value)}><option value="">Select method</option>{DELIVERY_METHODS.map(o => <option key={o}>{o}</option>)}</Select></div>
        </div>
        {e.exceptionReason === "Other" && <div style={{ marginTop: 10 }}><Label>Explain Exception Reason *</Label><Area value={e.exceptionReasonOther} onChange={x => updateEvent(e.id, "exceptionReasonOther", x.target.value)} /></div>}
      </div>}

      {e.eventType === "OTHER" && <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
        <h3 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>Other BSO Event</h3>
        <div style={grid}>
          <div><Label>Category</Label><Input value={e.otherCategory} onChange={x => updateEvent(e.id, "otherCategory", x.target.value)} placeholder="Customer, baggage, process..." /></div>
          <div><Label>Follow-up Required?</Label><Select value={e.followUpRequired} onChange={x => updateEvent(e.id, "followUpRequired", x.target.value)}><option>No</option><option>Yes</option></Select></div>
        </div>
        <div style={{ marginTop: 10 }}><Label>Description *</Label><Area value={e.otherDescription} onChange={x => updateEvent(e.id, "otherDescription", x.target.value)} /></div>
        <div style={{ marginTop: 10 }}><Label>Action Taken</Label><Area value={e.actionTaken} onChange={x => updateEvent(e.id, "actionTaken", x.target.value)} /></div>
      </div>}

      <div style={{ marginTop: 14 }}><Label>Comments / Coaching</Label><Area value={e.comments} onChange={x => updateEvent(e.id, "comments", x.target.value)} /></div>
    </Card>)}

    <div><Button variant="secondary" onClick={addEvent}>+ Add BSO Event</Button></div>

    <Card><h2 style={{ marginTop: 0 }}>Shift Notes & Certification</h2><Label>General Shift Notes</Label><Area value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /><label style={{ marginTop: 13, display: "flex", gap: 10, padding: 12, border: "1px solid #dbeafe", borderRadius: 13, background: "#f8fbff", fontSize: 12.5, fontWeight: 700 }}><input type="checkbox" checked={form.certification} onChange={e => setForm(p => ({ ...p, certification: e.target.checked }))} />I confirm that the BSO events handled during this shift were reviewed and documented accurately.</label></Card>

    <Card><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Submit BSO Daily Report"}</Button><Button variant="secondary" onClick={() => navigate("/dashboard")} disabled={saving}>Cancel</Button></div></Card>
    </>}

    {activeTab === "today" && <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(5,minmax(0,1fr))", gap: 9 }}>
        <Metric label="Events Today" value={todayMetrics.total} />
        <Metric label="Code 24" value={todayMetrics.code24} tone="amber" />
        <Metric label="Code 39" value={todayMetrics.code39} tone="red" />
        <Metric label="Exception Delivery" value={todayMetrics.exceptions} tone="blue" />
        <Metric label="Other" value={todayMetrics.other} tone="green" />
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div><h2 style={{ margin: 0 }}>BSO Reports Today</h2><div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>Review what has already been submitted before adding another event.</div></div>
          <Button variant="secondary" onClick={loadTodayReports} disabled={loadingToday}>{loadingToday ? "Refreshing..." : "Refresh"}</Button>
        </div>

        {loadingToday ? <div style={{ padding: 16, color: "#64748b", fontWeight: 700 }}>Loading today's reports...</div> : todayReports.length === 0 ? <div style={{ padding: 16, background: "#f8fafc", borderRadius: 14, color: "#64748b", fontWeight: 700 }}>No BSO reports have been submitted today.</div> : <div style={{ display: "grid", gap: 10 }}>
          {todayReports.map((report) => {
            const events = Array.isArray(report.events) ? report.events : [];
            const expanded = expandedReportId === report.id;
            return <div key={report.id} style={{ border: "1px solid #dbeafe", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: 13, background: "#f8fbff", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#1769aa", fontWeight: 900, textTransform: "uppercase" }}>{report.shift || "-"} Shift Â· {events.length} Event{events.length === 1 ? "" : "s"}</div>
                  <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{report.supervisorName || report.submittedByName || "Supervisor"}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{timestampToLabel(report.createdAt)}</div>
                </div>
                <Button variant="secondary" onClick={() => setExpandedReportId(expanded ? "" : report.id)}>{expanded ? "Hide Details" : "View Details"}</Button>
              </div>
              {expanded && <div style={{ padding: 13, display: "grid", gap: 9 }}>
                {events.map((event, index) => <div key={`${report.id}-${index}`} style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{event.eventType === "CODE_24" ? "Code 24 / Bag Return" : event.eventType === "CODE_39" ? "Code 39" : event.eventType === "EXCEPTION_DELIVERY" ? "Exception Delivery" : "Other"}</div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Event #{event.sequence || index + 1}</div>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 7, fontSize: 12 }}>
                    <div><b>Employee:</b> {event.employee || "-"}</div>
                    <div><b>PNR:</b> {event.pnr || "-"}</div>
                    <div><b>Bag Tag:</b> {event.bagTags || "-"}</div>
                    <div><b>Flight:</b> {event.flightNumber || "-"}</div>
                    {event.eventType === "CODE_39" && <div><b>Report ID:</b> {event.reportId || "-"}</div>}
                    {event.eventType === "CODE_39" && <div><b>World Tracer:</b> {event.worldTracerId || "-"}</div>}
                    {event.eventType === "CODE_24" && <div><b>Code 24 Created:</b> {event.code24Created === true || event.code24Created === "Yes" ? "Yes" : "No"}</div>}
                    {event.eventType === "EXCEPTION_DELIVERY" && <div><b>NetTracer:</b> {event.netTracerFile || "-"} Â· <b>Method:</b> {event.deliveryMethod || "-"} Â· <b>Reason:</b> {event.exceptionReason || "-"}</div>}
                  </div>
                </div>)}
              </div>}
            </div>;
          })}
        </div>}
      </Card>
    </>}

    {duplicateWarning && <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,.48)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 20, boxShadow: "0 24px 70px rgba(15,23,42,.28)", overflow: "hidden" }}>
        <div style={{ padding: "17px 19px", background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
          <div style={{ fontSize: 11, color: "#c2410c", fontWeight: 900, textTransform: "uppercase" }}>Possible Duplicate Found</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#7c2d12" }}>This event may already be in BSO Daily Reports</div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 700, lineHeight: 1.55 }}>Review the matching information before creating another entry.</div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {duplicateWarning.duplicates.map((d, index) => <div key={index} style={{ padding: 10, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 12.5, fontWeight: 800 }}>Event #{d.eventNumber} Â· {d.eventType}: {d.reason}</div>)}
          </div>
          <div style={{ marginTop: 14 }}><Label>If this is a different event, explain why *</Label><Area value={duplicateOverrideReason} onChange={(e) => setDuplicateOverrideReason(e.target.value)} placeholder="Example: Separate bag, new customer interaction, correction, or other valid reason." /></div>
          <div style={{ marginTop: 14, display: "flex", gap: 9, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => { setDuplicateWarning(null); setActiveTab("today"); }}>View Reports Today</Button>
            <Button onClick={continueDuplicate} disabled={saving}>{saving ? "Saving..." : "Continue Anyway"}</Button>
            <Button variant="danger" onClick={() => { setDuplicateWarning(null); setDuplicateOverrideReason(""); }}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
