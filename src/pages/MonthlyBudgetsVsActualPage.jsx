import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* -------------------- Normalizers (aligned with your existing pages) -------------------- */

function normalizeAirlineName(name) {
  const value = String(name || "").trim();
  const upper = value.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WAL" ||
    upper === "WL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return value;
}

function normalizeDepartmentName(name) {
  const value = String(name || "").trim();
  if (!value) return "";

  const upper = value.toUpperCase();

  if (upper === "TC" || upper === "TICKET COUNTER") return "TC";
  if (upper === "RAMP") return "Ramp";
  if (upper === "BSO") return "BSO";
  if (upper === "WCHR") return "WCHR";
  if (
    upper === "CABIN" ||
    upper === "CABIN SERVICE" ||
    upper === "DL CABIN SERVICE"
  ) {
    return "Cabin Service";
  }
  if (upper === "OTHER") return "Other";

  return value;
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

  if (lower === "ramp") return "Ramp";
  if (lower === "tc" || lower === "ticket counter") return "TC";
  if (lower === "bso") return "BSO";
  if (lower === "wchr") return "WCHR";
  if (lower === "other") return "Other";

  return clean;
}

/* -------------------- Helpers -------------------- */

function startOfTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function startOfCurrentMonthString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthOptions() {
  const now = new Date();
  const options = [];

  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({ value, label });
  }

  return options;
}

function parseDateSafe(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLabel(value) {
  const d = parseDateSafe(value);
  if (!d) return value || "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(
    2,
    "0"
  )}`;
}

function getWeekStart(dateString) {
  const d = parseDateSafe(dateString);
  if (!d) return "";

  const day = d.getDay(); // 0 sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate()
  ).padStart(2, "0")}`;
}

function isSameMonth(dateString, monthValue) {
  const d = parseDateSafe(dateString);
  if (!d) return false;

  const [year, month] = String(monthValue || "").split("-").map(Number);
  if (!year || !month) return false;

  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function isOnOrBeforeToday(dateString) {
  const d = parseDateSafe(dateString);
  if (!d) return false;

  const today = parseDateSafe(startOfTodayString());
  if (!today) return false;

  return d.getTime() <= today.getTime();
}

function sumHoursFromRows(rows = []) {
  return rows.reduce((sum, row) => sum + calculateRowHours(row), 0);
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

function formatHours(value) {
  return Number(value || 0).toFixed(2);
}

function getVariance(budget, actual) {
  return Number(budget || 0) - Number(actual || 0);
}

function getRevenue(budget, actual) {
  const variance = getVariance(budget, actual);
  return variance > 0 ? variance : 0;
}

function getOvertime(budget, actual) {
  return Number(actual || 0) > Number(budget || 0)
    ? Number(actual || 0) - Number(budget || 0)
    : 0;
}

/* -------------------- Shared UI -------------------- */

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

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: {
      bg: "#f8fbff",
      border: "#dbeafe",
      color: "#0f172a",
    },
    green: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#166534",
    },
    red: {
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
    },
    amber: {
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
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
          fontSize: 18,
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

function smallPill(text, tone = "default") {
  const tones = {
    default: {
      background: "#f8fafc",
      color: "#334155",
      border: "#e2e8f0",
    },
    green: {
      background: "#dcfce7",
      color: "#166534",
      border: "#86efac",
    },
    red: {
      background: "#fff1f2",
      color: "#9f1239",
      border: "#fecdd3",
    },
    amber: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "#fdba74",
    },
    blue: {
      background: "#edf7ff",
      color: "#1769aa",
      border: "#cfe7fb",
    },
  };

  const style = tones[tone] || tones.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: style.background,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {text}
    </span>
  );
}

/* -------------------- Main Page -------------------- */

export default function MonthlyBudgetsVsActualPage() {
  const { user } = useUser();

  const canAccess = user?.role === "station_manager";

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [filters, setFilters] = useState({
    month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    airline: "all",
    department: "all",
  });

  const [weeklyBudgets, setWeeklyBudgets] = useState([]);
  const [dailyBudgets, setDailyBudgets] = useState([]);
  const [approvedTimesheets, setApprovedTimesheets] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [weeklySnap, dailySnap, timesheetSnap] = await Promise.all([
          getDocs(collection(db, "airlineBudgets")),
          getDocs(collection(db, "airlineDailyBudgets")),
          getDocs(collection(db, "timesheet_reports")),
        ]);

        const weeklyRows = weeklySnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            airline: normalizeAirlineName(data.airline),
            department: normalizeDepartmentName(data.department),
            weekStart: String(data.weekStart || ""),
            budgetHours: Number(data.budgetHours || 0),
          };
        });

        const dailyRows = dailySnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            airline: normalizeAirlineName(data.airline),
            date: String(data.date || ""),
            dailyBudgetHours:
              data.dailyBudgetHours === null ||
              data.dailyBudgetHours === undefined ||
              data.dailyBudgetHours === ""
                ? 0
                : Number(data.dailyBudgetHours),
          };
        });

        const approvedRows = timesheetSnap.docs
          .map((d) => {
            const data = d.data();

            const totalHours =
              data.totalHours !== undefined && data.totalHours !== null
                ? Number(data.totalHours)
                : sumHoursFromRows(data.rows || []);

            return {
              id: d.id,
              ...data,
              airline: normalizeAirlineName(data.airline),
              department: normalizeDepartmentName(data.department || data.airline),
              reportDate: String(data.reportDate || ""),
              status: String(data.status || "").toLowerCase(),
              totalHours,
              approvedByName: String(data.approvedByName || "").trim(),
              overBudgetReason: String(data.overBudgetReason || "").trim(),
            };
          })
          .filter((row) => row.status === "approved");

        setWeeklyBudgets(weeklyRows);
        setDailyBudgets(dailyRows);
        setApprovedTimesheets(approvedRows);
      } catch (err) {
        console.error("Error loading monthly budgets vs actual:", err);
        setStatusMessage("Could not load Monthly Budgets vs Actual report.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const dailyBudgetMap = useMemo(() => {
    const map = {};

    dailyBudgets.forEach((item) => {
      const airline = normalizeAirlineName(item.airline);
      const date = String(item.date || "").trim();
      if (!airline || !date) return;
      map[`${airline}__${date}`] = Number(item.dailyBudgetHours || 0);
    });

    return map;
  }, [dailyBudgets]);

  const weeklyBudgetMap = useMemo(() => {
    const map = {};

    weeklyBudgets.forEach((item) => {
      const airline = normalizeAirlineName(item.airline);
      const department = normalizeDepartmentName(item.department);
      const weekStart = String(item.weekStart || "").trim();

      if (!airline || !department || !weekStart) return;

      map[`${airline}__${department}__${weekStart}`] = Number(item.budgetHours || 0);
    });

    return map;
  }, [weeklyBudgets]);

  const allAirlines = useMemo(() => {
    const set = new Set();

    weeklyBudgets.forEach((row) => row.airline && set.add(row.airline));
    dailyBudgets.forEach((row) => row.airline && set.add(row.airline));
    approvedTimesheets.forEach((row) => row.airline && set.add(row.airline));

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [weeklyBudgets, dailyBudgets, approvedTimesheets]);

  const allDepartments = useMemo(() => {
    const set = new Set();

    weeklyBudgets.forEach((row) => row.department && set.add(prettifyDepartment(row.department)));
    approvedTimesheets.forEach((row) =>
      row.department && set.add(prettifyDepartment(row.department))
    );

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [weeklyBudgets, approvedTimesheets]);

  const visibleApprovedTimesheets = useMemo(() => {
    return approvedTimesheets.filter((row) => {
      if (!row.reportDate || !isOnOrBeforeToday(row.reportDate)) return false;
      if (!isSameMonth(row.reportDate, filters.month)) return false;

      if (filters.airline !== "all" && row.airline !== filters.airline) {
        return false;
      }

      if (
        filters.department !== "all" &&
        prettifyDepartment(row.department) !== filters.department
      ) {
        return false;
      }

      return true;
    });
  }, [approvedTimesheets, filters]);

  const detailRows = useMemo(() => {
    const map = {};

    visibleApprovedTimesheets.forEach((report) => {
      const airline = normalizeAirlineName(report.airline);
      const department = normalizeDepartmentName(report.department);
      const reportDate = String(report.reportDate || "").trim();
      const weekStart = getWeekStart(reportDate);

      if (!airline || !department || !reportDate) return;

      const dailyBudget = Number(dailyBudgetMap[`${airline}__${reportDate}`] || 0);
      const weeklyBudget = Number(
        weeklyBudgetMap[`${airline}__${department}__${weekStart}`] || 0
      );

      const fallbackDepartmentDailyBudget = weeklyBudget > 0 ? weeklyBudget / 7 : 0;

      // Important:
      // - If there is a daily airline budget, we still keep department budget from weekly if available.
      // - If department weekly budget is missing, fallback to airline daily budget only when department breakdown doesn't exist.
      const budget = fallbackDepartmentDailyBudget > 0 ? fallbackDepartmentDailyBudget : dailyBudget;

      const key = `${airline}__${department}__${reportDate}`;

      if (!map[key]) {
        map[key] = {
          airline,
          department,
          reportDate,
          weekStart,
          budget: 0,
          actual: 0,
          approvedBy: new Set(),
          overtimeReasons: new Set(),
        };
      }

      map[key].budget = budget;
      map[key].actual += Number(report.totalHours || 0);

      if (report.approvedByName) {
        map[key].approvedBy.add(report.approvedByName);
      }

      if (report.overBudgetReason) {
        map[key].overtimeReasons.add(report.overBudgetReason);
      }
    });

    const rows = Object.values(map)
      .map((row) => {
        const variance = getVariance(row.budget, row.actual);
        const revenue = getRevenue(row.budget, row.actual);
        const overtime = getOvertime(row.budget, row.actual);

        return {
          ...row,
          variance,
          revenue,
          overtime,
          approvedByText: Array.from(row.approvedBy).join(", "),
          overtimeReasonText: Array.from(row.overtimeReasons).join(" | "),
        };
      })
      .sort((a, b) => {
        if (a.reportDate !== b.reportDate) return a.reportDate.localeCompare(b.reportDate);
        if (a.airline !== b.airline) return a.airline.localeCompare(b.airline);
        return prettifyDepartment(a.department).localeCompare(prettifyDepartment(b.department));
      });

    let currentWeekKey = "";
    let weekBudgetRunning = 0;
    let weekActualRunning = 0;
    let weekRevenueRunning = 0;
    let weekOvertimeRunning = 0;

    let currentMonthAirlineDeptKey = "";
    let monthBudgetRunning = 0;
    let monthActualRunning = 0;
    let monthRevenueRunning = 0;
    let monthOvertimeRunning = 0;

    return rows.map((row) => {
      const weekKey = `${row.airline}__${row.department}__${row.weekStart}`;
      const monthKey = `${row.airline}__${row.department}__${filters.month}`;

      if (currentWeekKey !== weekKey) {
        currentWeekKey = weekKey;
        weekBudgetRunning = 0;
        weekActualRunning = 0;
        weekRevenueRunning = 0;
        weekOvertimeRunning = 0;
      }

      if (currentMonthAirlineDeptKey !== monthKey) {
        currentMonthAirlineDeptKey = monthKey;
        monthBudgetRunning = 0;
        monthActualRunning = 0;
        monthRevenueRunning = 0;
        monthOvertimeRunning = 0;
      }

      weekBudgetRunning += row.budget;
      weekActualRunning += row.actual;
      weekRevenueRunning += row.revenue;
      weekOvertimeRunning += row.overtime;

      monthBudgetRunning += row.budget;
      monthActualRunning += row.actual;
      monthRevenueRunning += row.revenue;
      monthOvertimeRunning += row.overtime;

      return {
        ...row,
        weekBudgetRunning,
        weekActualRunning,
        weekVarianceRunning: getVariance(weekBudgetRunning, weekActualRunning),
        weekRevenueRunning,
        weekOvertimeRunning,
        monthBudgetRunning,
        monthActualRunning,
        monthVarianceRunning: getVariance(monthBudgetRunning, monthActualRunning),
        monthRevenueRunning,
        monthOvertimeRunning,
      };
    });
  }, [visibleApprovedTimesheets, dailyBudgetMap, weeklyBudgetMap, filters.month]);

  const airlineSummary = useMemo(() => {
    const summaryMap = {};

    detailRows.forEach((row) => {
      const airline = row.airline || "Unknown";

      if (!summaryMap[airline]) {
        summaryMap[airline] = {
          airline,
          budget: 0,
          actual: 0,
          approvedBySet: new Set(),
          overtimeReasonsSet: new Set(),
        };
      }

      summaryMap[airline].budget += Number(row.budget || 0);
      summaryMap[airline].actual += Number(row.actual || 0);

      if (row.approvedByText) {
        row.approvedByText.split(",").forEach((item) => {
          const clean = String(item || "").trim();
          if (clean) summaryMap[airline].approvedBySet.add(clean);
        });
      }

      if (row.overtimeReasonText) {
        row.overtimeReasonText.split("|").forEach((item) => {
          const clean = String(item || "").trim();
          if (clean) summaryMap[airline].overtimeReasonsSet.add(clean);
        });
      }
    });

    return Object.values(summaryMap)
      .map((row) => {
        const variance = getVariance(row.budget, row.actual);
        const revenue = getRevenue(row.budget, row.actual);
        const overtime = getOvertime(row.budget, row.actual);

        return {
          airline: row.airline,
          budget: row.budget,
          actual: row.actual,
          variance,
          revenue,
          overtime,
          approvedByText: Array.from(row.approvedBySet).join(", "),
          overtimeReasonText: Array.from(row.overtimeReasonsSet).join(" | "),
        };
      })
      .sort((a, b) => a.airline.localeCompare(b.airline));
  }, [detailRows]);

  const totals = useMemo(() => {
    const budget = airlineSummary.reduce((sum, row) => sum + Number(row.budget || 0), 0);
    const actual = airlineSummary.reduce((sum, row) => sum + Number(row.actual || 0), 0);
    const variance = getVariance(budget, actual);
    const revenue = getRevenue(budget, actual);
    const overtime = getOvertime(budget, actual);

    return { budget, actual, variance, revenue, overtime };
  }, [airlineSummary]);

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
            TPA OPS · Station Manager
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
            This page is only available for Station Manager.
          </p>
        </div>
      </div>
    );
  }

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
            TPA OPS · Station Manager
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
            Monthly Budgets vs Actual
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 850,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Monthly view up to today using weekly/daily budgets and approved timesheets.
            Shows budget, actual used hours, variance, revenue from unused hours, overtime,
            approved by, overtime reason, and running weekly/monthly totals.
          </p>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#9f1239",
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
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Filter the monthly report by month, airline, and department.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Month</FieldLabel>
            <SelectInput
              value={filters.month}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  month: e.target.value,
                }))
              }
            >
              {monthOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

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
              {allAirlines.map((airline) => (
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
                setFilters((prev) => ({
                  ...prev,
                  department: e.target.value,
                }))
              }
            >
              <option value="all">All</option>
              {allDepartments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Up To Today</FieldLabel>
            <TextInput value={startOfTodayString()} disabled />
          </div>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <InfoCard label="Total Budget" value={`${formatHours(totals.budget)} hrs`} />
        <InfoCard label="Total Actual" value={`${formatHours(totals.actual)} hrs`} tone="blue" />
        <InfoCard
          label="Total Revenue"
          value={`${formatHours(totals.revenue)} hrs`}
          tone="green"
        />
        <InfoCard
          label="Total Overtime"
          value={`${formatHours(totals.overtime)} hrs`}
          tone={totals.overtime > 0 ? "red" : "default"}
        />
      </div>

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
              Airline Summary
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Consolidated by airline. Example: SY = SY TC + SY Ramp + all SY departments.
            </p>
          </div>

          <div>{smallPill(`Rows: ${airlineSummary.length}`, "blue")}</div>
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
            Loading report...
          </div>
        ) : airlineSummary.length === 0 ? (
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
            No monthly data found for this filter.
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
                minWidth: 1180,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Airline</th>
                  <th style={thStyle()}>Budget</th>
                  <th style={thStyle()}>Actual</th>
                  <th style={thStyle()}>Variance</th>
                  <th style={thStyle()}>Revenue</th>
                  <th style={thStyle()}>Overtime</th>
                  <th style={thStyle()}>Approved By</th>
                  <th style={thStyle()}>Overtime Reason</th>
                </tr>
              </thead>
              <tbody>
                {airlineSummary.map((row, index) => (
                  <tr
                    key={row.airline}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>{row.airline}</strong>
                    </td>
                    <td style={tdStyle}>{formatHours(row.budget)} hrs</td>
                    <td style={tdStyle}>{formatHours(row.actual)} hrs</td>
                    <td style={tdStyle}>
                      {row.variance >= 0
                        ? smallPill(`${formatHours(row.variance)} hrs`, "green")
                        : smallPill(`${formatHours(row.variance)} hrs`, "red")}
                    </td>
                    <td style={tdStyle}>
                      {row.revenue > 0
                        ? smallPill(`${formatHours(row.revenue)} hrs`, "green")
                        : smallPill(`${formatHours(row.revenue)} hrs`, "default")}
                    </td>
                    <td style={tdStyle}>
                      {row.overtime > 0
                        ? smallPill(`${formatHours(row.overtime)} hrs`, "red")
                        : smallPill(`${formatHours(row.overtime)} hrs`, "default")}
                    </td>
                    <td style={tdStyle}>{row.approvedByText || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ minWidth: 220, whiteSpace: "pre-line", lineHeight: 1.6 }}>
                        {row.overtimeReasonText || "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              Daily Department Detail
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Department-level detail with daily row, approved by, overtime reason, and
              running weekly/monthly totals.
            </p>
          </div>

          <div>{smallPill(`Rows: ${detailRows.length}`, "blue")}</div>
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
            Loading detail...
          </div>
        ) : detailRows.length === 0 ? (
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
            No detail rows found for this filter.
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
                minWidth: 2200,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Airline</th>
                  <th style={thStyle()}>Department</th>
                  <th style={thStyle()}>Date</th>
                  <th style={thStyle()}>Budget</th>
                  <th style={thStyle()}>Actual</th>
                  <th style={thStyle()}>Variance</th>
                  <th style={thStyle()}>Revenue</th>
                  <th style={thStyle()}>Overtime</th>
                  <th style={thStyle()}>Approved By</th>
                  <th style={thStyle()}>Overtime Reason</th>
                  <th style={thStyle()}>Weekly Budget Running</th>
                  <th style={thStyle()}>Weekly Actual Running</th>
                  <th style={thStyle()}>Weekly Variance Running</th>
                  <th style={thStyle()}>Monthly Budget Running</th>
                  <th style={thStyle()}>Monthly Actual Running</th>
                  <th style={thStyle()}>Monthly Variance Running</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, index) => (
                  <tr
                    key={`${row.airline}-${row.department}-${row.reportDate}`}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{row.airline}</td>
                    <td style={tdStyle}>{prettifyDepartment(row.department)}</td>
                    <td style={tdStyle}>{formatDateLabel(row.reportDate)}</td>
                    <td style={tdStyle}>{formatHours(row.budget)} hrs</td>
                    <td style={tdStyle}>{formatHours(row.actual)} hrs</td>
                    <td style={tdStyle}>
                      {row.variance >= 0
                        ? smallPill(`${formatHours(row.variance)} hrs`, "green")
                        : smallPill(`${formatHours(row.variance)} hrs`, "red")}
                    </td>
                    <td style={tdStyle}>
                      {row.revenue > 0
                        ? smallPill(`${formatHours(row.revenue)} hrs`, "green")
                        : smallPill(`${formatHours(row.revenue)} hrs`, "default")}
                    </td>
                    <td style={tdStyle}>
                      {row.overtime > 0
                        ? smallPill(`${formatHours(row.overtime)} hrs`, "red")
                        : smallPill(`${formatHours(row.overtime)} hrs`, "default")}
                    </td>
                    <td style={tdStyle}>{row.approvedByText || "—"}</td>
                    <td style={tdStyle}>
                      <div style={{ minWidth: 240, whiteSpace: "pre-line", lineHeight: 1.6 }}>
                        {row.overtimeReasonText || "—"}
                      </div>
                    </td>
                    <td style={tdStyle}>{formatHours(row.weekBudgetRunning)} hrs</td>
                    <td style={tdStyle}>{formatHours(row.weekActualRunning)} hrs</td>
                    <td style={tdStyle}>
                      {row.weekVarianceRunning >= 0
                        ? smallPill(`${formatHours(row.weekVarianceRunning)} hrs`, "green")
                        : smallPill(`${formatHours(row.weekVarianceRunning)} hrs`, "red")}
                    </td>
                    <td style={tdStyle}>{formatHours(row.monthBudgetRunning)} hrs</td>
                    <td style={tdStyle}>{formatHours(row.monthActualRunning)} hrs</td>
                    <td style={tdStyle}>
                      {row.monthVarianceRunning >= 0
                        ? smallPill(`${formatHours(row.monthVarianceRunning)} hrs`, "green")
                        : smallPill(`${formatHours(row.monthVarianceRunning)} hrs`, "red")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 16,
            padding: "14px 16px",
            color: "#475569",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "#0f172a" }}>Logic used:</strong> approved timesheets are
          the actual used hours. Revenue is the unused portion of budget. Overtime is the
          portion above budget. Daily budget is taken first from{" "}
          <strong>airlineDailyBudgets</strong>. If department daily budget is not explicitly
          available, the page falls back to <strong>airlineBudgets / 7</strong> using airline
          + department + week start.
        </div>
      </PageCard>
    </div>
  );
}
