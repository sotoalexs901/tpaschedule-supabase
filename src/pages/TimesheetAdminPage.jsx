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
  if (!d) return "—";
  return d.toLocaleString();
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
  return (report?.rows || []).reduce((sum, row) => sum + calculateRowHours(row), 0);
}

function startOfTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 110,
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
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

function statusBadge(status) {
  const value = String(status || "").toUpperCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
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

function buildPrintableHtml(report, airlineSummary) {
  const rowsHtml = (report.rows || [])
    .map((row) => {
      const hours = calculateRowHours(row).toFixed(2);
      return `
        <tr>
          <td>${row.employeeName || "—"}</td>
          <td>${row.punchIn || "—"}</td>
          <td>${row.punchOut || "—"}</td>
          <td>${row.employeeStatus || "—"}</td>
          <td>${row.breakTaken || "—"}</td>
          <td>${row.reason || "—"}</td>
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
            · ${formatDateTime(report.approvedAt)}
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
            · ${formatDateTime(report.returnedAt)}
          </div>
          <div style="margin-top:8px;">
            ${String(report.returnedReason || "No reason provided.").replace(/\n/g, "<br/>")}
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
          Budget alert: ${report.normalizedAirline} is over budget by
          ${Number(report.overBudgetBy || airlineSummary?.overBy || 0).toFixed(2)} hours
          on ${report.reportDate || "this day"}.
        </div>
      `
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Timesheet Report</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #111827;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 18px;
          }
          .title {
            font-size: 28px;
            font-weight: 800;
            margin: 0;
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
            gap: 12px;
            margin-bottom: 16px;
          }
          .card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 12px 14px;
          }
          .card-label,
          .section-label {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .card-value {
            margin-top: 6px;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
          }
          .alert-box {
            border-radius: 14px;
            padding: 12px 14px;
            background: #fff1f2;
            border: 1px solid #fecdd3;
            color: #9f1239;
            font-weight: 800;
            margin-bottom: 16px;
          }
          .notes-box,
          .approval-box,
          .returned-box,
          .over-budget-reason-box {
            border-radius: 14px;
            padding: 12px 14px;
            margin-bottom: 16px;
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
          .total-box {
            margin-top: 16px;
            margin-left: auto;
            width: 260px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px 16px;
          }
          .total-value {
            margin-top: 6px;
            font-size: 26px;
            font-weight: 900;
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
          <div>
            <h1 class="title">Timesheet Report</h1>
            <div class="subtitle">
              ${report.normalizedAirline || "—"} · ${report.reportDate || "—"}
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
            <div class="card-value">${report.normalizedAirline || "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">Report Date</div>
            <div class="card-value">${report.reportDate || "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">Shift</div>
            <div class="card-value">${report.shift || "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">Supervisor Reporting</div>
            <div class="card-value">${report.supervisorReporting || "—"}</div>
          </div>
          <div class="card">
            <div class="card-label">Submitted By</div>
            <div class="card-value">${report.submittedByName || report.submittedByUsername || "—"}</div>
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

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" && normalizedUsername === "hhernandez";

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "station_manager" ||
    user?.role === "duty_manager";

  const canApprove =
    user?.role === "station_manager" || user?.role === "duty_manager";

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
  const [showMonthlyOverBudgetSummary, setShowMonthlyOverBudgetSummary] = useState(true);

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

        const [reportsSnap, dailyBudgetsSnap, employeesSnap] = await Promise.all([
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
          isCabinServiceDepartment(currentEmployeeRecord?.department || user?.department) &&
          currentRole === "supervisor";

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
        dailyBudgetByAirlineAndDate[`${normalizedAirline}__${reportDate}`] || 0;

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
          typeof report.overBudget === "boolean" ? report.overBudget : computedOverBudget,
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
        r.submittedByName || r.submittedByUsername || r.supervisorReporting || ""
      ).toLowerCase();

      if (filters.airline !== "all" && r.normalizedAirline !== filters.airline) {
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
        const overBy = row.hours > row.budget ? row.hours - row.budget : 0;

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
          airline: report.normalizedAirline || "—",
          department: prettifyDepartment(report.department || report.normalizedDepartment),
          reportDate: report.reportDate || "—",
          submittedBy:
            report.submittedByName ||
            report.submittedByUsername ||
            report.supervisorReporting ||
            "—",
          reportedHours: hours,
          budgetHours: budget,
          overBy,
          overBudgetReason: String(report.overBudgetReason || "").trim(),
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
    return currentMonthOverBudgetReports.reduce((sum, item) => sum + item.overBy, 0);
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
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (selectedId && !filteredReports.some((r) => r.id === selectedId)) {
      setSelectedId(filteredReports[0]?.id || "");
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
      `Delete this timesheet report from ${report.reportDate || "unknown date"}?`
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
      setStatusMessage("Please write the reason before returning the timesheet.");
      return;
    }

    const ok = window.confirm("Return this timesheet to supervisor for fix?");
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
        setStatusMessage("The timesheet needs at least one employee row.");
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
          `${normalizedAirline}__${String(editData.reportDate || "").trim()}`
        ] || 0;
      const overBudget = budgetHoursDaily > 0 && totalHours > budgetHoursDaily;
      const overBudgetBy = overBudget ? totalHours - budgetHoursDaily : 0;

      if (overBudget && !String(editData.overBudgetReason || "").trim()) {
        setStatusMessage("Please fill in the over budget reason before saving.");
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
        ? normalizeAirlineName(editData.airline || selectedReport.airline)
        : selectedReport.airline,
      normalizedAirline: isEditMode
        ? normalizeAirlineName(editData.airline || selectedReport.airline)
        : selectedReport.normalizedAirline,
      reportDate: isEditMode
        ? editData.reportDate || selectedReport.reportDate
        : selectedReport.reportDate,
      shift: isEditMode ? editData.shift || selectedReport.shift : selectedReport.shift,
      supervisorReporting: isEditMode
        ? editData.supervisorReporting || selectedReport.supervisorReporting
        : selectedReport.supervisorReporting,
      notes: isEditMode ? editData.notes || selectedReport.notes : selectedReport.notes,
      overBudgetReason: isEditMode
        ? editData.overBudgetReason || selectedReport.overBudgetReason
        : selectedReport.overBudgetReason,
      rows:
        isEditMode && (editData.rows || []).length
          ? editData.rows
          : selectedReport.rows || [],
      totalHours:
        isEditMode && (editData.rows || []).length
          ? editData.rows.reduce((sum, row) => sum + calculateRowHours(row), 0)
          : selectedReport.totalHours,
      budgetHoursDaily:
        isEditMode
          ? dailyBudgetByAirlineAndDate[
              `${normalizeAirlineName(editData.airline || selectedReport.airline)}__${String(
                editData.reportDate || selectedReport.reportDate || ""
              ).trim()}`
            ] || selectedReport.budgetHoursDaily || 0
          : selectedReport.budgetHoursDaily || 0,
    };

    const html = buildPrintableHtml(printableReport, selectedAirlineSummary);
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

  if (!canAccess) {
    return (
      <div
        style={{
          display: "grid",
          gap: 18,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
        }}
      >
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
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Timesheets
          </p>
          <h1
            style={{
              margin: "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Access denied
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            You do not have permission to view timesheet reports.
          </p>
        </div>
      </div>
    );
  }

  const currentDisplayedTotal =
    isEditMode && (editData.rows || []).length
      ? editData.rows.reduce((sum, row) => sum + calculateRowHours(row), 0)
      : selectedReport?.totalHours || 0;

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div style={{ position: "relative" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Timesheets
          </p>

          <h1
            style={{
              margin: "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Timesheet Reports
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            {restrictToOwnReports
              ? "Review your submitted timesheets, check budget impact, and export your selected report."
              : "Review submitted reports, compare daily airline hours vs daily budget, approve, return for correction, edit reports, and export only the selected timesheet."}
          </p>
        </div>
      </div>

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
              borderRadius: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background: isErrorStatus ? "#fff1f2" : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 18,
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
                padding: "22px 20px 18px",
                fontSize: 15,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 20px 20px",
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
                  borderRadius: 14,
                  padding: "12px 22px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            marginBottom: showMonthlyOverBudgetSummary ? 16 : 0,
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
                letterSpacing: "-0.02em",
              }}
            >
              Monthly Over Budget Summary
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
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
                  padding: 16,
                  borderRadius: 16,
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  fontWeight: 700,
                }}
              >
                No over budget reports found for the current month.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      borderRadius: 14,
                      padding: "12px 14px",
                      fontWeight: 800,
                      color: "#9a3412",
                    }}
                  >
                    Reports this month: {currentMonthOverBudgetReports.length}
                  </div>

                  <div
                    style={{
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: 14,
                      padding: "12px 14px",
                      fontWeight: 800,
                      color: "#9f1239",
                    }}
                  >
                    Total over budget: {totalMonthlyOverBudgetHours.toFixed(2)} hrs
                  </div>
                </div>

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
                            background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>{item.reportDate}</td>
                          <td style={tdStyle}>{item.airline}</td>
                          <td style={tdStyle}>{item.department}</td>
                          <td style={tdStyle}>{item.submittedBy}</td>
                          <td style={tdStyle}>{item.reportedHours.toFixed(2)} hrs</td>
                          <td style={tdStyle}>{item.budgetHours.toFixed(2)} hrs</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
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
                                color: item.overBudgetReason ? "#0f172a" : "#64748b",
                                minWidth: 260,
                              }}
                            >
                              {item.overBudgetReason || "No over budget reason provided."}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={statusBadge(item.status)}>
                              {String(item.status || "submitted").toUpperCase()}
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
              Daily Budget Alert
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {overBudgetAlerts.map((alert) => (
                <div
                  key={`${alert.airline}-${alert.date}`}
                  style={{
                    color: "#9f1239",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {alert.airline} is over daily budget by {alert.overBy.toFixed(2)} hours
                  {alert.date ? ` on ${alert.date}` : ""}.
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
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
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
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
            <FieldLabel>Report Date</FieldLabel>
            <TextInput
              type="date"
              value={filters.reportDate}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, reportDate: e.target.value }))
              }
            />
          </div>

          <div>
            <FieldLabel>Submitted By</FieldLabel>
            <TextInput
              value={filters.submittedBy}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, submittedBy: e.target.value }))
              }
              placeholder="Search by supervisor"
            />
          </div>
        </div>
      </PageCard>

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
                letterSpacing: "-0.02em",
              }}
            >
              Daily Hours by Airline
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
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
              borderRadius: 14,
              padding: "12px 14px",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Total: {totalHoursAllAirlines.toFixed(2)} hrs
          </div>
        </div>

        {airlineHourSummary.length === 0 ? (
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
            No airline hour totals found for this filter.
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
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{row.airline}</td>
                    <td style={tdStyle}>{row.date || "—"}</td>
                    <td style={tdStyle}>{row.hours.toFixed(2)} hrs</td>
                    <td style={tdStyle}>{row.budget.toFixed(2)} hrs</td>
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
                            fontSize: 12,
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
                            fontSize: 12,
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
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.95fr) minmax(520px, 1.25fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
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
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
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
              Loading timesheet reports...
            </div>
          ) : filteredReports.length === 0 ? (
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
              No timesheet reports found.
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
                  minWidth: 1140,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>Date</th>
                    <th style={thStyle()}>Submitted By</th>
                    <th style={thStyle()}>Hours</th>
                    <th style={thStyle()}>Created</th>
                    <th style={thStyle()}>Status</th>
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
                      <td style={tdStyle}>
                        {report.submittedByName ||
                          report.supervisorReporting ||
                          report.submittedByUsername ||
                          "—"}
                      </td>
                      <td style={tdStyle}>{report.totalHours.toFixed(2)} hrs</td>
                      <td style={tdStyle}>{formatDateTime(report.createdAt)}</td>
                      <td style={tdStyle}>
                        <span style={statusBadge(report.status)}>
                          {String(report.status || "submitted").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton
                            variant="secondary"
                            onClick={() => {
                              setSelectedId(report.id);
                              setIsEditMode(false);
                            }}
                          >
                            View
                          </ActionButton>

                          {canApprove && (
                            <ActionButton
                              variant="primary"
                              onClick={() => {
                                setSelectedId(report.id);
                                setIsEditMode(true);
                              }}
                            >
                              Edit
                            </ActionButton>
                          )}

                          {canApprove && report.status !== "approved" && (
                            <ActionButton
                              variant="success"
                              onClick={() => handleApprove(report)}
                              disabled={approvingId === report.id}
                            >
                              {approvingId === report.id ? "Approving..." : "Approve"}
                            </ActionButton>
                          )}

                          {canApprove && (
                            <ActionButton
                              variant="danger"
                              onClick={() => handleDelete(report)}
                              disabled={deletingId === report.id}
                            >
                              {deletingId === report.id ? "Deleting..." : "Delete"}
                            </ActionButton>
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
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
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
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.normalizedAirline || "—"} ·{" "}
                      {selectedReport.reportDate || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

                    {canApprove && selectedReport.status !== "approved" && (
                      <ActionButton
                        variant="success"
                        onClick={() => handleApprove(selectedReport)}
                        disabled={approvingId === selectedReport.id}
                      >
                        {approvingId === selectedReport.id ? "Approving..." : "Approve"}
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
                  <InfoCard
                    label="Airline"
                    value={selectedReport.normalizedAirline || "—"}
                  />
                  <InfoCard
                    label="Department"
                    value={prettifyDepartment(
                      selectedReport.department || selectedReport.normalizedDepartment
                    )}
                  />
                  <InfoCard
                    label="Report Date"
                    value={selectedReport.reportDate || "—"}
                  />
                  <InfoCard
                    label="Shift"
                    value={selectedReport.shift || "—"}
                  />
                  <InfoCard
                    label="Supervisor Reporting"
                    value={selectedReport.supervisorReporting || "—"}
                  />
                  <InfoCard
                    label="Submitted By"
                    value={
                      selectedReport.submittedByName ||
                      selectedReport.submittedByUsername ||
                      "—"
                    }
                  />
                  <InfoCard
                    label="Report Hours"
                    value={`${selectedReport.totalHours.toFixed(2)} hrs`}
                  />
                  <InfoCard
                    label="Daily Budget"
                    value={`${
                      selectedAirlineSummary
                        ? selectedAirlineSummary.budget.toFixed(2)
                        : Number(selectedReport.budgetHoursDaily || 0).toFixed(2)
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

                {(selectedAirlineSummary?.overBudget || selectedReport.overBudget) && (
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
                    Budget alert: {selectedReport.normalizedAirline} is over daily budget by{" "}
                    {Number(
                      selectedReport.overBudgetBy || selectedAirlineSummary?.overBy || 0
                    ).toFixed(2)} hours on {selectedReport.reportDate || "this day"}.
                  </div>
                )}

                {selectedReport.overBudget && selectedReport.overBudgetReason && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
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
                        fontSize: 14,
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
                      Notes
                    </div>
                    <div
                      style={{
                        fontSize: 14,
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
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
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
                        fontSize: 14,
                        color: "#7c2d12",
                        lineHeight: 1.7,
                        fontWeight: 700,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {selectedReport.returnedReason || "No reason provided."}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        color: "#9a3412",
                        fontWeight: 700,
                      }}
                    >
                      {selectedReport.returnedByName || "Manager"}
                      {selectedReport.returnedByRole
                        ? ` (${selectedReport.returnedByRole})`
                        : ""}
                      {" · "}
                      {formatDateTime(selectedReport.returnedAt)}
                    </div>
                  </div>
                )}

                {selectedReport.status === "approved" && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
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
                        fontSize: 14,
                        color: "#065f46",
                        lineHeight: 1.7,
                        fontWeight: 700,
                      }}
                    >
                      Approved by {selectedReport.approvedByName || "Manager"}{" "}
                      {selectedReport.approvedByRole
                        ? `(${selectedReport.approvedByRole})`
                        : ""}
                      {" · "}
                      {formatDateTime(selectedReport.approvedAt)}
                    </div>
                  </div>
                )}

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
                            background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>{row.employeeName || "—"}</td>
                          <td style={tdStyle}>{row.punchIn || "—"}</td>
                          <td style={tdStyle}>{row.punchOut || "—"}</td>
                          <td style={tdStyle}>{row.employeeStatus || "—"}</td>
                          <td style={tdStyle}>{row.breakTaken || "—"}</td>
                          <td style={tdStyle}>{row.reason || "—"}</td>
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
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      minWidth: 260,
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                      borderRadius: 16,
                      padding: "16px 18px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
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
                        marginTop: 6,
                        fontSize: 26,
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
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
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
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {selectedReport.normalizedAirline || "—"} ·{" "}
                      {selectedReport.reportDate || "—"}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                      {savingEditId === selectedReport.id ? "Saving..." : "Save Edits"}
                    </ActionButton>

                    {selectedReport.status !== "approved" && (
                      <ActionButton
                        variant="success"
                        onClick={() => handleApprove(selectedReport)}
                        disabled={approvingId === selectedReport.id}
                      >
                        {approvingId === selectedReport.id ? "Approving..." : "Approve"}
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
                  <div>
                    <FieldLabel>Airline</FieldLabel>
                    <TextInput
                      value={editData.airline}
                      onChange={(e) => handleEditField("airline", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Report Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={editData.reportDate}
                      onChange={(e) => handleEditField("reportDate", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Shift</FieldLabel>
                    <TextInput
                      value={editData.shift}
                      onChange={(e) => handleEditField("shift", e.target.value)}
                    />
                  </div>

                  <div>
                    <FieldLabel>Supervisor Reporting</FieldLabel>
                    <TextInput
                      value={editData.supervisorReporting}
                      onChange={(e) =>
                        handleEditField("supervisorReporting", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextArea
                    value={editData.notes}
                    onChange={(e) => handleEditField("notes", e.target.value)}
                  />
                </div>

                <div>
                  <FieldLabel>Over Budget Reason</FieldLabel>
                  <TextArea
                    value={editData.overBudgetReason}
                    onChange={(e) =>
                      handleEditField("overBudgetReason", e.target.value)
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Reason to return for correction</FieldLabel>
                  <TextArea
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Explain what needs to be fixed before resubmitting."
                  />
                  <div style={{ marginTop: 12 }}>
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
                        <th style={thStyle({ textAlign: "center" })}>Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(editData.rows || []).map((row, index) => (
                        <tr
                          key={index}
                          style={{
                            background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            <TextInput
                              value={row.employeeName || ""}
                              onChange={(e) =>
                                handleEditRow(index, "employeeName", e.target.value)
                              }
                            />
                          </td>
                          <td style={tdStyle}>
                            <TextInput
                              type="time"
                              value={row.punchIn || ""}
                              onChange={(e) =>
                                handleEditRow(index, "punchIn", e.target.value)
                              }
                            />
                          </td>
                          <td style={tdStyle}>
                            <TextInput
                              type="time"
                              value={row.punchOut || ""}
                              onChange={(e) =>
                                handleEditRow(index, "punchOut", e.target.value)
                              }
                            />
                          </td>
                          <td style={tdStyle}>
                            <TextInput
                              value={row.employeeStatus || ""}
                              onChange={(e) =>
                                handleEditRow(index, "employeeStatus", e.target.value)
                              }
                            />
                          </td>
                          <td style={tdStyle}>
                            <SelectInput
                              value={row.breakTaken || "No"}
                              onChange={(e) =>
                                handleEditRow(index, "breakTaken", e.target.value)
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
                                handleEditRow(index, "reason", e.target.value)
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

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ActionButton variant="secondary" onClick={addEditRow}>
                    + Add Row
                  </ActionButton>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      minWidth: 260,
                      background: "#f8fbff",
                      border: "1px solid #dbeafe",
                      borderRadius: 16,
                      padding: "16px 18px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
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
                        marginTop: 6,
                        fontSize: 26,
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
        )}
      </div>
    </div>
  );
}
