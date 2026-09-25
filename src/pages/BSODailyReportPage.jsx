// src/pages/BSODailyReportPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import * as XLSX from "xlsx";

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


function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getExcelValue(row, aliases) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });

  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      return normalized[key];
    }
  }
  return "";
}

function excelDateToDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
      }
    } catch {
      // Fall through to the normal Date parser.
    }
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToInputString(value) {
  const d = excelDateToDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateToDateTimeLocal(value) {
  const d = excelDateToDate(value);
  if (!d) return "";
  return `${dateToInputString(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function countBagTags(value) {
  return splitBagTags(value).length;
}

function eventTypeLabel(type) {
  if (type === "CODE_24") return "Code 24 / Bag Return";
  if (type === "CODE_39") return "Code 39";
  if (type === "EXCEPTION_DELIVERY") return "Exception Delivery";
  return "Other";
}

function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedDeep);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedDeep(v)])
    );
  }
  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildBsoPrintableHtml(report, events) {
  const logoUrl = typeof window !== "undefined"
    ? `${window.location.origin}/icons/aerostation-icon.png`
    : "/icons/aerostation-icon.png";

  const safeEvents = Array.isArray(events) ? events : [];
  const rowsHtml = safeEvents.map((event, index) => {
    let details = "";
    if (event.eventType === "CODE_24") {
      details = [
        event.returnReason === "Other" ? event.returnReasonOther : event.returnReason,
        event.code24Created === true || event.code24Created === "Yes" ? "Code 24 created" : "No Code 24",
        event.bccReferral === true || event.bccReferral === "Yes" ? "BCC referral" : "",
      ].filter(Boolean).join(" | ");
    } else if (event.eventType === "CODE_39") {
      details = [
        event.faultStation ? `Fault: ${event.faultStation}` : "",
        event.lossCode ? `Loss: ${event.lossCode}` : "",
        event.worldTracerId ? `WT: ${event.worldTracerId}` : "",
      ].filter(Boolean).join(" | ");
    } else if (event.eventType === "EXCEPTION_DELIVERY") {
      details = [event.deliveryMethod, event.exceptionReason, event.netTracerFile].filter(Boolean).join(" | ");
    } else {
      details = [event.otherCategory, event.otherDescription, event.actionTaken].filter(Boolean).join(" | ");
    }

    const fileRef = event.reportId || event.netTracerFile || event.worldTracerId || "-";
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(eventTypeLabel(event.eventType))}</td>
        <td>${escapeHtml(event.employee || "-")}</td>
        <td>${escapeHtml(event.passengerName || "-")}</td>
        <td>${escapeHtml(event.pnr || "-")}</td>
        <td>${escapeHtml(event.bagTags || "-")}</td>
        <td>${escapeHtml(fileRef)}</td>
        <td>${escapeHtml(event.flightNumber || "-")}</td>
        <td>${escapeHtml(event.status || "-")}</td>
        <td>${escapeHtml(details || "-")}</td>
      </tr>
    `;
  }).join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(APP_NAME)} - BSO Daily Report</title>
        <style>
          * { box-sizing: border-box; }
          @page { size: landscape; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 20px; color: #111827; background: #fff; }
          .brand { display:flex; justify-content:space-between; align-items:center; gap:18px; padding-bottom:14px; border-bottom:2px solid #e5eef7; }
          .brand-left { display:flex; align-items:center; gap:12px; }
          .logo { width:52px; height:52px; border-radius:14px; border:1px solid #dbeafe; object-fit:contain; }
          .brand-name { font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#1769aa; }
          .brand-sub { margin-top:3px; font-size:11px; color:#64748b; font-weight:700; }
          .doc-label { font-size:11px; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
          .title-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin:18px 0 14px; }
          h1 { margin:0; font-size:27px; letter-spacing:-.03em; }
          .subtitle { margin-top:5px; color:#475569; font-size:13px; font-weight:700; }
          .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; margin-bottom:14px; }
          .card { border:1px solid #dbeafe; background:#f8fbff; border-radius:11px; padding:10px 12px; }
          .label { font-size:9px; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
          .value { margin-top:4px; font-size:13px; font-weight:800; color:#0f172a; }
          table { width:100%; border-collapse:collapse; margin-top:10px; }
          th, td { border:1px solid #dbeafe; padding:7px 8px; text-align:left; vertical-align:top; font-size:9.5px; }
          th { background:#f8fbff; font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#475569; }
          .notes { margin-top:12px; border:1px solid #dbeafe; background:#f8fbff; border-radius:11px; padding:10px 12px; font-size:11px; line-height:1.5; }
          .footer { margin-top:18px; padding-top:10px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:8.5px; text-align:center; }
        </style>
      </head>
      <body>
        <div class="brand">
          <div class="brand-left">
            <img class="logo" src="${logoUrl}" alt="${escapeHtml(APP_NAME)}" />
            <div><div class="brand-name">${escapeHtml(APP_NAME)}</div><div class="brand-sub">${escapeHtml(APP_SUBTITLE)}</div></div>
          </div>
          <div class="doc-label">BSO Daily Management Report</div>
        </div>

        <div class="title-row">
          <div><h1>BSO Daily Report</h1><div class="subtitle">AA BSO | ${escapeHtml(report.reportDate || "-")} | ${escapeHtml(report.shift || "-")} Shift</div></div>
          <div class="doc-label">${escapeHtml(String(report.status || "submitted").toUpperCase())}</div>
        </div>

        <div class="grid">
          <div class="card"><div class="label">Report Date</div><div class="value">${escapeHtml(report.reportDate || "-")}</div></div>
          <div class="card"><div class="label">Shift</div><div class="value">${escapeHtml(report.shift || "-")}</div></div>
          <div class="card"><div class="label">Supervisor / Submitted By</div><div class="value">${escapeHtml(report.supervisorName || report.submittedByName || "-")}</div></div>
          <div class="card"><div class="label">Total Events</div><div class="value">${safeEvents.length}</div></div>
        </div>

        <table>
          <thead><tr><th>#</th><th>Type</th><th>Employee</th><th>Passenger</th><th>PNR</th><th>Bag Tag(s)</th><th>File / Report ID</th><th>Flight</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="10">No events found.</td></tr>'}</tbody>
        </table>

        ${report.notes ? `<div class="notes"><strong>Notes:</strong><br/>${escapeHtml(report.notes).replace(/\n/g, "<br/>")}</div>` : ""}
        <div class="footer">${escapeHtml(APP_NAME)} | ${escapeHtml(APP_SUBTITLE)}</div>
      </body>
    </html>
  `;
}

export default function BSODailyReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();
  const canAccess = ["supervisor", "duty_manager", "station_manager"].includes(user?.role);
  const canBulkUpload = user?.role === "station_manager";
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    reportDate: todayLocal(), shift: "", department: "AA BSO",
    supervisorName: getVisibleName(user), supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "", certification: false, events: [newEvent()],
  });
  const [activeTab, setActiveTab] = useState("submit");
  const [mtdReports, setMtdReports] = useState([]);
  const [loadingMtd, setLoadingMtd] = useState(true);
  const [expandedReportId, setExpandedReportId] = useState("");
  const [selectedHistoryCase, setSelectedHistoryCase] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("MTD");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyType, setHistoryType] = useState("ALL");
  const [historySupervisor, setHistorySupervisor] = useState("");
  const [historyEmployee, setHistoryEmployee] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkShift, setBulkShift] = useState("IMPORTED");
  const [bulkReading, setBulkReading] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");

  const getMonthBounds = () => {
    const today = todayLocal();
    const month = today.slice(0, 7);
    const [year, monthNum] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
  };

  const loadMtdReports = async () => {
    try {
      setLoadingMtd(true);
      const { start, end } = getMonthBounds();
      const q = query(
        collection(db, "bso_daily_reports"),
        where("reportDate", ">=", start),
        where("reportDate", "<=", end)
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ad = typeof a.createdAt?.toMillis === "function" ? a.createdAt.toMillis() : 0;
        const bd = typeof b.createdAt?.toMillis === "function" ? b.createdAt.toMillis() : 0;
        return bd - ad;
      });
      setMtdReports(rows);
    } catch (err) {
      console.error("Error loading MTD BSO reports:", err);
      setMessage("Could not load BSO MTD reports.");
    } finally {
      setLoadingMtd(false);
    }
  };

  useEffect(() => {
    loadMtdReports();
  }, []);

  const mtdEventRows = useMemo(() => {
    return mtdReports.flatMap((report) =>
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
  }, [mtdReports]);

  const historyRowsBase = useMemo(() => {
    const today = todayLocal();
    return mtdEventRows.filter((row) => {
      if (historyFilter === "TODAY" && row.reportDate !== today) return false;
      if (historyFilter === "RANGE") {
        if (historyStartDate && row.reportDate < historyStartDate) return false;
        if (historyEndDate && row.reportDate > historyEndDate) return false;
      }
      if (historySupervisor && !String(row.supervisorName || "").toLowerCase().includes(historySupervisor.toLowerCase().trim())) return false;
      if (historyEmployee && !String(row.employee || "").toLowerCase().includes(historyEmployee.toLowerCase().trim())) return false;
      const search = historySearch.trim().toLowerCase();
      if (search) {
        const haystack = [
          row.pnr, row.bagTags, row.flightNumber, row.reportId, row.worldTracerId,
          row.netTracerFile, row.employee, row.supervisorName, row.passengerName, row.otherCategory, row.otherDescription
        ].map((v) => String(v || "").toLowerCase()).join(" ");
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [mtdEventRows, historyFilter, historyStartDate, historyEndDate, historySupervisor, historyEmployee, historySearch]);

  const historyRows = useMemo(() => {
    if (historyType === "ALL") return historyRowsBase;
    return historyRowsBase.filter((row) => row.eventType === historyType);
  }, [historyRowsBase, historyType]);

  const historyMetrics = useMemo(() => {
    const events = historyRowsBase;
    return {
      total: events.length,
      code24: events.filter((e) => e.eventType === "CODE_24").length,
      code39: events.filter((e) => e.eventType === "CODE_39").length,
      exceptions: events.filter((e) => e.eventType === "EXCEPTION_DELIVERY").length,
      other: events.filter((e) => e.eventType === "OTHER").length,
    };
  }, [historyRowsBase]);

  const filteredHistoryReports = useMemo(() => {
    const allowed = new Set(historyRows.map((r) => r.reportIdDoc));
    return mtdReports.filter((r) => allowed.has(r.id));
  }, [mtdReports, historyRows]);

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
          const sameReportId = reportId && reportId === normalizeKey(existing.reportId);
          if (sameReportId || (samePnr && sharedTag && sameFlight)) {
            duplicates.push({
              eventNumber: idx + 1,
              eventType: "Code 24",
              reason: sameReportId
                ? `Report ID ${event.reportId} already exists.`
                : `PNR ${event.pnr} and Bag Tag ${sharedTag} already exist${existing.sourceShift ? ` in ${existing.sourceShift} shift` : " in this submission"}.`,
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
      await loadMtdReports();
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


  const parseBulkExcel = async (file) => {
    if (!canBulkUpload || !file) return;
    setBulkReading(true);
    setBulkMessage("");
    setBulkRows([]);
    setBulkFileName(file.name || "");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) throw new Error("No worksheet found in this Excel file.");

      const sheet = workbook.Sheets[firstSheetName];
      const sourceRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
      const parsedRows = [];

      sourceRows.forEach((row, index) => {
        const passengerName = String(getExcelValue(row, ["Last Name, First Name", "Passenger Name", "Name"]) || "").trim();
        const reportId = String(getExcelValue(row, ["Report ID", "File", "File ID"]) || "").trim().toUpperCase();
        const pnr = String(getExcelValue(row, ["PNR", "Record Locator"]) || "").trim().toUpperCase();
        const createDateRaw = getExcelValue(row, ["Create Date", "Created Date", "Date"]);
        const status = String(getExcelValue(row, ["Status"]) || "").trim() || "Closed";
        const faultStation = String(getExcelValue(row, ["Fault Station", "Fault"]) || "").trim().toUpperCase();
        const lossCodeRaw = getExcelValue(row, ["Loss Code", "Code"]);
        const lossCode = String(lossCodeRaw || "").trim();
        const bagTags = String(getExcelValue(row, ["Bag Tag (s)", "Bag Tags", "Bag Tag(s)", "Bag Tag"]) || "").trim();
        const worldTracerId = String(getExcelValue(row, ["World Tracer ID", "WorldTracer ID", "WT ID"]) || "").trim().toUpperCase();
        const employee = String(getExcelValue(row, ["Employee", "Employee Involved", "Agent", "Agent Name", "Agent Code"]) || "").trim();
        const flightNumber = String(getExcelValue(row, ["Flight", "Flight Number", "Flight #"]) || "").trim().toUpperCase();

        const sourceRowNumber = index + 2;
        if (!passengerName && !reportId && !pnr && !bagTags && !lossCode) return;
        if (passengerName.toLowerCase() === "delayed" && !reportId && !pnr) return;

        const numericLossCode = Number(lossCode);
        const eventType = numericLossCode === 24 ? "CODE_24" : numericLossCode === 39 ? "CODE_39" : "";
        const reportDate = dateToInputString(createDateRaw) || todayLocal();
        const createDate = dateToDateTimeLocal(createDateRaw);

        const validationIssues = [];
        if (!eventType) validationIssues.push(`Unsupported Loss Code: ${lossCode || "blank"}`);
        if (!reportId) validationIssues.push("Missing Report ID");
        if (!pnr) validationIssues.push("Missing PNR");
        if (!bagTags) validationIssues.push("Missing Bag Tag(s)");
        if (eventType === "CODE_39" && !faultStation) validationIssues.push("Missing Fault Station");

        const event = {
          ...newEvent(),
          sequence: 0,
          eventType: eventType || "OTHER",
          employee: employee || "Excel Import",
          passengerName,
          pnr,
          flightNumber,
          bagTags,
          supervisorReview: "Imported by Station Manager",
          comments: `Bulk Excel import from ${file.name || "uploaded workbook"} (source row ${sourceRowNumber}).`,
          reportId,
          createDate,
          status,
          faultStation,
          lossCode: lossCode || (eventType === "CODE_24" ? "24" : eventType === "CODE_39" ? "39" : ""),
          bagsChecked: eventType === "CODE_39" ? countBagTags(bagTags) : 0,
          bagsReceived: 0,
          worldTracerId,
          returnReason: eventType === "CODE_24" ? "Customer requested bag return" : "",
          code24Created: eventType === "CODE_24",
          code24Reason: "",
          bccReferral: false,
          followUpRequired: false,
          importedFromExcel: true,
          importSourceFile: file.name || "",
          importSourceRow: sourceRowNumber,
        };

        parsedRows.push({
          sourceRowNumber,
          reportDate,
          event,
          status: validationIssues.length ? "INVALID" : "READY",
          reason: validationIssues.join("; "),
        });
      });

      const validCandidates = parsedRows.filter((row) => row.status === "READY");
      const existingSnap = await getDocs(collection(db, "bso_daily_reports"));
      const existingReports = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const duplicates = findDuplicates(validCandidates.map((row) => row.event), existingReports);
      const duplicateMap = new Map(duplicates.map((item) => [item.eventNumber - 1, item.reason]));

      let candidateIndex = -1;
      const finalRows = parsedRows.map((row) => {
        if (row.status !== "READY") return row;
        candidateIndex += 1;
        const duplicateReason = duplicateMap.get(candidateIndex);
        return duplicateReason
          ? { ...row, status: "DUPLICATE", reason: duplicateReason }
          : row;
      });

      setBulkRows(finalRows);
      const readyCount = finalRows.filter((row) => row.status === "READY").length;
      const duplicateCount = finalRows.filter((row) => row.status === "DUPLICATE").length;
      const invalidCount = finalRows.filter((row) => row.status === "INVALID").length;
      setBulkMessage(`Excel reviewed: ${readyCount} ready, ${duplicateCount} duplicate, ${invalidCount} invalid.`);
    } catch (err) {
      console.error("Error reading BSO bulk Excel:", err);
      setBulkMessage(`Could not read this Excel file. ${err?.message || ""}`.trim());
      setBulkRows([]);
    } finally {
      setBulkReading(false);
    }
  };

  const importBulkRows = async () => {
    if (!canBulkUpload) return;
    const readyRows = bulkRows.filter((row) => row.status === "READY");
    if (!readyRows.length) {
      setBulkMessage("There are no unique rows ready to import.");
      return;
    }

    try {
      setBulkImporting(true);
      setBulkMessage("");

      // Re-check duplicates immediately before committing the import.
      const existingSnap = await getDocs(collection(db, "bso_daily_reports"));
      const existingReports = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const duplicates = findDuplicates(readyRows.map((row) => row.event), existingReports);
      const duplicateIndexes = new Set(duplicates.map((item) => item.eventNumber - 1));
      const rowsToImport = readyRows.filter((_, index) => !duplicateIndexes.has(index));

      if (!rowsToImport.length) {
        setBulkRows((prev) => prev.map((row) => row.status === "READY" ? { ...row, status: "DUPLICATE", reason: "Duplicate detected during final pre-import check." } : row));
        setBulkMessage("No rows were imported because all ready rows are now duplicates.");
        return;
      }

      const groups = new Map();
      rowsToImport.forEach((row) => {
        const key = row.reportDate || todayLocal();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row.event);
      });

      const batch = writeBatch(db);
      const currentName = getVisibleName(user);

      groups.forEach((events, reportDate) => {
        const normalizedEvents = events.map((event, index) =>
          removeUndefinedDeep({ ...event, sequence: index + 1 })
        );
        const code24Events = normalizedEvents.filter((event) => event.eventType === "CODE_24");
        const code39Events = normalizedEvents.filter((event) => event.eventType === "CODE_39");
        const exceptions = normalizedEvents.filter((event) => event.eventType === "EXCEPTION_DELIVERY");
        const otherEvents = normalizedEvents.filter((event) => event.eventType === "OTHER");
        const code24CreatedCount = code24Events.filter((event) => event.code24Created === true || event.code24Created === "Yes").length;
        const code39BagsAffected = code39Events.reduce((sum, event) => sum + Number(event.bagsChecked || 0), 0);
        const reportRef = doc(collection(db, "bso_daily_reports"));

        batch.set(reportRef, {
          reportDate,
          shift: bulkShift,
          department: "AA BSO",
          supervisorName: currentName,
          supervisorPosition: user?.position || "Station Manager",
          notes: `Bulk Excel import: ${bulkFileName || "uploaded workbook"}`,
          events: normalizedEvents,
          totalEvents: normalizedEvents.length,
          code24BagReturnEvents: code24Events.length,
          code24CreatedCount,
          code24Rate: code24Events.length ? Number(((code24CreatedCount / code24Events.length) * 100).toFixed(2)) : 0,
          code39Count: code39Events.length,
          exceptionDeliveryCount: exceptions.length,
          exceptionFedExCount: exceptions.filter((event) => event.deliveryMethod === "FedEx").length,
          exceptionSddCount: exceptions.filter((event) => event.deliveryMethod === "SDD").length,
          exceptionOtherMethodCount: exceptions.filter((event) => event.deliveryMethod && !["FedEx", "SDD"].includes(event.deliveryMethod)).length,
          otherCount: otherEvents.length,
          code39BagsAffected,
          submittedByUserId: user?.id || "",
          submittedByUsername: user?.username || "",
          submittedByName: currentName,
          submittedByRole: user?.role || "station_manager",
          bulkImport: true,
          bulkImportFileName: bulkFileName || "",
          bulkImportCount: normalizedEvents.length,
          bulkImportedBy: currentName,
          bulkImportedByUserId: user?.id || "",
          bulkImportedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          status: "submitted",
          reviewStatus: "submitted",
        });
      });

      await batch.commit();

      const importedKeys = new Set(rowsToImport.map((row) => `${row.sourceRowNumber}__${row.event.reportId}__${row.event.pnr}`));
      setBulkRows((prev) => prev.map((row) => importedKeys.has(`${row.sourceRowNumber}__${row.event.reportId}__${row.event.pnr}`) ? { ...row, status: "IMPORTED", reason: "Imported successfully" } : row));
      setBulkMessage(`Imported ${rowsToImport.length} unique BSO case${rowsToImport.length === 1 ? "" : "s"}. Duplicate and invalid rows were not imported.`);
      await loadMtdReports();
    } catch (err) {
      console.error("Error bulk importing BSO reports:", err);
      setBulkMessage(
        `Could not import the Excel rows. ${err?.code ? `[${err.code}] ` : ""}${err?.message || "Unknown Firestore error."}`
      );
    } finally {
      setBulkImporting(false);
    }
  };

  const handlePrintReport = (report, events) => {
    if (!report) return;
    const printWindow = window.open("", "_blank", "width=1200,height=850");
    if (!printWindow) {
      setMessage("Please allow pop-ups to print the BSO report.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildBsoPrintableHtml(report, events));
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };


  if (!canAccess) return <Card><h2>Access denied</h2></Card>;
  const error = /please|could not|event #/i.test(message);

  return <div style={{ display: "grid", gap: 16, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
    <div style={{ background: "linear-gradient(135deg,#0f5c91,#1f7cc1 45%,#6ec6e8)", borderRadius: 22, padding: isMobile ? 15 : 20, color: "#fff", boxShadow: "0 18px 42px rgba(23,105,170,.18)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".15em", textTransform: "uppercase", opacity: .8 }}>{APP_NAME} | AA BSO</div><h1 style={{ margin: "7px 0 4px", fontSize: isMobile ? 21 : 27 }}>BSO Daily Report</h1><div style={{ fontSize: 12.5, opacity: .9 }}>Daily office activity tracking for Code 24 / Bag Returns, Code 39, Exception Delivery and other BSO events.</div><div style={{ marginTop: 4, fontSize: 10.5, opacity: .7 }}>{APP_SUBTITLE}</div></div>
        <Button variant="secondary" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      </div>
    </div>

    {message && <Card style={{ padding: 13 }}><div style={{ padding: 11, borderRadius: 12, background: error ? "#fff1f2" : "#ecfdf5", border: `1px solid ${error ? "#fecdd3" : "#a7f3d0"}`, color: error ? "#9f1239" : "#065f46", fontWeight: 800, fontSize: 13 }}>{message}</div></Card>}

    <Card style={{ padding: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: canBulkUpload ? "repeat(3,minmax(0,1fr))" : "1fr 1fr", gap: 8 }}>
        <button type="button" onClick={() => setActiveTab("submit")} style={{ border: activeTab === "submit" ? "1px solid #9ecdf3" : "1px solid #e2e8f0", background: activeTab === "submit" ? "linear-gradient(135deg,#e7f4ff,#f4faff)" : "#fff", color: activeTab === "submit" ? "#0f4c81" : "#64748b", borderRadius: 13, padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}>Submit Report</button>
        <button type="button" onClick={() => setActiveTab("history")} style={{ border: activeTab === "history" ? "1px solid #9ecdf3" : "1px solid #e2e8f0", background: activeTab === "history" ? "linear-gradient(135deg,#e7f4ff,#f4faff)" : "#fff", color: activeTab === "history" ? "#0f4c81" : "#64748b", borderRadius: 13, padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}>BSO MTD Reports ({historyMetrics.total})</button>
        {canBulkUpload && <button type="button" onClick={() => setActiveTab("bulk")} style={{ border: activeTab === "bulk" ? "1px solid #9ecdf3" : "1px solid #e2e8f0", background: activeTab === "bulk" ? "linear-gradient(135deg,#e7f4ff,#f4faff)" : "#fff", color: activeTab === "bulk" ? "#0f4c81" : "#64748b", borderRadius: 13, padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}>Bulk Excel Upload</button>}
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


    {activeTab === "bulk" && canBulkUpload && <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: "#1769aa", textTransform: "uppercase", letterSpacing: ".08em" }}>Station Manager Only</div>
            <h2 style={{ margin: "4px 0 6px" }}>Bulk Excel Upload</h2>
            <div style={{ color: "#64748b", fontSize: 12.5, fontWeight: 700, lineHeight: 1.55 }}>Upload the Code 24 or Code 39 Excel export to create multiple BSO cases at once. Existing files are checked before import and duplicates are skipped.</div>
          </div>
          <div style={{ padding: "8px 11px", borderRadius: 999, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: 11, fontWeight: 900 }}>AA BSO BULK IMPORT</div>
        </div>

        <div style={{ ...grid, marginTop: 16 }}>
          <div>
            <Label>Imported Shift</Label>
            <Select value={bulkShift} onChange={(e) => setBulkShift(e.target.value)}>
              <option value="IMPORTED">Imported / Historical</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
              <option value="MID">MID</option>
            </Select>
          </div>
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}>
            <Label>Excel File (.xlsx / .xls)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) parseBulkExcel(file);
                e.target.value = "";
              }}
              disabled={bulkReading || bulkImporting}
            />
          </div>
        </div>

        {bulkFileName && <div style={{ marginTop: 11, padding: 10, borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12.5, color: "#475569", fontWeight: 750 }}><b>Selected file:</b> {bulkFileName}</div>}
        {bulkMessage && <div style={{ marginTop: 11, padding: 11, borderRadius: 12, background: /could not|no rows/i.test(bulkMessage) ? "#fff1f2" : "#eff6ff", border: `1px solid ${/could not|no rows/i.test(bulkMessage) ? "#fecdd3" : "#bfdbfe"}`, color: /could not|no rows/i.test(bulkMessage) ? "#9f1239" : "#1d4ed8", fontSize: 12.5, fontWeight: 800 }}>{bulkReading ? "Reading Excel..." : bulkMessage}</div>}
      </Card>

      {bulkRows.length > 0 && <>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(6,minmax(0,1fr))", gap: 9 }}>
          <Metric label="Rows Found" value={bulkRows.length} />
          <Metric label="Ready" value={bulkRows.filter((r) => r.status === "READY").length} tone="green" />
          <Metric label="Duplicates" value={bulkRows.filter((r) => r.status === "DUPLICATE").length} tone="amber" />
          <Metric label="Invalid" value={bulkRows.filter((r) => r.status === "INVALID").length} tone="red" />
          <Metric label="Code 24" value={bulkRows.filter((r) => r.event.eventType === "CODE_24").length} tone="amber" />
          <Metric label="Code 39" value={bulkRows.filter((r) => r.event.eventType === "CODE_39").length} tone="red" />
        </div>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div><h2 style={{ margin: 0 }}>Excel Preview</h2><div style={{ marginTop: 4, color: "#64748b", fontSize: 12, fontWeight: 700 }}>Only rows marked Ready will be imported. Duplicate and invalid rows remain visible for review.</div></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={importBulkRows} disabled={bulkImporting || bulkReading || !bulkRows.some((r) => r.status === "READY")}>{bulkImporting ? "Importing..." : `Import ${bulkRows.filter((r) => r.status === "READY").length} Unique Row(s)`}</Button>
              <Button variant="secondary" onClick={() => { setBulkRows([]); setBulkFileName(""); setBulkMessage(""); }} disabled={bulkImporting}>Clear</Button>
            </div>
          </div>

          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
              <thead><tr style={{ background: "#f8fbff" }}>{["Excel Row","Result","Type","Passenger","Report ID","PNR","Create Date","Fault Station","Bag Tag(s)","World Tracer ID","Reason / Note"].map((label) => <th key={label} style={{ padding: "10px 11px", borderBottom: "1px solid #e2e8f0", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#475569", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
              <tbody>{bulkRows.map((row) => {
                const tone = row.status === "READY" ? ["#ecfdf5","#047857"] : row.status === "IMPORTED" ? ["#eff6ff","#1d4ed8"] : row.status === "DUPLICATE" ? ["#fffbeb","#b45309"] : ["#fff1f2","#be123c"];
                return <tr key={`${row.sourceRowNumber}-${row.event.reportId}-${row.event.pnr}`}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.sourceRowNumber}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7" }}><span style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 999, background: tone[0], color: tone[1], fontSize: 10.5, fontWeight: 900 }}>{row.status}</span></td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12, fontWeight: 800 }}>{eventTypeLabel(row.event.eventType)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.passengerName || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.reportId || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.pnr || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.createDate || row.reportDate || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.faultStation || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.bagTags || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.event.worldTracerId || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 11.5, color: "#64748b", maxWidth: 260, whiteSpace: "normal" }}>{row.reason || (row.status === "READY" ? "Ready to import" : "-")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </Card>
      </>}
    </>}

    {activeTab === "history" && <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(5,minmax(0,1fr))", gap: 9 }}>
        {[
          { key: "ALL", label: historyFilter === "TODAY" ? "Events Today" : "All BSO Cases", value: historyMetrics.total, tone: "blue" },
          { key: "CODE_24", label: "Code 24", value: historyMetrics.code24, tone: "amber" },
          { key: "CODE_39", label: "Code 39", value: historyMetrics.code39, tone: "red" },
          { key: "EXCEPTION_DELIVERY", label: "Exception Delivery", value: historyMetrics.exceptions, tone: "blue" },
          { key: "OTHER", label: "Other", value: historyMetrics.other, tone: "green" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setHistoryType(item.key)}
            style={{ border: historyType === item.key ? "2px solid #1769aa" : "none", padding: 0, borderRadius: 16, background: "transparent", cursor: "pointer", textAlign: "left" }}
          >
            <Metric label={item.label} value={item.value} tone={item.tone} />
          </button>
        ))}
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{historyType === "ALL" ? "All BSO Cases" : `${eventTypeLabel(historyType)} Cases`} ({historyRows.length})</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>Click a KPI above to filter the office cases. Select View Case to open one record at a time.</div>
          </div>
          <Button variant="secondary" onClick={loadMtdReports} disabled={loadingMtd}>{loadingMtd ? "Refreshing..." : "Refresh"}</Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginBottom: 14 }}>
          <div><Label>View</Label><Select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}><option value="MTD">Month to Date</option><option value="TODAY">Today</option><option value="RANGE">Date Range</option></Select></div>
          {historyFilter === "RANGE" && <><div><Label>Start Date</Label><Input type="date" value={historyStartDate} onChange={(e) => setHistoryStartDate(e.target.value)} /></div><div><Label>End Date</Label><Input type="date" value={historyEndDate} onChange={(e) => setHistoryEndDate(e.target.value)} /></div></>}
          <div><Label>Type</Label><Select value={historyType} onChange={(e) => setHistoryType(e.target.value)}><option value="ALL">All Types</option><option value="CODE_24">Code 24</option><option value="CODE_39">Code 39</option><option value="EXCEPTION_DELIVERY">Exception Delivery</option><option value="OTHER">Other</option></Select></div>
          <div><Label>Supervisor</Label><Input value={historySupervisor} onChange={(e) => setHistorySupervisor(e.target.value)} placeholder="Supervisor name" /></div>
          <div><Label>Employee</Label><Input value={historyEmployee} onChange={(e) => setHistoryEmployee(e.target.value)} placeholder="Employee name" /></div>
          <div><Label>Search</Label><Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="PNR, bag tag, file, flight..." /></div>
        </div>

        {loadingMtd ? <div style={{ padding: 16, color: "#64748b", fontWeight: 700 }}>Loading BSO MTD cases...</div> : historyRows.length === 0 ? <div style={{ padding: 16, background: "#f8fafc", borderRadius: 14, color: "#64748b", fontWeight: 700 }}>No BSO cases match the selected filters.</div> : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead><tr style={{ background: "#f8fbff" }}>{["Date","Type","Passenger / PNR","Bag Tag(s)","File / Report ID","Flight","Employee","Supervisor","Action"].map((label) => <th key={label} style={{ padding: "10px 11px", borderBottom: "1px solid #e2e8f0", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#475569", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
              <tbody>{historyRows.map((row, index) => {
                const fileRef = row.reportId || row.netTracerFile || row.worldTracerId || "-";
                return <tr key={`${row.reportIdDoc}-${row.eventIndex}-${index}`}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.reportDate || "-"}<br/><span style={{ color: "#64748b" }}>{row.shift || "-"}</span></td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12, fontWeight: 850 }}>{eventTypeLabel(row.eventType)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.passengerName || "-"}<br/><b>{row.pnr || "-"}</b></td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.bagTags || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{fileRef}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.flightNumber || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.employee || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7", fontSize: 12 }}>{row.supervisorName || "-"}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eef2f7" }}><Button variant="secondary" onClick={() => setSelectedHistoryCase(row)}>View Case</Button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>}

    {selectedHistoryCase && <div
      onClick={() => setSelectedHistoryCase(null)}
      style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: isMobile ? 10 : 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", background: "#fff", borderRadius: isMobile ? 16 : 22, boxShadow: "0 28px 80px rgba(15,23,42,.32)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: isMobile ? "14px 15px" : "17px 20px", background: "linear-gradient(135deg,#0f5c91,#1f7cc1 55%,#6ec6e8)", color: "#fff", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div><div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".10em", opacity: .82 }}>BSO Case Detail</div><div style={{ marginTop: 4, fontSize: isMobile ? 18 : 22, fontWeight: 900 }}>{eventTypeLabel(selectedHistoryCase.eventType)}</div><div style={{ marginTop: 4, fontSize: 12, opacity: .9 }}>{selectedHistoryCase.reportDate || "-"} | {selectedHistoryCase.shift || "-"} Shift</div></div>
          <button type="button" onClick={() => setSelectedHistoryCase(null)} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", fontWeight: 800 }}>x</button>
        </div>
        <div style={{ padding: isMobile ? 13 : 18, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 10, fontSize: 13, color: "#334155" }}>
            <div><b>Passenger:</b> {selectedHistoryCase.passengerName || "-"}</div><div><b>PNR:</b> {selectedHistoryCase.pnr || "-"}</div>
            <div><b>Bag Tag(s):</b> {selectedHistoryCase.bagTags || "-"}</div><div><b>Flight:</b> {selectedHistoryCase.flightNumber || "-"}</div>
            <div><b>Employee:</b> {selectedHistoryCase.employee || "-"}</div><div><b>Supervisor:</b> {selectedHistoryCase.supervisorName || "-"}</div>
            {selectedHistoryCase.eventType === "CODE_24" && <>
              <div><b>Return Reason:</b> {selectedHistoryCase.returnReason === "Other" ? (selectedHistoryCase.returnReasonOther || "Other") : (selectedHistoryCase.returnReason || "-")}</div>
              <div><b>Code 24 Created:</b> {selectedHistoryCase.code24Created === true || selectedHistoryCase.code24Created === "Yes" ? "Yes" : "No"}</div>
              <div><b>Code 24 Reason:</b> {selectedHistoryCase.code24Reason === "Other" ? (selectedHistoryCase.code24ReasonOther || "Other") : (selectedHistoryCase.code24Reason || "-")}</div>
              <div><b>BCC Referral:</b> {selectedHistoryCase.bccReferral === true || selectedHistoryCase.bccReferral === "Yes" ? "Yes" : "No"}</div>
              <div><b>Report ID:</b> {selectedHistoryCase.reportId || "-"}</div>
            </>}
            {selectedHistoryCase.eventType === "CODE_39" && <>
              <div><b>Report ID:</b> {selectedHistoryCase.reportId || "-"}</div><div><b>Create Date:</b> {selectedHistoryCase.createDate || "-"}</div>
              <div><b>Status:</b> {selectedHistoryCase.status || "-"}</div><div><b>Fault Station:</b> {selectedHistoryCase.faultStation || "-"}</div>
              <div><b>Loss Code:</b> {selectedHistoryCase.lossCode || "-"}</div><div><b>Bag Type:</b> {selectedHistoryCase.bagType || "-"}</div>
              <div><b>Bags Checked:</b> {selectedHistoryCase.bagsChecked ?? "-"}</div><div><b>Bags Received:</b> {selectedHistoryCase.bagsReceived ?? "-"}</div>
              <div><b>World Tracer:</b> {selectedHistoryCase.worldTracerId || "-"}</div>
            </>}
            {selectedHistoryCase.eventType === "EXCEPTION_DELIVERY" && <>
              <div><b>NetTracer File:</b> {selectedHistoryCase.netTracerFile || "-"}</div><div><b>Exception Date:</b> {selectedHistoryCase.exceptionDate || "-"}</div>
              <div><b>Agent Code:</b> {selectedHistoryCase.agentCode || "-"}</div><div><b>Delivery Method:</b> {selectedHistoryCase.deliveryMethod || "-"}</div>
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}><b>Exception Reason:</b> {selectedHistoryCase.exceptionReason === "Other" ? (selectedHistoryCase.exceptionReasonOther || "Other") : (selectedHistoryCase.exceptionReason || "-")}</div>
            </>}
            {selectedHistoryCase.eventType === "OTHER" && <>
              <div><b>Category:</b> {selectedHistoryCase.otherCategory || "-"}</div><div><b>Follow-up Required:</b> {selectedHistoryCase.followUpRequired || "-"}</div>
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}><b>Description:</b> {selectedHistoryCase.otherDescription || "-"}</div>
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}><b>Action Taken:</b> {selectedHistoryCase.actionTaken || "-"}</div>
            </>}
          </div>
          {selectedHistoryCase.comments && <div style={{ marginTop: 14, padding: 11, borderRadius: 12, background: "#f8fafc", color: "#475569", fontSize: 12.5 }}><b>Comments / Coaching:</b> {selectedHistoryCase.comments}</div>}
        </div>
        <div style={{ padding: 13, borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "flex-end" }}><Button variant="secondary" onClick={() => setSelectedHistoryCase(null)}>Close</Button></div>
      </div>
    </div>}

    {expandedReportId && (() => {
      const report = filteredHistoryReports.find((item) => item.id === expandedReportId);
      if (!report) return null;
      const allEvents = Array.isArray(report.events) ? report.events : [];
      const events = allEvents.filter((event, index) => historyRows.some((row) => row.reportIdDoc === report.id && row.eventIndex === index));
      return <div
        onClick={() => setExpandedReportId("")}
        style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center", padding: isMobile ? 10 : 20 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 900, maxHeight: "88vh", background: "#fff", borderRadius: isMobile ? 16 : 22, boxShadow: "0 28px 80px rgba(15,23,42,.32)", overflow: "hidden", display: "flex", flexDirection: "column" }}
        >
          <div style={{ padding: isMobile ? "14px 15px" : "17px 20px", background: "linear-gradient(135deg,#0f5c91,#1f7cc1 55%,#6ec6e8)", color: "#fff", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".10em", opacity: .82 }}>BSO Daily Report</div>
              <div style={{ marginTop: 4, fontSize: isMobile ? 18 : 22, fontWeight: 900 }}>{report.reportDate || "-"} | {report.shift || "-"} Shift</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: .9 }}>{report.supervisorName || report.submittedByName || "Supervisor"} | {timestampToLabel(report.createdAt)}</div>
            </div>
            <button type="button" onClick={() => setExpandedReportId("")} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, border: "1px solid rgba(255,255,255,.35)", background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", fontWeight: 800 }}>x</button>
          </div>

          <div style={{ padding: isMobile ? 13 : 18, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "grid", gap: 11 }}>
            {events.map((event, index) => <div key={`${report.id}-${index}`} style={{ border: "1px solid #dbeafe", borderRadius: 15, padding: isMobile ? 12 : 14, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 16 }}>{event.eventType === "CODE_24" ? "Code 24 / Bag Return" : event.eventType === "CODE_39" ? "Code 39" : event.eventType === "EXCEPTION_DELIVERY" ? "Exception Delivery" : "Other"}</div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>Event #{event.sequence || index + 1}</div>
              </div>

              <div style={{ marginTop: 11, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 9, fontSize: 12.5, color: "#334155" }}>
                <div><b>Employee:</b> {event.employee || "-"}</div>
                <div><b>Passenger:</b> {event.passengerName || "-"}</div>
                <div><b>PNR:</b> {event.pnr || "-"}</div>
                <div><b>Bag Tag:</b> {event.bagTags || "-"}</div>
                <div><b>Flight:</b> {event.flightNumber || "-"}</div>
                <div><b>Supervisor Review:</b> {event.supervisorReview || "-"}</div>

                {event.eventType === "CODE_24" && <>
                  <div><b>Return Reason:</b> {event.returnReason === "Other" ? (event.returnReasonOther || "Other") : (event.returnReason || "-")}</div>
                  <div><b>Code 24 Created:</b> {event.code24Created === true || event.code24Created === "Yes" ? "Yes" : "No"}</div>
                  <div><b>Code 24 Reason:</b> {event.code24Reason === "Other" ? (event.code24ReasonOther || "Other") : (event.code24Reason || "-")}</div>
                  <div><b>BCC Referral:</b> {event.bccReferral === true || event.bccReferral === "Yes" ? "Yes" : "No"}</div>
                </>}

                {event.eventType === "CODE_39" && <>
                  <div><b>Report ID:</b> {event.reportId || "-"}</div>
                  <div><b>Create Date:</b> {event.createDate || "-"}</div>
                  <div><b>Status:</b> {event.status || "-"}</div>
                  <div><b>Fault Station:</b> {event.faultStation || "-"}</div>
                  <div><b>Loss Code:</b> {event.lossCode || "-"}</div>
                  <div><b>Bag Type:</b> {event.bagType || "-"}</div>
                  <div><b>Bags Checked:</b> {event.bagsChecked || "-"}</div>
                  <div><b>Bags Received:</b> {event.bagsReceived || "-"}</div>
                  <div><b>World Tracer:</b> {event.worldTracerId || "-"}</div>
                </>}

                {event.eventType === "EXCEPTION_DELIVERY" && <>
                  <div><b>NetTracer File:</b> {event.netTracerFile || "-"}</div>
                  <div><b>Exception Date:</b> {event.exceptionDate || "-"}</div>
                  <div><b>Agent Code:</b> {event.agentCode || "-"}</div>
                  <div><b>Delivery Method:</b> {event.deliveryMethod || "-"}</div>
                  <div><b>Exception Reason:</b> {event.exceptionReason === "Other" ? (event.exceptionReasonOther || "Other") : (event.exceptionReason || "-")}</div>
                </>}

                {event.eventType === "OTHER" && <>
                  <div><b>Category:</b> {event.otherCategory || "-"}</div>
                  <div><b>Follow-up Required:</b> {event.followUpRequired || "-"}</div>
                  <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}><b>Description:</b> {event.otherDescription || "-"}</div>
                  <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}><b>Action Taken:</b> {event.actionTaken || "-"}</div>
                </>}
              </div>

              {event.comments && <div style={{ marginTop: 11, padding: 10, borderRadius: 11, background: "#f8fafc", color: "#475569", fontSize: 12.5 }}><b>Comments / Coaching:</b> {event.comments}</div>}
            </div>)}

            {!events.length && <div style={{ padding: 16, background: "#f8fafc", borderRadius: 14, color: "#64748b", fontWeight: 700 }}>No matching events in this report for the selected filters.</div>}
          </div>

          <div style={{ padding: 13, borderTop: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
            <Button onClick={() => handlePrintReport(report, allEvents)}>Print Report</Button>
            <Button variant="secondary" onClick={() => setExpandedReportId("")}>Close</Button>
          </div>
        </div>
      </div>;
    })()}

    {duplicateWarning && <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,.48)", display: "grid", placeItems: "center", padding: 18 }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 20, boxShadow: "0 24px 70px rgba(15,23,42,.28)", overflow: "hidden" }}>
        <div style={{ padding: "17px 19px", background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
          <div style={{ fontSize: 11, color: "#c2410c", fontWeight: 900, textTransform: "uppercase" }}>Possible Duplicate Found</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: "#7c2d12" }}>This event may already be in BSO Daily Reports</div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: "#475569", fontWeight: 700, lineHeight: 1.55 }}>Review the matching information before creating another entry.</div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {duplicateWarning.duplicates.map((d, index) => <div key={index} style={{ padding: 10, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 12.5, fontWeight: 800 }}>Event #{d.eventNumber} | {d.eventType}: {d.reason}</div>)}
          </div>
          <div style={{ marginTop: 14 }}><Label>If this is a different event, explain why *</Label><Area value={duplicateOverrideReason} onChange={(e) => setDuplicateOverrideReason(e.target.value)} placeholder="Example: Separate bag, new customer interaction, correction, or other valid reason." /></div>
          <div style={{ marginTop: 14, display: "flex", gap: 9, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => { setDuplicateWarning(null); setActiveTab("history"); }}>View BSO MTD Reports</Button>
            <Button onClick={continueDuplicate} disabled={saving}>{saving ? "Saving..." : "Continue Anyway"}</Button>
            <Button variant="danger" onClick={() => { setDuplicateWarning(null); setDuplicateOverrideReason(""); }}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}
