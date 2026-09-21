import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

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
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
        width: "100%",
        maxWidth: "100%",
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
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        minHeight: 46,
        ...props.style,
      }}
    />
  );
}

function TimeInput(props) {
  return (
    <input
      type="time"
      step="60"
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        minHeight: 46,
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        minHeight: 46,
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
        fontFamily: "inherit",
        boxSizing: "border-box",
        minHeight: 100,
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  style = {},
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
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
    dark: {
      background: "#0f172a",
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
        borderRadius: 12,
        padding: "10px 14px",
        minHeight: 42,
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 20,
          fontWeight: 900,
          color: current.color,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}


function AircraftSilhouette({
  width = 132,
  height = 54,
  color = "#0f2f57",
}) {
  return (
    <svg
      viewBox="0 0 220 90"
      width={width}
      height={height}
      aria-hidden="true"
      role="img"
      style={{ display: "block", maxWidth: "100%" }}
    >
      <path
        fill={color}
        d="M13 50c0-4 5-7 13-8l52-6 28-28h15l-12 27 63-2 18-14h11l-7 14 13 4c9 3 14 7 14 12 0 6-8 10-23 12l-72 2 17 21h-14L96 64l-48 1-18 13H18l10-14-8-2c-5-1-7-5-7-12Z"
      />
      <rect x="144" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
      <rect x="159" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
      <rect x="174" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
    </svg>
  );
}

function getAircraftSvgHtml(color = "#0f2f57") {
  return `
    <svg viewBox="0 0 220 90" width="150" height="60" aria-hidden="true" style="display:block;margin:0 auto;">
      <path
        fill="${color}"
        d="M13 50c0-4 5-7 13-8l52-6 28-28h15l-12 27 63-2 18-14h11l-7 14 13 4c9 3 14 7 14 12 0 6-8 10-23 12l-72 2 17 21h-14L96 64l-48 1-18 13H18l10-14-8-2c-5-1-7-5-7-12Z"
      />
      <rect x="144" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
      <rect x="159" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
      <rect x="174" y="39" width="11" height="5" rx="2" fill="#ffffff" opacity="0.88" />
    </svg>
  `;
}

function getWeekBucketLabel(dateStr) {
  if (!dateStr) return "Other";
  const day = Number(String(dateStr).slice(8, 10)) || 0;

  if (day <= 7) return "1-7";
  if (day <= 14) return "8-14";
  if (day <= 21) return "15-21";
  if (day <= 28) return "22-28";
  return "29-31";
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function getStartOfWeek(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateOnly(d);
}

function toDateOnly(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sameMonth(dateStr, month) {
  return String(dateStr || "").slice(0, 7) === month;
}

function sameWeek(dateStr, weekStart) {
  return getStartOfWeek(dateStr) === weekStart;
}

function inDateRange(dateStr, startDate, endDate) {
  if (!dateStr) return false;
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

function getOtpPercent(otpFlights, flights) {
  if (!flights) return 0;
  return (otpFlights / flights) * 100;
}

function getMbrPercent(notLoadedBags, checkedBags) {
  if (!checkedBags) return 0;
  return (notLoadedBags / checkedBags) * 100;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function getMonthKey(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getAirlineDisplayName(code) {
  const names = {
    SY: "Sun Country Airlines",
    AV: "Avianca",
    WL: "World Atlantic Airlines",
  };
  const clean = String(code || "").trim().toUpperCase();
  return names[clean] || clean || "All Airlines";
}

function formatMonthYear(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return "Selected Period";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function printManagementView() {
  window.print();
}

function DetailsRow({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function getStdValue(report) {
  return report?.std || report?.etd || "";
}

function getNewStdValue(report) {
  return report?.newStd || report?.newEtd || "";
}

function createEditDraft(report) {
  return {
    airline: report.airline || "SY",
    flight: report.flight || "",
    date: report.date || "",
    aircraft: report.aircraft || "",
    origin: report.origin || "",
    destination: report.destination || "",
    gateAgent: report.gateAgent || "",
    expeditor: report.expeditor || "",
    supervisor: report.supervisor || "",
    finalTotalPax:
      report.finalTotalPax !== undefined && report.finalTotalPax !== null
        ? String(report.finalTotalPax)
        : "",
    totalIbPax:
      report.totalIbPax !== undefined && report.totalIbPax !== null
        ? String(report.totalIbPax)
        : "",
    delay: report.delay || "No",
    delayTimeMinutes:
      report.delayTimeMinutes !== undefined && report.delayTimeMinutes !== null
        ? String(report.delayTimeMinutes)
        : "",
    delayCode: report.delayCode || "",
    controllable: report.controllable || "No",
    blockIn: report.blockIn || "",
    std: report.std || report.etd || "",
    newStd: report.newStd || report.newEtd || "",
    boardingDeadline: report.boardingDeadline || "",
    actualDepartureTime: report.actualDepartureTime || "",
    actualArrivalTime: report.actualArrivalTime || "",
    brakeReleaseTime: report.brakeReleaseTime || "",
    pushTime: report.pushTime || "",
    gateAgent1Arrival: report.gateAgent1Arrival || "",
    gateAgent2Arrival: report.gateAgent2Arrival || "",
    checkedBags:
      report.checkedBags !== undefined && report.checkedBags !== null
        ? String(report.checkedBags)
        : "",
    notLoadedBags:
      report.notLoadedBags !== undefined && report.notLoadedBags !== null
        ? String(report.notLoadedBags)
        : "",
    gpuConnected: report.gpuConnected || "",
    firstPaxOff: report.firstPaxOff || "",
    lastPaxOff: report.lastPaxOff || "",
    firstPaxOn: report.firstPaxOn || "",
    lastPaxOn: report.lastPaxOn || "",
    remarks: report.remarks || "",
  };
}

function printReportDetails(report) {
  const specials = report?.specials || {};
  const gateCheck = report?.gateCheck || {};
  const delayAnnouncements = Array.isArray(report?.delayAnnouncements)
    ? report.delayAnnouncements
    : [];
  const checklistSections = Array.isArray(report?.checklistSections)
    ? report.checklistSections
    : [];
  const actuals = report?.actuals || {};
  const std = getStdValue(report);
  const newStd = getNewStdValue(report);

  const html = `
    <html>
      <head>
        <title>AeroStation Hub - Gate Checklist Details</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            padding: 24px;
            color: #0f172a;
          }
          h1, h2, h3 {
            margin: 0 0 12px;
          }
          .card {
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }
          .label {
            font-size: 11px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 800;
            letter-spacing: 0.06em;
          }
          .value {
            margin-top: 6px;
            font-size: 14px;
            font-weight: 700;
            white-space: pre-wrap;
            word-break: break-word;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            vertical-align: top;
            text-align: left;
            font-size: 13px;
          }
          th {
            background: #f8fafc;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
        </style>
      </head>
      <body>
        <h1>AeroStation Hub - Gate Checklist Details</h1>

        <div class="card">
          <div class="grid">
            <div><div class="label">Airline</div><div class="value">${report.airline || "-"}</div></div>
            <div><div class="label">Flight</div><div class="value">${report.flight || "-"}</div></div>
            <div><div class="label">Date</div><div class="value">${report.date || "-"}</div></div>
            <div><div class="label">Aircraft</div><div class="value">${report.aircraft || "-"}</div></div>

            <div><div class="label">Origin</div><div class="value">${report.origin || "-"}</div></div>
            <div><div class="label">Destination</div><div class="value">${report.destination || "-"}</div></div>
            <div><div class="label">Gate Agent</div><div class="value">${report.gateAgent || "-"}</div></div>
            <div><div class="label">Expeditor</div><div class="value">${report.expeditor || "-"}</div></div>

            <div><div class="label">Supervisor</div><div class="value">${report.supervisor || "-"}</div></div>
            <div><div class="label">Final Total Pax</div><div class="value">${safeNumber(report.finalTotalPax)}</div></div>
            <div><div class="label">Total IB Pax</div><div class="value">${safeNumber(report.totalIbPax)}</div></div>
            <div><div class="label">Delay</div><div class="value">${report.delay || "-"}</div></div>

            <div><div class="label">Delay Minutes</div><div class="value">${safeNumber(report.delayTimeMinutes)}</div></div>
            <div><div class="label">Delay Code</div><div class="value">${report.delayCode || "-"}</div></div>
            <div><div class="label">Controllable</div><div class="value">${report.controllable || "-"}</div></div>
            <div><div class="label">Block In</div><div class="value">${report.blockIn || "-"}</div></div>

            <div><div class="label">STD</div><div class="value">${std || "-"}</div></div>
            <div><div class="label">New STD</div><div class="value">${newStd || "-"}</div></div>
            <div><div class="label">${report.airline === "SY" ? "D-10" : "D-15"}</div><div class="value">${report.boardingDeadline || "-"}</div></div>
            <div><div class="label">Actual Departure</div><div class="value">${report.actualDepartureTime || "-"}</div></div>

            <div><div class="label">Actual Arrival</div><div class="value">${report.actualArrivalTime || "-"}</div></div>
            <div><div class="label">Brake Release</div><div class="value">${report.brakeReleaseTime || "-"}</div></div>
            <div><div class="label">Push Time</div><div class="value">${report.pushTime || "-"}</div></div>
            <div><div class="label">GPU Connected</div><div class="value">${report.gpuConnected || "-"}</div></div>

            <div><div class="label">Gate Agent 1 Arrival</div><div class="value">${report.gateAgent1Arrival || "-"}</div></div>
            <div><div class="label">Gate Agent 2 Arrival</div><div class="value">${report.gateAgent2Arrival || "-"}</div></div>
            <div><div class="label">Checked Bags</div><div class="value">${safeNumber(report.checkedBags)}</div></div>
            <div><div class="label">Not Loaded Bags</div><div class="value">${safeNumber(report.notLoadedBags)}</div></div>

            <div><div class="label">MBR %</div><div class="value">${formatPercent(
              getMbrPercent(safeNumber(report.notLoadedBags), safeNumber(report.checkedBags))
            )}</div></div>
            <div><div class="label">First Pax Off</div><div class="value">${report.firstPaxOff || "-"}</div></div>
            <div><div class="label">Last Pax Off</div><div class="value">${report.lastPaxOff || "-"}</div></div>
            <div><div class="label">First Pax On</div><div class="value">${report.firstPaxOn || "-"}</div></div>

            <div><div class="label">Last Pax On</div><div class="value">${report.lastPaxOn || "-"}</div></div>
            <div><div class="label">Submitted By</div><div class="value">${report.submittedBy || "-"}</div></div>
            <div><div class="label">Created</div><div class="value">${formatDateTime(report.createdAt)}</div></div>
            <div><div class="label">Status</div><div class="value">${report.status || "-"}</div></div>
          </div>
        </div>

        <div class="card">
          <h3>Specials</h3>
          <table>
            <thead>
              <tr><th>Type</th><th>Value</th></tr>
            </thead>
            <tbody>
              ${Object.keys(specials).length
                ? Object.entries(specials)
                    .map(
                      ([key, value]) =>
                        `<tr><td>${key}</td><td>${String(value || "-")}</td></tr>`
                    )
                    .join("")
                : `<tr><td colspan="2">No specials</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Gate Check</h3>
          <table>
            <thead>
              <tr><th>Item</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td>Bags</td><td>${gateCheck.bags || "-"}</td></tr>
              <tr><td>Strollers / Car Seats</td><td>${gateCheck.strollersCarSeats || "-"}</td></tr>
              <tr><td>WCHRS</td><td>${gateCheck.wchrs || "-"}</td></tr>
              <tr><td>Other</td><td>${gateCheck.other || "-"}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Delay Announcements</h3>
          ${
            delayAnnouncements.length
              ? `<ul>${delayAnnouncements
                  .map((item) => `<li>${item || "-"}</li>`)
                  .join("")}</ul>`
              : `<div>No delay announcements</div>`
          }
        </div>

        <div class="card">
          <h3>Checklist Details</h3>
          <table>
            <thead>
              <tr><th>Time</th><th>Task</th><th>Actual</th></tr>
            </thead>
            <tbody>
              ${
                checklistSections.length
                  ? checklistSections
                      .map((section, sectionIndex) =>
                        (section.tasks || [])
                          .map(
                            (task, taskIndex) => `
                              <tr>
                                <td>${section.time || "-"}</td>
                                <td>${task || "-"}</td>
                                <td>${actuals[`${sectionIndex}-${taskIndex}`] || "-"}</td>
                              </tr>
                            `
                          )
                          .join("")
                      )
                      .join("")
                  : `<tr><td colspan="3">No checklist data</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Notes</h3>
          <div class="value">${report.remarks || "-"}</div>
        </div>

        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">
          AeroStation Hub | Operational Management Platform
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

export default function GateChecklistManagementPage() {
  const { isMobile, isTablet } = useViewport();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [editingReportId, setEditingReportId] = useState("");
  const [editDraft, setEditDraft] = useState(null);

  const [filters, setFilters] = useState({
    airline: "all",
    flight: "",
    date: "",
    weekStart: "",
    month: "",
    startDate: "",
    endDate: "",
    periodType: "day",
    status: "all",
    monthClosed: "all",
    delay: "all",
    otp: "all",
    supervisor: "",
    search: "",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const snap = await getDocs(
          query(collection(db, "gateChecklistReports"), orderBy("createdAt", "desc"))
        );

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (error) {
        console.error("Error loading gate checklist reports:", error);
        setStatusMessage("Could not load gate checklist reports.");
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const airlineOptions = useMemo(() => {
    return Array.from(
      new Set(
        reports
          .map((item) => String(item.airline || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const monthOptions = useMemo(() => {
    return Array.from(
      new Set(
        reports
          .map((item) => getMonthKey(item.date || item.month || ""))
          .filter((value) => /^\d{4}-\d{2}$/.test(value))
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const supervisorOptions = useMemo(() => {
    return Array.from(
      new Set(
        reports
          .map((item) =>
            String(item.supervisor || item.submittedBy || "").trim()
          )
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (filters.airline !== "all" && item.airline !== filters.airline) {
        return false;
      }

      if (
        filters.flight &&
        !String(item.flight || "")
          .toLowerCase()
          .includes(filters.flight.toLowerCase().trim())
      ) {
        return false;
      }

      if (filters.status !== "all" && String(item.status || "") !== filters.status) {
        return false;
      }

      if (filters.monthClosed !== "all") {
        const isClosed = !!item.monthClosed;
        if (filters.monthClosed === "closed" && !isClosed) return false;
        if (filters.monthClosed === "open" && isClosed) return false;
      }

      if (filters.delay !== "all") {
        const hasDelay = String(item.delay || "No") === "Yes";
        if (filters.delay === "yes" && !hasDelay) return false;
        if (filters.delay === "no" && hasDelay) return false;
      }

      if (filters.otp !== "all") {
        if (filters.otp === "otp" && item.isOtpDeparture !== true) return false;
        if (filters.otp === "nonotp" && item.isOtpDeparture !== false) return false;
      }

      if (
        filters.supervisor &&
        !String(item.supervisor || item.submittedBy || "")
          .toLowerCase()
          .includes(filters.supervisor.toLowerCase().trim())
      ) {
        return false;
      }

      const searchValue = String(filters.search || "")
        .trim()
        .toLowerCase();

      if (searchValue) {
        const haystack = [
          item.airline,
          item.flight,
          item.origin,
          item.destination,
          item.aircraft,
          item.gateAgent,
          item.expeditor,
          item.supervisor,
          item.submittedBy,
          item.delayCode,
          item.status,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        if (!haystack.includes(searchValue)) {
          return false;
        }
      }

      if (filters.periodType === "day" && filters.date) {
        if (item.date !== filters.date) return false;
      }

      if (filters.periodType === "week" && filters.weekStart) {
        if (!sameWeek(item.date, filters.weekStart)) return false;
      }

      if (filters.periodType === "month" && filters.month) {
        if (!sameMonth(item.date, filters.month)) return false;
      }

      if (filters.periodType === "range") {
        if (!inDateRange(item.date, filters.startDate, filters.endDate)) {
          return false;
        }
      }

      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((item) => item.id === selectedReportId) || null;
  }, [filteredReports, selectedReportId]);

  const otpByAirline = useMemo(() => {
    const map = {};

    filteredReports.forEach((item) => {
      const airline = item.airline || "N/A";

      if (!map[airline]) {
        map[airline] = {
          flights: 0,
          otpFlights: 0,
          totalCheckedBags: 0,
          totalNotLoadedBags: 0,
        };
      }

      map[airline].flights += 1;
      map[airline].totalCheckedBags += safeNumber(item.checkedBags);
      map[airline].totalNotLoadedBags += safeNumber(item.notLoadedBags);

      if (item.isOtpDeparture === true) {
        map[airline].otpFlights += 1;
      }
    });

    return Object.entries(map).map(([airline, data]) => {
      const otpPercent = getOtpPercent(data.otpFlights, data.flights);
      const mbrPercent = getMbrPercent(
        data.totalNotLoadedBags,
        data.totalCheckedBags
      );

      return {
        airline,
        ...data,
        otpPercent,
        mbrPercent,
      };
    });
  }, [filteredReports]);

  const paxFlowSummary = useMemo(() => {
    return filteredReports.map((item) => ({
      id: item.id,
      date: item.date || "-",
      airline: item.airline || "-",
      flight: item.flight || "-",
      route: `${item.origin || "-"} - ${item.destination || "-"}`,
      totalIbPax: safeNumber(item.totalIbPax),
      finalTotalPax: safeNumber(item.finalTotalPax),
    }));
  }, [filteredReports]);

  const delaySummary = useMemo(() => {
    return filteredReports
      .filter((item) => String(item.delay || "No") === "Yes")
      .map((item) => ({
        id: item.id,
        airline: item.airline || "-",
        flight: item.flight || "-",
        route: `${item.origin || "-"} - ${item.destination || "-"}`,
        std: getStdValue(item) || "-",
        pushTime: item.pushTime || "-",
        delayTimeMinutes: safeNumber(item.delayTimeMinutes),
        delayCode: item.delayCode || "-",
      }));
  }, [filteredReports]);

  const totals = useMemo(() => {
    const flights = filteredReports.length;
    const otpFlights = filteredReports.filter(
      (item) => item.isOtpDeparture === true
    ).length;
    const checkedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.checkedBags),
      0
    );
    const notLoadedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.notLoadedBags),
      0
    );
    const totalIbPax = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.totalIbPax),
      0
    );
    const totalOutPax = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.finalTotalPax),
      0
    );

    const delayedFlights = filteredReports.filter(
      (item) => String(item.delay || "No") === "Yes"
    ).length;

    const controllableDelays = filteredReports.filter(
      (item) =>
        String(item.delay || "No") === "Yes" &&
        String(item.controllable || "No") === "Yes"
    ).length;

    const totalDelayMinutes = filteredReports.reduce(
      (sum, item) =>
        sum +
        (String(item.delay || "No") === "Yes"
          ? safeNumber(item.delayTimeMinutes)
          : 0),
      0
    );

    const avgDelayMinutes = delayedFlights
      ? totalDelayMinutes / delayedFlights
      : 0;

    const otpPercent = getOtpPercent(otpFlights, flights);
    const stationMbrPercent = getMbrPercent(notLoadedBags, checkedBags);

    return {
      flights,
      otpFlights,
      otpPercent,
      checkedBags,
      notLoadedBags,
      stationMbrPercent,
      totalIbPax,
      totalOutPax,
      delayedFlights,
      controllableDelays,
      totalDelayMinutes,
      avgDelayMinutes,
    };
  }, [filteredReports]);

  const monthlySummaries = useMemo(() => {
    const monthlyMap = {};

    reports.forEach((item) => {
      const month = getMonthKey(item.date || item.month || "");
      if (!month) return;

      if (!monthlyMap[month]) {
        monthlyMap[month] = {
          month,
          flights: 0,
          otpFlights: 0,
          checkedBags: 0,
          notLoadedBags: 0,
          totalIbPax: 0,
          totalOutPax: 0,
          monthClosed: false,
          closedAt: "",
        };
      }

      monthlyMap[month].flights += 1;
      monthlyMap[month].checkedBags += safeNumber(item.checkedBags);
      monthlyMap[month].notLoadedBags += safeNumber(item.notLoadedBags);
      monthlyMap[month].totalIbPax += safeNumber(item.totalIbPax);
      monthlyMap[month].totalOutPax += safeNumber(item.finalTotalPax);

      if (item.isOtpDeparture === true) {
        monthlyMap[month].otpFlights += 1;
      }

      if (item.monthClosed) {
        monthlyMap[month].monthClosed = true;
        monthlyMap[month].closedAt = item.monthClosedAt || monthlyMap[month].closedAt;
      }
    });

    return Object.values(monthlyMap)
      .map((row) => ({
        ...row,
        otpPercent: getOtpPercent(row.otpFlights, row.flights),
        mbrPercent: getMbrPercent(row.notLoadedBags, row.checkedBags),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [reports]);

  async function handleDeleteReport(reportId) {
    const ok = window.confirm("Delete this report permanently?");
    if (!ok) return;

    try {
      setWorkingId(reportId);
      await deleteDoc(doc(db, "gateChecklistReports", reportId));
      setReports((prev) => prev.filter((item) => item.id !== reportId));
      if (selectedReportId === reportId) setSelectedReportId("");
      if (editingReportId === reportId) {
        setEditingReportId("");
        setEditDraft(null);
      }
      setStatusMessage("Report deleted successfully.");
    } catch (error) {
      console.error("Error deleting report:", error);
      setStatusMessage("Could not delete report.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleCloseMonth(monthValue) {
    const monthReports = reports.filter((item) => getMonthKey(item.date || "") === monthValue);

    if (!monthReports.length) {
      setStatusMessage("No reports found for that month.");
      return;
    }

    const ok = window.confirm(
      `Close month ${monthValue} for ${monthReports.length} reports?`
    );
    if (!ok) return;

    try {
      setWorkingId(monthValue);

      await Promise.all(
        monthReports.map((item) =>
          updateDoc(doc(db, "gateChecklistReports", item.id), {
            monthClosed: true,
            monthClosedAt: serverTimestamp(),
          })
        )
      );

      setReports((prev) =>
        prev.map((item) =>
          getMonthKey(item.date || "") === monthValue
            ? {
                ...item,
                monthClosed: true,
                monthClosedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage(`Month ${monthValue} closed successfully.`);
    } catch (error) {
      console.error("Error closing month:", error);
      setStatusMessage("Could not close month.");
    } finally {
      setWorkingId("");
    }
  }

  function handlePrintAirlineKpis(row) {
    if (!row) return;

    const airlineReports = filteredReports.filter(
      (item) => String(item.airline || "") === String(row.airline || "")
    );
    const delayedFlights = airlineReports.filter(
      (item) => String(item.delay || "No") === "Yes"
    );
    const totalDelayMinutes = delayedFlights.reduce(
      (sum, item) => sum + safeNumber(item.delayTimeMinutes),
      0
    );
    const avgDelay = delayedFlights.length
      ? totalDelayMinutes / delayedFlights.length
      : 0;
    const ibPax = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.totalIbPax),
      0
    );
    const outPax = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.finalTotalPax),
      0
    );

    const monthKey =
      filters.periodType === "month" && filters.month
        ? filters.month
        : airlineReports.length
        ? getMonthKey(airlineReports[0].date || "")
        : "";
    const periodLabel = monthKey ? formatMonthYear(monthKey) : "Selected Period";
    const airlineName = getAirlineDisplayName(row.airline);

    const delayRows = delayedFlights.length
      ? delayedFlights
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.date || "-")}</td>
                <td>${escapeHtml(item.flight || "-")}</td>
                <td>${escapeHtml(`${item.origin || "-"} - ${item.destination || "-"}`)}</td>
                <td>${escapeHtml(getStdValue(item) || "-")}</td>
                <td>${escapeHtml(item.pushTime || "-")}</td>
                <td>${safeNumber(item.delayTimeMinutes)} min</td>
                <td>${escapeHtml(item.delayCode || "-")}</td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="7" class="empty">No delays reported for this period.</td></tr>`;

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(airlineName)} - KPI Report - ${escapeHtml(periodLabel)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: landscape; margin: 0.45in; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff; }
            .sheet { max-width: 1120px; margin: 0 auto; }
            .header { border: 1px solid #dbeafe; border-radius: 18px; padding: 22px 24px; background: linear-gradient(135deg,#f8fbff,#eef8ff); }
            .eyebrow { color:#1769aa; font-size:11px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
            h1 { margin:7px 0 3px; font-size:29px; line-height:1.05; }
            .sub { color:#64748b; font-size:13px; font-weight:700; }
            .period { margin-top:10px; display:inline-block; padding:7px 11px; border-radius:999px; background:#1769aa; color:white; font-size:11px; font-weight:900; }
            .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:14px; }
            .kpi { border:1px solid #dbeafe; border-radius:14px; padding:13px 14px; background:#fff; }
            .kpi-label { font-size:9px; font-weight:900; color:#64748b; letter-spacing:.07em; text-transform:uppercase; }
            .kpi-value { margin-top:5px; font-size:22px; font-weight:900; }
            .section { margin-top:16px; }
            .section h2 { margin:0 0 8px; font-size:16px; }
            table { width:100%; border-collapse:collapse; }
            th,td { border:1px solid #dbe3ec; padding:8px 9px; font-size:10px; text-align:left; }
            th { background:#f8fbff; color:#475569; font-size:9px; text-transform:uppercase; letter-spacing:.05em; }
            .empty { text-align:center; color:#64748b; padding:16px; }
            .footer { margin-top:18px; padding-top:10px; border-top:1px solid #e2e8f0; text-align:center; color:#94a3b8; font-size:9px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <div class="eyebrow">AeroStation Hub | Operational Management Platform</div>
              <h1>${escapeHtml(airlineName)}</h1>
              <div class="sub">Gate Operations KPI & MBR Performance Report</div>
              <div class="period">${escapeHtml(periodLabel)}</div>
            </div>

            <div class="kpis">
              <div class="kpi"><div class="kpi-label">Flights</div><div class="kpi-value">${row.flights}</div></div>
              <div class="kpi"><div class="kpi-label">OTP</div><div class="kpi-value">${formatPercent(row.otpPercent)}</div></div>
              <div class="kpi"><div class="kpi-label">Checked Bags</div><div class="kpi-value">${row.totalCheckedBags}</div></div>
              <div class="kpi"><div class="kpi-label">Not Loaded</div><div class="kpi-value">${row.totalNotLoadedBags}</div></div>
              <div class="kpi"><div class="kpi-label">MBR</div><div class="kpi-value">${formatPercent(row.mbrPercent)}</div></div>
              <div class="kpi"><div class="kpi-label">Delayed Flights</div><div class="kpi-value">${delayedFlights.length}</div></div>
              <div class="kpi"><div class="kpi-label">Avg Delay</div><div class="kpi-value">${avgDelay.toFixed(1)} min</div></div>
              <div class="kpi"><div class="kpi-label">Pax Flow</div><div class="kpi-value" style="font-size:16px">${ibPax} IB | ${outPax} OUT</div></div>
            </div>

            <div class="section">
              <h2>Delay Detail</h2>
              <table>
                <thead><tr><th>Date</th><th>Flight</th><th>Route</th><th>STD</th><th>Push Back</th><th>Delay</th><th>Code</th></tr></thead>
                <tbody>${delayRows}</tbody>
              </table>
            </div>

            <div class="footer">AeroStation Hub | ${escapeHtml(airlineName)} | ${escapeHtml(periodLabel)}</div>
          </div>
        </body>
      </html>`;

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print/export the KPI report.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 450);
  }

  function handleExportCurrentCsv() {
    const rows = [
      [
        "Date",
        "Airline",
        "Flight",
        "Origin",
        "Destination",
        "STD",
        "Push Time",
        "OTP",
        "Final Total Pax",
        "Total IB Pax",
        "Checked Bags",
        "Not Loaded Bags",
        "MBR %",
        "Delay",
        "Delay Time Minutes",
        "Delay Code",
        "Controllable",
        "Status",
        "Month Closed",
        "Submitted By",
        "Created At",
      ],
      ...filteredReports.map((item) => {
        const checked = safeNumber(item.checkedBags);
        const notLoaded = safeNumber(item.notLoadedBags);
        const mbr = getMbrPercent(notLoaded, checked);

        return [
          item.date || "",
          item.airline || "",
          item.flight || "",
          item.origin || "",
          item.destination || "",
          getStdValue(item) || "",
          item.pushTime || "",
          item.isOtpDeparture === true
            ? "YES"
            : item.isOtpDeparture === false
            ? "NO"
            : "",
          safeNumber(item.finalTotalPax),
          safeNumber(item.totalIbPax),
          checked,
          notLoaded,
          formatPercent(mbr),
          item.delay || "",
          safeNumber(item.delayTimeMinutes),
          item.delayCode || "",
          item.controllable || "",
          item.status || "",
          item.monthClosed ? "YES" : "NO",
          item.submittedBy || "",
          formatDateTime(item.createdAt),
        ];
      }),
    ];

    downloadCsv("gate-checklist-management.csv", rows);
  }


  function printAirlineKpiSheet(airlineCode) {
    const airlineReports = filteredReports.filter(
      (item) => String(item.airline || "") === String(airlineCode || "")
    );

    if (!airlineReports.length) {
      setStatusMessage("No KPI data found for this airline and selected period.");
      return;
    }

    const flights = airlineReports.length;
    const otpFlights = airlineReports.filter(
      (item) => item.isOtpDeparture === true
    ).length;
    const delayedFlights = airlineReports.filter(
      (item) => String(item.delay || "No") === "Yes"
    ).length;
    const checkedBags = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.checkedBags),
      0
    );
    const notLoadedBags = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.notLoadedBags),
      0
    );
    const ibPax = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.totalIbPax),
      0
    );
    const outPax = airlineReports.reduce(
      (sum, item) => sum + safeNumber(item.finalTotalPax),
      0
    );
    const totalDelayMinutes = airlineReports.reduce(
      (sum, item) =>
        sum +
        (String(item.delay || "No") === "Yes"
          ? safeNumber(item.delayTimeMinutes)
          : 0),
      0
    );

    const avgDelay = delayedFlights
      ? totalDelayMinutes / delayedFlights
      : 0;

    const otpPercent = getOtpPercent(otpFlights, flights);
    const mbrPercent = getMbrPercent(notLoadedBags, checkedBags);

    const aircraftCounts = {};
    airlineReports.forEach((item) => {
      const aircraft = String(item.aircraft || "Unknown").trim() || "Unknown";
      aircraftCounts[aircraft] = (aircraftCounts[aircraft] || 0) + 1;
    });

    const aircraftRows = Object.entries(aircraftCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(
        ([aircraft, count]) => `
          <div class="aircraft-card">
            <div class="aircraft-visual">${getAircraftSvgHtml("#0f2f57")}</div>
            <div class="aircraft-name">${aircraft}</div>
            <div class="aircraft-count">${count}</div>
            <div class="aircraft-sub">flight${count === 1 ? "" : "s"}</div>
          </div>
        `
      )
      .join("");

    const airlineName = getAirlineDisplayName(airlineCode);
    const periodLabel =
      filters.periodType === "month" && filters.month
        ? formatMonthYear(filters.month)
        : "Selected Period";

    const maxPassengers = Math.max(
      1,
      ...airlineReports.map((item) =>
        Math.max(
          safeNumber(item.finalTotalPax),
          safeNumber(item.totalIbPax)
        )
      )
    );

    const passengerBars = airlineReports
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .slice(-8)
      .map((item) => {
        const out = safeNumber(item.finalTotalPax);
        const ib = safeNumber(item.totalIbPax);
        const outPct = Math.max(4, Math.round((out / maxPassengers) * 100));
        const ibPct = Math.max(4, Math.round((ib / maxPassengers) * 100));

        return `
          <div class="bar-item">
            <div class="bar-wrap">
              <div class="bar ib" style="height:${ibPct}%"></div>
              <div class="bar out" style="height:${outPct}%"></div>
            </div>
            <div class="bar-label">${item.flight || "-"}</div>
          </div>
        `;
      })
      .join("");

    const delayRows = airlineReports
      .filter((item) => String(item.delay || "No") === "Yes")
      .map(
        (item) => `
          <tr>
            <td>${item.date || "-"}</td>
            <td>${item.flight || "-"}</td>
            <td>${item.origin || "-"} - ${item.destination || "-"}</td>
            <td>${getStdValue(item) || "-"}</td>
            <td>${item.pushTime || "-"}</td>
            <td>${safeNumber(item.delayTimeMinutes)} min</td>
            <td>${item.delayCode || "-"}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${airlineName} KPI - ${periodLabel}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 0;
              color: #0f172a;
              background: #f4f7fb;
            }

            .page {
              width: 100%;
              padding: 22px;
            }

            .hero {
              background: #ffffff;
              border: 1px solid #dbeafe;
              border-radius: 18px;
              padding: 20px 22px;
              margin-bottom: 14px;
            }

            .kicker {
              font-size: 10px;
              font-weight: 900;
              color: #1769aa;
              text-transform: uppercase;
              letter-spacing: .14em;
            }

            h1 {
              margin: 6px 0 4px;
              font-size: 31px;
              line-height: 1.05;
              font-weight: 900;
            }

            .subtitle {
              color: #64748b;
              font-size: 12px;
              font-weight: 700;
            }

            .dashboard {
              display: grid;
              grid-template-columns: 1.2fr 1fr 1fr;
              gap: 12px;
              align-items: stretch;
            }

            .panel {
              background: #fff;
              border: 1px solid #dbeafe;
              border-radius: 16px;
              padding: 14px;
              min-height: 190px;
            }

            .panel-title {
              text-align: center;
              font-size: 13px;
              font-weight: 900;
              color: #334155;
              margin-bottom: 8px;
            }

            .bar-chart {
              height: 135px;
              display: flex;
              align-items: end;
              justify-content: center;
              gap: 8px;
              padding: 4px 4px 0;
            }

            .bar-item {
              flex: 1;
              min-width: 28px;
              max-width: 42px;
              text-align: center;
            }

            .bar-wrap {
              height: 105px;
              display: flex;
              gap: 2px;
              align-items: end;
              justify-content: center;
            }

            .bar {
              width: 10px;
              border-radius: 3px 3px 0 0;
            }

            .bar.ib { background: #1fa9e6; }
            .bar.out { background: #f8c32d; }

            .bar-label {
              margin-top: 5px;
              font-size: 8px;
              font-weight: 800;
              color: #64748b;
            }

            .legend {
              margin-top: 8px;
              display: flex;
              justify-content: center;
              gap: 12px;
              font-size: 8px;
              color: #64748b;
              font-weight: 700;
            }

            .legend span::before {
              content: "";
              display: inline-block;
              width: 8px;
              height: 8px;
              border-radius: 2px;
              margin-right: 4px;
              vertical-align: -1px;
            }

            .legend .ib-key::before { background: #1fa9e6; }
            .legend .out-key::before { background: #f8c32d; }

            .big-number {
              text-align: center;
              margin-top: 26px;
            }

            .big-number .label {
              font-size: 13px;
              font-weight: 900;
              color: #475569;
            }

            .big-number .value {
              font-size: 34px;
              line-height: 1;
              font-weight: 950;
              margin-top: 12px;
              color: #0f172a;
            }

            .big-number .sub {
              margin-top: 8px;
              font-size: 10px;
              color: #94a3b8;
              font-weight: 700;
            }

            .aircraft-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 10px;
              margin-top: 12px;
            }

            .aircraft-card {
              background: #fff;
              border: 1px solid #dbeafe;
              border-radius: 14px;
              padding: 13px 14px;
              text-align: center;
            }

            .aircraft-visual {
              height: 64px;
              display: grid;
              place-items: center;
              margin-bottom: 4px;
            }

            .aircraft-name {
              font-size: 12px;
              font-weight: 900;
              color: #334155;
            }

            .aircraft-count {
              margin-top: 5px;
              font-size: 24px;
              line-height: 1;
              font-weight: 950;
              color: #1769aa;
            }

            .aircraft-sub {
              margin-top: 4px;
              font-size: 8px;
              color: #94a3b8;
              font-weight: 800;
              text-transform: uppercase;
            }

            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 10px;
              margin-top: 12px;
            }

            .kpi {
              background: #fff;
              border: 1px solid #dbeafe;
              border-radius: 14px;
              padding: 13px 14px;
              text-align: center;
            }

            .kpi .label {
              font-size: 9px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: .05em;
              font-weight: 900;
            }

            .kpi .value {
              margin-top: 5px;
              font-size: 21px;
              font-weight: 950;
              color: #0f172a;
            }

            .kpi .good { color: #15803d; }
            .kpi .warn { color: #b45309; }
            .kpi .bad { color: #be123c; }

            .donut-row {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-top: 12px;
            }

            .donut-panel {
              background: #fff;
              border: 1px solid #dbeafe;
              border-radius: 16px;
              padding: 14px;
              text-align: center;
            }

            .donut-title {
              font-size: 13px;
              font-weight: 900;
              color: #334155;
              margin-bottom: 8px;
            }

            .donut {
              width: 150px;
              height: 150px;
              border-radius: 50%;
              margin: 0 auto;
              display: grid;
              place-items: center;
              position: relative;
            }

            .donut::after {
              content: "";
              width: 100px;
              height: 100px;
              border-radius: 50%;
              background: #fff;
              position: absolute;
            }

            .donut-value {
              position: relative;
              z-index: 2;
              font-size: 30px;
              font-weight: 950;
              color: #0f172a;
            }

            .section {
              margin-top: 12px;
              background: #fff;
              border: 1px solid #dbeafe;
              border-radius: 16px;
              padding: 14px;
            }

            .section h2 {
              margin: 0 0 10px;
              font-size: 16px;
              font-weight: 900;
            }

            table {
              width: 100%;
              border-collapse: collapse;
            }

            th, td {
              border: 1px solid #e2e8f0;
              padding: 7px 8px;
              text-align: left;
              font-size: 9px;
            }

            th {
              background: #f8fbff;
              text-transform: uppercase;
              letter-spacing: .04em;
              color: #475569;
              font-size: 8px;
            }

            .footer {
              margin-top: 12px;
              text-align: center;
              color: #94a3b8;
              font-size: 8px;
            }

            @media print {
              body { background: #fff; }
              .page { padding: 10px; }
              .hero, .panel, .kpi, .donut-panel, .section {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="hero">
              <div class="kicker">AeroStation Hub | Airline Service KPI Dashboard</div>
              <h1>${airlineName}</h1>
              <div class="subtitle">${periodLabel} | Operational Performance Summary</div>
            </div>

            <div class="dashboard">
              <div class="panel">
                <div class="panel-title">Passenger Flow by Flight</div>
                <div class="bar-chart">
                  ${passengerBars || `<div style="color:#94a3b8;font-size:11px;">No passenger data</div>`}
                </div>
                <div class="legend">
                  <span class="ib-key">IB Pax</span>
                  <span class="out-key">OUT Pax</span>
                </div>
              </div>

              <div class="panel">
                <div class="big-number">
                  <div class="label">Total Flights</div>
                  <div class="value">${flights}</div>
                  <div class="sub">${periodLabel}</div>
                </div>
              </div>

              <div class="panel">
                <div class="big-number">
                  <div class="label">Checked Bags</div>
                  <div class="value">${checkedBags}</div>
                  <div class="sub">${notLoadedBags} not loaded</div>
                </div>
              </div>
            </div>

            <div class="section" style="margin-top:12px;">
              <h2>Aircraft Type Mix</h2>
              <div class="aircraft-grid">
                ${aircraftRows || `<div class="aircraft-card"><div class="aircraft-name">No aircraft data</div></div>`}
              </div>
            </div>

            <div class="kpi-grid">
              <div class="kpi">
                <div class="label">OTP</div>
                <div class="value ${otpPercent >= 90 ? "good" : "warn"}">${formatPercent(otpPercent)}</div>
              </div>

              <div class="kpi">
                <div class="label">Delayed Flights</div>
                <div class="value ${delayedFlights > 0 ? "warn" : "good"}">${delayedFlights}</div>
              </div>

              <div class="kpi">
                <div class="label">Average Delay</div>
                <div class="value ${avgDelay > 0 ? "warn" : "good"}">${avgDelay.toFixed(1)} min</div>
              </div>

              <div class="kpi">
                <div class="label">MBR</div>
                <div class="value ${mbrPercent > 0 ? "bad" : "good"}">${formatPercent(mbrPercent)}</div>
              </div>

              <div class="kpi">
                <div class="label">IB Pax</div>
                <div class="value">${ibPax}</div>
              </div>

              <div class="kpi">
                <div class="label">OUT Pax</div>
                <div class="value">${outPax}</div>
              </div>

              <div class="kpi">
                <div class="label">Not Loaded Bags</div>
                <div class="value ${notLoadedBags > 0 ? "bad" : "good"}">${notLoadedBags}</div>
              </div>

              <div class="kpi">
                <div class="label">OTP Flights</div>
                <div class="value">${otpFlights}</div>
              </div>
            </div>

            <div class="donut-row">
              <div class="donut-panel">
                <div class="donut-title">OTP Performance</div>
                <div
                  class="donut"
                  style="background: conic-gradient(#1fa9e6 0 ${Math.max(0, Math.min(100, otpPercent))}%, #e5e7eb ${Math.max(0, Math.min(100, otpPercent))}% 100%);"
                >
                  <div class="donut-value">${formatPercent(otpPercent)}</div>
                </div>
              </div>

              <div class="donut-panel">
                <div class="donut-title">Bag Delivery Quality</div>
                <div
                  class="donut"
                  style="background: conic-gradient(#f8c32d 0 ${Math.max(0, Math.min(100, 100 - mbrPercent))}%, #e5e7eb ${Math.max(0, Math.min(100, 100 - mbrPercent))}% 100%);"
                >
                  <div class="donut-value">${formatPercent(Math.max(0, 100 - mbrPercent))}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <h2>Delay Detail</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Flight</th>
                    <th>Route</th>
                    <th>STD</th>
                    <th>Push</th>
                    <th>Delay</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    delayRows ||
                    `<tr><td colspan="7">No delays for this selected period.</td></tr>`
                  }
                </tbody>
              </table>
            </div>

            <div class="footer">
              AeroStation Hub | ${airlineName} | ${periodLabel}
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1280,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print/export KPI.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  }


  function startEditing(report) {
    setEditingReportId(report.id);
    setEditDraft(createEditDraft(report));
    if (selectedReportId !== report.id) {
      setSelectedReportId(report.id);
    }
  }

  function cancelEditing() {
    setEditingReportId("");
    setEditDraft(null);
  }

  async function saveEditing(reportId) {
    if (!editDraft) return;

    try {
      setWorkingId(reportId);

      const payload = {
        airline: editDraft.airline || "",
        flight: editDraft.flight || "",
        date: editDraft.date || "",
        aircraft: editDraft.aircraft || "",
        origin: editDraft.origin || "",
        destination: editDraft.destination || "",
        gateAgent: editDraft.gateAgent || "",
        expeditor: editDraft.expeditor || "",
        supervisor: editDraft.supervisor || "",
        finalTotalPax: Number(editDraft.finalTotalPax || 0),
        totalIbPax: Number(editDraft.totalIbPax || 0),
        delay: editDraft.delay || "No",
        delayTimeMinutes: Number(editDraft.delayTimeMinutes || 0),
        delayCode: editDraft.delayCode || "",
        controllable: editDraft.controllable || "No",
        blockIn: editDraft.blockIn || "",
        std: editDraft.std || "",
        newStd: editDraft.newStd || "",
        boardingDeadline: editDraft.boardingDeadline || "",
        actualDepartureTime: editDraft.actualDepartureTime || "",
        actualArrivalTime: editDraft.actualArrivalTime || "",
        brakeReleaseTime: editDraft.brakeReleaseTime || "",
        pushTime: editDraft.pushTime || "",
        gateAgent1Arrival: editDraft.gateAgent1Arrival || "",
        gateAgent2Arrival: editDraft.gateAgent2Arrival || "",
        checkedBags: Number(editDraft.checkedBags || 0),
        notLoadedBags: Number(editDraft.notLoadedBags || 0),
        gpuConnected: editDraft.gpuConnected || "",
        firstPaxOff: editDraft.firstPaxOff || "",
        lastPaxOff: editDraft.lastPaxOff || "",
        firstPaxOn: editDraft.firstPaxOn || "",
        lastPaxOn: editDraft.lastPaxOn || "",
        remarks: editDraft.remarks || "",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "gateChecklistReports", reportId), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                ...payload,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Report updated successfully.");
      setEditingReportId("");
      setEditDraft(null);
    } catch (error) {
      console.error("Error updating report:", error);
      setStatusMessage("Could not update report.");
    } finally {
      setWorkingId("");
    }
  }

  const selectedMonthSummary = useMemo(() => {
    if (!filters.month) return null;
    return monthlySummaries.find((item) => item.month === filters.month) || null;
  }, [monthlySummaries, filters.month]);

  const aircraftTypeSummary = useMemo(() => {
    const counts = {};

    filteredReports.forEach((item) => {
      const aircraft = String(item.aircraft || "Unknown").trim() || "Unknown";
      counts[aircraft] = (counts[aircraft] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([aircraft, flights]) => ({
        aircraft,
        flights,
      }))
      .sort((a, b) => b.flights - a.flights || a.aircraft.localeCompare(b.aircraft));
  }, [filteredReports]);

  const selectedAirlineName = useMemo(() => {
    if (filters.airline === "all") return "All Airlines";
    return getAirlineDisplayName(filters.airline);
  }, [filters.airline]);

  const passengerFlowBuckets = useMemo(() => {
    const order = ["1-7", "8-14", "15-21", "22-28", "29-31"];
    const bucketMap = order.reduce((acc, label) => {
      acc[label] = { label, ib: 0, out: 0 };
      return acc;
    }, {});

    filteredReports.forEach((item) => {
      const label = getWeekBucketLabel(item.date);
      if (!bucketMap[label]) {
        bucketMap[label] = { label, ib: 0, out: 0 };
      }

      bucketMap[label].ib += safeNumber(item.totalIbPax);
      bucketMap[label].out += safeNumber(item.finalTotalPax);
    });

    return order.map((label) => bucketMap[label]);
  }, [filteredReports]);

  const maxPassengerBucket = useMemo(() => {
    return Math.max(
      1,
      ...passengerFlowBuckets.map((item) => Math.max(item.ib, item.out))
    );
  }, [passengerFlowBuckets]);

  const selectedAirlinePeriodSummary = useMemo(() => {
    if (
      filters.periodType !== "month" ||
      !filters.month ||
      filters.airline === "all"
    ) {
      return null;
    }

    return otpByAirline.find(
      (item) => item.airline === filters.airline
    ) || null;
  }, [
    filters.periodType,
    filters.month,
    filters.airline,
    otpByAirline,
  ]);

  const selectedPeriodTitle = useMemo(() => {
    if (filters.periodType === "month" && filters.month) {
      const monthLabel = formatMonthYear(filters.month);

      if (filters.airline !== "all") {
        return `${getAirlineDisplayName(filters.airline)} - ${monthLabel}`;
      }

      return `Station KPI - ${monthLabel}`;
    }

    if (filters.airline !== "all") {
      return `${getAirlineDisplayName(filters.airline)} - Selected Period`;
    }

    return "Station KPI - Selected Period";
  }, [filters.periodType, filters.month, filters.airline]);


  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: 1480,
        margin: "0 auto",
        minWidth: 0,
      }}
    >
      <style>{`
        @media print {
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
        }


        .airline-kpi-shell {
          background: #ffffff;
          border: 1px solid #dbeafe;
          border-radius: 22px;
          padding: 18px;
          overflow: hidden;
        }

        .airline-kpi-header {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) auto auto;
          gap: 14px;
          align-items: center;
          padding: 16px 18px;
          border-radius: 18px;
          background: linear-gradient(135deg, #f8fbff 0%, #eef7ff 100%);
          border: 1px solid #dbeafe;
        }

        .airline-kpi-title {
          font-size: 28px;
          font-weight: 950;
          color: #0f172a;
          line-height: 1.05;
        }

        .airline-kpi-sub {
          margin-top: 5px;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }

        .airline-kpi-badge {
          padding: 8px 11px;
          border-radius: 999px;
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          color: #1769aa;
          font-size: 12px;
          font-weight: 900;
        }

        .airline-kpi-chart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(0, .85fr) minmax(0, .85fr) minmax(0, 1.15fr);
          gap: 10px;
          margin-top: 12px;
        }

        .airline-kpi-panel {
          background: #fff;
          border: 1px solid #dbeafe;
          border-radius: 16px;
          padding: 13px;
          min-width: 0;
        }

        .airline-kpi-panel-title {
          font-size: 13px;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 10px;
        }

        .airline-kpi-bars {
          height: 165px;
          display: flex;
          align-items: end;
          gap: 12px;
          justify-content: center;
        }

        .airline-kpi-bar-group {
          flex: 1;
          min-width: 0;
          text-align: center;
        }

        .airline-kpi-bar-wrap {
          height: 126px;
          display: flex;
          justify-content: center;
          align-items: end;
          gap: 4px;
        }

        .airline-kpi-bar {
          width: 14px;
          min-height: 4px;
          border-radius: 4px 4px 0 0;
        }

        .airline-kpi-bar.ib {
          background: #24a7e5;
        }

        .airline-kpi-bar.out {
          background: #0f5c91;
        }

        .airline-kpi-bar-label {
          margin-top: 6px;
          font-size: 9px;
          color: #64748b;
          font-weight: 800;
        }

        .airline-kpi-donut {
          width: 140px;
          height: 140px;
          margin: 8px auto 0;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: relative;
        }

        .airline-kpi-donut::after {
          content: "";
          position: absolute;
          width: 94px;
          height: 94px;
          border-radius: 50%;
          background: white;
        }

        .airline-kpi-donut-value {
          position: relative;
          z-index: 2;
          font-size: 25px;
          font-weight: 950;
          color: #0f172a;
          text-align: center;
          line-height: 1.05;
        }

        .airline-kpi-aircraft-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .airline-kpi-aircraft-card {
          border: 1px solid #dbeafe;
          background: #f8fbff;
          border-radius: 13px;
          padding: 8px;
          text-align: center;
        }

        .airline-kpi-aircraft-name {
          margin-top: 2px;
          font-size: 11px;
          font-weight: 900;
          color: #0f172a;
        }

        .airline-kpi-aircraft-count {
          margin-top: 2px;
          font-size: 18px;
          font-weight: 950;
          color: #1769aa;
        }

        @media (max-width: 1100px) {
          .airline-kpi-header {
            grid-template-columns: 1fr auto;
          }

          .airline-kpi-chart-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 900px) {
          .airline-kpi-shell {
            padding: 12px !important;
            border-radius: 18px !important;
          }

          .airline-kpi-header {
            grid-template-columns: 1fr !important;
            padding: 14px !important;
          }

          .airline-kpi-title {
            font-size: 22px !important;
          }

          .airline-kpi-chart-grid {
            grid-template-columns: 1fr !important;
          }

          .airline-kpi-bars {
            height: 150px !important;
            gap: 7px !important;
          }

          .airline-kpi-aircraft-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .gcm-hero {
            padding: 18px !important;
            border-radius: 18px !important;
          }

          .gcm-hero h1 {
            font-size: 22px !important;
            line-height: 1.15 !important;
          }

          .gcm-hero p {
            font-size: 13px !important;
          }

          .gcm-card {
            padding: 14px !important;
            border-radius: 16px !important;
          }

          .gcm-section-title {
            font-size: 18px !important;
          }

          .gcm-scroll {
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .gcm-scroll table {
            min-width: 980px !important;
          }

          .gcm-details-scroll table {
            min-width: 760px !important;
          }

          .gcm-mobile-actions button {
            width: 100% !important;
          }

          .gcm-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
        }

        @media (max-width: 560px) {
          .gcm-mobile-hide-table {
            display: none !important;
          }

          .gcm-mobile-report-cards {
            display: grid !important;
          }
        }

        @media (min-width: 561px) {
          .gcm-mobile-report-cards {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="gcm-hero"
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 24,
          padding: 24,
          color: "#fff",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            opacity: 0.85,
          }}
        >
          AEROSTATION HUB | GATE CHECKLIST MANAGEMENT
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
            wordBreak: "break-word",
          }}
        >
          Gate Checklist Management
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 960,
            color: "rgba(255,255,255,0.92)",
            wordBreak: "break-word",
          }}
        >
          Operational dashboard for gate checklists, OTP, MBR, delays, baggage
          performance and passenger flow. Review by day, week, month or custom range.
        </p>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              color: "#1769aa",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard className="gcm-card no-print" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div
            className="gcm-mobile-actions"
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <ActionButton
              variant="primary"
              onClick={printManagementView}
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Print
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={handleExportCurrentCsv}
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Export CSV
            </ActionButton>
            {filters.month && (
              <ActionButton
                variant="warning"
                onClick={() => handleCloseMonth(filters.month)}
                disabled={workingId === filters.month}
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                {workingId === filters.month ? "Closing..." : `Close Month ${formatMonthYear(filters.month)}`}
              </ActionButton>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <FieldLabel>Period Type</FieldLabel>
            <SelectInput
              value={filters.periodType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, periodType: e.target.value }))
              }
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="range">Date Range</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All Airlines</option>
              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Flight</FieldLabel>
            <TextInput
              value={filters.flight}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, flight: e.target.value }))
              }
              placeholder="Example: SY123"
            />
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="closed">Closed</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Month Closed</FieldLabel>
            <SelectInput
              value={filters.monthClosed}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, monthClosed: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Delay</FieldLabel>
            <SelectInput
              value={filters.delay}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, delay: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="yes">Delayed Only</option>
              <option value="no">No Delay</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>OTP</FieldLabel>
            <SelectInput
              value={filters.otp}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, otp: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="otp">OTP Only</option>
              <option value="nonotp">Non-OTP Only</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Supervisor / Submitted By</FieldLabel>
            <TextInput
              list="gate-checklist-supervisors"
              value={filters.supervisor}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, supervisor: e.target.value }))
              }
              placeholder="Search supervisor"
            />
            <datalist id="gate-checklist-supervisors">
              {supervisorOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div>
            <FieldLabel>Quick Search</FieldLabel>
            <TextInput
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Flight, route, agent, delay code..."
            />
          </div>

          {filters.periodType === "day" && (
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "week" && (
            <div>
              <FieldLabel>Week Start</FieldLabel>
              <TextInput
                type="date"
                value={filters.weekStart}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, weekStart: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "month" && (
            <div>
              <FieldLabel>Month</FieldLabel>
              <SelectInput
                value={filters.month}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, month: e.target.value }))
                }
              >
                <option value="">Select Month</option>
                {monthOptions.map((monthValue) => (
                  <option key={monthValue} value={monthValue}>
                    {formatMonthYear(monthValue)}
                  </option>
                ))}
              </SelectInput>
            </div>
          )}

          {filters.periodType === "range" && (
            <>
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>

              <div>
                <FieldLabel>End Date</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </>
          )}
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: isMobile ? "stretch" : "flex-end",
          }}
        >
          <ActionButton
            variant="secondary"
            onClick={() =>
              setFilters({
                airline: "all",
                flight: "",
                date: "",
                weekStart: "",
                month: "",
                startDate: "",
                endDate: "",
                periodType: "day",
                status: "all",
                monthClosed: "all",
                delay: "all",
                otp: "all",
                supervisor: "",
                search: "",
              })
            }
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            Clear Filters
          </ActionButton>
        </div>
      </PageCard>

      {filters.airline !== "all" ? (
        <div className="airline-kpi-shell">
          <div className="airline-kpi-header">
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#1769aa",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                AeroStation Hub | Airline Service KPI Dashboard
              </div>

              <div
                className="airline-kpi-title"
                style={{
                  marginTop: 7,
                }}
              >
                {selectedAirlineName}
              </div>

              <div className="airline-kpi-sub">
                {filters.month ? formatMonthYear(filters.month) : "Selected Period"} | Gate Operations Performance
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span className="airline-kpi-badge">
                {filters.airline}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {totals.flights} Flights
              </span>
            </div>

            <ActionButton
              variant="dark"
              onClick={() => printAirlineKpiSheet(filters.airline)}
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Print / Export KPI PDF
            </ActionButton>
          </div>

          <div
            className="gcm-kpi-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 9,
              marginTop: 12,
            }}
          >
            <InfoCard label="Total Flights" value={String(totals.flights)} tone="blue" />
            <InfoCard
              label="OTP"
              value={formatPercent(totals.otpPercent)}
              tone={totals.otpPercent >= 90 ? "green" : "amber"}
            />
            <InfoCard
              label="Delayed Flights"
              value={String(totals.delayedFlights)}
              tone={totals.delayedFlights > 0 ? "amber" : "green"}
            />
            <InfoCard
              label="Avg Delay"
              value={`${totals.avgDelayMinutes.toFixed(1)} min`}
              tone={totals.avgDelayMinutes > 0 ? "amber" : "green"}
            />
            <InfoCard label="Checked Bags" value={String(totals.checkedBags)} tone="blue" />
            <InfoCard
              label="Not Loaded Bags"
              value={String(totals.notLoadedBags)}
              tone={totals.notLoadedBags > 0 ? "red" : "green"}
            />
            <InfoCard
              label="Passenger Flow"
              value={`${totals.totalIbPax} IB | ${totals.totalOutPax} OUT`}
              tone="blue"
            />
          </div>

          <div className="airline-kpi-chart-grid">
            <div className="airline-kpi-panel">
              <div className="airline-kpi-panel-title">Passenger Flow by Month Segment</div>

              <div className="airline-kpi-bars">
                {passengerFlowBuckets.map((bucket) => (
                  <div className="airline-kpi-bar-group" key={bucket.label}>
                    <div className="airline-kpi-bar-wrap">
                      <div
                        className="airline-kpi-bar ib"
                        title={`${bucket.ib} IB`}
                        style={{
                          height: `${Math.max(
                            4,
                            (bucket.ib / maxPassengerBucket) * 100
                          )}%`,
                        }}
                      />
                      <div
                        className="airline-kpi-bar out"
                        title={`${bucket.out} OUT`}
                        style={{
                          height: `${Math.max(
                            4,
                            (bucket.out / maxPassengerBucket) * 100
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="airline-kpi-bar-label">
                      {bucket.label}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "center",
                  gap: 14,
                  flexWrap: "wrap",
                  fontSize: 9,
                  fontWeight: 800,
                  color: "#64748b",
                }}
              >
                <span>â IB Pax</span>
                <span style={{ color: "#0f5c91" }}>â OUT Pax</span>
              </div>
            </div>

            <div className="airline-kpi-panel">
              <div className="airline-kpi-panel-title">OTP Performance</div>
              <div
                className="airline-kpi-donut"
                style={{
                  background: `conic-gradient(
                    #22a06b 0 ${Math.max(0, Math.min(100, totals.otpPercent))}%,
                    #e5e7eb ${Math.max(0, Math.min(100, totals.otpPercent))}% 100%
                  )`,
                }}
              >
                <div className="airline-kpi-donut-value">
                  {formatPercent(totals.otpPercent)}
                </div>
              </div>
            </div>

            <div className="airline-kpi-panel">
              <div className="airline-kpi-panel-title">Bag Delivery Quality</div>
              <div
                className="airline-kpi-donut"
                style={{
                  background: `conic-gradient(
                    #2196f3 0 ${Math.max(
                      0,
                      Math.min(100, 100 - totals.stationMbrPercent)
                    )}%,
                    #e5e7eb ${Math.max(
                      0,
                      Math.min(100, 100 - totals.stationMbrPercent)
                    )}% 100%
                  )`,
                }}
              >
                <div className="airline-kpi-donut-value">
                  {formatPercent(
                    Math.max(0, 100 - totals.stationMbrPercent)
                  )}
                </div>
              </div>
            </div>

            <div className="airline-kpi-panel">
              <div className="airline-kpi-panel-title">Aircraft Type Mix</div>

              {aircraftTypeSummary.length === 0 ? (
                <div style={emptyTextStyle}>No aircraft data.</div>
              ) : (
                <div className="airline-kpi-aircraft-grid">
                  {aircraftTypeSummary.slice(0, 4).map((item) => (
                    <div
                      className="airline-kpi-aircraft-card"
                      key={item.aircraft}
                    >
                      <AircraftSilhouette
                        width={108}
                        height={44}
                        color="#0f2f57"
                      />

                      <div className="airline-kpi-aircraft-name">
                        {item.aircraft}
                      </div>

                      <div className="airline-kpi-aircraft-count">
                        {item.flights}
                      </div>

                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 8,
                          fontWeight: 800,
                          color: "#94a3b8",
                          textTransform: "uppercase",
                        }}
                      >
                        Flight{item.flights === 1 ? "" : "s"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <PageCard
            style={{
              padding: isMobile ? 14 : 18,
              background: "#ffffff",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#1769aa",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Selected KPI View
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: isMobile ? 19 : 23,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {selectedPeriodTitle}
              </div>
            </div>
          </PageCard>

          <div
            className="gcm-kpi-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <InfoCard label="Flights" value={String(totals.flights)} />
            <InfoCard
              label="OTP"
              value={formatPercent(totals.otpPercent)}
              tone={totals.otpPercent >= 90 ? "green" : "amber"}
            />
            <InfoCard
              label="Delayed Flights"
              value={String(totals.delayedFlights)}
              tone={totals.delayedFlights > 0 ? "amber" : "green"}
            />
            <InfoCard
              label="Avg Delay"
              value={`${totals.avgDelayMinutes.toFixed(1)} min`}
              tone={totals.avgDelayMinutes > 0 ? "amber" : "green"}
            />
            <InfoCard label="Checked Bags" value={String(totals.checkedBags)} />
            <InfoCard
              label="Not Loaded"
              value={String(totals.notLoadedBags)}
              tone={totals.notLoadedBags > 0 ? "red" : "green"}
            />
            <InfoCard
              label="Station MBR"
              value={formatPercent(totals.stationMbrPercent)}
              tone={totals.stationMbrPercent > 0 ? "amber" : "green"}
            />
            <InfoCard
              label="Pax Flow"
              value={`${totals.totalIbPax} IB | ${totals.totalOutPax} OUT`}
              tone="blue"
            />
          </div>
        </>
      )}

      {selectedMonthSummary &&
        !(filters.periodType === "month" && filters.airline !== "all") && (
        <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
          <div style={{ marginBottom: 12 }}>
            <h2
              className="gcm-section-title"
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Monthly Closing Summary | {formatMonthYear(selectedMonthSummary.month)}
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            <InfoCard label="Station Flights" value={String(selectedMonthSummary.flights)} />
            <InfoCard
              label="Station OTP %"
              value={formatPercent(selectedMonthSummary.otpPercent)}
              tone="blue"
            />
            <InfoCard
              label="Station Checked Bags"
              value={String(selectedMonthSummary.checkedBags)}
            />
            <InfoCard
              label="Station Not Loaded"
              value={String(selectedMonthSummary.notLoadedBags)}
              tone={selectedMonthSummary.notLoadedBags > 0 ? "red" : "green"}
            />
            <InfoCard
              label="Station MBR %"
              value={formatPercent(selectedMonthSummary.mbrPercent)}
              tone={selectedMonthSummary.mbrPercent > 0 ? "amber" : "green"}
            />
            <InfoCard
              label="Total IB Pax"
              value={String(selectedMonthSummary.totalIbPax)}
            />
            <InfoCard
              label="Total OUT Pax"
              value={String(selectedMonthSummary.totalOutPax)}
              tone="blue"
            />
            <InfoCard
              label="Month Status"
              value={selectedMonthSummary.monthClosed ? "Closed" : "Open"}
              tone={selectedMonthSummary.monthClosed ? "green" : "default"}
            />
          </div>
        </PageCard>
      )}

      <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
              OTP + MBR by Airline
            </h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
              Print or save a clean KPI sheet by airline for the selected period.
            </div>
          </div>
        </div>

        <div className="gcm-scroll" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flights</th>
                <th style={thStyle}>OTP Flights</th>
                <th style={thStyle}>OTP %</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded Bags</th>
                <th style={thStyle}>MBR %</th>
                <th style={thStyle}>KPI Report</th>
              </tr>
            </thead>
            <tbody>
              {otpByAirline.length === 0 ? (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    {loading ? "Loading..." : "No data found."}
                  </td>
                </tr>
              ) : (
                otpByAirline.map((row) => (
                  <tr key={row.airline}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 900 }}>
                        {getAirlineDisplayName(row.airline)}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        {row.airline}
                      </div>
                    </td>
                    <td style={tdStyle}>{row.flights}</td>
                    <td style={tdStyle}>{row.otpFlights}</td>
                    <td style={tdStyle}>{formatPercent(row.otpPercent)}</td>
                    <td style={tdStyle}>{row.totalCheckedBags}</td>
                    <td style={tdStyle}>{row.totalNotLoadedBags}</td>
                    <td style={tdStyle}>{formatPercent(row.mbrPercent)}</td>
                    <td style={tdStyle}>
                      <ActionButton
                        variant="dark"
                        onClick={() => printAirlineKpiSheet(row.airline)}
                      >
                        Print / PDF
                      </ActionButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Delay Summary
          </h2>
        </div>

        <div className="gcm-scroll" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>STD</th>
                <th style={thStyle}>Push Back</th>
                <th style={thStyle}>Delay Time</th>
                <th style={thStyle}>Delay Code</th>
              </tr>
            </thead>
            <tbody>
              {delaySummary.length === 0 ? (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    {loading ? "Loading..." : "No delays found."}
                  </td>
                </tr>
              ) : (
                delaySummary.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.airline}</td>
                    <td style={tdStyle}>{item.flight}</td>
                    <td style={tdStyle}>{item.route}</td>
                    <td style={tdStyle}>{item.std}</td>
                    <td style={tdStyle}>{item.pushTime}</td>
                    <td style={tdStyle}>{item.delayTimeMinutes}</td>
                    <td style={tdStyle}>{item.delayCode}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Pax Flow Summary
          </h2>
        </div>

        <div className="gcm-scroll" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>Total IB Pax</th>
                <th style={thStyle}>Total OUT Pax</th>
              </tr>
            </thead>
            <tbody>
              {paxFlowSummary.length === 0 ? (
                <tr>
                  <td colSpan={6} style={tdStyle}>
                    {loading ? "Loading..." : "No pax flow data found."}
                  </td>
                </tr>
              ) : (
                paxFlowSummary.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.date}</td>
                    <td style={tdStyle}>{item.airline}</td>
                    <td style={tdStyle}>{item.flight}</td>
                    <td style={tdStyle}>{item.route}</td>
                    <td style={tdStyle}>{item.totalIbPax}</td>
                    <td style={tdStyle}>{item.finalTotalPax}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Monthly Summaries
          </h2>
        </div>

        <div className="gcm-scroll" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Month</th>
                <th style={thStyle}>Flights</th>
                <th style={thStyle}>OTP Flights</th>
                <th style={thStyle}>OTP %</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded</th>
                <th style={thStyle}>MBR %</th>
                <th style={thStyle}>IB Pax</th>
                <th style={thStyle}>OUT Pax</th>
                <th style={thStyle}>Closed</th>
                <th style={thStyle}>Closed At</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {monthlySummaries.length === 0 ? (
                <tr>
                  <td colSpan={12} style={tdStyle}>
                    {loading ? "Loading..." : "No monthly summaries found."}
                  </td>
                </tr>
              ) : (
                monthlySummaries.map((item) => (
                  <tr key={item.month}>
                    <td style={tdStyle}>{item.month}</td>
                    <td style={tdStyle}>{item.flights}</td>
                    <td style={tdStyle}>{item.otpFlights}</td>
                    <td style={tdStyle}>{formatPercent(item.otpPercent)}</td>
                    <td style={tdStyle}>{item.checkedBags}</td>
                    <td style={tdStyle}>{item.notLoadedBags}</td>
                    <td style={tdStyle}>{formatPercent(item.mbrPercent)}</td>
                    <td style={tdStyle}>{item.totalIbPax}</td>
                    <td style={tdStyle}>{item.totalOutPax}</td>
                    <td style={tdStyle}>{item.monthClosed ? "YES" : "NO"}</td>
                    <td style={tdStyle}>{formatDateTime(item.closedAt)}</td>
                    <td style={tdStyle}>
                      <ActionButton
                        variant="warning"
                        onClick={() => handleCloseMonth(item.month)}
                        disabled={workingId === item.month || item.monthClosed}
                      >
                        {item.monthClosed
                          ? "Closed"
                          : workingId === item.month
                          ? "Closing..."
                          : "Close Month"}
                      </ActionButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Submitted Checklists
          </h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
            {filteredReports.length} report(s) match the current filters.
          </div>
        </div>

        <div
          className="gcm-mobile-report-cards"
          style={{
            display: "none",
            gap: 10,
          }}
        >
          {filteredReports.length === 0 ? (
            <div style={emptyTextStyle}>
              {loading ? "Loading..." : "No reports found."}
            </div>
          ) : (
            filteredReports.map((item) => {
              const checked = safeNumber(item.checkedBags);
              const notLoaded = safeNumber(item.notLoadedBags);
              const mbrPercent = getMbrPercent(notLoaded, checked);

              return (
                <div
                  key={`mobile-${item.id}`}
                  style={{
                    borderRadius: 16,
                    border: "1px solid #dbeafe",
                    background: selectedReportId === item.id ? "#edf7ff" : "#ffffff",
                    padding: 13,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>
                        {item.airline || "-"} {item.flight || "-"}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>
                        {item.date || "-"} | {item.origin || "-"} - {item.destination || "-"}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "5px 8px",
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 900,
                        background:
                          item.isOtpDeparture === true ? "#ecfdf5" : "#fff7ed",
                        color:
                          item.isOtpDeparture === true ? "#166534" : "#9a3412",
                        border: `1px solid ${
                          item.isOtpDeparture === true ? "#a7f3d0" : "#fdba74"
                        }`,
                      }}
                    >
                      {item.isOtpDeparture === true ? "OTP" : "NON-OTP"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 7,
                    }}
                  >
                    <DetailsRow label="STD" value={getStdValue(item) || "-"} />
                    <DetailsRow label="Push" value={item.pushTime || "-"} />
                    <DetailsRow label="OUT Pax" value={String(safeNumber(item.finalTotalPax))} />
                    <DetailsRow label="IB Pax" value={String(safeNumber(item.totalIbPax))} />
                    <DetailsRow label="Checked Bags" value={String(checked)} />
                    <DetailsRow label="MBR %" value={formatPercent(mbrPercent)} />
                  </div>

                  {String(item.delay || "No") === "Yes" && (
                    <div
                      style={{
                        padding: "9px 10px",
                        borderRadius: 12,
                        background: "#fff7ed",
                        border: "1px solid #fdba74",
                        color: "#9a3412",
                        fontSize: 11.5,
                        fontWeight: 800,
                      }}
                    >
                      Delay {safeNumber(item.delayTimeMinutes)} min
                      {item.delayCode ? ` | ${item.delayCode}` : ""}
                    </div>
                  )}

                  <div
                    className="gcm-mobile-actions"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 7,
                    }}
                  >
                    <ActionButton
                      variant="secondary"
                      onClick={() =>
                        setSelectedReportId((prev) =>
                          prev === item.id ? "" : item.id
                        )
                      }
                      style={{ width: "100%" }}
                    >
                      {selectedReportId === item.id ? "Hide" : "View"}
                    </ActionButton>

                    <ActionButton
                      variant="warning"
                      onClick={() => startEditing(item)}
                      style={{ width: "100%" }}
                    >
                      Edit
                    </ActionButton>

                    <ActionButton
                      variant="dark"
                      onClick={() => printReportDetails(item)}
                      style={{ width: "100%" }}
                    >
                      Print
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={() => handleDeleteReport(item.id)}
                      disabled={workingId === item.id}
                      style={{ width: "100%" }}
                    >
                      {workingId === item.id ? "Deleting..." : "Delete"}
                    </ActionButton>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="gcm-scroll gcm-mobile-hide-table" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>STD</th>
                <th style={thStyle}>Push</th>
                <th style={thStyle}>OTP</th>
                <th style={thStyle}>OUT Pax</th>
                <th style={thStyle}>IB Pax</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded</th>
                <th style={thStyle}>MBR %</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Month Closed</th>
                <th style={thStyle}>Submitted By</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={17} style={tdStyle}>
                    {loading ? "Loading..." : "No reports found."}
                  </td>
                </tr>
              ) : (
                filteredReports.map((item) => {
                  const checked = safeNumber(item.checkedBags);
                  const notLoaded = safeNumber(item.notLoadedBags);
                  const mbrPercent = getMbrPercent(notLoaded, checked);
                  const isEditing = editingReportId === item.id;

                  return (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.date || "-"}</td>
                      <td style={tdStyle}>{item.airline || "-"}</td>
                      <td style={tdStyle}>{item.flight || "-"}</td>
                      <td style={tdStyle}>
                        {item.origin || "-"} - {item.destination || "-"}
                      </td>
                      <td style={tdStyle}>{getStdValue(item) || "-"}</td>
                      <td style={tdStyle}>{item.pushTime || "-"}</td>
                      <td style={tdStyle}>
                        {item.isOtpDeparture === true
                          ? "YES"
                          : item.isOtpDeparture === false
                          ? "NO"
                          : "-"}
                      </td>
                      <td style={tdStyle}>{safeNumber(item.finalTotalPax)}</td>
                      <td style={tdStyle}>{safeNumber(item.totalIbPax)}</td>
                      <td style={tdStyle}>{checked}</td>
                      <td style={tdStyle}>{notLoaded}</td>
                      <td style={tdStyle}>{formatPercent(mbrPercent)}</td>
                      <td style={tdStyle}>{item.status || "-"}</td>
                      <td style={tdStyle}>{item.monthClosed ? "YES" : "NO"}</td>
                      <td style={tdStyle}>{item.submittedBy || "-"}</td>
                      <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="secondary"
                            onClick={() =>
                              setSelectedReportId((prev) =>
                                prev === item.id ? "" : item.id
                              )
                            }
                          >
                            {selectedReportId === item.id ? "Hide Details" : "View Details"}
                          </ActionButton>

                          {!isEditing ? (
                            <ActionButton
                              variant="warning"
                              onClick={() => startEditing(item)}
                            >
                              Edit
                            </ActionButton>
                          ) : (
                            <>
                              <ActionButton
                                variant="success"
                                onClick={() => saveEditing(item.id)}
                                disabled={workingId === item.id}
                              >
                                {workingId === item.id ? "Saving..." : "Save"}
                              </ActionButton>
                              <ActionButton
                                variant="secondary"
                                onClick={cancelEditing}
                                disabled={workingId === item.id}
                              >
                                Cancel
                              </ActionButton>
                            </>
                          )}

                          <ActionButton
                            variant="dark"
                            onClick={() => printReportDetails(item)}
                          >
                            Print Details
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => handleDeleteReport(item.id)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? "Deleting..." : "Delete"}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {selectedReport && (
        <PageCard className="gcm-card" style={{ padding: isMobile ? 14 : 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <div>
              <h2 className="gcm-section-title" style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
                Gate Checklist Details
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 14,
                  color: "#64748b",
                  fontWeight: 700,
                  wordBreak: "break-word",
                }}
              >
                {selectedReport.airline || "-"} | {selectedReport.flight || "-"} | {selectedReport.date || "-"}
              </p>
            </div>

            <div
              className="gcm-mobile-actions"
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <ActionButton
                variant="dark"
                onClick={() => printReportDetails(selectedReport)}
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                Print Details
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => setSelectedReportId("")}
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                Close
              </ActionButton>
            </div>
          </div>

          {editingReportId === selectedReport.id && editDraft ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  color: "#9a3412",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                Edit mode is ON for this report.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                }}
              >
                <div>
                  <FieldLabel>Airline</FieldLabel>
                  <SelectInput
                    value={editDraft.airline}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, airline: e.target.value }))
                    }
                  >
                    <option value="SY">SUN COUNTRY (SY)</option>
                    <option value="AV">AVIANCA (AV)</option>
                    <option value="WL">WORLD ATLANTIC (WL)</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Flight</FieldLabel>
                  <TextInput
                    value={editDraft.flight}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, flight: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Date</FieldLabel>
                  <TextInput
                    type="date"
                    value={editDraft.date}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Aircraft</FieldLabel>
                  <TextInput
                    value={editDraft.aircraft}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, aircraft: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Origin</FieldLabel>
                  <TextInput
                    value={editDraft.origin}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, origin: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Destination</FieldLabel>
                  <TextInput
                    value={editDraft.destination}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, destination: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Gate Agent</FieldLabel>
                  <TextInput
                    value={editDraft.gateAgent}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, gateAgent: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Expeditor</FieldLabel>
                  <TextInput
                    value={editDraft.expeditor}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, expeditor: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Supervisor</FieldLabel>
                  <TextInput
                    value={editDraft.supervisor}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, supervisor: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Final Total Pax</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editDraft.finalTotalPax}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, finalTotalPax: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Total IB Pax</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editDraft.totalIbPax}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, totalIbPax: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Delay</FieldLabel>
                  <SelectInput
                    value={editDraft.delay}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, delay: e.target.value }))
                    }
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Delay Time Minutes</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editDraft.delayTimeMinutes}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, delayTimeMinutes: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Delay Code</FieldLabel>
                  <TextInput
                    value={editDraft.delayCode}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, delayCode: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Controllable</FieldLabel>
                  <SelectInput
                    value={editDraft.controllable}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, controllable: e.target.value }))
                    }
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Block In</FieldLabel>
                  <TimeInput
                    value={editDraft.blockIn}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, blockIn: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>STD</FieldLabel>
                  <TimeInput
                    value={editDraft.std}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, std: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>New STD</FieldLabel>
                  <TimeInput
                    value={editDraft.newStd}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, newStd: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Boarding Deadline</FieldLabel>
                  <TimeInput
                    value={editDraft.boardingDeadline}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, boardingDeadline: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Actual Departure Time</FieldLabel>
                  <TimeInput
                    value={editDraft.actualDepartureTime}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        actualDepartureTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Actual Arrival Time</FieldLabel>
                  <TimeInput
                    value={editDraft.actualArrivalTime}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        actualArrivalTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Brake Release Time</FieldLabel>
                  <TimeInput
                    value={editDraft.brakeReleaseTime}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        brakeReleaseTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Push Time</FieldLabel>
                  <TimeInput
                    value={editDraft.pushTime}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, pushTime: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Gate Agent 1 Arrival</FieldLabel>
                  <TimeInput
                    value={editDraft.gateAgent1Arrival}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        gateAgent1Arrival: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Gate Agent 2 Arrival</FieldLabel>
                  <TimeInput
                    value={editDraft.gateAgent2Arrival}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        gateAgent2Arrival: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Checked Bags</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editDraft.checkedBags}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, checkedBags: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Not Loaded Bags</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editDraft.notLoadedBags}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, notLoadedBags: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>GPU Connected</FieldLabel>
                  <TextInput
                    value={editDraft.gpuConnected}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, gpuConnected: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>First Pax Off</FieldLabel>
                  <TimeInput
                    value={editDraft.firstPaxOff}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, firstPaxOff: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Last Pax Off</FieldLabel>
                  <TimeInput
                    value={editDraft.lastPaxOff}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, lastPaxOff: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>First Pax On</FieldLabel>
                  <TimeInput
                    value={editDraft.firstPaxOn}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, firstPaxOn: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Last Pax On</FieldLabel>
                  <TimeInput
                    value={editDraft.lastPaxOn}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, lastPaxOn: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextArea
                  value={editDraft.remarks}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, remarks: e.target.value }))
                  }
                />
              </div>

              <div
                className="gcm-mobile-actions"
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(2, auto)",
                  gap: 8,
                }}
              >
                <ActionButton
                  variant="success"
                  onClick={() => saveEditing(selectedReport.id)}
                  disabled={workingId === selectedReport.id}
                >
                  {workingId === selectedReport.id ? "Saving..." : "Save Changes"}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={cancelEditing}
                  disabled={workingId === selectedReport.id}
                >
                  Cancel
                </ActionButton>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                }}
              >
                <DetailsRow label="Airline" value={selectedReport.airline} />
                <DetailsRow label="Flight" value={selectedReport.flight} />
                <DetailsRow label="Date" value={selectedReport.date} />
                <DetailsRow label="Aircraft" value={selectedReport.aircraft} />
                <DetailsRow label="Origin" value={selectedReport.origin} />
                <DetailsRow label="Destination" value={selectedReport.destination} />
                <DetailsRow label="Gate Agent" value={selectedReport.gateAgent} />
                <DetailsRow label="Expeditor" value={selectedReport.expeditor} />
                <DetailsRow label="Supervisor" value={selectedReport.supervisor} />
                <DetailsRow
                  label="Final Total Pax"
                  value={String(safeNumber(selectedReport.finalTotalPax))}
                />
                <DetailsRow
                  label="Total IB Pax"
                  value={String(safeNumber(selectedReport.totalIbPax))}
                />
                <DetailsRow label="Delay" value={selectedReport.delay} />
                <DetailsRow
                  label="Delay Time Minutes"
                  value={String(safeNumber(selectedReport.delayTimeMinutes))}
                />
                <DetailsRow label="Delay Code" value={selectedReport.delayCode} />
                <DetailsRow label="Controllable" value={selectedReport.controllable} />
                <DetailsRow label="Block In" value={selectedReport.blockIn} />
                <DetailsRow label="STD" value={getStdValue(selectedReport)} />
                <DetailsRow label="New STD" value={getNewStdValue(selectedReport)} />
                <DetailsRow label="Boarding Deadline" value={selectedReport.boardingDeadline} />
                <DetailsRow label="Actual Departure" value={selectedReport.actualDepartureTime} />
                <DetailsRow label="Actual Arrival" value={selectedReport.actualArrivalTime} />
                <DetailsRow label="Brake Release" value={selectedReport.brakeReleaseTime} />
                <DetailsRow label="Push Time" value={selectedReport.pushTime} />
                <DetailsRow label="GPU Connected" value={selectedReport.gpuConnected} />
                <DetailsRow label="Gate Agent 1 Arrival" value={selectedReport.gateAgent1Arrival} />
                <DetailsRow label="Gate Agent 2 Arrival" value={selectedReport.gateAgent2Arrival} />
                <DetailsRow label="Checked Bags" value={String(safeNumber(selectedReport.checkedBags))} />
                <DetailsRow label="Not Loaded Bags" value={String(safeNumber(selectedReport.notLoadedBags))} />
                <DetailsRow
                  label="MBR %"
                  value={formatPercent(
                    getMbrPercent(
                      safeNumber(selectedReport.notLoadedBags),
                      safeNumber(selectedReport.checkedBags)
                    )
                  )}
                />
                <DetailsRow label="First Pax Off" value={selectedReport.firstPaxOff} />
                <DetailsRow label="Last Pax Off" value={selectedReport.lastPaxOff} />
                <DetailsRow label="First Pax On" value={selectedReport.firstPaxOn} />
                <DetailsRow label="Last Pax On" value={selectedReport.lastPaxOn} />
                <DetailsRow label="Status" value={selectedReport.status} />
                <DetailsRow label="Submitted By" value={selectedReport.submittedBy} />
                <DetailsRow label="Created" value={formatDateTime(selectedReport.createdAt)} />
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={sectionTitleStyle}>Specials</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 8,
                  }}
                >
                  {Object.entries(selectedReport.specials || {}).length ? (
                    Object.entries(selectedReport.specials || {}).map(([key, value]) => (
                      <DetailsRow key={key} label={key} value={value} />
                    ))
                  ) : (
                    <div style={emptyTextStyle}>No specials found.</div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={sectionTitleStyle}>Gate Check</h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 8,
                  }}
                >
                  <DetailsRow label="Bags" value={selectedReport.gateCheck?.bags} />
                  <DetailsRow
                    label="Strollers / Car Seats"
                    value={selectedReport.gateCheck?.strollersCarSeats}
                  />
                  <DetailsRow label="WCHRS" value={selectedReport.gateCheck?.wchrs} />
                  <DetailsRow label="Other" value={selectedReport.gateCheck?.other} />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={sectionTitleStyle}>Delay Announcements</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {Array.isArray(selectedReport.delayAnnouncements) &&
                  selectedReport.delayAnnouncements.length > 0 ? (
                    selectedReport.delayAnnouncements.map((item, index) => (
                      <div key={index} style={announcementRowStyle}>
                        {item || "-"}
                      </div>
                    ))
                  ) : (
                    <div style={emptyTextStyle}>No delay announcements found.</div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={sectionTitleStyle}>Checklist Tasks</h3>
                <div className="gcm-details-scroll" style={tableWrapStyle}>
                  <table style={detailsTableStyle}>
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle}>Time</th>
                        <th style={thStyle}>Task</th>
                        <th style={thStyle}>Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(selectedReport.checklistSections) &&
                      selectedReport.checklistSections.length > 0 ? (
                        selectedReport.checklistSections.flatMap((section, sectionIndex) =>
                          (section.tasks || []).map((task, taskIndex) => (
                            <tr key={`${sectionIndex}-${taskIndex}`}>
                              <td style={tdStyle}>{section.time || "-"}</td>
                              <td style={tdStyle}>{task || "-"}</td>
                              <td style={tdStyle}>
                                {(selectedReport.actuals || {})[
                                  `${sectionIndex}-${taskIndex}`
                                ] || "-"}
                              </td>
                            </tr>
                          ))
                        )
                      ) : (
                        <tr>
                          <td colSpan={3} style={tdStyle}>
                            No checklist tasks found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={sectionTitleStyle}>Notes</h3>
                <div
                  style={{
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    borderRadius: 14,
                    padding: "14px 16px",
                    color: "#0f172a",
                    fontSize: 14,
                    fontWeight: 700,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedReport.remarks || "-"}
                </div>
              </div>
            </>
          )}
        </PageCard>
      )}

      <div
        style={{
          textAlign: "center",
          padding: "6px 0 14px",
          fontSize: 11,
          color: "#94a3b8",
          fontWeight: 700,
        }}
      >
        AeroStation Hub | Operational Management Platform
      </div>
    </div>
  );
}

const tableWrapStyle = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  WebkitOverflowScrolling: "touch",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1740,
  background: "#fff",
};

const detailsTableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 900,
  background: "#fff",
};

const thStyle = {
  padding: "14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};

const sectionTitleStyle = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const emptyTextStyle = {
  fontSize: 14,
  color: "#64748b",
  fontWeight: 700,
};

const announcementRowStyle = {
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
};
