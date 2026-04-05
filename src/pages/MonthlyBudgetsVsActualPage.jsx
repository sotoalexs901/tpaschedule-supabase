import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* -------------------- Normalizers -------------------- */

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

  const day = d.getDay();
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

function sumHoursFromRows(rows = []) {
  return rows.reduce((sum, row) => sum + calculateRowHours(row), 0);
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

function getMonthOptionsFromData(approvedTimesheets) {
  const set = new Set();

  approvedTimesheets.forEach((row) => {
    const d = parseDateSafe(row.reportDate);
    if (!d) return;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    set.add(value);
  });

  if (!set.size) {
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }

  return Array.from(set)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => {
      const [year, month] = value.split("-").map(Number);
      const d = new Date(year, month - 1, 1);
      return {
        value,
        label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      };
    });
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

/* -------------------- UI helpers -------------------- */

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

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
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

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
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

/* -------------------- Page -------------------- */

export default function MonthlyBudgetsVsActualPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const canAccess = user?.role === "station_manager";

  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [weeklyBudgets, setWeeklyBudgets] = useState([]);
  const [dailyBudgets, setDailyBudgets] = useState([]);
  const [approvedTimesheets, setApprovedTimesheets] = useState([]);
  const [monthlyOverrides, setMonthlyOverrides] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedAirline, setSelectedAirline] = useState("all");
  const [sortBy, setSortBy] = useState("airline");
  const [sortDirection, setSortDirection] = useState("asc");

  const [showMonthlyDetails, setShowMonthlyDetails] = useState(false);
  const [showDailyDetail, setShowDailyDetail] = useState(false);

  const [editingOverride, setEditingOverride] = useState({});

  async function loadData() {
    try {
      const [weeklySnap, dailySnap, timesheetSnap, overridesSnap] = await Promise.all([
        getDocs(collection(db, "airlineBudgets")),
        getDocs(collection(db, "airlineDailyBudgets")),
        getDocs(collection(db, "timesheet_reports")),
        getDocs(collection(db, "monthlyBudgetOverrides")),
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

      const overridesRows = overridesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          month: String(data.month || ""),
          airline: normalizeAirlineName(data.airline),
          budgetHours: Number(data.budgetHours || 0),
        };
      });

      setWeeklyBudgets(weeklyRows);
      setDailyBudgets(dailyRows);
      setApprovedTimesheets(approvedRows);
      setMonthlyOverrides(overridesRows);
    } catch (err) {
      console.error("Error loading monthly budgets vs actual:", err);
      setStatusMessage("Could not load Monthly Budgets vs Actual report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    loadData();
  }, [canAccess]);

  const monthOptions = useMemo(() => getMonthOptionsFromData(approvedTimesheets), [approvedTimesheets]);

  useEffect(() => {
    if (!selectedMonth && monthOptions.length) {
      setSelectedMonth(monthOptions[0].value);
    }
  }, [monthOptions, selectedMonth]);

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

  const overrideMap = useMemo(() => {
    const map = {};
    monthlyOverrides.forEach((item) => {
      if (!item.month || !item.airline) return;
      map[`${item.month}__${item.airline}`] = item;
    });
    return map;
  }, [monthlyOverrides]);

  const allAirlines = useMemo(() => {
    const set = new Set();
    approvedTimesheets.forEach((row) => row.airline && set.add(row.airline));
    weeklyBudgets.forEach((row) => row.airline && set.add(row.airline));
    dailyBudgets.forEach((row) => row.airline && set.add(row.airline));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [approvedTimesheets, weeklyBudgets, dailyBudgets]);

  function buildDetailRowsForMonth(monthValue) {
    const visibleApproved = approvedTimesheets.filter((row) => {
      if (!row.reportDate || !isOnOrBeforeToday(row.reportDate)) return false;
      if (!isSameMonth(row.reportDate, monthValue)) return false;
      return true;
    });

    const map = {};

    visibleApproved.forEach((report) => {
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
      const budget =
        fallbackDepartmentDailyBudget > 0 ? fallbackDepartmentDailyBudget : dailyBudget;

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

      if (report.approvedByName) map[key].approvedBy.add(report.approvedByName);
      if (report.overBudgetReason) map[key].overtimeReasons.add(report.overBudgetReason);
    });

    const rows = Object.values(map)
      .map((row) => ({
        ...row,
        variance: getVariance(row.budget, row.actual),
        revenue: getRevenue(row.budget, row.actual),
        overtime: getOvertime(row.budget, row.actual),
        approvedByText: Array.from(row.approvedBy).join(", "),
        overtimeReasonText: Array.from(row.overtimeReasons).join(" | "),
      }))
      .sort((a, b) => {
        if (a.reportDate !== b.reportDate) return a.reportDate.localeCompare(b.reportDate);
        if (a.airline !== b.airline) return a.airline.localeCompare(b.airline);
        return prettifyDepartment(a.department).localeCompare(prettifyDepartment(b.department));
      });

    let currentWeekKey = "";
    let weekBudgetRunning = 0;
    let weekActualRunning = 0;

    let currentMonthKey = "";
    let monthBudgetRunning = 0;
    let monthActualRunning = 0;

    return rows.map((row) => {
      const weekKey = `${row.airline}__${row.department}__${row.weekStart}`;
      const monthKey = `${row.airline}__${row.department}__${monthValue}`;

      if (currentWeekKey !== weekKey) {
        currentWeekKey = weekKey;
        weekBudgetRunning = 0;
        weekActualRunning = 0;
      }

      if (currentMonthKey !== monthKey) {
        currentMonthKey = monthKey;
        monthBudgetRunning = 0;
        monthActualRunning = 0;
      }

      weekBudgetRunning += row.budget;
      weekActualRunning += row.actual;
      monthBudgetRunning += row.budget;
      monthActualRunning += row.actual;

      return {
        ...row,
        weekBudgetRunning,
        weekActualRunning,
        weekVarianceRunning: getVariance(weekBudgetRunning, weekActualRunning),
        monthBudgetRunning,
        monthActualRunning,
        monthVarianceRunning: getVariance(monthBudgetRunning, monthActualRunning),
      };
    });
  }

  const allMonthSummaries = useMemo(() => {
    return monthOptions.map((monthItem) => {
      const rows = buildDetailRowsForMonth(monthItem.value);
      const rawBudget = rows.reduce((sum, row) => sum + Number(row.budget || 0), 0);
      const actual = rows.reduce((sum, row) => sum + Number(row.actual || 0), 0);
      const variance = getVariance(rawBudget, actual);
      const revenue = getRevenue(rawBudget, actual);
      const overtime = getOvertime(rawBudget, actual);

      return {
        month: monthItem.value,
        label: monthItem.label,
        budget: rawBudget,
        actual,
        variance,
        revenue,
        overtime,
        rowsCount: rows.length,
      };
    });
  }, [monthOptions, approvedTimesheets, dailyBudgetMap, weeklyBudgetMap]);

  const selectedMonthDetailRowsAll = useMemo(() => {
    if (!selectedMonth) return [];
    return buildDetailRowsForMonth(selectedMonth);
  }, [selectedMonth, approvedTimesheets, dailyBudgetMap, weeklyBudgetMap]);

  const selectedMonthAirlineSummaryAll = useMemo(() => {
    const map = {};

    selectedMonthDetailRowsAll.forEach((row) => {
      const airline = row.airline || "Unknown";

      if (!map[airline]) {
        map[airline] = {
          airline,
          rawBudget: 0,
          actual: 0,
          approvedBySet: new Set(),
          overtimeReasonsSet: new Set(),
        };
      }

      map[airline].rawBudget += Number(row.budget || 0);
      map[airline].actual += Number(row.actual || 0);

      if (row.approvedByText) {
        row.approvedByText.split(",").forEach((item) => {
          const clean = String(item || "").trim();
          if (clean) map[airline].approvedBySet.add(clean);
        });
      }

      if (row.overtimeReasonText) {
        row.overtimeReasonText.split("|").forEach((item) => {
          const clean = String(item || "").trim();
          if (clean) map[airline].overtimeReasonsSet.add(clean);
        });
      }
    });

    return Object.values(map).map((row) => {
      const override = overrideMap[`${selectedMonth}__${row.airline}`];
      const finalBudget =
        override && Number(override.budgetHours || 0) > 0
          ? Number(override.budgetHours)
          : row.rawBudget;

      return {
        airline: row.airline,
        rawBudget: row.rawBudget,
        finalBudget,
        actual: row.actual,
        variance: getVariance(finalBudget, row.actual),
        revenue: getRevenue(finalBudget, row.actual),
        overtime: getOvertime(finalBudget, row.actual),
        approvedByText: Array.from(row.approvedBySet).join(", "),
        overtimeReasonText: Array.from(row.overtimeReasonsSet).join(" | "),
        overrideDocId: override?.id || "",
      };
    });
  }, [selectedMonthDetailRowsAll, overrideMap, selectedMonth]);

  const filteredAirlineSummary = useMemo(() => {
    let rows = [...selectedMonthAirlineSummaryAll];

    if (selectedAirline !== "all") {
      rows = rows.filter((row) => row.airline === selectedAirline);
    }

    rows.sort((a, b) => {
      let left = a[sortBy];
      let right = b[sortBy];

      if (sortBy === "airline") {
        left = String(left || "");
        right = String(right || "");
        return sortDirection === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }

      left = Number(left || 0);
      right = Number(right || 0);
      return sortDirection === "asc" ? left - right : right - left;
    });

    return rows;
  }, [selectedMonthAirlineSummaryAll, selectedAirline, sortBy, sortDirection]);

  const filteredDetailRows = useMemo(() => {
    if (selectedAirline === "all") return selectedMonthDetailRowsAll;
    return selectedMonthDetailRowsAll.filter((row) => row.airline === selectedAirline);
  }, [selectedMonthDetailRowsAll, selectedAirline]);

  const stationTotals = useMemo(() => {
    const budget = filteredAirlineSummary.reduce(
      (sum, row) => sum + Number(row.finalBudget || 0),
      0
    );
    const actual = filteredAirlineSummary.reduce(
      (sum, row) => sum + Number(row.actual || 0),
      0
    );
    return {
      budget,
      actual,
      variance: getVariance(budget, actual),
      revenue: getRevenue(budget, actual),
      overtime: getOvertime(budget, actual),
    };
  }, [filteredAirlineSummary]);

  async function saveMonthlyOverride(airline) {
    const key = `${selectedMonth}__${airline}`;
    const rawValue = editingOverride[key];
    const nextBudget = Number(rawValue || 0);

    if (!selectedMonth || !airline || !nextBudget) {
      setStatusMessage("Please enter a valid final monthly budget.");
      return;
    }

    try {
      const existing = overrideMap[key];

      if (existing?.id) {
        await updateDoc(doc(db, "monthlyBudgetOverrides", existing.id), {
          budgetHours: nextBudget,
        });
      } else {
        await addDoc(collection(db, "monthlyBudgetOverrides"), {
          month: selectedMonth,
          airline,
          budgetHours: nextBudget,
        });
      }

      setStatusMessage(`Final monthly budget saved for ${airline}.`);
      await loadData();
    } catch (err) {
      console.error("Error saving monthly override:", err);
      setStatusMessage("Could not save final monthly budget.");
    }
  }

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
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 14 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 16 : isTablet ? 20 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: isMobile ? 10 : 12,
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
            fontSize: isMobile ? 26 : 32,
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
            maxWidth: 900,
            fontSize: isMobile ? 12 : 14,
            color: "rgba(255,255,255,0.88)",
            lineHeight: 1.6,
          }}
        >
          Summary by month, station totals, airline filters, sortable monthly detail,
          collapsible daily department detail, and editable final monthly budget by airline.
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

      <PageCard style={{ padding: isMobile ? 16 : 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Monthly Summary
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: isMobile ? 12 : 13,
              color: "#64748b",
            }}
          >
            Click a month to open station totals and details.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : isTablet
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {allMonthSummaries.map((month) => {
            const isActive = selectedMonth === month.month;
            return (
              <button
                key={month.month}
                type="button"
                onClick={() => setSelectedMonth(month.month)}
                style={{
                  textAlign: "left",
                  borderRadius: 18,
                  border: isActive ? "1px solid #1769aa" : "1px solid #e2e8f0",
                  background: isActive ? "#edf7ff" : "#ffffff",
                  padding: 14,
                  cursor: "pointer",
                  boxShadow: isActive ? "0 10px 22px rgba(23,105,170,0.10)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  {month.label}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      Budget
                    </div>
                    <div style={{ marginTop: 3, fontSize: 14, fontWeight: 800 }}>
                      {formatHours(month.budget)} hrs
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      Used
                    </div>
                    <div style={{ marginTop: 3, fontSize: 14, fontWeight: 800 }}>
                      {formatHours(month.actual)} hrs
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      Revenue
                    </div>
                    <div style={{ marginTop: 3 }}>{smallPill(`${formatHours(month.revenue)} hrs`, "green")}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>
                      Overtime
                    </div>
                    <div style={{ marginTop: 3 }}>
                      {smallPill(`${formatHours(month.overtime)} hrs`, month.overtime > 0 ? "red" : "default")}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 18 : 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Station Total · {monthOptions.find((m) => m.value === selectedMonth)?.label || "—"}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 12 : 13,
                color: "#64748b",
              }}
            >
              Click below to open monthly airline detail.
            </p>
          </div>

          <ActionButton
            variant="secondary"
            onClick={() => setShowMonthlyDetails((prev) => !prev)}
          >
            {showMonthlyDetails ? "Hide Details" : "Show Details"}
          </ActionButton>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : isTablet
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(5, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <InfoCard label="Station Budget" value={`${formatHours(stationTotals.budget)} hrs`} />
          <InfoCard label="Total Used" value={`${formatHours(stationTotals.actual)} hrs`} tone="blue" />
          <InfoCard
            label="Variance"
            value={`${formatHours(stationTotals.variance)} hrs`}
            tone={stationTotals.variance >= 0 ? "green" : "red"}
          />
          <InfoCard label="Revenue" value={`${formatHours(stationTotals.revenue)} hrs`} tone="green" />
          <InfoCard
            label="Overtime"
            value={`${formatHours(stationTotals.overtime)} hrs`}
            tone={stationTotals.overtime > 0 ? "red" : "default"}
          />
        </div>
      </PageCard>

      {showMonthlyDetails && (
        <PageCard style={{ padding: isMobile ? 16 : 22 }}>
          <div
            style={{
              marginBottom: 16,
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : isTablet
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(4, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Airline Filter</FieldLabel>
              <SelectInput
                value={selectedAirline}
                onChange={(e) => setSelectedAirline(e.target.value)}
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
              <FieldLabel>Sort By</FieldLabel>
              <SelectInput value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="airline">Airline</option>
                <option value="finalBudget">Final Budget</option>
                <option value="actual">Actual</option>
                <option value="variance">Variance</option>
                <option value="revenue">Revenue</option>
                <option value="overtime">Overtime</option>
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Direction</FieldLabel>
              <SelectInput
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value)}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </SelectInput>
            </div>

            <div style={{ display: "flex", alignItems: "end" }}>
              <ActionButton
                variant="secondary"
                onClick={() => setShowDailyDetail((prev) => !prev)}
              >
                {showDailyDetail ? "Hide Daily Detail" : "Open Daily Detail"}
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
                minWidth: 1400,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle()}>Airline</th>
                  <th style={thStyle()}>Raw Budget</th>
                  <th style={thStyle()}>Final Budget</th>
                  <th style={thStyle()}>Actual Used</th>
                  <th style={thStyle()}>Variance</th>
                  <th style={thStyle()}>Revenue</th>
                  <th style={thStyle()}>Overtime</th>
                  <th style={thStyle()}>Approved By</th>
                  <th style={thStyle()}>Overtime Reason</th>
                  <th style={thStyle()}>Edit Final Budget</th>
                </tr>
              </thead>
              <tbody>
                {filteredAirlineSummary.map((row, index) => {
                  const editKey = `${selectedMonth}__${row.airline}`;
                  return (
                    <tr
                      key={row.airline}
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>
                        <strong>{row.airline}</strong>
                      </td>
                      <td style={tdStyle}>{formatHours(row.rawBudget)} hrs</td>
                      <td style={tdStyle}>{formatHours(row.finalBudget)} hrs</td>
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
                        <div style={{ minWidth: 260, whiteSpace: "pre-line", lineHeight: 1.6 }}>
                          {row.overtimeReasonText || "—"}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "grid", gap: 8, minWidth: 180 }}>
                          <TextInput
                            type="number"
                            step="0.01"
                            value={
                              editingOverride[editKey] !== undefined
                                ? editingOverride[editKey]
                                : row.finalBudget
                            }
                            onChange={(e) =>
                              setEditingOverride((prev) => ({
                                ...prev,
                                [editKey]: e.target.value,
                              }))
                            }
                          />
                          <ActionButton
                            variant="success"
                            onClick={() => saveMonthlyOverride(row.airline)}
                          >
                            Save Final Budget
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredAirlineSummary.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ ...tdStyle, textAlign: "center" }}>
                      No airline rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 16 : 22 }}>
        <details open={showDailyDetail} onToggle={(e) => setShowDailyDetail(e.target.open)}>
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: isMobile ? 18 : 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Daily Department Detail
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: isMobile ? 12 : 13,
                  color: "#64748b",
                }}
              >
                Dropdown section. Open only when you need the daily detail.
              </p>
            </div>

            <div>{smallPill(`${filteredDetailRows.length} rows`, "blue")}</div>
          </summary>

          <div style={{ marginTop: 16 }}>
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
                  {filteredDetailRows.map((row, index) => (
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

                  {filteredDetailRows.length === 0 && (
                    <tr>
                      <td colSpan={16} style={{ ...tdStyle, textAlign: "center" }}>
                        No daily detail rows found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </PageCard>
    </div>
  );
}
