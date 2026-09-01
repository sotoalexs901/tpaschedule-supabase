import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

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

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return airline;
}

function normalizeDepartment(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCabinServiceValue(value) {
  const raw = normalizeDepartment(value);

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "cabin_service";
  }

  return raw;
}

function isCabinServiceDepartment(value) {
  return normalizeCabinServiceValue(value) === "cabin_service";
}

function tsToDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = tsToDate(value);
  if (!d) return "\u2014";
  return d.toLocaleString();
}

const APPROVAL_DEADLINE_HOURS = 24;

function getSubmissionReferenceDate(report) {
  return (
    tsToDate(report?.resubmittedAt) ||
    tsToDate(report?.createdAt) ||
    null
  );
}

function getApprovalDeadline(report) {
  const reference = getSubmissionReferenceDate(report);
  if (!reference) return null;

  return new Date(
    reference.getTime() + APPROVAL_DEADLINE_HOURS * 60 * 60 * 1000
  );
}

function isReportOverdue(report) {
  const status = String(report?.status || "submitted")
    .trim()
    .toLowerCase();

  if (status !== "submitted") return false;

  const deadline = getApprovalDeadline(report);
  if (!deadline) return false;

  return Date.now() > deadline.getTime();
}

function getReportVisualState(report) {
  const status = String(report?.status || "submitted")
    .trim()
    .toLowerCase();

  if (isReportOverdue(report)) {
    return {
      key: "overdue",
      label: "OVERDUE",
      background: "#fff1f2",
      border: "#fda4af",
      text: "#9f1239",
      accent: "#dc2626",
    };
  }

  if (status === "approved") {
    return {
      key: "approved",
      label: "APPROVED",
      background: "#ecfdf5",
      border: "#86efac",
      text: "#166534",
      accent: "#16a34a",
    };
  }

  if (status === "returned") {
    return {
      key: "returned",
      label: "RETURNED TO SUPERVISOR",
      background: "#fffbeb",
      border: "#fcd34d",
      text: "#92400e",
      accent: "#d97706",
    };
  }

  return {
    key: "submitted",
    label: "SUBMITTED",
    background: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
    accent: "#2563eb",
  };
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getBreakMinutes(value) {
  const v = String(value || "").trim().toLowerCase();

  if (!v || v === "no") return 0;
  if (v === "yes") return 30;
  if (v.includes("30")) return 30;
  if (v.includes("45")) return 45;
  if (v.includes("60")) return 60;

  return 0;
}

function calculateRowHours(row) {
  const start = toMinutes(row?.punchIn);
  const endRaw = toMinutes(row?.punchOut);

  if (start == null || endRaw == null) return 0;

  let end = endRaw;
  if (end <= start) end += 24 * 60;

  let minutes = end - start;
  minutes -= getBreakMinutes(row?.breakTaken);

  if (minutes < 0) minutes = 0;

  return minutes / 60;
}

function calculateReportHours(report) {
  return (report?.rows || []).reduce(
    (sum, row) => sum + calculateRowHours(row),
    0
  );
}

function startOfTodayString() {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function isInCurrentMonth(dateString) {
  const clean = String(dateString || "").trim();
  if (!clean) return false;

  const parsed = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;

  const now = new Date();

  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth()
  );
}

function prettifyDepartment(value) {
  const clean = String(value || "").trim();
  if (!clean) return "No Department";

  const lower = clean.toLowerCase();

  if (
    lower === "cabin_service" ||
    lower === "cabin service" ||
    lower === "dl cabin service"
  ) {
    return "Cabin Service";
  }

  return clean;
}

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
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
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
        fontSize: 11,
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
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
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
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
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
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 13,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 100,
        fontFamily: "inherit",
        boxSizing: "border-box",
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
      boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
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
      boxShadow: "0 10px 20px rgba(22,163,74,0.16)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(245,158,11,0.16)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 9px 18px rgba(220,38,38,0.16)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
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
    padding: "12px 13px",
    fontSize: 11,
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
  padding: "12px 13px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 13,
};

function statusBadge(status) {
  const value = String(status || "").toUpperCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (value === "APPROVED") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    };
  }

  if (value === "RETURNED") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (value === "SUBMITTED") {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function InfoCard({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 15,
        padding: "13px 15px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
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
          marginTop: 5,
          fontSize: 15,
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

function BrandHeader({ title, description, isMobile, isTablet }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, #073b66 0%, #0f5c91 50%, #2e9fd6 100%)",
        borderRadius: isMobile ? 16 : 18,
        padding: isMobile ? "12px 14px" : isTablet ? "14px 16px" : "14px 16px",
        color: "#ffffff",
        boxShadow: "0 14px 30px rgba(15,76,129,0.16)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 155,
          height: 155,
          borderRadius: "999px",
          border: "1px solid rgba(255,255,255,0.08)",
          top: -92,
          right: -28,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: isMobile ? 38 : 42,
            height: isMobile ? 38 : 42,
            flex: `0 0 ${isMobile ? 38 : 42}px`,
            borderRadius: 12,
            background: "rgba(255,255,255,0.96)",
            border: "1px solid rgba(255,255,255,0.9)",
            overflow: "hidden",
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              marginBottom: 2,
              fontSize: isMobile ? 8 : 8.5,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.7)",
              fontWeight: 800,
            }}
          >
            {APP_NAME} {"\u00B7"} Timesheets
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              lineHeight: 1.15,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              margin: "4px 0 0",
              maxWidth: 760,
              fontSize: isMobile ? 10.5 : 11.5,
              lineHeight: 1.45,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function buildPrintableHtml(report, airlineSummary) {
  const logoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/icons/aerostation-icon.png`
      : "/icons/aerostation-icon.png";

  const rowsHtml = (report.rows || [])
    .map((row) => {
      const hours = calculateRowHours(row).toFixed(2);

      return `
        <tr>
          <td>${row.employeeName || "\u2014"}</td>
          <td>${row.punchIn || "\u2014"}</td>
          <td>${row.punchOut || "\u2014"}</td>
          <td>${row.employeeStatus || "\u2014"}</td>
          <td>${row.breakTaken || "\u2014"}</td>
          <td>${row.reason || "\u2014"}</td>
          <td>${hours} hrs</td>
        </tr>
      `;
    })
    .join("");

  const approvalBlock =
    String(report.status || "").toLowerCase() === "approved"
      ? `
        <div class="approval-box">
          <div class="section-label">Approval</div>
          <div>
            Approved by ${report.approvedByName || "Manager"}
            ${report.approvedByRole ? ` (${report.approvedByRole})` : ""}
            &middot; ${formatDateTime(report.approvedAt)}
          </div>
        </div>
      `
      : "";

  const returnedBlock =
    String(report.status || "").toLowerCase() === "returned"
      ? `
        <div class="returned-box">
          <div class="section-label">Returned For Fix</div>
          <div>
            Returned by ${report.returnedByName || "Manager"}
            ${report.returnedByRole ? ` (${report.returnedByRole})` : ""}
            &middot; ${formatDateTime(report.returnedAt)}
          </div>
          <div style="margin-top:8px;">
            ${String(report.returnedReason || "No reason provided.").replace(
              /\n/g,
              "<br/>"
            )}
          </div>
        </div>
      `
      : "";

  const notesBlock = report.notes
    ? `
      <div class="notes-box">
        <div class="section-label">Notes</div>
        <div>${String(report.notes).replace(/\n/g, "<br/>")}</div>
      </div>
    `
    : "";

  const overBudgetReasonBlock =
    report.overBudget && report.overBudgetReason
      ? `
        <div class="over-budget-reason-box">
          <div class="section-label">Over Budget Reason</div>
          <div>${String(report.overBudgetReason).replace(/\n/g, "<br/>")}</div>
        </div>
      `
      : "";

  const budgetAlert =
    airlineSummary?.overBudget || report.overBudget
      ? `
        <div class="alert-box">
          Budget alert: ${report.normalizedAirline} is over daily budget by
          ${Number(report.overBudgetBy || airlineSummary?.overBy || 0).toFixed(
            2
          )} hours on ${report.reportDate || "this day"}.
        </div>
      `
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${APP_NAME} - Timesheet Report</title>
        <style>
          * { box-sizing: border-box; }

          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #111827;
            background: #ffffff;
          }

          .brand-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding-bottom: 16px;
            margin-bottom: 18px;
            border-bottom: 2px solid #e5eef7;
          }

          .brand-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .brand-logo {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            border: 1px solid #dbeafe;
            background: #ffffff;
            object-fit: contain;
          }

          .brand-name {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #1769aa;
          }

          .brand-subtitle {
            margin-top: 3px;
            font-size: 11px;
            color: #64748b;
            font-weight: 700;
          }

          .document-label {
            font-size: 11px;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            text-align: right;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 18px;
          }

          .title {
            font-size: 27px;
            font-weight: 800;
            margin: 0;
            letter-spacing: -0.03em;
          }

          .subtitle {
            margin-top: 6px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }

          .status {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 800;
            border: 1px solid #cfe7fb;
            background: #edf7ff;
            color: #1769aa;
          }

          .status.approved {
            background: #dcfce7;
            color: #166534;
            border-color: #86efac;
          }

          .status.returned {
            background: #fff7ed;
            color: #9a3412;
            border-color: #fdba74;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 16px;
          }

          .card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 11px 12px;
          }

          .card-label,
          .section-label {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .card-value {
            margin-top: 5px;
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }

          .alert-box {
            border-radius: 12px;
            padding: 11px 13px;
            background: #fff1f2;
            border: 1px solid #fecdd3;
            color: #9f1239;
            font-weight: 800;
            margin-bottom: 14px;
          }

          .notes-box,
          .approval-box,
          .returned-box,
          .over-budget-reason-box {
            border-radius: 12px;
            padding: 11px 13px;
            margin-bottom: 14px;
            line-height: 1.6;
          }

          .notes-box {
            background: #f8fbff;
            border: 1px solid #dbeafe;
          }

          .approval-box {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
          }

          .returned-box {
            background: #fff7ed;
            border: 1px solid #fdba74;
            color: #9a3412;
          }

          .over-budget-reason-box {
            background: #fff7ed;
            border: 1px solid #fdba74;
            color: #9a3412;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }

          th, td {
            border: 1px solid #dbeafe;
            padding: 9px 10px;
            text-align: left;
            font-size: 12px;
          }

          th {
            background: #f8fbff;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
          }

          .total-box {
            margin-top: 16px;
            margin-left: auto;
            width: 245px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 13px 15px;
          }

          .total-value {
            margin-top: 5px;
            font-size: 24px;
            font-weight: 900;
          }

          .print-footer {
            margin-top: 28px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 9px;
            text-align: center;
          }

          @media print {
            body { margin: 14px; }
          }
        </style>
      </head>

      <body>
        <div class="brand-header">
          <div class="brand-left">
            <img
              class="brand-logo"
              src="${logoUrl}"
              alt="${APP_NAME}"
            />
            <div>
              <div class="brand-name">${APP_NAME}</div>
              <div class="brand-subtitle">${APP_SUBTITLE}</div>
            </div>
          </div>

          <div class="document-label">
            Timesheet Management Report
          </div>
        </div>

        <div class="header">
          <div>
            <h1 class="title">Timesheet Report</h1>
            <div class="subtitle">
              ${report.normalizedAirline || "\u2014"}
              &middot;
              ${report.reportDate || "\u2014"}
            </div>
          </div>

          <div class="status ${
            String(report.status || "").toLowerCase() === "approved"
              ? "approved"
              : String(report.status || "").toLowerCase() === "returned"
              ? "returned"
              : ""
          }">
            ${String(report.status || "submitted").toUpperCase()}
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-label">Airline</div>
            <div class="card-value">${report.normalizedAirline || "\u2014"}</div>
          </div>

          <div class="card">
            <div class="card-label">Report Date</div>
            <div class="card-value">${report.reportDate || "\u2014"}</div>
          </div>

          <div class="card">
            <div class="card-label">Shift</div>
            <div class="card-value">${report.shift || "\u2014"}</div>
          </div>

          <div class="card">
            <div class="card-label">Supervisor Reporting</div>
            <div class="card-value">${report.supervisorReporting || "\u2014"}</div>
          </div>

          <div class="card">
            <div class="card-label">Submitted By</div>
            <div class="card-value">${
              report.submittedByName ||
              report.submittedByUsername ||
              "\u2014"
            }</div>
          </div>

          <div class="card">
            <div class="card-label">Created</div>
            <div class="card-value">${formatDateTime(report.createdAt)}</div>
          </div>

          <div class="card">
            <div class="card-label">Daily Budget</div>
            <div class="card-value">${
              airlineSummary
                ? airlineSummary.budget.toFixed(2)
                : Number(report.budgetHoursDaily || 0).toFixed(2)
            } hrs</div>
          </div>

          <div class="card">
            <div class="card-label">Airline Daily Total</div>
            <div class="card-value">${
              airlineSummary
                ? airlineSummary.hours.toFixed(2)
                : report.totalHours.toFixed(2)
            } hrs</div>
          </div>
        </div>

        ${budgetAlert}
        ${overBudgetReasonBlock}
        ${notesBlock}
        ${returnedBlock}
        ${approvalBlock}

        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Punch In</th>
              <th>Punch Out</th>
              <th>Employee Status</th>
              <th>Break Taken</th>
              <th>Reason</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="total-box">
          <div class="section-label">Report Total</div>
          <div class="total-value">${report.totalHours.toFixed(2)} hrs</div>
        </div>

        <div class="print-footer">
          ${APP_NAME} &middot; ${APP_SUBTITLE}
        </div>
      </body>
    </html>
  `;
}

function emptyEditRow() {
  return {
    employeeId: "",
    employeeName: "",
    punchIn: "",
    punchOut: "",
    employeeStatus: "",
    breakTaken: "No",
    reason: "",
  };
}

export default function TimesheetAdminPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" &&
    normalizedUsername === "hhernandez";

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "station_manager" ||
    user?.role === "duty_manager";

  const canApprove =
    user?.role === "station_manager" ||
    user?.role === "duty_manager";

  const [reports, setReports] = useState([]);
  const [dailyBudgetDocs, setDailyBudgetDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [approvingId, setApprovingId] = useState("");
  const [returningId, setReturningId] = useState("");
  const [savingEditId, setSavingEditId] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [restrictToOwnReports, setRestrictToOwnReports] = useState(false);
  const [showMonthlyOverBudgetSummary, setShowMonthlyOverBudgetSummary] =
    useState(true);

  const [filters, setFilters] = useState({
    airline: "all",
    reportDate: startOfTodayString(),
    submittedBy: "",
  });

  const [returnReason, setReturnReason] = useState("");

  const [editData, setEditData] = useState({
    airline: "",
    reportDate: "",
    shift: "",
    supervisorReporting: "",
    notes: "",
    overBudgetReason: "",
    rows: [],
  });

  useEffect(() => {
    async function loadData() {
      try {
        const reportsQuery = query(
          collection(db, "timesheet_reports"),
          orderBy("createdAt", "desc")
        );

        const [reportsSnap, dailyBudgetsSnap, employeesSnap] =
          await Promise.all([
            getDocs(reportsQuery),
            getDocs(collection(db, "airlineDailyBudgets")),
            getDocs(collection(db, "employees")),
          ]);

        const reportRows = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const budgetRows = dailyBudgetsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          airline: normalizeAirlineName(d.data().airline),
          date: String(d.data().date || ""),
          dailyBudgetHours:
            d.data().dailyBudgetHours === null ||
            d.data().dailyBudgetHours === undefined ||
            d.data().dailyBudgetHours === ""
              ? 0
              : Number(d.data().dailyBudgetHours),
        }));

        const employeeRows = employeesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const currentUsername = String(user?.username || "")
          .trim()
          .toLowerCase();

        const currentVisibleName = String(
          user?.displayName ||
            user?.fullName ||
            user?.name ||
            user?.username ||
            ""
        )
          .trim()
          .toLowerCase();

        const currentEmployeeRecord = employeeRows.find((item) => {
          const itemUsername = String(
            item.loginUsername || item.username || ""
          )
            .trim()
            .toLowerCase();

          const itemName = String(
            item.name ||
              item.employeeName ||
              item.fullName ||
              item.displayName ||
              ""
          )
            .trim()
            .toLowerCase();

          return (
            (currentUsername && itemUsername === currentUsername) ||
            (currentVisibleName && itemName === currentVisibleName)
          );
        });

        const currentRole = String(
          currentEmployeeRecord?.role || user?.role || ""
        )
          .trim()
          .toLowerCase();

        const shouldRestrictCabinSupervisor =
          isCabinServiceDepartment(
            currentEmployeeRecord?.department || user?.department
          ) && currentRole === "supervisor";

        setRestrictToOwnReports(shouldRestrictCabinSupervisor);
        setReports(reportRows);
        setDailyBudgetDocs(budgetRows);
      } catch (err) {
        console.error("Error loading timesheet reports:", err);
        setStatusMessage("Could not load timesheet reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canAccess, user]);

  const dailyBudgetByAirlineAndDate = useMemo(() => {
    const map = {};

    dailyBudgetDocs.forEach((item) => {
      const airline = normalizeAirlineName(item.airline);
      const date = String(item.date || "").trim();

      if (!airline || !date) return;

      map[`${airline}__${date}`] = Number(item.dailyBudgetHours || 0);
    });

    return map;
  }, [dailyBudgetDocs]);

  const reportsWithHours = useMemo(() => {
    return reports.map((report) => {
      const normalizedAirline = normalizeAirlineName(report.airline);
      const reportDate = String(report.reportDate || "").trim();

      const matchingBudget =
        dailyBudgetByAirlineAndDate[
          `${normalizedAirline}__${reportDate}`
        ] || 0;

      const computedTotalHours =
        report.totalHours !== undefined && report.totalHours !== null
          ? Number(report.totalHours)
          : calculateReportHours(report);

      const computedOverBudget =
        matchingBudget > 0 && computedTotalHours > matchingBudget;

      return {
        ...report,
        totalHours: computedTotalHours,
        normalizedAirline,
        normalizedDepartment: normalizeCabinServiceValue(
          report.department || report.airline
        ),
        budgetHoursDaily: matchingBudget,
        overBudget:
          typeof report.overBudget === "boolean"
            ? report.overBudget
            : computedOverBudget,
        overBudgetBy:
          report.overBudgetBy !== undefined && report.overBudgetBy !== null
            ? Number(report.overBudgetBy)
            : computedOverBudget
            ? computedTotalHours - matchingBudget
            : 0,
      };
    });
  }, [reports, dailyBudgetByAirlineAndDate]);

  const accessibleReports = useMemo(() => {
    return reportsWithHours.filter((r) => {
      const isCabinReport = r.normalizedDepartment === "cabin_service";

      if (isCabinDutyManager) {
        return isCabinReport;
      }

      if (restrictToOwnReports) {
        return r.submittedByUserId === user?.id;
      }

      return true;
    });
  }, [reportsWithHours, restrictToOwnReports, user?.id, isCabinDutyManager]);

  const filteredReports = useMemo(() => {
    return accessibleReports.filter((r) => {
      const submittedBy = String(
        r.submittedByName ||
          r.submittedByUsername ||
          r.supervisorReporting ||
          ""
      ).toLowerCase();

      if (
        filters.airline !== "all" &&
        r.normalizedAirline !== filters.airline
      ) {
        return false;
      }

      if (filters.reportDate && r.reportDate !== filters.reportDate) {
        return false;
      }

      if (
        filters.submittedBy &&
        !submittedBy.includes(filters.submittedBy.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [accessibleReports, filters]);

  const airlineOptions = useMemo(() => {
    const set = new Set();

    accessibleReports.forEach((r) => {
      if (r.normalizedAirline) set.add(r.normalizedAirline);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [accessibleReports]);

  const airlineHourSummary = useMemo(() => {
    const totals = {};

    filteredReports.forEach((report) => {
      const airline = report.normalizedAirline || "Unknown";
      const date = String(report.reportDate || "").trim();
      const key = `${airline}__${date}`;

      if (!totals[key]) {
        totals[key] = {
          airline,
          date,
          hours: 0,
          budget:
            dailyBudgetByAirlineAndDate[`${airline}__${date}`] || 0,
        };
      }

      totals[key].hours += report.totalHours;
    });

    return Object.values(totals)
      .map((row) => {
        const overBy =
          row.hours > row.budget ? row.hours - row.budget : 0;

        return {
          ...row,
          overBy,
          overBudget: row.budget > 0 && row.hours > row.budget,
        };
      })
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return a.airline.localeCompare(b.airline);
      });
  }, [filteredReports, dailyBudgetByAirlineAndDate]);

  const currentMonthOverBudgetReports = useMemo(() => {
    return accessibleReports
      .filter((report) => isInCurrentMonth(report.reportDate))
      .filter((report) => {
        const budget = Number(report.budgetHoursDaily || 0);
        const hours = Number(report.totalHours || 0);
        return budget > 0 && hours > budget;
      })
      .map((report) => {
        const budget = Number(report.budgetHoursDaily || 0);
        const hours = Number(report.totalHours || 0);
        const overBy = hours - budget;

        return {
          id: report.id,
          airline: report.normalizedAirline || "\u2014",
          department: prettifyDepartment(
            report.department || report.normalizedDepartment
          ),
          reportDate: report.reportDate || "\u2014",
          submittedBy:
            report.submittedByName ||
            report.submittedByUsername ||
            report.supervisorReporting ||
            "\u2014",
          reportedHours: hours,
          budgetHours: budget,
          overBy,
          overBudgetReason: String(
            report.overBudgetReason || ""
          ).trim(),
          status: report.status || "submitted",
        };
      })
      .sort((a, b) => {
        if (a.reportDate !== b.reportDate) {
          return b.reportDate.localeCompare(a.reportDate);
        }

        if (b.overBy !== a.overBy) {
          return b.overBy - a.overBy;
        }

        return a.department.localeCompare(b.department);
      });
  }, [accessibleReports]);

  const totalMonthlyOverBudgetHours = useMemo(() => {
    return currentMonthOverBudgetReports.reduce(
      (sum, item) => sum + item.overBy,
      0
    );
  }, [currentMonthOverBudgetReports]);

  const totalHoursAllAirlines = useMemo(() => {
    return airlineHourSummary.reduce((sum, row) => sum + row.hours, 0);
  }, [airlineHourSummary]);

  const overBudgetAlerts = useMemo(() => {
    return airlineHourSummary.filter((row) => row.overBudget);
  }, [airlineHourSummary]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedId) || null;
  }, [filteredReports, selectedId]);

  const selectedAirlineSummary = useMemo(() => {
    if (!selectedReport) return null;

    return (
      airlineHourSummary.find(
        (row) =>
          row.airline === selectedReport.normalizedAirline &&
          row.date === String(selectedReport.reportDate || "").trim()
      ) || null
    );
  }, [selectedReport, airlineHourSummary]);

  const isErrorStatus =
    statusMessage.toLowerCase().includes("error") ||
    statusMessage.toLowerCase().includes("could not") ||
    statusMessage.toLowerCase().includes("please") ||
    statusMessage.toLowerCase().includes("required") ||
    statusMessage.toLowerCase().includes("cannot");

  useEffect(() => {
    // Keep report details closed until the user explicitly clicks View.
    // If the selected report disappears because of filters/deletion,
    // close the detail panel instead of automatically opening another one.
    if (
      selectedId &&
      !filteredReports.some((r) => r.id === selectedId)
    ) {
      setSelectedId("");
      setIsEditMode(false);
    }
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedReport) {
      setEditData({
        airline: "",
        reportDate: "",
        shift: "",
        supervisorReporting: "",
        notes: "",
        overBudgetReason: "",
        rows: [],
      });

      setReturnReason("");
      setIsEditMode(false);
      return;
    }

    setEditData({
      airline: selectedReport.airline || "",
      reportDate: selectedReport.reportDate || "",
      shift: selectedReport.shift || "",
      supervisorReporting: selectedReport.supervisorReporting || "",
      notes: selectedReport.notes || "",
      overBudgetReason: selectedReport.overBudgetReason || "",
      rows: (selectedReport.rows || []).length
        ? selectedReport.rows.map((row) => ({
            employeeId: row.employeeId || "",
            employeeName: row.employeeName || "",
            punchIn: row.punchIn || "",
            punchOut: row.punchOut || "",
            employeeStatus: row.employeeStatus || "",
            breakTaken: row.breakTaken || "No",
            reason: row.reason || "",
          }))
        : [emptyEditRow()],
    });

    setReturnReason(selectedReport.returnedReason || "");
  }, [selectedReport]);

  const handleDelete = async (report) => {
    const ok = window.confirm(
      `Delete this timesheet report from ${
        report.reportDate || "unknown date"
      }?`
    );

    if (!ok) return;

    try {
      setDeletingId(report.id);

      await deleteDoc(doc(db, "timesheet_reports", report.id));

      setReports((prev) => prev.filter((r) => r.id !== report.id));

      setStatusMessage("Timesheet report deleted successfully.");
    } catch (err) {
      console.error("Error deleting timesheet:", err);
      setStatusMessage("Could not delete timesheet report.");
    } finally {
      setDeletingId("");
    }
  };

  const handleApprove = async (report) => {
    if (!canApprove) return;

    const airlineSummary =
      airlineHourSummary.find(
        (row) =>
          row.airline === report.normalizedAirline &&
          row.date === String(report.reportDate || "").trim()
      ) || null;

    let ok = true;

    if (airlineSummary?.overBudget || report.overBudget) {
      ok = window.confirm(
        `${report.normalizedAirline} is over daily budget by ${Number(
          report.overBudgetBy || airlineSummary?.overBy || 0
        ).toFixed(2)} hours. Approve anyway?`
      );
    } else {
      ok = window.confirm("Approve this timesheet report?");
    }

    if (!ok) return;

    try {
      setApprovingId(report.id);

      await updateDoc(doc(db, "timesheet_reports", report.id), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
        approvedByRole: user?.role || "",
        returnedReason: "",
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: "approved",
                approvedAt: new Date(),
                approvedByName:
                  user?.displayName ||
                  user?.fullName ||
                  user?.name ||
                  user?.username ||
                  "Manager",
                approvedByRole: user?.role || "",
                returnedReason: "",
              }
            : item
        )
      );

      if (airlineSummary?.overBudget || report.overBudget) {
        setStatusMessage(
          `${report.normalizedAirline} approved. Alert: over daily budget by ${Number(
            report.overBudgetBy || airlineSummary?.overBy || 0
          ).toFixed(2)} hours.`
        );
      } else {
        setStatusMessage("Timesheet report approved successfully.");
      }
    } catch (err) {
      console.error("Error approving timesheet:", err);
      setStatusMessage("Could not approve timesheet report.");
    } finally {
      setApprovingId("");
    }
  };

  const handleReturn = async (report) => {
    if (!canApprove) return;

    if (!String(returnReason || "").trim()) {
      setStatusMessage(
        "Please write the reason before returning the timesheet."
      );
      return;
    }

    const ok = window.confirm(
      "Return this timesheet to supervisor for fix?"
    );

    if (!ok) return;

    try {
      setReturningId(report.id);

      await updateDoc(doc(db, "timesheet_reports", report.id), {
        status: "returned",
        returnedAt: serverTimestamp(),
        returnedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
        returnedByRole: user?.role || "",
        returnedReason: returnReason,
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: "returned",
                returnedAt: new Date(),
                returnedByName:
                  user?.displayName ||
                  user?.fullName ||
                  user?.name ||
                  user?.username ||
                  "Manager",
                returnedByRole: user?.role || "",
                returnedReason: returnReason,
              }
            : item
        )
      );

      setStatusMessage("Timesheet returned for correction.");
      setIsEditMode(false);
    } catch (err) {
      console.error("Error returning timesheet:", err);
      setStatusMessage("Could not return timesheet.");
    } finally {
      setReturningId("");
    }
  };

  const handleEditField = (field, value) => {
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEditRow = (index, field, value) => {
    setEditData((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      ),
    }));
  };

  const addEditRow = () => {
    setEditData((prev) => ({
      ...prev,
      rows: [...prev.rows, emptyEditRow()],
    }));
  };

  const removeEditRow = (index) => {
    setEditData((prev) => ({
      ...prev,
      rows:
        prev.rows.length === 1
          ? prev.rows
          : prev.rows.filter((_, i) => i !== index),
    }));
  };

  const handleSaveEdits = async (report) => {
    if (!canApprove) return;

    try {
      setSavingEditId(report.id);

      const cleanRows = (editData.rows || [])
        .map((row) => ({
          employeeId: row.employeeId || "",
          employeeName: String(row.employeeName || "").trim(),
          punchIn: String(row.punchIn || "").trim(),
          punchOut: String(row.punchOut || "").trim(),
          employeeStatus: String(row.employeeStatus || "").trim(),
          breakTaken: String(row.breakTaken || "").trim(),
          reason: String(row.reason || "").trim(),
        }))
        .filter(
          (row) =>
            row.employeeName ||
            row.punchIn ||
            row.punchOut ||
            row.employeeStatus ||
            row.reason
        );

      if (!cleanRows.length) {
        setStatusMessage(
          "The timesheet needs at least one employee row."
        );
        return;
      }

      if (
        cleanRows.some(
          (row) =>
            !row.employeeName ||
            !row.punchIn ||
            !row.punchOut ||
            !row.employeeStatus ||
            !row.breakTaken
        )
      ) {
        setStatusMessage(
          "Cannot save edits. Every row must have Employee, Punch In, Punch Out, Employee Status and Break Taken completed."
        );
        return;
      }

      if (
        cleanRows.some(
          (row) =>
            String(row.breakTaken || "").trim().toLowerCase() === "no" &&
            !String(row.reason || "").trim()
        )
      ) {
        setStatusMessage(
          'Cannot save edits. If "Break Taken" is set to "No", the "Reason" field is required.'
        );
        return;
      }

      const totalHours = cleanRows.reduce(
        (sum, row) => sum + calculateRowHours(row),
        0
      );

      const normalizedAirline = normalizeAirlineName(editData.airline);

      const budgetHoursDaily =
        dailyBudgetByAirlineAndDate[
          `${normalizedAirline}__${String(
            editData.reportDate || ""
          ).trim()}`
        ] || 0;

      const overBudget =
        budgetHoursDaily > 0 && totalHours > budgetHoursDaily;

      const overBudgetBy = overBudget
        ? totalHours - budgetHoursDaily
        : 0;

      if (
        overBudget &&
        !String(editData.overBudgetReason || "").trim()
      ) {
        setStatusMessage(
          "Please fill in the over budget reason before saving."
        );
        return;
      }

      await updateDoc(doc(db, "timesheet_reports", report.id), {
        airline: normalizedAirline,
        reportDate: editData.reportDate || "",
        shift: editData.shift || "",
        supervisorReporting: editData.supervisorReporting || "",
        notes: editData.notes || "",
        overBudgetReason: editData.overBudgetReason || "",
        rows: cleanRows,
        totalHours,
        budgetHoursDaily,
        overBudget,
        overBudgetBy,
        lastEditedAt: serverTimestamp(),
        lastEditedByName:
          user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          "Manager",
        lastEditedByRole: user?.role || "",
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                airline: normalizedAirline,
                reportDate: editData.reportDate || "",
                shift: editData.shift || "",
                supervisorReporting: editData.supervisorReporting || "",
                notes: editData.notes || "",
                overBudgetReason: editData.overBudgetReason || "",
                rows: cleanRows,
                totalHours,
                budgetHoursDaily,
                overBudget,
                overBudgetBy,
              }
            : item
        )
      );

      setStatusMessage("Timesheet changes saved successfully.");
      setIsEditMode(false);
    } catch (err) {
      console.error("Error saving edits:", err);
      setStatusMessage("Could not save timesheet edits.");
    } finally {
      setSavingEditId("");
    }
  };

  const handlePrintExport = () => {
    if (!selectedReport) return;

    const printableReport = {
      ...selectedReport,
      airline: isEditMode
        ? normalizeAirlineName(
            editData.airline || selectedReport.airline
          )
        : selectedReport.airline,
      normalizedAirline: isEditMode
        ? normalizeAirlineName(
            editData.airline || selectedReport.airline
          )
        : selectedReport.normalizedAirline,
      reportDate: isEditMode
        ? editData.reportDate || selectedReport.reportDate
        : selectedReport.reportDate,
      shift: isEditMode
        ? editData.shift || selectedReport.shift
        : selectedReport.shift,
      supervisorReporting: isEditMode
        ? editData.supervisorReporting ||
          selectedReport.supervisorReporting
        : selectedReport.supervisorReporting,
      notes: isEditMode
        ? editData.notes || selectedReport.notes
        : selectedReport.notes,
      overBudgetReason: isEditMode
        ? editData.overBudgetReason ||
          selectedReport.overBudgetReason
        : selectedReport.overBudgetReason,
      rows:
        isEditMode && (editData.rows || []).length
          ? editData.rows
          : selectedReport.rows || [],
      totalHours:
        isEditMode && (editData.rows || []).length
          ? editData.rows.reduce(
              (sum, row) => sum + calculateRowHours(row),
              0
            )
          : selectedReport.totalHours,
      budgetHoursDaily: isEditMode
        ? dailyBudgetByAirlineAndDate[
            `${normalizeAirlineName(
              editData.airline || selectedReport.airline
            )}__${String(
              editData.reportDate ||
                selectedReport.reportDate ||
                ""
            ).trim()}`
          ] ||
          selectedReport.budgetHoursDaily ||
          0
        : selectedReport.budgetHoursDaily || 0,
    };

    const html = buildPrintableHtml(
      printableReport,
      selectedAirlineSummary
    );

    const printWindow = window.open(
      "",
      "_blank",
      "width=1200,height=900"
    );

    if (!printWindow) {
      setStatusMessage(
        "Pop-up blocked. Please allow pop-ups to export/print."
      );
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

  if (!canAccess) {
    return (
      <div
        style={{
          display: "grid",
          gap: 18,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <BrandHeader
          title="Access denied"
          description="You do not have permission to view timesheet reports."
          isMobile={isMobile}
          isTablet={isTablet}
        />
      </div>
    );
  }

  const currentDisplayedTotal =
    isEditMode && (editData.rows || []).length
      ? editData.rows.reduce(
          (sum, row) => sum + calculateRowHours(row),
          0
        )
      : selectedReport?.totalHours || 0;

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 14 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <BrandHeader
        title="Timesheet Reports"
        description={
          restrictToOwnReports
            ? `${APP_SUBTITLE} \u00B7 Review your submitted timesheets, budget impact and selected report exports.`
            : `${APP_SUBTITLE} \u00B7 Review, approve, return, edit and export submitted timesheets.`
        }
        isMobile={isMobile}
        isTablet={isTablet}
      />

      {statusMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setStatusMessage("")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 22,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "17px 19px",
                background: isErrorStatus ? "#fff1f2" : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: isErrorStatus ? "#9f1239" : "#065f46",
                  letterSpacing: "-0.02em",
                }}
              >
                {isErrorStatus ? "Action Required" : "Success"}
              </div>
            </div>

            <div
              style={{
                padding: "20px 19px 17px",
                fontSize: 14,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 19px 19px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => setStatusMessage("")}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "10px 20px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All report content below preserves the existing operational logic. */}
      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            marginBottom: showMonthlyOverBudgetSummary ? 15 : 0,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Monthly Over Budget Summary
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 11.5 : 12.5,
                color: "#64748b",
              }}
            >
              Current month summary with department, hours over budget and reason.
            </p>
          </div>

          <ActionButton
            variant="secondary"
            onClick={() =>
              setShowMonthlyOverBudgetSummary((prev) => !prev)
            }
          >
            {showMonthlyOverBudgetSummary ? "Hide summary" : "Show summary"}
          </ActionButton>
        </div>

        {showMonthlyOverBudgetSummary && (
          <>
            {currentMonthOverBudgetReports.length === 0 ? (
              <div
                style={{
                  padding: 15,
                  borderRadius: 14,
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                No over budget reports found for the current month.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 13 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontWeight: 800,
                      color: "#9a3412",
                      fontSize: 12,
                    }}
                  >
                    Reports this month: {currentMonthOverBudgetReports.length}
                  </div>

                  <div
                    style={{
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontWeight: 800,
                      color: "#9f1239",
                      fontSize: 12,
                    }}
                  >
                    Total over budget:{" "}
                    {totalMonthlyOverBudgetHours.toFixed(2)} hrs
                  </div>
                </div>

                <div
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    overflowX: "auto",
                    overflowY: "hidden",
                    WebkitOverflowScrolling: "touch",
                    borderRadius: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1280,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle()}>Date</th>
                        <th style={thStyle()}>Airline</th>
                        <th style={thStyle()}>Department</th>
                        <th style={thStyle()}>Submitted By</th>
                        <th style={thStyle()}>Reported Hours</th>
                        <th style={thStyle()}>Daily Budget</th>
                        <th style={thStyle()}>Over Budget By</th>
                        <th style={thStyle()}>Reason</th>
                        <th style={thStyle()}>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {currentMonthOverBudgetReports.map((item, index) => (
                        <tr
                          key={item.id}
                          style={{
                            background:
                              index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>{item.reportDate}</td>
                          <td style={tdStyle}>{item.airline}</td>
                          <td style={tdStyle}>{item.department}</td>
                          <td style={tdStyle}>{item.submittedBy}</td>
                          <td style={tdStyle}>
                            {item.reportedHours.toFixed(2)} hrs
                          </td>
                          <td style={tdStyle}>
                            {item.budgetHours.toFixed(2)} hrs
                          </td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 11.5,
                                fontWeight: 800,
                                background: "#fff1f2",
                                color: "#9f1239",
                                border: "1px solid #fecdd3",
                              }}
                            >
                              {item.overBy.toFixed(2)} hrs
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div
                              style={{
                                whiteSpace: "pre-line",
                                lineHeight: 1.6,
                                color: item.overBudgetReason
                                  ? "#0f172a"
                                  : "#64748b",
                                minWidth: 260,
                              }}
                            >
                              {item.overBudgetReason ||
                                "No over budget reason provided."}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={statusBadge(item.status)}>
                              {String(
                                item.status || "submitted"
                              ).toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </PageCard>

      {overBudgetAlerts.length > 0 && (
        <PageCard style={{ padding: isMobile ? 16 : 18 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "#9f1239",
                marginBottom: 7,
              }}
            >
              Daily Budget Alert
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {overBudgetAlerts.map((alert) => (
                <div
                  key={`${alert.airline}-${alert.date}`}
                  style={{
                    color: "#9f1239",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {alert.airline} is over daily budget by{" "}
                  {alert.overBy.toFixed(2)} hours
                  {alert.date ? ` on ${alert.date}` : ""}.
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 18,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Filters
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 13,
          }}
        >
          <div>
            <FieldLabel>Airline</FieldLabel>

            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  airline: e.target.value,
                }))
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
            <FieldLabel>Report Date</FieldLabel>

            <TextInput
              type="date"
              value={filters.reportDate}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  reportDate: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <FieldLabel>Submitted By</FieldLabel>

            <TextInput
              value={filters.submittedBy}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  submittedBy: e.target.value,
                }))
              }
              placeholder="Search by supervisor"
            />
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            marginBottom: 13,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Daily Hours by Airline
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 11.5 : 12.5,
                color: "#64748b",
              }}
            >
              Uses daily budget by airline and report date.
            </p>
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 800,
              color: "#0f172a",
              fontSize: 12,
            }}
          >
            Total: {totalHoursAllAirlines.toFixed(2)} hrs
          </div>
        </div>

        {airlineHourSummary.length === 0 ? (
          <div
            style={{
              padding: 15,
              borderRadius: 14,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            No airline hour totals found for this filter.
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 900,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Airline</th>
                  <th style={thStyle()}>Date</th>
                  <th style={thStyle()}>Reported Hours</th>
                  <th style={thStyle()}>Daily Budget</th>
                  <th style={thStyle()}>Variance</th>
                  <th style={thStyle()}>Alert</th>
                </tr>
              </thead>

              <tbody>
                {airlineHourSummary.map((row, index) => (
                  <tr
                    key={`${row.airline}-${row.date}`}
                    style={{
                      background:
                        index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{row.airline}</td>
                    <td style={tdStyle}>{row.date || "\u2014"}</td>
                    <td style={tdStyle}>
                      {row.hours.toFixed(2)} hrs
                    </td>
                    <td style={tdStyle}>
                      {row.budget.toFixed(2)} hrs
                    </td>
                    <td style={tdStyle}>
                      {(row.hours - row.budget).toFixed(2)} hrs
                    </td>
                    <td style={tdStyle}>
                      {row.overBudget ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 800,
                            background: "#fff1f2",
                            color: "#9f1239",
                            border: "1px solid #fecdd3",
                          }}
                        >
                          Over by {row.overBy.toFixed(2)}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 800,
                            background: "#dcfce7",
                            color: "#166534",
                            border: "1px solid #86efac",
                          }}
                        >
                          Within budget
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 18,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          alignItems: "start",
        }}
      >
        <PageCard style={{ padding: 18 }}>
          <div style={{ marginBottom: 13 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Submitted Reports
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 11.5 : 12.5,
                color: "#64748b",
              }}
            >
              Total found: {filteredReports.length}. Tap any report to open it. Submitted reports must be resolved within 24 hours.
            </p>
          </div>

          {loading ? (
            <div
              style={{
                padding: 15,
                borderRadius: 14,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Loading timesheet reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div
              style={{
                padding: 15,
                borderRadius: 14,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              No timesheet reports found.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 10,
              }}
            >
              {filteredReports.map((report) => {
                const isSelected = report.id === selectedId;
                const visual = getReportVisualState(report);
                const deadline = getApprovalDeadline(report);

                return (
                  <div
                    key={report.id}
                    style={{
                      width: "100%",
                      border: isSelected
                        ? `2px solid ${visual.accent}`
                        : `1px solid ${visual.border}`,
                      background: visual.background,
                      borderRadius: 14,
                      padding: isMobile ? "12px 13px" : "13px 15px",
                      boxShadow: isSelected
                        ? "0 10px 24px rgba(15,23,42,0.08)"
                        : "none",
                      boxSizing: "border-box",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(report.id);
                        setIsEditMode(false);

                        window.setTimeout(() => {
                          document
                            .getElementById("timesheet-detail-panel")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }, 80);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 900,
                                color: "#0f172a",
                              }}
                            >
                              {report.normalizedAirline || "\u2014"}
                            </span>

                            <span
                              style={{
                                fontSize: 12,
                                color: "#64748b",
                                fontWeight: 700,
                              }}
                            >
                              {report.reportDate || "\u2014"}
                            </span>

                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "5px 9px",
                                borderRadius: 999,
                                fontSize: 10.5,
                                fontWeight: 900,
                                background: "#ffffff",
                                color: visual.text,
                                border: `1px solid ${visual.border}`,
                              }}
                            >
                              {visual.label}
                            </span>
                          </div>

                          <div
                            style={{
                              marginTop: 7,
                              display: "grid",
                              gridTemplateColumns: isMobile
                                ? "1fr"
                                : "repeat(4, minmax(0, 1fr))",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                Submitted By
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 12.5,
                                  color: "#334155",
                                  fontWeight: 700,
                                }}
                              >
                                {report.submittedByName ||
                                  report.supervisorReporting ||
                                  report.submittedByUsername ||
                                  "\u2014"}
                              </div>
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                Hours
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 12.5,
                                  color: "#334155",
                                  fontWeight: 800,
                                }}
                              >
                                {report.totalHours.toFixed(2)} hrs
                              </div>
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  color: "#94a3b8",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                Created
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 12.5,
                                  color: "#334155",
                                  fontWeight: 700,
                                }}
                              >
                                {formatDateTime(report.createdAt)}
                              </div>
                            </div>

                            <div>
                              <div
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  color: isReportOverdue(report)
                                    ? "#be123c"
                                    : "#94a3b8",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                Approval Deadline
                              </div>
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 12.5,
                                  color: isReportOverdue(report)
                                    ? "#9f1239"
                                    : "#334155",
                                  fontWeight: 800,
                                }}
                              >
                                {deadline
                                  ? deadline.toLocaleString()
                                  : "\u2014"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            alignSelf: "center",
                            color: visual.accent,
                            fontSize: 18,
                            fontWeight: 900,
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        >
                          {"\u203A"}
                        </div>
                      </div>
                    </button>

                    {canApprove && (
                      <div
                        style={{
                          marginTop: 11,
                          paddingTop: 10,
                          borderTop: `1px solid ${visual.border}`,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {report.status !== "approved" && (
                          <ActionButton
                            variant="success"
                            onClick={() => handleApprove(report)}
                            disabled={approvingId === report.id}
                          >
                            {approvingId === report.id
                              ? "Approving..."
                              : "Approve"}
                          </ActionButton>
                        )}

                        <ActionButton
                          variant="danger"
                          onClick={() => handleDelete(report)}
                          disabled={deletingId === report.id}
                        >
                          {deletingId === report.id
                            ? "Deleting..."
                            : "Delete"}
                        </ActionButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <div id="timesheet-detail-panel" style={{ scrollMarginTop: 92 }}>
            <PageCard style={{ padding: isMobile ? 16 : 20 }}>
            {!isEditMode ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: isMobile ? 19 : 21,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Timesheet Detail
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: isMobile ? 11.5 : 12.5,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.normalizedAirline || "\u2014"}{" "}
                      {"\u00B7"}{" "}
                      {selectedReport.reportDate || "\u2014"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 9,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      variant="secondary"
                      onClick={() => {
                        setSelectedId("");
                        setIsEditMode(false);
                      }}
                    >
                      Close Report
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={handlePrintExport}
                    >
                      Print / Export PDF
                    </ActionButton>

                    {canApprove && (
                      <ActionButton
                        variant="primary"
                        onClick={() => setIsEditMode(true)}
                      >
                        Edit
                      </ActionButton>
                    )}

                    {canApprove && (
                      <ActionButton
                        variant="danger"
                        onClick={() => handleDelete(selectedReport)}
                        disabled={deletingId === selectedReport.id}
                      >
                        {deletingId === selectedReport.id
                          ? "Deleting..."
                          : "Delete"}
                      </ActionButton>
                    )}

                    {canApprove &&
                      selectedReport.status !== "approved" && (
                        <ActionButton
                          variant="success"
                          onClick={() =>
                            handleApprove(selectedReport)
                          }
                          disabled={
                            approvingId === selectedReport.id
                          }
                        >
                          {approvingId === selectedReport.id
                            ? "Approving..."
                            : "Approve"}
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
                    gap: 11,
                  }}
                >
                  <InfoCard
                    label="Airline"
                    value={
                      selectedReport.normalizedAirline || "\u2014"
                    }
                  />
                  <InfoCard
                    label="Department"
                    value={prettifyDepartment(
                      selectedReport.department ||
                        selectedReport.normalizedDepartment
                    )}
                  />
                  <InfoCard
                    label="Report Date"
                    value={selectedReport.reportDate || "\u2014"}
                  />
                  <InfoCard
                    label="Shift"
                    value={selectedReport.shift || "\u2014"}
                  />
                  <InfoCard
                    label="Supervisor Reporting"
                    value={
                      selectedReport.supervisorReporting || "\u2014"
                    }
                  />
                  <InfoCard
                    label="Submitted By"
                    value={
                      selectedReport.submittedByName ||
                      selectedReport.submittedByUsername ||
                      "\u2014"
                    }
                  />
                  <InfoCard
                    label="Report Hours"
                    value={`${selectedReport.totalHours.toFixed(
                      2
                    )} hrs`}
                  />
                  <InfoCard
                    label="Daily Budget"
                    value={`${
                      selectedAirlineSummary
                        ? selectedAirlineSummary.budget.toFixed(2)
                        : Number(
                            selectedReport.budgetHoursDaily || 0
                          ).toFixed(2)
                    } hrs`}
                  />
                  <InfoCard
                    label="Airline Daily Total"
                    value={`${
                      selectedAirlineSummary
                        ? selectedAirlineSummary.hours.toFixed(2)
                        : selectedReport.totalHours.toFixed(2)
                    } hrs`}
                  />
                </div>

                {(selectedAirlineSummary?.overBudget ||
                  selectedReport.overBudget) && (
                  <div
                    style={{
                      borderRadius: 15,
                      padding: "13px 15px",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      color: "#9f1239",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Budget alert: {selectedReport.normalizedAirline} is over
                    daily budget by{" "}
                    {Number(
                      selectedReport.overBudgetBy ||
                        selectedAirlineSummary?.overBy ||
                        0
                    ).toFixed(2)}{" "}
                    hours on{" "}
                    {selectedReport.reportDate || "this day"}.
                  </div>
                )}

                {selectedReport.overBudget &&
                  selectedReport.overBudgetReason && (
                    <div
                      style={{
                        borderRadius: 15,
                        padding: "13px 15px",
                        background: "#fff7ed",
                        border: "1px solid #fdba74",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#9a3412",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 6,
                        }}
                      >
                        Over Budget Reason
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: "#7c2d12",
                          whiteSpace: "pre-line",
                          lineHeight: 1.7,
                          fontWeight: 700,
                        }}
                      >
                        {selectedReport.overBudgetReason}
                      </div>
                    </div>
                  )}

                {selectedReport.notes && (
                  <div
                    style={{
                      borderRadius: 15,
                      padding: "13px 15px",
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                      }}
                    >
                      Notes
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#0f172a",
                        whiteSpace: "pre-line",
                        lineHeight: 1.7,
                      }}
                    >
                      {selectedReport.notes}
                    </div>
                  </div>
                )}

                {selectedReport.status === "returned" && (
                  <div
                    style={{
                      borderRadius: 15,
                      padding: "13px 15px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#9a3412",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                      }}
                    >
                      Returned For Fix
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#7c2d12",
                        lineHeight: 1.7,
                        fontWeight: 700,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {selectedReport.returnedReason ||
                        "No reason provided."}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color: "#9a3412",
                        fontWeight: 700,
                      }}
                    >
                      {selectedReport.returnedByName || "Manager"}
                      {selectedReport.returnedByRole
                        ? ` (${selectedReport.returnedByRole})`
                        : ""}
                      {" \u00B7 "}
                      {formatDateTime(selectedReport.returnedAt)}
                    </div>
                  </div>
                )}

                {selectedReport.status === "approved" && (
                  <div
                    style={{
                      borderRadius: 15,
                      padding: "13px 15px",
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#047857",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                      }}
                    >
                      Approval
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: "#065f46",
                        lineHeight: 1.7,
                        fontWeight: 700,
                      }}
                    >
                      Approved by{" "}
                      {selectedReport.approvedByName || "Manager"}{" "}
                      {selectedReport.approvedByRole
                        ? `(${selectedReport.approvedByRole})`
                        : ""}
                      {" \u00B7 "}
                      {formatDateTime(selectedReport.approvedAt)}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    overflowX: "auto",
                    overflowY: "hidden",
                    WebkitOverflowScrolling: "touch",
                    borderRadius: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1180,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle()}>Employee</th>
                        <th style={thStyle()}>Punch In</th>
                        <th style={thStyle()}>Punch Out</th>
                        <th style={thStyle()}>Employee Status</th>
                        <th style={thStyle()}>Break Taken</th>
                        <th style={thStyle()}>Reason</th>
                        <th style={thStyle()}>Hours</th>
                      </tr>
                    </thead>

                    <tbody>
                      {(selectedReport.rows || []).map((row, index) => (
                        <tr
                          key={index}
                          style={{
                            background:
                              index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            {row.employeeName || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {row.punchIn || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {row.punchOut || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {row.employeeStatus || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {row.breakTaken || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {row.reason || "\u2014"}
                          </td>
                          <td style={tdStyle}>
                            {calculateRowHours(row).toFixed(2)} hrs
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: isMobile ? "stretch" : "flex-end",
                  }}
                >
                  <div
                    style={{
                      minWidth: isMobile ? "100%" : 250,
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                      borderRadius: 15,
                      padding: "14px 16px",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Report Total
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      {selectedReport.totalHours.toFixed(2)} hrs
                    </div>
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
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: isMobile ? 19 : 21,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Edit Timesheet
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: isMobile ? 11.5 : 12.5,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.normalizedAirline || "\u2014"}{" "}
                      {"\u00B7"}{" "}
                      {selectedReport.reportDate || "\u2014"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 9,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      variant="secondary"
                      onClick={() => setIsEditMode(false)}
                    >
                      Cancel Edit
                    </ActionButton>

                    <ActionButton
                      variant="primary"
                      onClick={() => handleSaveEdits(selectedReport)}
                      disabled={savingEditId === selectedReport.id}
                    >
                      {savingEditId === selectedReport.id
                        ? "Saving..."
                        : "Save Edits"}
                    </ActionButton>

                    {selectedReport.status !== "approved" && (
                      <ActionButton
                        variant="success"
                        onClick={() => handleApprove(selectedReport)}
                        disabled={approvingId === selectedReport.id}
                      >
                        {approvingId === selectedReport.id
                          ? "Approving..."
                          : "Approve"}
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
                    gap: 11,
                  }}
                >
                  <div>
                    <FieldLabel>Airline</FieldLabel>

                    <TextInput
                      value={editData.airline}
                      onChange={(e) =>
                        handleEditField("airline", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Report Date</FieldLabel>

                    <TextInput
                      type="date"
                      value={editData.reportDate}
                      onChange={(e) =>
                        handleEditField("reportDate", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Shift</FieldLabel>

                    <TextInput
                      value={editData.shift}
                      onChange={(e) =>
                        handleEditField("shift", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Supervisor Reporting</FieldLabel>

                    <TextInput
                      value={editData.supervisorReporting}
                      onChange={(e) =>
                        handleEditField(
                          "supervisorReporting",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Notes</FieldLabel>

                  <TextArea
                    value={editData.notes}
                    onChange={(e) =>
                      handleEditField("notes", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Over Budget Reason</FieldLabel>

                  <TextArea
                    value={editData.overBudgetReason}
                    onChange={(e) =>
                      handleEditField(
                        "overBudgetReason",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <FieldLabel>
                    Reason to return for correction
                  </FieldLabel>

                  <TextArea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Explain what needs to be fixed before resubmitting."
                  />

                  <div style={{ marginTop: 11 }}>
                    <ActionButton
                      variant="warning"
                      onClick={() => handleReturn(selectedReport)}
                      disabled={returningId === selectedReport.id}
                    >
                      {returningId === selectedReport.id
                        ? "Returning..."
                        : "Return to Supervisor"}
                    </ActionButton>
                  </div>
                </div>

                <div
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minWidth: 0,
                    overflowX: "auto",
                    overflowY: "hidden",
                    WebkitOverflowScrolling: "touch",
                    borderRadius: 16,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1180,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle()}>Employee</th>
                        <th style={thStyle()}>Punch In</th>
                        <th style={thStyle()}>Punch Out</th>
                        <th style={thStyle()}>Employee Status</th>
                        <th style={thStyle()}>Break Taken</th>
                        <th style={thStyle()}>Reason</th>
                        <th style={thStyle()}>Hours</th>
                        <th
                          style={thStyle({ textAlign: "center" })}
                        >
                          Remove
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(editData.rows || []).map((row, index) => (
                        <tr
                          key={index}
                          style={{
                            background:
                              index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            <TextInput
                              value={row.employeeName || ""}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "employeeName",
                                  e.target.value
                                )
                              }
                            />
                          </td>

                          <td style={tdStyle}>
                            <TextInput
                              type="time"
                              value={row.punchIn || ""}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "punchIn",
                                  e.target.value
                                )
                              }
                            />
                          </td>

                          <td style={tdStyle}>
                            <TextInput
                              type="time"
                              value={row.punchOut || ""}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "punchOut",
                                  e.target.value
                                )
                              }
                            />
                          </td>

                          <td style={tdStyle}>
                            <TextInput
                              value={row.employeeStatus || ""}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "employeeStatus",
                                  e.target.value
                                )
                              }
                            />
                          </td>

                          <td style={tdStyle}>
                            <SelectInput
                              value={row.breakTaken || "No"}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "breakTaken",
                                  e.target.value
                                )
                              }
                            >
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                              <option value="30 min">30 min</option>
                              <option value="45 min">45 min</option>
                              <option value="60 min">60 min</option>
                            </SelectInput>
                          </td>

                          <td style={tdStyle}>
                            <TextInput
                              value={row.reason || ""}
                              onChange={(e) =>
                                handleEditRow(
                                  index,
                                  "reason",
                                  e.target.value
                                )
                              }
                            />
                          </td>

                          <td style={tdStyle}>
                            {calculateRowHours(row).toFixed(2)} hrs
                          </td>

                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <ActionButton
                              variant="danger"
                              onClick={() => removeEditRow(index)}
                              disabled={(editData.rows || []).length === 1}
                            >
                              Remove
                            </ActionButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={addEditRow}
                  >
                    + Add Row
                  </ActionButton>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: isMobile ? "stretch" : "flex-end",
                  }}
                >
                  <div
                    style={{
                      minWidth: isMobile ? "100%" : 250,
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                      borderRadius: 15,
                      padding: "14px 16px",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Report Total
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 24,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      {currentDisplayedTotal.toFixed(2)} hrs
                    </div>
                  </div>
                </div>
              </div>
            )}
            </PageCard>
          </div>
        )}
      </div>
    </div>
  );
}
