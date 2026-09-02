// src/pages/OperationalReportAdminPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

/* =========================================================
   RESPONSIVE
========================================================= */

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

/* =========================================================
   NORMALIZATION / HELPERS
========================================================= */

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();
  const upper = airline.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
}

function normalizeDepartmentValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (raw.includes("wchr") || raw.includes("wheelchair")) return "wchr";
  if (raw.includes("baggage")) return "baggage";
  if (raw.includes("cabin")) return "cabin_service";
  if (raw.includes("passenger")) return "passenger_service";
  return raw;
}

function tsToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = tsToDate(value);
  return d ? d.toLocaleString() : "\u2014";
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function prettifyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  return raw === "yes" || raw === "true" || raw === "1";
}

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function formatHours(value) {
  const num = toSafeNumber(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatResponseValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "\u2014");
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfToday() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek() {
  const end = new Date(startOfWeek());
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getRangeDates(range) {
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  return { start: startOfMonth(), end: endOfMonth() };
}

function getCustomDateRange(fromDate, toDate) {
  if (!fromDate && !toDate) return null;

  const start = fromDate
    ? new Date(`${fromDate}T00:00:00`)
    : new Date("2000-01-01T00:00:00");

  const end = toDate
    ? new Date(`${toDate}T23:59:59.999`)
    : new Date("2100-12-31T23:59:59.999");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

/* =========================================================
   LOB
========================================================= */

const DEFAULT_LOB_RULES = [
  { id: "lob_1", minBags: 1, maxBags: 40, hours: 1 },
  { id: "lob_2", minBags: 41, maxBags: 80, hours: 3 },
  { id: "lob_3", minBags: 81, maxBags: null, hours: 4 },
];

function normalizeLobRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => {
      const minBags = Math.max(0, Number(rule?.minBags || 0));
      const maxBags =
        rule?.maxBags === null ||
        rule?.maxBags === "" ||
        typeof rule?.maxBags === "undefined"
          ? null
          : Math.max(0, Number(rule.maxBags || 0));

      const hours = Math.max(0, Number(rule?.hours || 0));

      return {
        id: rule?.id || `lob_${index + 1}`,
        minBags,
        maxBags,
        hours,
      };
    })
    .filter(
      (rule) =>
        Number.isFinite(rule.minBags) &&
        Number.isFinite(rule.hours) &&
        (rule.maxBags === null || Number.isFinite(rule.maxBags)) &&
        (rule.maxBags === null || rule.maxBags >= rule.minBags)
    )
    .sort((a, b) => a.minBags - b.minBags);
}

function getReportHasLobs(report) {
  return parseBooleanLike(
    report?.hasLobs ??
      report?.responses?.had_lobs ??
      report?.responses?.has_lobs ??
      report?.responses?.hasLobs ??
      report?.responses?.lobs
  );
}

function getReportLobBagCount(report) {
  return toSafeNumber(
    report?.lobBags ??
      report?.lobBagCount ??
      report?.responses?.lob_bags ??
      report?.responses?.lob_total_bags ??
      report?.responses?.lobBagCount ??
      report?.responses?.lob_bag_count ??
      report?.responses?.lobBags
  );
}

function getReportLobAgentsUsed(report) {
  return toSafeNumber(
    report?.lobAgentsUsed ??
      report?.responses?.lob_agents_used ??
      report?.responses?.lobAgentsUsed ??
      report?.responses?.agentsUsedForLobs
  );
}

function getReportLobSupervisorsUsed(report) {
  return toSafeNumber(
    report?.lobSupervisorsUsed ??
      report?.responses?.lob_supervisors_used ??
      report?.responses?.lobSupervisorsUsed ??
      report?.responses?.supervisorsUsedForLobs
  );
}

function getLobData(report) {
  return {
    hasLobs: getReportHasLobs(report),
    bags: getReportLobBagCount(report),
    agents: getReportLobAgentsUsed(report),
    supervisors: getReportLobSupervisorsUsed(report),
  };
}

function calculateLobEstimatedHours(bagCount, rules) {
  const bags = toSafeNumber(bagCount);
  if (bags <= 0) return 0;

  const normalizedRules = normalizeLobRules(
    Array.isArray(rules) && rules.length ? rules : DEFAULT_LOB_RULES
  );

  const matching = normalizedRules.find(
    (rule) =>
      bags >= rule.minBags &&
      (rule.maxBags === null || bags <= rule.maxBags)
  );

  if (matching) return toSafeNumber(matching.hours);

  const last = normalizedRules[normalizedRules.length - 1];
  return last ? toSafeNumber(last.hours) : 0;
}

function calculateLobLabor(report, rules) {
  const lob = getLobData(report);
  const estimatedHours = calculateLobEstimatedHours(lob.bags, rules);

  return {
    ...lob,
    estimatedHours,
    agentLaborHours: lob.agents * estimatedHours,
    supervisorLaborHours: lob.supervisors * estimatedHours,
    totalLaborHours:
      lob.agents * estimatedHours + lob.supervisors * estimatedHours,
  };
}

/* =========================================================
   ATTENTION / STATUS
========================================================= */

function shouldFlagNeedsAttention(report) {
  if (report?.needsAttention) return true;

  const responses = report?.responses || {};
  const operationStatus = String(responses.operation_status || "").toLowerCase();
  const safetyConcern = String(responses.safety_concern || "").toLowerCase();

  const delayed =
    String(responses.delayed_flight || "").toLowerCase() === "yes" ||
    String(responses.delayed_flight_impact || "").toLowerCase() === "yes" ||
    String(responses.service_delays || "").toLowerCase() === "yes";

  return (
    operationStatus.includes("not completed") ||
    operationStatus.includes("remarks") ||
    safetyConcern === "yes" ||
    delayed
  );
}

function getReviewStatusLabel(status) {
  const value = String(status || "submitted").toLowerCase();

  if (value === "read") return "Read";
  if (value === "approved") return "Approved";
  if (value === "follow_up_required") return "Follow Up Required";
  if (value === "closed") return "Closed";
  if (value === "archived") return "Archived";
  return "Submitted";
}

function getReviewStatusStyle(status) {
  const value = String(status || "submitted").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 9px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (value === "read") {
    return { ...base, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" };
  }

  if (value === "approved") {
    return { ...base, background: "#dcfce7", color: "#166534", borderColor: "#86efac" };
  }

  if (value === "follow_up_required") {
    return { ...base, background: "#fff7ed", color: "#9a3412", borderColor: "#fdba74" };
  }

  if (value === "closed") {
    return { ...base, background: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" };
  }

  if (value === "archived") {
    return { ...base, background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" };
  }

  return { ...base, background: "#edf7ff", color: "#1769aa", borderColor: "#cfe7fb" };
}

function getTemplateLabel(report) {
  return (
    report?.templateLabel ||
    report?.department ||
    prettifyKey(report?.templateKey || "operational_report")
  );
}

function isCabinServiceReport(report) {
  return (
    normalizeDepartmentValue(report?.templateKey || report?.department) ===
    "cabin_service"
  );
}

/* =========================================================
   UI
========================================================= */

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 5,
        fontSize: 10.5,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 11,
        padding: "10px 12px",
        fontSize: 13.5,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 11,
        padding: "10px 12px",
        fontSize: 13.5,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 11,
        padding: "10px 12px",
        fontSize: 13.5,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 84,
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#fff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 10,
        padding: "8px 11px",
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        whiteSpace: "nowrap",
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 13,
        padding: "11px 12px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: 800,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailBox({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 13,
        padding: "11px 12px",
        background: "#f8fbff",
        border: "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 13,
          color: "#0f172a",
          whiteSpace: "pre-line",
          lineHeight: 1.55,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   PRINT
========================================================= */

function buildPrintableHtml(report, lobRules) {
  const labor = calculateLobLabor(report, lobRules);
  const responseHtml = Object.entries(report?.responses || {})
    .map(
      ([key, value]) => `
        <div class="box">
          <div class="label">${escapeHtml(prettifyKey(key))}</div>
          <div class="value">${escapeHtml(formatResponseValue(value))}</div>
        </div>
      `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Operational Report</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#0f172a}
.brand{font-size:11px;font-weight:800;color:#1769aa;text-transform:uppercase;letter-spacing:.08em}
h1{margin:6px 0 4px;font-size:26px}
.sub{font-size:12px;color:#64748b;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
.box{border:1px solid #dbeafe;background:#f8fbff;border-radius:12px;padding:10px 12px;margin-bottom:8px}
.label{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase}
.value{margin-top:4px;font-size:13px;font-weight:700;white-space:pre-wrap}
.alert{padding:10px 12px;border-radius:12px;margin-bottom:10px;font-weight:700}
.warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}
.danger{background:#fff1f2;border:1px solid #fecdd3;color:#9f1239}
</style>
</head>
<body>
<div class="brand">${escapeHtml(APP_NAME)}</div>
<h1>Operational Report</h1>
<div class="sub">${escapeHtml(APP_SUBTITLE)} &middot; ${escapeHtml(
    getTemplateLabel(report)
  )} &middot; ${escapeHtml(report.normalizedAirline || "\u2014")} &middot; ${escapeHtml(
    report.reportDate || "\u2014"
  )}</div>

<div class="grid">
<div class="box"><div class="label">Department</div><div class="value">${escapeHtml(
    report.department || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Airline</div><div class="value">${escapeHtml(
    report.normalizedAirline || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Flight</div><div class="value">${escapeHtml(
    report.flightNumber || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Supervisor</div><div class="value">${escapeHtml(
    report.supervisorReporting || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Status</div><div class="value">${escapeHtml(
    getReviewStatusLabel(report.reviewStatus)
  )}</div></div>
<div class="box"><div class="label">Created</div><div class="value">${escapeHtml(
    formatDateTime(report.createdAt)
  )}</div></div>
</div>

${
  report.delayedFlight
    ? `<div class="alert warn">Delay: ${Number(
        report.delayedTimeMinutes || 0
      )} minutes. ${escapeHtml(report.delayedReason || "")}</div>`
    : ""
}

${
  shouldFlagNeedsAttention(report)
    ? `<div class="alert danger">This report requires management attention.</div>`
    : ""
}

${
  labor.hasLobs
    ? `<div class="box"><div class="label">LOB Summary</div><div class="value">${labor.bags} bags | ${labor.agents} agents | ${labor.supervisors} supervisors | ${formatHours(
        labor.estimatedHours
      )} formula hours | ${formatHours(labor.totalLaborHours)} total labor hours</div></div>`
    : ""
}

<div class="box"><div class="label">Notes</div><div class="value">${escapeHtml(
    report.notes || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Manager Notes</div><div class="value">${escapeHtml(
    report.managerNotes || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Follow Up Action</div><div class="value">${escapeHtml(
    report.followUpAction || "\u2014"
  )}</div></div>
<div class="box"><div class="label">Follow Up Details</div><div class="value">${escapeHtml(
    report.followUpDetails || "\u2014"
  )}</div></div>

${responseHtml}
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function OperationalReportAdminPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" &&
    ["hhernandez", "hhernadez"].includes(normalizedUsername);

  const isSupervisor = user?.role === "supervisor";
  const isManager =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canAccess =
    isSupervisor ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [selectedId, setSelectedId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [actionId, setActionId] = useState("");

  const [lobRules, setLobRules] = useState(DEFAULT_LOB_RULES);
  const [lobRulesDraft, setLobRulesDraft] = useState(
    DEFAULT_LOB_RULES.map((rule) => ({ ...rule }))
  );
  const [savingLobRules, setSavingLobRules] = useState(false);
  const [lobOnly, setLobOnly] = useState(false);
  const [showLobFormula, setShowLobFormula] = useState(false);
  const [showLobSection, setShowLobSection] = useState(false);
  const [showDelaySection, setShowDelaySection] = useState(false);

  const [filters, setFilters] = useState({
    airline: "all",
    department: "all",
    lifecycle: "active",
    dateMode: "quick",
    range: "today",
    fromDate: "",
    toDate: "",
  });

  const [editForm, setEditForm] = useState({
    templateKey: "",
    templateLabel: "",
    department: "",
    airline: "",
    reportDate: "",
    shift: "",
    flightNumber: "",
    flightsHandled: "",
    supervisorReporting: "",
    notes: "",
    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",
    needsAttention: false,
    responses: {},
    reviewStatus: "submitted",
    managerNotes: "",
    followUpRequired: false,
    followUpAction: "",
    followUpDetails: "",
    hasLobs: false,
    lobBags: "",
    lobAgentsUsed: "",
    lobSupervisorsUsed: "",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);

        const snap = await getDocs(
          query(
            collection(db, "operational_reports"),
            orderBy("createdAt", "desc")
          )
        );

        let rows = snap.docs.map((item) => {
          const data = item.data();
          const normalized = {
            id: item.id,
            ...data,
            normalizedAirline: normalizeAirlineName(data.airline),
            normalizedDepartment: normalizeDepartmentValue(
              data.templateKey || data.department || data.airline
            ),
            reviewStatus: data.reviewStatus || "submitted",
            managerNotes: data.managerNotes || "",
            followUpRequired: Boolean(data.followUpRequired),
            followUpAction: data.followUpAction || "",
            followUpDetails: data.followUpDetails || "",
            archived: Boolean(data.archived),
          };

          const lob = getLobData(normalized);

          return {
            ...normalized,
            hasLobs: lob.hasLobs,
            lobBags: lob.bags,
            lobAgentsUsed: lob.agents,
            lobSupervisorsUsed: lob.supervisors,
          };
        });

        if (isCabinDutyManager) {
          rows = rows.filter(
            (row) => row.normalizedDepartment === "cabin_service"
          );
        }

        setReports(rows);
      } catch (err) {
        console.error("Error loading operational reports:", err);
        setStatusMessage("Could not load operational reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) loadReports();
    else setLoading(false);
  }, [canAccess, isCabinDutyManager]);

  useEffect(() => {
    async function loadLobRules() {
      if (!isManager) return;

      try {
        const snap = await getDocs(
          collection(db, "operational_report_lob_settings")
        );

        if (snap.empty) return;

        const saved = normalizeLobRules(
          Array.isArray(snap.docs[0].data()?.rules)
            ? snap.docs[0].data().rules
            : DEFAULT_LOB_RULES
        );

        if (saved.length) {
          setLobRules(saved);
          setLobRulesDraft(saved.map((rule) => ({ ...rule })));
        }
      } catch (err) {
        console.error("Error loading LOB formula:", err);
      }
    }

    if (canAccess) loadLobRules();
  }, [canAccess, isManager]);

  const airlineOptions = useMemo(() => {
    return Array.from(
      new Set(reports.map((r) => r.normalizedAirline).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const departmentOptions = useMemo(() => {
    return Array.from(
      new Set(reports.map((r) => r.department).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const quickRange =
      filters.dateMode === "quick" ? getRangeDates(filters.range) : null;

    const customRange =
      filters.dateMode === "custom"
        ? getCustomDateRange(filters.fromDate, filters.toDate)
        : null;

    let base = reports;

    if (isSupervisor) {
      const myId = String(user?.id || "").trim();
      const myUsername = String(user?.username || "").trim().toLowerCase();
      const myName = String(getVisibleUserName(user)).trim().toLowerCase();

      base = reports.filter((r) => {
        const submittedId = String(r.submittedByUserId || "").trim();
        const submittedUsername = String(r.submittedByUsername || "")
          .trim()
          .toLowerCase();
        const submittedName = String(
          r.submittedByName || r.supervisorReporting || ""
        )
          .trim()
          .toLowerCase();

        return (
          (myId && submittedId === myId) ||
          (myUsername && submittedUsername === myUsername) ||
          (myName && submittedName === myName)
        );
      });
    }

    return base.filter((r) => {
      const created = tsToDate(r.createdAt);
      if (!created) return false;

      if (
        quickRange &&
        (created < quickRange.start || created > quickRange.end)
      ) {
        return false;
      }

      if (
        customRange &&
        (created < customRange.start || created > customRange.end)
      ) {
        return false;
      }

      if (
        filters.airline !== "all" &&
        r.normalizedAirline !== filters.airline
      ) {
        return false;
      }

      if (
        filters.department !== "all" &&
        r.department !== filters.department
      ) {
        return false;
      }

      if (lobOnly && !getReportHasLobs(r)) return false;

      const status = String(r.reviewStatus || "submitted").toLowerCase();

      if (filters.lifecycle === "active") {
        return !["closed", "archived"].includes(status);
      }

      if (filters.lifecycle === "closed") return status === "closed";
      if (filters.lifecycle === "archived") return status === "archived";

      return true;
    });
  }, [reports, filters, isSupervisor, user, lobOnly]);

  const selectedReport = useMemo(
    () => filteredReports.find((r) => r.id === selectedId) || null,
    [filteredReports, selectedId]
  );

  useEffect(() => {
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (
      selectedId &&
      !filteredReports.some((report) => report.id === selectedId)
    ) {
      setSelectedId(filteredReports[0]?.id || "");
    }
  }, [filteredReports, selectedId]);

  const delayedReports = useMemo(
    () => filteredReports.filter((r) => Boolean(r.delayedFlight)),
    [filteredReports]
  );

  const delaySummary = useMemo(() => {
    const map = {};

    for (const report of delayedReports) {
      const airline = report.normalizedAirline || "Unknown";
      if (!map[airline]) map[airline] = { airline, reports: [] };
      map[airline].reports.push(report);
    }

    return Object.values(map)
      .map((item) => ({
        ...item,
        totalDelayedFlights: item.reports.length,
        maxMinutes: Math.max(
          ...item.reports.map((r) => Number(r.delayedTimeMinutes || 0)),
          0
        ),
      }))
      .sort(
        (a, b) =>
          b.totalDelayedFlights - a.totalDelayedFlights ||
          a.airline.localeCompare(b.airline)
      );
  }, [delayedReports]);

  const lobReports = useMemo(
    () => filteredReports.filter((r) => getReportHasLobs(r)),
    [filteredReports]
  );

  const lobSummary = useMemo(() => {
    return lobReports.reduce(
      (acc, report) => {
        const labor = calculateLobLabor(report, lobRules);
        acc.totalFlights += 1;
        acc.totalBags += labor.bags;
        acc.totalAgents += labor.agents;
        acc.totalSupervisors += labor.supervisors;
        acc.totalAgentHours += labor.agentLaborHours;
        acc.totalSupervisorHours += labor.supervisorLaborHours;
        acc.totalLaborHours += labor.totalLaborHours;
        return acc;
      },
      {
        totalFlights: 0,
        totalBags: 0,
        totalAgents: 0,
        totalSupervisors: 0,
        totalAgentHours: 0,
        totalSupervisorHours: 0,
        totalLaborHours: 0,
      }
    );
  }, [lobReports, lobRules]);

  const alerts = useMemo(() => {
    const rows = [];

    for (const item of delaySummary) {
      if (item.maxMinutes > 4) {
        rows.push(
          `${item.airline}: at least one delayed flight exceeded 4 minutes.`
        );
      }

      if (item.totalDelayedFlights > 2) {
        rows.push(
          `${item.airline}: more than 2 delayed flights in the selected period.`
        );
      }
    }

    for (const report of filteredReports) {
      if (shouldFlagNeedsAttention(report)) {
        rows.push(
          `${report.normalizedAirline || "Unknown"}: report requires management attention.`
        );
      }
    }

    return Array.from(new Set(rows));
  }, [delaySummary, filteredReports]);

  const removeOperationalAlerts = async (reportId) => {
    if (!reportId) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, "operational_alerts"),
          where("sourceId", "==", reportId)
        )
      );

      await Promise.all(
        snap.docs.map((alertDoc) =>
          deleteDoc(doc(db, "operational_alerts", alertDoc.id))
        )
      );
    } catch (err) {
      console.error("Operational alert cleanup error:", err);
    }
  };

  const startEdit = (report) => {
    if (!isManager) return;

    const lob = getLobData(report);

    setEditForm({
      templateKey: report.templateKey || "",
      templateLabel: report.templateLabel || "",
      department: report.department || "",
      airline: report.airline || "",
      reportDate: report.reportDate || "",
      shift: report.shift || "",
      flightNumber: report.flightNumber || "",
      flightsHandled: report.flightsHandled || "",
      supervisorReporting: report.supervisorReporting || "",
      notes: report.notes || "",
      delayedFlight: Boolean(report.delayedFlight),
      delayedTimeMinutes: report.delayedTimeMinutes ?? "",
      delayedReason: report.delayedReason || "",
      delayedCodeReported: report.delayedCodeReported || "",
      needsAttention: Boolean(report.needsAttention),
      responses: { ...(report.responses || {}) },
      reviewStatus: report.reviewStatus || "submitted",
      managerNotes: report.managerNotes || "",
      followUpRequired: Boolean(report.followUpRequired),
      followUpAction: report.followUpAction || "",
      followUpDetails: report.followUpDetails || "",
      hasLobs: lob.hasLobs,
      lobBags: lob.bags || "",
      lobAgentsUsed: lob.agents || "",
      lobSupervisorsUsed: lob.supervisors || "",
    });

    setSelectedId(report.id);
    setEditingId(report.id);
    setExpandedId(report.id);
  };

  const saveEdit = async (report) => {
    if (!isManager) return;

    try {
      setSavingId(report.id);

      const hasLobs = Boolean(editForm.hasLobs);
      const lobBags = hasLobs ? toSafeNumber(editForm.lobBags) : 0;
      const lobAgentsUsed = hasLobs
        ? toSafeNumber(editForm.lobAgentsUsed)
        : 0;
      const lobSupervisorsUsed = hasLobs
        ? toSafeNumber(editForm.lobSupervisorsUsed)
        : 0;

      const responses = {
        ...(editForm.responses || {}),
        has_lobs: hasLobs ? "Yes" : "No",
        lobs: hasLobs ? "Yes" : "No",
        lob_bags: lobBags,
        lob_total_bags: lobBags,
        lob_agents_used: lobAgentsUsed,
        lob_supervisors_used: lobSupervisorsUsed,
      };

      const payload = {
        templateKey: editForm.templateKey || report.templateKey || "",
        templateLabel: editForm.templateLabel || report.templateLabel || "",
        department: editForm.department || report.department || "",
        airline: normalizeAirlineName(editForm.airline),
        reportDate: editForm.reportDate,
        shift: editForm.shift,
        flightNumber: isCabinServiceReport(editForm)
          ? ""
          : editForm.flightNumber,
        flightsHandled: editForm.flightsHandled,
        supervisorReporting: editForm.supervisorReporting,
        notes: editForm.notes,
        delayedFlight: Boolean(editForm.delayedFlight),
        delayedTimeMinutes: Number(editForm.delayedTimeMinutes || 0),
        delayedReason: String(editForm.delayedReason || "").trim(),
        delayedCodeReported: String(editForm.delayedCodeReported || "").trim(),
        needsAttention: Boolean(editForm.needsAttention),
        responses,
        reviewStatus: editForm.reviewStatus || "submitted",
        managerNotes: editForm.managerNotes || "",
        followUpRequired: Boolean(editForm.followUpRequired),
        followUpAction: editForm.followUpAction || "",
        followUpDetails: editForm.followUpDetails || "",
        hasLobs,
        lobBagCount: lobBags,
        lobBags,
        lobAgentsUsed,
        lobSupervisorsUsed,
        updatedAt: serverTimestamp(),
        updatedBy: getVisibleUserName(user),
      };

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                normalizedAirline: normalizeAirlineName(payload.airline),
                normalizedDepartment: normalizeDepartmentValue(
                  payload.templateKey || payload.department
                ),
              }
            : item
        )
      );

      setEditingId("");
      setStatusMessage("Operational report updated successfully.");
    } catch (err) {
      console.error("Error updating operational report:", err);
      setStatusMessage("Could not update operational report.");
    } finally {
      setSavingId("");
    }
  };

  const saveLobRules = async () => {
    if (!isManager) return;

    try {
      setSavingLobRules(true);

      const cleaned = normalizeLobRules(lobRulesDraft);
      if (!cleaned.length) {
        setStatusMessage("Please add at least one valid LOB labor rule.");
        return;
      }

      await setDoc(
        doc(db, "operational_report_lob_settings", "default"),
        {
          rules: cleaned,
          updatedAt: serverTimestamp(),
          updatedBy: getVisibleUserName(user),
          updatedByUserId: user?.id || "",
          updatedByUsername: user?.username || "",
        },
        { merge: true }
      );

      setLobRules(cleaned);
      setLobRulesDraft(cleaned.map((rule) => ({ ...rule })));
      setStatusMessage("LOB labor formula updated successfully.");
    } catch (err) {
      console.error("Error saving LOB formula:", err);
      setStatusMessage("Could not save the LOB labor formula.");
    } finally {
      setSavingLobRules(false);
    }
  };

  const updateWorkflowStatus = async (report, mode) => {
    if (!isManager) return;

    try {
      setActionId(report.id);

      const managerName = getVisibleUserName(user);
      const managerRole = user?.role || "";
      const payload = {};

      if (mode === "read") {
        payload.reviewStatus = "read";
        payload.readAt = serverTimestamp();
        payload.readBy = managerName;
        payload.readByRole = managerRole;
      }

      if (mode === "approved") {
        payload.reviewStatus = "approved";
        payload.approvedAt = serverTimestamp();
        payload.approvedBy = managerName;
        payload.approvedByRole = managerRole;
      }

      if (mode === "follow_up_required") {
        payload.reviewStatus = "follow_up_required";
        payload.followUpRequired = true;
        payload.reviewedAt = serverTimestamp();
        payload.reviewedBy = managerName;
        payload.reviewedByRole = managerRole;
      }

      if (mode === "closed") {
        payload.reviewStatus = "closed";
        payload.closedAt = serverTimestamp();
        payload.closedBy = managerName;
        payload.closedByRole = managerRole;
      }

      if (mode === "archived") {
        payload.reviewStatus = "archived";
        payload.archived = true;
        payload.archivedAt = serverTimestamp();
        payload.archivedBy = managerName;
        payload.archivedByRole = managerRole;
      }

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id ? { ...item, ...payload } : item
        )
      );

      if (["read", "approved", "closed", "archived"].includes(mode)) {
        await removeOperationalAlerts(report.id);
      }

      setStatusMessage(
        `Report marked as ${getReviewStatusLabel(payload.reviewStatus)}.`
      );
    } catch (err) {
      console.error("Error updating workflow status:", err);
      setStatusMessage("Could not update report status.");
    } finally {
      setActionId("");
    }
  };

  const saveFollowUp = async (report) => {
    if (!isManager) return;

    const action = String(editForm.followUpAction || "").trim();
    const details = String(editForm.followUpDetails || "").trim();

    if (!action && !details) {
      setStatusMessage("Please enter follow up action or follow up details.");
      return;
    }

    try {
      setActionId(report.id);

      const payload = {
        followUpRequired: true,
        reviewStatus: "follow_up_required",
        followUpAction: action,
        followUpDetails: details,
        managerNotes: editForm.managerNotes || "",
        followUpCompletedAt: serverTimestamp(),
        followUpCompletedBy: getVisibleUserName(user),
        followUpCompletedByRole: user?.role || "",
      };

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id ? { ...item, ...payload } : item
        )
      );

      setStatusMessage("Follow up saved successfully.");
    } catch (err) {
      console.error("Error saving follow up:", err);
      setStatusMessage("Could not save follow up.");
    } finally {
      setActionId("");
    }
  };

  const deleteReport = async (report) => {
    if (!isManager) return;

    const ok = window.confirm(
      `Delete operational report for ${report.normalizedAirline || "Unknown"}?`
    );

    if (!ok) return;

    try {
      setDeletingId(report.id);
      await removeOperationalAlerts(report.id);
      await deleteDoc(doc(db, "operational_reports", report.id));

      setReports((prev) => prev.filter((item) => item.id !== report.id));
      setStatusMessage("Operational report deleted.");
    } catch (err) {
      console.error("Error deleting operational report:", err);
      setStatusMessage("Could not delete operational report.");
    } finally {
      setDeletingId("");
    }
  };

  const handlePrintExport = (report) => {
    const printWindow = window.open("", "_blank", "width=1100,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableHtml(report, lobRules));
    printWindow.document.close();
  };

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 18 }}>
        Only Supervisors, Duty Managers and Station Managers can view this page.
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 16,
        width: "100%",
        minWidth: 0,
        overflowX: "hidden",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 18 : 22,
          padding: isMobile ? 14 : isTablet ? "16px 18px" : "18px 20px",
          color: "#fff",
          boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 6,
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width: isMobile ? 34 : 40,
              height: isMobile ? 34 : 40,
              borderRadius: 10,
              background: "#fff",
              objectFit: "contain",
            }}
          />

          <div>
            <div
              style={{
                fontSize: isMobile ? 9 : 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {APP_NAME} {"\u00B7"} Operational Reports
            </div>

            <div
              style={{
                marginTop: 2,
                fontSize: isMobile ? 9.5 : 10.5,
                fontWeight: 700,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {APP_SUBTITLE}
            </div>
          </div>
        </div>

        <h1
          style={{
            margin: "0 0 4px",
            fontSize: isMobile ? 20 : isTablet ? 23 : 25,
            lineHeight: 1.08,
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {isSupervisor
            ? "My Supervisor Operational Reports"
            : "Operational Report Admin"}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 780,
            fontSize: isMobile ? 11.5 : 12.5,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {isSupervisor
            ? "Review your submitted operational reports and management feedback."
            : "Review delays, LOB operations, labor hours, attention items and management workflow."}
        </p>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: isMobile ? 11 : 14 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 12,
              padding: "10px 12px",
              color: "#1769aa",
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 12 : 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 10,
          }}
        >
          <div>
            <FieldLabel>Date Filter</FieldLabel>
            <SelectInput
              value={filters.dateMode}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateMode: e.target.value }))
              }
            >
              <option value="quick">Quick Range</option>
              <option value="custom">Custom Dates</option>
            </SelectInput>
          </div>

          {filters.dateMode === "quick" ? (
            <div>
              <FieldLabel>Range</FieldLabel>
              <SelectInput
                value={filters.range}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, range: e.target.value }))
                }
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </SelectInput>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>From</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      fromDate: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <FieldLabel>To</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.toDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, toDate: e.target.value }))
                  }
                />
              </div>
            </>
          )}

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All</option>
              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <SelectInput
              value={filters.department}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, department: e.target.value }))
              }
            >
              <option value="all">All</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Lifecycle</FieldLabel>
            <SelectInput
              value={filters.lifecycle}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, lifecycle: e.target.value }))
              }
            >
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>LOB Filter</FieldLabel>
            <SelectInput
              value={lobOnly ? "lobs" : "all"}
              onChange={(e) => setLobOnly(e.target.value === "lobs")}
            >
              <option value="all">All Reports</option>
              <option value="lobs">LOB Reports Only</option>
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {!isSupervisor && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
            gap: 9,
          }}
        >
          <InfoCard label="Reports" value={filteredReports.length} />
          <InfoCard label="Delayed" value={delayedReports.length} />
          <InfoCard label="LOB Flights" value={lobSummary.totalFlights} />
          <InfoCard
            label="LOB Labor"
            value={`${formatHours(lobSummary.totalLaborHours)} hrs`}
          />
        </div>
      )}

      {!isSupervisor && alerts.length > 0 && (
        <PageCard style={{ padding: isMobile ? 12 : 15 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: "#9f1239",
              marginBottom: 7,
            }}
          >
            Management Attention
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {alerts.map((text, index) => (
              <div
                key={`${text}-${index}`}
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: 10,
                  padding: "9px 10px",
                  color: "#9f1239",
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                {text}
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {!isSupervisor && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              gap: 8,
              alignItems: isMobile ? "stretch" : "center",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>
                LOB Management
              </div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>
                {lobSummary.totalFlights} flight(s) {"\u00B7"}{" "}
                {lobSummary.totalBags} bag(s) {"\u00B7"}{" "}
                {formatHours(lobSummary.totalLaborHours)} labor hours
              </div>
            </div>

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <ActionButton
                variant="secondary"
                onClick={() => setShowLobSection((prev) => !prev)}
              >
                {showLobSection ? "Hide LOBs" : "View LOBs"}
              </ActionButton>

              {isManager && (
                <ActionButton
                  variant="secondary"
                  onClick={() => setShowLobFormula((prev) => !prev)}
                >
                  {showLobFormula ? "Hide Formula" : "LOB Formula"}
                </ActionButton>
              )}
            </div>
          </div>

          {showLobSection && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {lobReports.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  No LOB reports found for this filter.
                </div>
              ) : (
                lobReports.map((report) => {
                  const labor = calculateLobLabor(report, lobRules);

                  return (
                    <div
                      key={report.id}
                      style={{
                        border: "1px solid #fed7aa",
                        background: "#fff7ed",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: isMobile ? "column" : "row",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 900,
                              color: "#7c2d12",
                            }}
                          >
                            {report.normalizedAirline || "\u2014"} {"\u00B7"}{" "}
                            {report.flightNumber || "\u2014"} {"\u00B7"}{" "}
                            {report.reportDate || "\u2014"}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11.5,
                              color: "#9a3412",
                            }}
                          >
                            {labor.bags} bags {"\u00B7"} {labor.agents} agents{" "}
                            {"\u00B7"} {labor.supervisors} supervisor(s) {"\u00B7"}{" "}
                            {formatHours(labor.estimatedHours)} formula hrs{" "}
                            {"\u00B7"} {formatHours(labor.totalLaborHours)} total
                            labor hrs
                          </div>
                        </div>

                        <ActionButton
                          variant="secondary"
                          onClick={() => {
                            setSelectedId(report.id);
                            setExpandedId(report.id);
                          }}
                        >
                          View
                        </ActionButton>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {showLobFormula && isManager && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                borderRadius: 12,
                padding: 11,
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                {lobRulesDraft.map((rule, index) => (
                  <div
                    key={rule.id || index}
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr 1fr"
                        : "1fr 1fr 1fr auto",
                      gap: 7,
                    }}
                  >
                    <TextInput
                      type="number"
                      min="0"
                      value={rule.minBags}
                      placeholder="Min bags"
                      onChange={(e) =>
                        setLobRulesDraft((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, minBags: e.target.value }
                              : item
                          )
                        )
                      }
                    />

                    <TextInput
                      type="number"
                      min="0"
                      value={rule.maxBags === null ? "" : rule.maxBags}
                      placeholder="Max / blank"
                      onChange={(e) =>
                        setLobRulesDraft((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, maxBags: e.target.value }
                              : item
                          )
                        )
                      }
                    />

                    <TextInput
                      type="number"
                      min="0"
                      step="0.25"
                      value={rule.hours}
                      placeholder="Hours"
                      onChange={(e) =>
                        setLobRulesDraft((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, hours: e.target.value }
                              : item
                          )
                        )
                      }
                    />

                    <ActionButton
                      variant="danger"
                      onClick={() =>
                        setLobRulesDraft((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      Remove
                    </ActionButton>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 9,
                  display: "flex",
                  gap: 7,
                  flexWrap: "wrap",
                }}
              >
                <ActionButton
                  variant="secondary"
                  onClick={() =>
                    setLobRulesDraft((prev) => [
                      ...prev,
                      {
                        id: `lob_${Date.now()}`,
                        minBags: 1,
                        maxBags: "",
                        hours: 1,
                      },
                    ])
                  }
                >
                  Add Range
                </ActionButton>

                <ActionButton
                  variant="success"
                  onClick={saveLobRules}
                  disabled={savingLobRules}
                >
                  {savingLobRules ? "Saving..." : "Save Formula"}
                </ActionButton>
              </div>
            </div>
          )}
        </PageCard>
      )}

      {!isSupervisor && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              gap: 8,
              alignItems: isMobile ? "stretch" : "center",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>
                Delay Summary
              </div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>
                {delayedReports.length} delayed report(s) in selected period.
              </div>
            </div>

            <ActionButton
              variant="secondary"
              onClick={() => setShowDelaySection((prev) => !prev)}
            >
              {showDelaySection ? "Hide Delays" : "View Delays"}
            </ActionButton>
          </div>

          {showDelaySection && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {delaySummary.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  No delayed flights found.
                </div>
              ) : (
                delaySummary.map((item) => (
                  <div
                    key={item.airline}
                    style={{
                      border: "1px solid #fed7aa",
                      background: "#fff7ed",
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: "#9a3412",
                      }}
                    >
                      {item.airline} {"\u00B7"} {item.totalDelayedFlights} delayed
                      flight(s)
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      {item.reports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(report.id);
                            setExpandedId(report.id);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            textAlign: "left",
                            fontSize: 11.5,
                            color: "#7c2d12",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          {report.reportDate || "\u2014"} {"\u00B7"}{" "}
                          {report.flightNumber || "\u2014"} {"\u00B7"}{" "}
                          {Number(report.delayedTimeMinutes || 0)} min
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 12 : 16 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a" }}>
            {isSupervisor ? "My Submitted Reports" : "Submitted Reports"}
          </div>

          <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>
            Total found: {filteredReports.length}
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Loading operational reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            No operational reports found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {filteredReports.map((report) => {
              const labor = calculateLobLabor(report, lobRules);
              const expanded = expandedId === report.id;
              const editing = editingId === report.id;

              return (
                <div
                  key={report.id}
                  style={{
                    border:
                      report.id === selectedId
                        ? "1px solid #93c5fd"
                        : "1px solid #e2e8f0",
                    background:
                      report.id === selectedId ? "#f8fbff" : "#ffffff",
                    borderRadius: 14,
                    padding: isMobile ? 10 : 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      gap: 9,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color: "#0f172a",
                          wordBreak: "break-word",
                        }}
                      >
                        {report.normalizedAirline || "\u2014"} {"\u00B7"}{" "}
                        {report.flightNumber || getTemplateLabel(report)}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          color: "#64748b",
                          lineHeight: 1.45,
                        }}
                      >
                        {report.reportDate || "\u2014"} {"\u00B7"}{" "}
                        {report.department || "\u2014"} {"\u00B7"}{" "}
                        {report.supervisorReporting || "\u2014"}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={getReviewStatusStyle(report.reviewStatus)}>
                          {getReviewStatusLabel(report.reviewStatus)}
                        </span>

                        {report.delayedFlight && (
                          <span
                            style={{
                              ...getReviewStatusStyle("follow_up_required"),
                            }}
                          >
                            Delay {Number(report.delayedTimeMinutes || 0)}m
                          </span>
                        )}

                        {labor.hasLobs && (
                          <span
                            style={{
                              ...getReviewStatusStyle("follow_up_required"),
                            }}
                          >
                            LOB {labor.bags}
                          </span>
                        )}

                        {shouldFlagNeedsAttention(report) && (
                          <span
                            style={{
                              ...getReviewStatusStyle("follow_up_required"),
                              background: "#fff1f2",
                              borderColor: "#fecdd3",
                              color: "#9f1239",
                            }}
                          >
                            Needs Attention
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignContent: "flex-start",
                      }}
                    >
                      <ActionButton
                        variant="secondary"
                        onClick={() => {
                          setSelectedId(report.id);
                          setExpandedId(expanded ? "" : report.id);
                          if (expanded) setEditingId("");
                        }}
                      >
                        {expanded ? "Close" : "View"}
                      </ActionButton>

                      {isManager && (
                        <ActionButton
                          variant="warning"
                          onClick={() => startEdit(report)}
                        >
                          Edit
                        </ActionButton>
                      )}

                      {isManager && (
                        <ActionButton
                          variant="danger"
                          disabled={deletingId === report.id}
                          onClick={() => deleteReport(report)}
                        >
                          {deletingId === report.id ? "Deleting..." : "Delete"}
                        </ActionButton>
                      )}
                    </div>
                  </div>

                  {expanded && !editing && (
                    <div
                      style={{
                        marginTop: 11,
                        paddingTop: 11,
                        borderTop: "1px solid #e2e8f0",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile
                            ? "1fr 1fr"
                            : "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: 8,
                        }}
                      >
                        <InfoCard label="Template" value={getTemplateLabel(report)} />
                        <InfoCard label="Shift" value={report.shift || "\u2014"} />
                        <InfoCard
                          label={isCabinServiceReport(report) ? "Flights Serviced" : "Flights Handled"}
                          value={report.flightsHandled || "\u2014"}
                        />
                        <InfoCard
                          label="Created"
                          value={formatDateTime(report.createdAt)}
                        />
                      </div>

                      {labor.hasLobs && (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile
                              ? "1fr 1fr"
                              : "repeat(4, minmax(0, 1fr))",
                            gap: 8,
                          }}
                        >
                          <InfoCard label="LOB Bags" value={labor.bags} />
                          <InfoCard
                            label="Formula Hours"
                            value={formatHours(labor.estimatedHours)}
                          />
                          <InfoCard
                            label="Agent Hours"
                            value={formatHours(labor.agentLaborHours)}
                          />
                          <InfoCard
                            label="Total Labor"
                            value={formatHours(labor.totalLaborHours)}
                          />
                        </div>
                      )}

                      <DetailBox
                        label="Delayed Reason"
                        value={report.delayedReason || "\u2014"}
                      />
                      <DetailBox label="Notes" value={report.notes || "\u2014"} />
                      <DetailBox
                        label="Manager Notes"
                        value={report.managerNotes || "\u2014"}
                      />
                      <DetailBox
                        label="Follow Up Action"
                        value={report.followUpAction || "\u2014"}
                      />
                      <DetailBox
                        label="Follow Up Details"
                        value={report.followUpDetails || "\u2014"}
                      />

                      <div style={{ display: "grid", gap: 7 }}>
                        {Object.entries(report.responses || {})
                          .filter(
                            ([key]) =>
                              ![
                                "lobs",
                                "has_lobs",
                                "had_lobs",
                                "lob_bags",
                                "lob_total_bags",
                                "lob_agents_used",
                                "lob_supervisors_used",
                              ].includes(key)
                          )
                          .map(([key, value]) => (
                            <DetailBox
                              key={key}
                              label={prettifyKey(key)}
                              value={formatResponseValue(value)}
                            />
                          ))}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <ActionButton
                          variant="secondary"
                          onClick={() => handlePrintExport(report)}
                        >
                          Print / Export
                        </ActionButton>

                        {isManager && report.reviewStatus !== "read" && (
                          <ActionButton
                            variant="secondary"
                            disabled={actionId === report.id}
                            onClick={() => updateWorkflowStatus(report, "read")}
                          >
                            Mark Read
                          </ActionButton>
                        )}

                        {isManager && report.reviewStatus !== "approved" && (
                          <ActionButton
                            variant="success"
                            disabled={actionId === report.id}
                            onClick={() =>
                              updateWorkflowStatus(report, "approved")
                            }
                          >
                            Approve
                          </ActionButton>
                        )}

                        {isManager &&
                          report.reviewStatus !== "follow_up_required" && (
                            <ActionButton
                              variant="warning"
                              disabled={actionId === report.id}
                              onClick={() =>
                                updateWorkflowStatus(
                                  report,
                                  "follow_up_required"
                                )
                              }
                            >
                              Require Follow Up
                            </ActionButton>
                          )}

                        {isManager && report.reviewStatus !== "closed" && (
                          <ActionButton
                            variant="secondary"
                            disabled={actionId === report.id}
                            onClick={() => updateWorkflowStatus(report, "closed")}
                          >
                            Close
                          </ActionButton>
                        )}

                        {isManager && report.reviewStatus !== "archived" && (
                          <ActionButton
                            variant="secondary"
                            disabled={actionId === report.id}
                            onClick={() =>
                              updateWorkflowStatus(report, "archived")
                            }
                          >
                            Archive
                          </ActionButton>
                        )}
                      </div>

                      {isManager && (
                        <div
                          style={{
                            border: "1px solid #dbeafe",
                            background: "#f8fbff",
                            borderRadius: 12,
                            padding: 10,
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <FieldLabel>Manager Notes</FieldLabel>
                          <TextArea
                            value={editForm.managerNotes}
                            onFocus={() => {
                              if (!editingId) startEdit(report);
                            }}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                managerNotes: e.target.value,
                              }))
                            }
                          />

                          <FieldLabel>Follow Up Action</FieldLabel>
                          <TextArea
                            value={editForm.followUpAction}
                            onFocus={() => {
                              if (!editingId) startEdit(report);
                            }}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                followUpAction: e.target.value,
                              }))
                            }
                          />

                          <FieldLabel>Follow Up Details</FieldLabel>
                          <TextArea
                            value={editForm.followUpDetails}
                            onFocus={() => {
                              if (!editingId) startEdit(report);
                            }}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                followUpDetails: e.target.value,
                              }))
                            }
                          />

                          <ActionButton
                            variant="warning"
                            disabled={actionId === report.id}
                            onClick={() => saveFollowUp(report)}
                          >
                            Save Follow Up
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  )}

                  {expanded && editing && isManager && (
                    <div
                      style={{
                        marginTop: 11,
                        paddingTop: 11,
                        borderTop: "1px solid #e2e8f0",
                        display: "grid",
                        gap: 9,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile
                            ? "1fr"
                            : "repeat(2, minmax(0, 1fr))",
                          gap: 8,
                        }}
                      >
                        {[
                          ["Department", "department"],
                          ["Template", "templateLabel"],
                          ["Airline", "airline"],
                          ["Shift", "shift"],
                          ["Flights Handled", "flightsHandled"],
                          ["Supervisor Reporting", "supervisorReporting"],
                        ].map(([label, key]) => (
                          <div key={key}>
                            <FieldLabel>{label}</FieldLabel>
                            <TextInput
                              value={editForm[key]}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}

                        <div>
                          <FieldLabel>Report Date</FieldLabel>
                          <TextInput
                            type="date"
                            value={editForm.reportDate}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                reportDate: e.target.value,
                              }))
                            }
                          />
                        </div>

                        {!isCabinServiceReport(editForm) && (
                          <div>
                            <FieldLabel>Flight Number</FieldLabel>
                            <TextInput
                              value={editForm.flightNumber}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  flightNumber: e.target.value,
                                }))
                              }
                            />
                          </div>
                        )}

                        <div>
                          <FieldLabel>Delayed Flight</FieldLabel>
                          <SelectInput
                            value={editForm.delayedFlight ? "Yes" : "No"}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                delayedFlight: e.target.value === "Yes",
                              }))
                            }
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </SelectInput>
                        </div>

                        <div>
                          <FieldLabel>Delayed Minutes</FieldLabel>
                          <TextInput
                            type="number"
                            value={editForm.delayedTimeMinutes}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                delayedTimeMinutes: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          border: "1px solid #fed7aa",
                          background: "#fff7ed",
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <FieldLabel>Did this flight have LOBs?</FieldLabel>

                        <SelectInput
                          value={editForm.hasLobs ? "Yes" : "No"}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              hasLobs: e.target.value === "Yes",
                            }))
                          }
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </SelectInput>

                        {editForm.hasLobs && (
                          <div
                            style={{
                              marginTop: 8,
                              display: "grid",
                              gridTemplateColumns: isMobile
                                ? "1fr"
                                : "repeat(3, minmax(0, 1fr))",
                              gap: 8,
                            }}
                          >
                            <div>
                              <FieldLabel>LOB Bags</FieldLabel>
                              <TextInput
                                type="number"
                                min="0"
                                value={editForm.lobBags}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobBags: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>Agents Used</FieldLabel>
                              <TextInput
                                type="number"
                                min="0"
                                value={editForm.lobAgentsUsed}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobAgentsUsed: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>Supervisors Used</FieldLabel>
                              <TextInput
                                type="number"
                                min="0"
                                value={editForm.lobSupervisorsUsed}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobSupervisorsUsed: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <FieldLabel>Delayed Reason</FieldLabel>
                        <TextArea
                          value={editForm.delayedReason}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              delayedReason: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div>
                        <FieldLabel>Notes</FieldLabel>
                        <TextArea
                          value={editForm.notes}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div>
                        <FieldLabel>Manager Notes</FieldLabel>
                        <TextArea
                          value={editForm.managerNotes}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              managerNotes: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div>
                        <FieldLabel>Follow Up Action</FieldLabel>
                        <TextArea
                          value={editForm.followUpAction}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              followUpAction: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div>
                        <FieldLabel>Follow Up Details</FieldLabel>
                        <TextArea
                          value={editForm.followUpDetails}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              followUpDetails: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          flexWrap: "wrap",
                        }}
                      >
                        <ActionButton
                          variant="success"
                          disabled={savingId === report.id}
                          onClick={() => saveEdit(report)}
                        >
                          {savingId === report.id ? "Saving..." : "Save"}
                        </ActionButton>

                        <ActionButton
                          variant="secondary"
                          onClick={() => setEditingId("")}
                        >
                          Cancel
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageCard>
    </div>
  );
}

// END OperationalReportAdminPage
