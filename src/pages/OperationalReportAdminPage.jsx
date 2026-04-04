import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();

  if (
    airline.toUpperCase() === "WL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA" ||
    airline.toUpperCase() === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
}

function normalizeCabinServiceValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "cabin_service";
  }

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
  if (!d) return "—";
  return d.toLocaleString();
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
  const start = startOfWeek();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
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

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end };
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

function shouldFlagNeedsAttention(report) {
  if (report?.needsAttention) return true;

  const responses = report?.responses || {};
  return Object.entries(responses).some(([key, value]) => {
    const k = String(key || "").toLowerCase();
    if (
      k.includes("operation completed without issues") ||
      k.includes("operation completed without issue") ||
      k.includes("completed without issues")
    ) {
      return !parseBooleanLike(value) && String(value).trim().toLowerCase() !== "yes";
    }
    return false;
  });
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
  return String(value ?? "—");
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

function getReviewStatusLabel(status) {
  const value = String(status || "submitted").toLowerCase();

  if (value === "submitted") return "Received";
  if (value === "read") return "Reviewed";
  if (value === "approved") return "Accepted";
  if (value === "follow_up_required") return "Follow Up Required";
  if (value === "closed") return "Closed";
  if (value === "archived") return "Archived";
  return "Received";
}

function getReviewStatusStyle(status) {
  const value = String(status || "submitted").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (value === "read") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (value === "approved") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    };
  }

  if (value === "follow_up_required") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (value === "closed") {
    return {
      ...base,
      background: "#f1f5f9",
      color: "#334155",
      borderColor: "#cbd5e1",
    };
  }

  if (value === "archived") {
    return {
      ...base,
      background: "#f8fafc",
      color: "#475569",
      borderColor: "#e2e8f0",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

function getSupervisorFollowUpBy(report) {
  return (
    report.followUpCompletedBy ||
    report.reviewedBy ||
    report.readBy ||
    report.approvedBy ||
    report.closedBy ||
    report.archivedBy ||
    "—"
  );
}

function getSupervisorComments(report) {
  return (
    report.managerComments ||
    report.managerNotes ||
    report.followUpDetails ||
    report.followUpAction ||
    "—"
  );
}

function buildPrintableHtml(report) {
  const responses = report?.responses || {};
  const dynamicBlocks =
    Object.entries(responses).length === 0
      ? `
        <div class="detail-box">
          <div class="detail-label">Dynamic Responses</div>
          <div class="detail-value">No dynamic responses found.</div>
        </div>
      `
      : Object.entries(responses)
          .map(
            ([key, value]) => `
              <div class="detail-box">
                <div class="detail-label">${escapeHtml(prettifyKey(key))}</div>
                <div class="detail-value">${escapeHtml(formatResponseValue(value)).replace(/\n/g, "<br/>")}</div>
              </div>
            `
          )
          .join("");

  const alertNeedsAttention = shouldFlagNeedsAttention(report)
    ? `
      <div class="alert alert-danger">
        This report needs attention because the operation was not completed without issues.
      </div>
    `
    : "";

  const alertDelay = report?.delayedFlight
    ? `
      <div class="alert alert-warning">
        Delay Alert: ${escapeHtml(report.normalizedAirline || "Unknown")} reported a delay of
        ${escapeHtml(String(Number(report.delayedTimeMinutes || 0)))} minutes.
        ${
          Number(report.delayedTimeMinutes || 0) > 4
            ? " Duty Mgrs Follow up needed."
            : ""
        }
      </div>
    `
    : "";

  const managerSection = `
    <div class="detail-box">
      <div class="detail-label">Review Status</div>
      <div class="detail-value">${escapeHtml(getReviewStatusLabel(report.reviewStatus))}</div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Manager Notes / Comments</div>
      <div class="detail-value">${escapeHtml(
        report.managerComments ||
          report.managerNotes ||
          "—"
      ).replace(/\n/g, "<br/>")}</div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Follow Up Action</div>
      <div class="detail-value">${escapeHtml(report.followUpAction || "—").replace(/\n/g, "<br/>")}</div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Follow Up Details</div>
      <div class="detail-value">${escapeHtml(report.followUpDetails || "—").replace(/\n/g, "<br/>")}</div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Follow Up By</div>
      <div class="detail-value">${escapeHtml(getSupervisorFollowUpBy(report))}</div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Operational Report</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
          }
          .header {
            margin-bottom: 20px;
          }
          .title {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
          }
          .subtitle {
            margin-top: 8px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }
          .info-card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px 16px;
          }
          .info-label {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .info-value {
            margin-top: 6px;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            word-break: break-word;
          }
          .detail-box {
            border-radius: 14px;
            padding: 14px 16px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            margin-bottom: 12px;
          }
          .detail-label {
            font-size: 12px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .detail-value {
            font-size: 14px;
            color: #0f172a;
            white-space: pre-line;
            line-height: 1.7;
          }
          .alert {
            border-radius: 14px;
            padding: 14px 16px;
            font-weight: 800;
            font-size: 14px;
            margin-bottom: 14px;
          }
          .alert-danger {
            background: #fff1f2;
            border: 1px solid #fecdd3;
            color: #9f1239;
          }
          .alert-warning {
            background: #fff7ed;
            border: 1px solid #fdba74;
            color: #9a3412;
          }
          @media print {
            body {
              margin: 14px;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">Operational Report</h1>
          <div class="subtitle">
            ${escapeHtml(report.normalizedAirline || "—")} · ${escapeHtml(report.reportDate || "—")}
          </div>
        </div>

        <div class="grid">
          <div class="info-card">
            <div class="info-label">Airline</div>
            <div class="info-value">${escapeHtml(report.normalizedAirline || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Report Date</div>
            <div class="info-value">${escapeHtml(report.reportDate || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Shift</div>
            <div class="info-value">${escapeHtml(report.shift || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Flight Number</div>
            <div class="info-value">${escapeHtml(report.flightNumber || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Flights Handled</div>
            <div class="info-value">${escapeHtml(report.flightsHandled || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Affected Flight Number</div>
            <div class="info-value">${escapeHtml(report.affectedFlightNumber || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Supervisor</div>
            <div class="info-value">${escapeHtml(report.supervisorReporting || "—")}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Delayed Flight</div>
            <div class="info-value">${report.delayedFlight ? "Yes" : "No"}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Delayed Time</div>
            <div class="info-value">${escapeHtml(String(Number(report.delayedTimeMinutes || 0)))} min</div>
          </div>
          <div class="info-card">
            <div class="info-label">Delayed Code</div>
            <div class="info-value">${escapeHtml(report.delayedCodeReported || "—")}</div>
          </div>
        </div>

        ${alertNeedsAttention}
        ${alertDelay}

        <div class="detail-box">
          <div class="detail-label">Delayed Reason</div>
          <div class="detail-value">${escapeHtml(report.delayedReason || "—").replace(/\n/g, "<br/>")}</div>
        </div>

        <div class="detail-box">
          <div class="detail-label">Notes</div>
          <div class="detail-value">${escapeHtml(report.notes || "—").replace(/\n/g, "<br/>")}</div>
        </div>

        ${managerSection}
        ${dynamicBlocks}
      </body>
    </html>
  `;
}

function buildDelaySummaryPrintableHtml(airline, reports, range) {
  const rowsHtml = reports
    .map((report) => {
      const dutyManager = getSupervisorFollowUpBy(report);

      return `
        <tr>
          <td>${escapeHtml(report.reportDate || "—")}</td>
          <td>${escapeHtml(report.normalizedAirline || "—")}</td>
          <td>${escapeHtml(report.flightNumber || "—")}</td>
          <td>${escapeHtml(report.affectedFlightNumber || "—")}</td>
          <td>${escapeHtml(String(Number(report.delayedTimeMinutes || 0)))} min</td>
          <td>${escapeHtml(report.supervisorReporting || "—")}</td>
          <td>${escapeHtml(dutyManager)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Delay Summary</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
          }
          h1 {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
          }
          .subtitle {
            margin-top: 8px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }
          .summary-box {
            margin-top: 16px;
            margin-bottom: 18px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px 16px;
          }
          .summary-label {
            font-size: 12px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .summary-value {
            margin-top: 6px;
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th, td {
            border: 1px solid #dbeafe;
            padding: 10px 12px;
            text-align: left;
            font-size: 13px;
          }
          th {
            background: #f8fbff;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <h1>Delay Summary</h1>
        <div class="subtitle">
          ${escapeHtml(airline)} · ${escapeHtml(range)}
        </div>

        <div class="summary-box">
          <div class="summary-label">Total of Flights Delayed</div>
          <div class="summary-value">${reports.length}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Airline</th>
              <th>Flight Number</th>
              <th>Affected Flight</th>
              <th>Delayed Time</th>
              <th>Supervisor on Duty</th>
              <th>Duty Manager in Charge</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
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
        fontWeight: 700,
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
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
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 14,
};

function InfoCard({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 16,
        padding: "14px 16px",
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
          fontSize: 16,
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
        borderRadius: 16,
        padding: "14px 16px",
        background: "#f8fbff",
        border: "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#0f172a",
          whiteSpace: "pre-line",
          lineHeight: 1.7,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function OperationalReportAdminPage() {
  const { user } = useUser();

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" && normalizedUsername === "hhernandez";

  const isSupervisor = user?.role === "supervisor";
  const canManage =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canAccess =
    user?.role === "duty_manager" ||
    user?.role === "station_manager" ||
    user?.role === "supervisor";

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [actionId, setActionId] = useState("");
  const [selectedDelayAirline, setSelectedDelayAirline] = useState("");

  const [filters, setFilters] = useState({
    airline: "all",
    lifecycle: "active",
    dateMode: "quick",
    range: "today",
    fromDate: "",
    toDate: "",
  });

  const [editForm, setEditForm] = useState({
    airline: "",
    reportDate: "",
    shift: "",
    flightNumber: "",
    flightsHandled: "",
    affectedFlightNumber: "",
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
    managerComments: "",
    followUpRequired: false,
    followUpAction: "",
    followUpDetails: "",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const q = query(
          collection(db, "operational_reports"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        let rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            normalizedAirline: normalizeAirlineName(data.airline),
            normalizedDepartment: normalizeCabinServiceValue(
              data.department || data.airline
            ),
            reviewStatus: data.reviewStatus || "submitted",
            managerNotes: data.managerNotes || "",
            managerComments: data.managerComments || "",
            followUpRequired: Boolean(data.followUpRequired),
            followUpAction: data.followUpAction || "",
            followUpDetails: data.followUpDetails || "",
            archived: Boolean(data.archived),
          };
        });

        if (isCabinDutyManager) {
          rows = rows.filter((row) => row.normalizedDepartment === "cabin_service");
        }

        if (isSupervisor) {
          const myUserId = String(user?.id || "").trim();
          const myUsername = String(user?.username || "")
            .trim()
            .toLowerCase();

          rows = rows.filter((row) => {
            const rowUserId = String(row.submittedByUserId || "").trim();
            const rowUsername = String(row.submittedByUsername || "")
              .trim()
              .toLowerCase();

            return (
              (myUserId && rowUserId === myUserId) ||
              (myUsername && rowUsername === myUsername)
            );
          });
        }

        setReports(rows);
      } catch (err) {
        console.error("Error loading operational reports:", err);
        setStatusMessage("Could not load operational reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadReports();
    } else {
      setLoading(false);
    }
  }, [canAccess, isCabinDutyManager, isSupervisor, user?.id, user?.username]);

  const airlineOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      if (r.normalizedAirline) set.add(r.normalizedAirline);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const quickRange =
      filters.dateMode === "quick" ? getRangeDates(filters.range) : null;

    const customRange =
      filters.dateMode === "custom"
        ? getCustomDateRange(filters.fromDate, filters.toDate)
        : null;

    return reports.filter((r) => {
      const created = tsToDate(r.createdAt);
      if (!created) return false;

      if (filters.dateMode === "quick" && quickRange) {
        if (created < quickRange.start || created > quickRange.end) return false;
      }

      if (filters.dateMode === "custom" && customRange) {
        if (created < customRange.start || created > customRange.end) return false;
      }

      if (filters.airline !== "all" && r.normalizedAirline !== filters.airline) {
        return false;
      }

      const status = String(r.reviewStatus || "submitted").toLowerCase();

      if (filters.lifecycle === "active") {
        return !["closed", "archived"].includes(status);
      }

      if (filters.lifecycle === "closed") {
        return status === "closed";
      }

      if (filters.lifecycle === "archived") {
        return status === "archived";
      }

      return true;
    });
  }, [reports, filters]);

  const delayedReports = useMemo(() => {
    return filteredReports.filter((r) => Boolean(r.delayedFlight));
  }, [filteredReports]);

  const delayedSummaryByAirline = useMemo(() => {
    const map = {};

    delayedReports.forEach((r) => {
      const airline = r.normalizedAirline || "Unknown";

      if (!map[airline]) {
        map[airline] = {
          airline,
          totalDelayedFlights: 0,
          reports: [],
        };
      }

      map[airline].totalDelayedFlights += 1;
      map[airline].reports.push(r);
    });

    return Object.values(map).sort(
      (a, b) =>
        b.totalDelayedFlights - a.totalDelayedFlights ||
        a.airline.localeCompare(b.airline)
    );
  }, [delayedReports]);

  const selectedDelayAirlineReports = useMemo(() => {
    if (!selectedDelayAirline) return [];
    const found = delayedSummaryByAirline.find(
      (item) => item.airline === selectedDelayAirline
    );
    return found?.reports || [];
  }, [delayedSummaryByAirline, selectedDelayAirline]);

  const alerts = useMemo(() => {
    const rows = [];

    delayedSummaryByAirline.forEach((item) => {
      const maxMinutes = Math.max(
        ...item.reports.map((report) => Number(report.delayedTimeMinutes || 0)),
        0
      );

      if (
        (filters.dateMode === "quick" && filters.range === "month") ||
        (filters.dateMode === "custom" && item.totalDelayedFlights > 2)
      ) {
        if (item.totalDelayedFlights > 2) {
          rows.push({
            type: "followup",
            airline: item.airline,
            text: `${item.airline}: Duty Mgrs Follow up needed. More than 2 delayed flights reported in selected period.`,
          });
        }
      }

      if (maxMinutes > 4) {
        rows.push({
          type: "followup",
          airline: item.airline,
          text: `${item.airline}: Duty Mgrs Follow up needed. At least one delayed flight exceeded 4 minutes.`,
        });
      }
    });

    filteredReports.forEach((r) => {
      if (shouldFlagNeedsAttention(r)) {
        rows.push({
          type: "attention",
          airline: r.normalizedAirline || "Unknown",
          text: `${r.normalizedAirline || "Unknown"}: Report needs attention because operation was not completed without issues.`,
        });
      }
    });

    return rows;
  }, [delayedSummaryByAirline, filteredReports, filters.range, filters.dateMode]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedId) || null;
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (selectedId && !filteredReports.some((r) => r.id === selectedId)) {
      setSelectedId(filteredReports[0]?.id || "");
    }
  }, [filteredReports, selectedId]);

  const handleSelectDelayAirline = (airline) => {
    setSelectedDelayAirline(airline);
    const found = delayedSummaryByAirline.find((item) => item.airline === airline);
    if (found?.reports?.length) {
      setSelectedId(found.reports[0].id);
    }
  };

  const startEdit = (report) => {
    if (!canManage) return;

    setEditingId(report.id);
    setEditForm({
      airline: report.airline || "",
      reportDate: report.reportDate || "",
      shift: report.shift || "",
      flightNumber: report.flightNumber || "",
      flightsHandled: report.flightsHandled || "",
      affectedFlightNumber: report.affectedFlightNumber || "",
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
      managerComments: report.managerComments || "",
      followUpRequired: Boolean(report.followUpRequired),
      followUpAction: report.followUpAction || "",
      followUpDetails: report.followUpDetails || "",
    });
    setSelectedId(report.id);
  };

  const cancelEdit = () => {
    setEditingId("");
    setSavingId("");
  };

  const handleDynamicResponseChange = (key, value) => {
    setEditForm((prev) => ({
      ...prev,
      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  const saveEdit = async (report) => {
    if (!canManage) return;

    try {
      setSavingId(report.id);

      const payload = {
        airline: normalizeAirlineName(editForm.airline),
        reportDate: editForm.reportDate,
        shift: editForm.shift,
        flightNumber: editForm.flightNumber,
        flightsHandled: editForm.flightsHandled,
        affectedFlightNumber: editForm.affectedFlightNumber,
        supervisorReporting: editForm.supervisorReporting,
        notes: editForm.notes,
        delayedFlight: Boolean(editForm.delayedFlight),
        delayedTimeMinutes: Number(editForm.delayedTimeMinutes || 0),
        delayedReason: String(editForm.delayedReason || "").trim(),
        delayedCodeReported: String(editForm.delayedCodeReported || "").trim(),
        needsAttention: Boolean(editForm.needsAttention),
        responses: editForm.responses || {},
        reviewStatus: editForm.reviewStatus || "submitted",
        managerNotes: editForm.managerNotes || "",
        managerComments: editForm.managerComments || editForm.managerNotes || "",
        followUpRequired: Boolean(editForm.followUpRequired),
        followUpAction: editForm.followUpAction || "",
        followUpDetails: editForm.followUpDetails || "",
      };

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                normalizedAirline: normalizeAirlineName(payload.airline),
              }
            : item
        )
      );

      setEditingId("");
      setSavingId("");
      setStatusMessage("Operational report updated successfully.");
    } catch (err) {
      console.error("Error updating operational report:", err);
      setStatusMessage("Could not update operational report.");
      setSavingId("");
    }
  };

  const updateWorkflowStatus = async (report, mode) => {
    if (!canManage) return;

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
          item.id === report.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setStatusMessage(`Report marked as ${getReviewStatusLabel(payload.reviewStatus)}.`);
    } catch (err) {
      console.error("Error updating workflow status:", err);
      setStatusMessage("Could not update report status.");
    } finally {
      setActionId("");
    }
  };

  const saveFollowUp = async (report) => {
    if (!canManage) return;

    const action = String(editForm.followUpAction || "").trim();
    const details = String(editForm.followUpDetails || "").trim();

    if (!action && !details && !String(editForm.managerNotes || "").trim()) {
      setStatusMessage("Please enter manager notes, follow up action, or follow up details.");
      return;
    }

    try {
      setActionId(report.id);

      const managerName = getVisibleUserName(user);
      const managerRole = user?.role || "";

      const payload = {
        followUpRequired: true,
        reviewStatus: "follow_up_required",
        followUpAction: action,
        followUpDetails: details,
        managerNotes: editForm.managerNotes || "",
        managerComments: editForm.managerNotes || "",
        followUpCompletedAt: serverTimestamp(),
        followUpCompletedBy: managerName,
        followUpCompletedByRole: managerRole,
      };

      await updateDoc(doc(db, "operational_reports", report.id), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setEditForm((prev) => ({
        ...prev,
        followUpRequired: true,
        reviewStatus: "follow_up_required",
      }));

      setStatusMessage("Follow up saved successfully.");
    } catch (err) {
      console.error("Error saving follow up:", err);
      setStatusMessage("Could not save follow up.");
    } finally {
      setActionId("");
    }
  };

  const deleteReport = async (report) => {
    if (!canManage) return;

    const ok = window.confirm(
      `Delete operational report for ${report.normalizedAirline || "Unknown"}?`
    );
    if (!ok) return;

    try {
      setDeletingId(report.id);
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

  const handlePrintExport = () => {
    if (!selectedReport) return;

    const html = buildPrintableHtml(selectedReport);
    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to export/print.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    setTimeout(triggerPrint, 400);
  };

  const handlePrintDelaySummary = () => {
    if (!selectedDelayAirline || selectedDelayAirlineReports.length === 0) {
      setStatusMessage("Please select an airline with delayed flights first.");
      return;
    }

    const rangeLabel =
      filters.dateMode === "custom"
        ? `${filters.fromDate || "Start"} to ${filters.toDate || "End"}`
        : filters.range;

    const html = buildDelaySummaryPrintableHtml(
      selectedDelayAirline,
      selectedDelayAirlineReports,
      rangeLabel
    );

    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to export/print.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  if (!canAccess) {
    return (
      <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
            TPA OPS · Operational Reports
          </p>
          <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
            Access denied
          </h1>
          <p style={{ margin: 0, maxWidth: 700, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
            Only Supervisors, Duty Managers and Station Managers can view operational reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(255,255,255,0.78)", fontWeight: 700 }}>
          TPA OPS · Operational Reports
        </p>
        <h1 style={{ margin: "10px 0 6px", fontSize: 32, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-0.04em" }}>
          {isSupervisor ? "My Operational Reports" : "Operational Report Admin"}
        </h1>
        <p style={{ margin: 0, maxWidth: 760, fontSize: 14, color: "rgba(255,255,255,0.88)" }}>
          {isSupervisor
            ? "Review the operational reports submitted by you, track their status, see duty manager follow-up and comments."
            : "Review delays, alerts, follow-up cases, and manage submitted operational reports."}
        </p>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
            Filters
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Date Filter Mode</FieldLabel>
            <SelectInput
              value={filters.dateMode}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  dateMode: e.target.value,
                }))
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
                    setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
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
            <FieldLabel>View</FieldLabel>
            <SelectInput
              value={filters.lifecycle}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, lifecycle: e.target.value }))
              }
            >
              <option value="active">Active Reports</option>
              <option value="closed">Closed Reports</option>
              <option value="archived">Archived Reports</option>
              <option value="all">All</option>
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {!isSupervisor && alerts.length > 0 && (
        <PageCard style={{ padding: 18 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#9f1239",
                marginBottom: 8,
              }}
            >
              Alerts
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.airline}-${index}`}
                  style={{
                    color: "#9f1239",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      {!isSupervisor && (
        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              marginBottom: 14,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Delay Summary
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Click an airline to view its delayed flight list.
                {filters.dateMode === "custom"
                  ? ` Filter: ${filters.fromDate || "Start"} to ${filters.toDate || "End"}`
                  : ` Filter: ${filters.range}`}
              </p>
            </div>

            {selectedDelayAirline && selectedDelayAirlineReports.length > 0 && (
              <ActionButton variant="secondary" onClick={handlePrintDelaySummary}>
                Print / Export Delay Summary
              </ActionButton>
            )}
          </div>

          {delayedSummaryByAirline.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              No delayed flights found for this filter.
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                borderRadius: 18,
                border: "1px solid #e2e8f0",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 620,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>Total of Flights Delayed</th>
                    <th style={thStyle({ textAlign: "center" })}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {delayedSummaryByAirline.map((row, index) => (
                    <tr
                      key={row.airline}
                      style={{
                        background:
                          row.airline === selectedDelayAirline
                            ? "#edf7ff"
                            : index % 2 === 0
                            ? "#ffffff"
                            : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => handleSelectDelayAirline(row.airline)}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#1769aa",
                            fontWeight: 800,
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {row.airline}
                        </button>
                      </td>
                      <td style={tdStyle}>{row.totalDelayedFlights}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <ActionButton
                          variant="secondary"
                          onClick={() => handleSelectDelayAirline(row.airline)}
                        >
                          View
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedDelayAirline && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {selectedDelayAirline} Delayed Flights
                  </h3>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    Total delayed flights: {selectedDelayAirlineReports.length}
                  </p>
                </div>
              </div>

              {selectedDelayAirlineReports.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    color: "#64748b",
                    fontWeight: 600,
                  }}
                >
                  No delayed reports found for this airline.
                </div>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                    borderRadius: 18,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1100,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle()}>Date</th>
                        <th style={thStyle()}>Airline</th>
                        <th style={thStyle()}>Flight Number</th>
                        <th style={thStyle()}>Affected Flight</th>
                        <th style={thStyle()}>Delayed Time</th>
                        <th style={thStyle()}>Supervisor on Duty</th>
                        <th style={thStyle()}>Duty Manager in Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDelayAirlineReports.map((report, index) => {
                        const dutyManager = getSupervisorFollowUpBy(report);

                        return (
                          <tr
                            key={report.id}
                            style={{
                              background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                            }}
                          >
                            <td style={tdStyle}>{report.reportDate || "—"}</td>
                            <td style={tdStyle}>{report.normalizedAirline || "—"}</td>
                            <td style={tdStyle}>{report.flightNumber || "—"}</td>
                            <td style={tdStyle}>{report.affectedFlightNumber || "—"}</td>
                            <td style={tdStyle}>
                              {Number(report.delayedTimeMinutes || 0)} min
                            </td>
                            <td style={tdStyle}>{report.supervisorReporting || "—"}</td>
                            <td style={tdStyle}>{dutyManager}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </PageCard>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.95fr) minmax(460px, 1.3fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
              {isSupervisor ? "My Submitted Reports" : "Submitted Reports"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
            <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
              Loading operational reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div style={{ padding: 16, borderRadius: 16, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontWeight: 600 }}>
              No operational reports found.
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                borderRadius: 18,
                border: "1px solid #e2e8f0",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: isSupervisor ? 1100 : 1500,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>Date</th>
                    <th style={thStyle()}>Flight Number</th>
                    <th style={thStyle()}>Affected Flight</th>
                    <th style={thStyle()}>Supervisor</th>
                    <th style={thStyle()}>Delayed</th>
                    <th style={thStyle()}>Minutes</th>
                    <th style={thStyle()}>Needs Attention</th>
                    <th style={thStyle()}>Status</th>
                    <th style={thStyle()}>Created</th>
                    <th style={thStyle({ textAlign: "center" })}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report, index) => (
                    <tr
                      key={report.id}
                      style={{
                        background:
                          report.id === selectedId
                            ? "#edf7ff"
                            : index % 2 === 0
                            ? "#ffffff"
                            : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>{report.normalizedAirline || "—"}</td>
                      <td style={tdStyle}>{report.reportDate || "—"}</td>
                      <td style={tdStyle}>{report.flightNumber || "—"}</td>
                      <td style={tdStyle}>{report.affectedFlightNumber || "—"}</td>
                      <td style={tdStyle}>{report.supervisorReporting || "—"}</td>
                      <td style={tdStyle}>{report.delayedFlight ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{Number(report.delayedTimeMinutes || 0)}</td>
                      <td style={tdStyle}>{shouldFlagNeedsAttention(report) ? "Yes" : "No"}</td>
                      <td style={tdStyle}>
                        <span style={getReviewStatusStyle(report.reviewStatus)}>
                          {getReviewStatusLabel(report.reviewStatus)}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatDateTime(report.createdAt)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton variant="secondary" onClick={() => setSelectedId(report.id)}>
                            View
                          </ActionButton>

                          {canManage && (
                            <>
                              <ActionButton variant="warning" onClick={() => startEdit(report)}>
                                Edit
                              </ActionButton>

                              <ActionButton
                                variant="danger"
                                onClick={() => deleteReport(report)}
                                disabled={deletingId === report.id}
                              >
                                {deletingId === report.id ? "Deleting..." : "Delete"}
                              </ActionButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            {editingId === selectedReport.id && canManage ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                    Edit Operational Report
                  </h2>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton
                      variant="success"
                      onClick={() => saveEdit(selectedReport)}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Save"}
                    </ActionButton>

                    <ActionButton variant="secondary" onClick={cancelEdit}>
                      Cancel
                    </ActionButton>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Airline</FieldLabel>
                    <TextInput
                      value={editForm.airline}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, airline: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Report Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={editForm.reportDate}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, reportDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Shift</FieldLabel>
                    <TextInput
                      value={editForm.shift}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, shift: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Flight Number</FieldLabel>
                    <TextInput
                      value={editForm.flightNumber}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, flightNumber: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Flights Handled</FieldLabel>
                    <TextInput
                      value={editForm.flightsHandled}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, flightsHandled: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Affected Flight Number</FieldLabel>
                    <TextInput
                      value={editForm.affectedFlightNumber}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, affectedFlightNumber: e.target.value }))}
                    />
                  </div>

                  <div>
                    <FieldLabel>Supervisor Reporting</FieldLabel>
                    <TextInput
                      value={editForm.supervisorReporting}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, supervisorReporting: e.target.value }))}
                    />
                  </div>

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
                    <FieldLabel>Delayed Time (minutes)</FieldLabel>
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

                  <div>
                    <FieldLabel>Delayed Code Reported</FieldLabel>
                    <TextInput
                      value={editForm.delayedCodeReported}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedCodeReported: e.target.value,
                        }))
                      }
                    />
                  </div>
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

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.needsAttention}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        needsAttention: e.target.checked,
                      }))
                    }
                  />
                  Needs Attention
                </label>

                <div>
                  <FieldLabel>Manager Notes / Comments</FieldLabel>
                  <TextArea
                    value={editForm.managerNotes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        managerNotes: e.target.value,
                        managerComments: e.target.value,
                      }))
                    }
                  />
                </div>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.followUpRequired}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        followUpRequired: e.target.checked,
                        reviewStatus: e.target.checked
                          ? "follow_up_required"
                          : prev.reviewStatus,
                      }))
                    }
                  />
                  Follow Up Required
                </label>

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

                <div>
                  <FieldLabel>Dynamic Responses</FieldLabel>
                  <div style={{ display: "grid", gap: 12 }}>
                    {Object.entries(editForm.responses || {}).length === 0 ? (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No dynamic responses found.
                      </div>
                    ) : (
                      Object.entries(editForm.responses || {}).map(([key, value]) => (
                        <div key={key}>
                          <FieldLabel>{prettifyKey(key)}</FieldLabel>
                          <TextArea
                            value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                            onChange={(e) =>
                              handleDynamicResponseChange(key, e.target.value)
                            }
                            style={{ minHeight: 70 }}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                      {isSupervisor ? "My Report Detail" : "Report Detail"}
                    </h2>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                      {selectedReport.normalizedAirline || "—"} · {selectedReport.reportDate || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <ActionButton variant="secondary" onClick={handlePrintExport}>
                      Print / Export PDF
                    </ActionButton>

                    {canManage && (
                      <ActionButton variant="warning" onClick={() => startEdit(selectedReport)}>
                        Edit
                      </ActionButton>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <InfoCard label="Airline" value={selectedReport.normalizedAirline || "—"} />
                  <InfoCard label="Report Date" value={selectedReport.reportDate || "—"} />
                  <InfoCard label="Shift" value={selectedReport.shift || "—"} />
                  <InfoCard label="Flight Number" value={selectedReport.flightNumber || "—"} />
                  <InfoCard label="Flights Handled" value={selectedReport.flightsHandled || "—"} />
                  <InfoCard label="Affected Flight Number" value={selectedReport.affectedFlightNumber || "—"} />
                  <InfoCard label="Supervisor" value={selectedReport.supervisorReporting || "—"} />
                  <InfoCard label="Delayed Flight" value={selectedReport.delayedFlight ? "Yes" : "No"} />
                  <InfoCard label="Delayed Time" value={`${Number(selectedReport.delayedTimeMinutes || 0)} min`} />
                  <InfoCard label="Delayed Code" value={selectedReport.delayedCodeReported || "—"} />
                  <InfoCard label="Status" value={getReviewStatusLabel(selectedReport.reviewStatus)} />
                  <InfoCard label="Follow Up By" value={getSupervisorFollowUpBy(selectedReport)} />
                </div>

                <DetailBox label="Delayed Reason" value={selectedReport.delayedReason || "—"} />
                <DetailBox label="Notes" value={selectedReport.notes || "—"} />
                <DetailBox
                  label="Manager Notes / Comments"
                  value={getSupervisorComments(selectedReport)}
                />
                <DetailBox label="Follow Up Action" value={selectedReport.followUpAction || "—"} />
                <DetailBox label="Follow Up Details" value={selectedReport.followUpDetails || "—"} />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <InfoCard label="Received At" value={formatDateTime(selectedReport.createdAt)} />
                  <InfoCard label="Reviewed At" value={formatDateTime(selectedReport.readAt || selectedReport.reviewedAt)} />
                  <InfoCard label="Accepted At" value={formatDateTime(selectedReport.approvedAt)} />
                  <InfoCard label="Closed At" value={formatDateTime(selectedReport.closedAt)} />
                  <InfoCard label="Reviewed By" value={selectedReport.readBy || selectedReport.reviewedBy || "—"} />
                  <InfoCard label="Accepted By" value={selectedReport.approvedBy || "—"} />
                  <InfoCard label="Closed By" value={selectedReport.closedBy || "—"} />
                  <InfoCard label="Archived By" value={selectedReport.archivedBy || "—"} />
                </div>

                {shouldFlagNeedsAttention(selectedReport) && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      color: "#9f1239",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    This report needs attention because the operation was not completed without issues.
                  </div>
                )}

                {selectedReport.delayedFlight && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      color: "#9a3412",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Delay Alert: {selectedReport.normalizedAirline || "Unknown"} reported a delay of{" "}
                    {Number(selectedReport.delayedTimeMinutes || 0)} minutes.
                    {Number(selectedReport.delayedTimeMinutes || 0) > 4
                      ? " Duty Mgrs Follow up needed."
                      : ""}
                  </div>
                )}

                {canManage && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {selectedReport.reviewStatus !== "read" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() => updateWorkflowStatus(selectedReport, "read")}
                          disabled={actionId === selectedReport.id}
                        >
                          Mark Reviewed
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !== "approved" && (
                        <ActionButton
                          variant="success"
                          onClick={() => updateWorkflowStatus(selectedReport, "approved")}
                          disabled={actionId === selectedReport.id}
                        >
                          Accept
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !== "follow_up_required" && (
                        <ActionButton
                          variant="warning"
                          onClick={() => updateWorkflowStatus(selectedReport, "follow_up_required")}
                          disabled={actionId === selectedReport.id}
                        >
                          Require Follow Up
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !== "closed" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() => updateWorkflowStatus(selectedReport, "closed")}
                          disabled={actionId === selectedReport.id}
                        >
                          Close Report
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !== "archived" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() => updateWorkflowStatus(selectedReport, "archived")}
                          disabled={actionId === selectedReport.id}
                        >
                          Archive
                        </ActionButton>
                      )}
                    </div>

                    <div
                      style={{
                        borderRadius: 16,
                        padding: "14px 16px",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 8,
                        }}
                      >
                        Follow Up Manager Entry
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <FieldLabel>Manager Notes / Comments</FieldLabel>
                          <TextArea
                            value={editForm.managerNotes}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                managerNotes: e.target.value,
                                managerComments: e.target.value,
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

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="warning"
                            onClick={() => saveFollowUp(selectedReport)}
                            disabled={actionId === selectedReport.id}
                          >
                            Save Follow Up
                          </ActionButton>

                          <ActionButton
                            variant="secondary"
                            onClick={() => startEdit(selectedReport)}
                          >
                            Sync From Report
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Dynamic Responses
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {Object.entries(selectedReport.responses || {}).length === 0 ? (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No dynamic responses found.
                      </div>
                    ) : (
                      Object.entries(selectedReport.responses || {}).map(([key, value]) => (
                        <div
                          key={key}
                          style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#64748b",
                              marginBottom: 4,
                            }}
                          >
                            {prettifyKey(key)}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "#0f172a",
                              fontWeight: 600,
                              whiteSpace: "pre-line",
                            }}
                          >
                            {Array.isArray(value) ? value.join(", ") : String(value || "—")}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </PageCard>
        )}
      </div>
    </div>
  );
}
