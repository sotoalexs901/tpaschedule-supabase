import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  WestJet: "/logos/westjet.png",
  "WL Havana Air": "/logos/westjet.png",
  "WL Invicta":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_49%20p.m..png?alt=media&token=092a1deb-3285-41e1-ab0c-2e48a8faab92",
  AV: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_37%20p.m..png?alt=media&token=f133d1c8-51f9-4513-96df-8a75c6457b5b",
  EA: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_41%20p.m..png?alt=media&token=13fe584f-078f-4073-8d92-763ac549e5eb",
  WCHR:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_32%20p.m..png?alt=media&token=4f7e9ddd-692b-4288-af0a-8027a1fc6e1c",
  CABIN:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_28%20p.m..png?alt=media&token=b269ad02-0761-4b6b-b2f1-b510365cce49",
  "AA-BSO":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_25%20p.m..png?alt=media&token=09862a10-d237-43e9-a373-8bd07c30ce62",
  OTHER:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4b5f-b126-9c6a69f6dcc6",
};

const AIRLINE_COLORS = {
  SY: "#F28C28",
  WestJet: "#22B8B0",
  "WL Havana Air": "#22B8B0",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
  AM: "#0F766E",
  AMS: "#7C3AED",
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const toMinutes = (timeStr) => {
  if (!timeStr || timeStr === "OFF") return null;
  const [h, m] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const normalizeInterval = (start, end) => {
  const s = toMinutes(start);
  const eRaw = toMinutes(end);
  if (s == null || eRaw == null) return null;

  let e = eRaw;
  if (e <= s) e += 24 * 60;

  return [s, e];
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => {
  const a = normalizeInterval(aStart, aEnd);
  const b = normalizeInterval(bStart, bEnd);

  if (!a || !b) return false;

  const [s1, e1] = a;
  const [s2, e2] = b;

  return s1 < e2 && s2 < e1;
};

const normalizeAirlineName = (value) => {
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
};

const normalizeDepartmentName = (value) => {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (raw === "cabin") return "cabin service";
  if (raw === "cabin service") return "cabin service";
  if (raw === "dl cabin service") return "cabin service";
  if (raw === "ticket counter") return "tc";

  return raw;
};

function normalizeCustomOtherAirline(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();

  if (upper === "AM") return "AM";
  if (upper === "AMS") return "AMS";

  return raw;
}

function getEffectiveAirlineDisplayName(airlineKey, airlineDisplayName) {
  const normalizedKey = normalizeAirlineName(airlineKey);
  const display = normalizeCustomOtherAirline(airlineDisplayName);

  if (normalizedKey === "OTHER") {
    return display || "OTHER";
  }

  return normalizeAirlineName(display || normalizedKey);
}

function getThemeColor(airlineKey, airlineDisplayName) {
  const effectiveName = getEffectiveAirlineDisplayName(
    airlineKey,
    airlineDisplayName
  );

  return (
    AIRLINE_COLORS[effectiveName] ||
    AIRLINE_COLORS[normalizeAirlineName(airlineKey)] ||
    "#1769aa"
  );
}

function buildHeroGradient(themeColor) {
  return `linear-gradient(135deg, ${themeColor} 0%, #1f7cc1 55%, #6ec6e8 100%)`;
}

function normalizeDateString(value) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashWithYear = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashWithYear) {
    const [, mm, dd, yyyy] = slashWithYear;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(
      2,
      "0"
    )}`;
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return "";
}

function weekStartFromDays(days) {
  const mon = days?.mon;
  if (!mon) return "";

  const match = String(mon)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})$/);

  if (!match) return "";

  const [, mm, dd] = match;

  const today = new Date();
  const thisYear = today.getFullYear();
  const candidateThisYear = new Date(
    thisYear,
    Number(mm) - 1,
    Number(dd)
  );

  if (!Number.isNaN(candidateThisYear.getTime())) {
    return `${candidateThisYear.getFullYear()}-${String(
      candidateThisYear.getMonth() + 1
    ).padStart(2, "0")}-${String(candidateThisYear.getDate()).padStart(
      2,
      "0"
    )}`;
  }

  return "";
}

function cloneGrid(grid = []) {
  return grid.map((row) => ({
    ...row,
    mon: (row.mon || []).map((s) => ({ ...s })),
    tue: (row.tue || []).map((s) => ({ ...s })),
    wed: (row.wed || []).map((s) => ({ ...s })),
    thu: (row.thu || []).map((s) => ({ ...s })),
    fri: (row.fri || []).map((s) => ({ ...s })),
    sat: (row.sat || []).map((s) => ({ ...s })),
    sun: (row.sun || []).map((s) => ({ ...s })),
  }));
}

const getAirlineLogo = (airlineKey, airlineDisplayName) => {
  const effectiveName = getEffectiveAirlineDisplayName(
    airlineKey,
    airlineDisplayName
  );

  return (
    AIRLINE_LOGOS[effectiveName] ||
    AIRLINE_LOGOS[normalizeAirlineName(airlineKey)] ||
    AIRLINE_LOGOS.OTHER ||
    null
  );
};

function buildDayNumbers(weekStart) {
  if (!weekStart) {
    return {
      mon: "",
      tue: "",
      wed: "",
      thu: "",
      fri: "",
      sat: "",
      sun: "",
    };
  }

  const base = new Date(`${weekStart}T00:00:00`);

  if (Number.isNaN(base.getTime())) {
    return {
      mon: "",
      tue: "",
      wed: "",
      thu: "",
      fri: "",
      sat: "",
      sun: "",
    };
  }

  const result = {};

  DAY_KEYS.forEach((key, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);

    result[key] = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate()
    ).padStart(2, "0")}`;
  });

  return result;
}

function buildWeekTagFromWeekStart(weekStart) {
  return String(weekStart || "").trim();
}

function emptyRow() {
  return {
    employeeId: "",
    mon: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    tue: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    wed: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    thu: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    fri: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    sat: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    sun: [
      { start: "", end: "" },
      { start: "", end: "" },
    ],
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
  type = "button",
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
  };

  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function SummaryMetric({ label, value, accent = "#1769aa" }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 15,
        padding: "13px 15px",
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
          fontSize: 23,
          fontWeight: 900,
          color: accent,
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [airlineKey, setAirlineKey] = useState("");
  const [airlineDisplayName, setAirlineDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [weekStart, setWeekStart] = useState("");

  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([emptyRow()]);
  const [airlineBudgets, setAirlineBudgets] = useState({});
  const [blockedByEmployee, setBlockedByEmployee] = useState({});
  const [statusMessage, setStatusMessage] = useState("");

  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [loadedExistingSchedule, setLoadedExistingSchedule] = useState(false);

  const dayNumbers = useMemo(() => buildDayNumbers(weekStart), [weekStart]);

  const effectiveAirlineDisplayName = useMemo(
    () => getEffectiveAirlineDisplayName(airlineKey, airlineDisplayName),
    [airlineKey, airlineDisplayName]
  );

  const themeColor = useMemo(
    () => getThemeColor(airlineKey, airlineDisplayName),
    [airlineKey, airlineDisplayName]
  );

  const isErrorStatus =
    statusMessage.toLowerCase().includes("error") ||
    statusMessage.toLowerCase().includes("please") ||
    statusMessage.toLowerCase().includes("conflict") ||
    statusMessage.toLowerCase().includes("red flag");

  useEffect(() => {
    const incoming =
      location.state?.returnedSchedule ||
      location.state?.editSchedule ||
      location.state?.schedule ||
      location.state?.template ||
      null;

    if (!incoming) return;

    const resolvedAirline = normalizeAirlineName(
      incoming.airlineDisplayName || incoming.airline || ""
    );

    const resolvedWeekStart =
      normalizeDateString(incoming.weekStart) ||
      normalizeDateString(incoming.weekTag) ||
      weekStartFromDays(incoming.days);

    if (incoming.id) {
      setEditingScheduleId(incoming.id);
      setLoadedExistingSchedule(true);
    }

    if (resolvedAirline) {
      setAirlineKey(
        normalizeAirlineName(incoming.airline || resolvedAirline)
      );
      setAirlineDisplayName(
        incoming.airlineDisplayName || resolvedAirline
      );
    }

    if (incoming.department) {
      setDepartment(incoming.department);
    }

    if (resolvedWeekStart) {
      setWeekStart(resolvedWeekStart);
    }

    if (Array.isArray(incoming.grid) && incoming.grid.length) {
      setRows(cloneGrid(incoming.grid));
    } else {
      setRows([emptyRow()]);
    }
  }, [location.state]);

  useEffect(() => {
    async function loadEmployees() {
      const snap = await getDocs(collection(db, "employees"));

      const employeeList = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const nameA = String(
            a.name ||
              a.fullName ||
              a.displayName ||
              a.employeeName ||
              ""
          ).toLowerCase();

          const nameB = String(
            b.name ||
              b.fullName ||
              b.displayName ||
              b.employeeName ||
              ""
          ).toLowerCase();

          return nameA.localeCompare(nameB);
        });

      setEmployees(employeeList);
    }

    loadEmployees().catch((err) => {
      console.error(err);
      setStatusMessage("Error loading employees.");
    });
  }, []);

  useEffect(() => {
    async function loadBudgets() {
      const snap = await getDocs(collection(db, "airlineBudgets"));
      const map = {};

      snap.docs.forEach((d) => {
        const data = d.data();
        const airline = normalizeAirlineName(data.airline);
        const dept = normalizeDepartmentName(data.department);
        const start = String(data.weekStart || "").trim();

        if (!airline || !dept || !start) return;

        map[`${airline}__${dept}__${start}`] = Number(
          data.budgetHours || 0
        );
      });

      setAirlineBudgets(map);
    }

    loadBudgets().catch((err) => {
      console.error(err);
      setStatusMessage("Error loading budgets.");
    });
  }, []);

  useEffect(() => {
    async function loadRestrictions() {
      try {
        const snap = await getDocs(collection(db, "restrictions"));
        const byEmp = {};

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const empId = data.employeeId || data.employee_id;
          const startStr = data.start_date || data.startDate;
          const endStr = data.end_date || data.endDate || startStr;

          if (!empId || !startStr) return;

          const start = new Date(`${startStr}T00:00:00`);
          const end = new Date(`${endStr}T00:00:00`);

          if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime())
          ) {
            return;
          }

          let current = new Date(start);

          while (current <= end) {
            const dateKey = `${current.getFullYear()}-${String(
              current.getMonth() + 1
            ).padStart(2, "0")}-${String(current.getDate()).padStart(
              2,
              "0"
            )}`;

            if (!byEmp[empId]) byEmp[empId] = {};
            byEmp[empId][dateKey] = true;

            current.setDate(current.getDate() + 1);
          }
        });

        setBlockedByEmployee(byEmp);
      } catch (err) {
        console.error("Error loading restrictions:", err);
      }
    }

    loadRestrictions();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setRows([emptyRow()]);
    }
  }, [rows.length]);

  const blockedByEmployeeForSelectedWeek = useMemo(() => {
    if (!weekStart) return {};

    const weekDates = {};

    DAY_KEYS.forEach((key, index) => {
      const base = new Date(`${weekStart}T00:00:00`);
      if (Number.isNaN(base.getTime())) return;

      const d = new Date(base);
      d.setDate(base.getDate() + index);

      weekDates[key] = `${d.getFullYear()}-${String(
        d.getMonth() + 1
      ).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });

    const mapped = {};

    Object.keys(blockedByEmployee).forEach((empId) => {
      DAY_KEYS.forEach((dayKey) => {
        const actualDate = weekDates[dayKey];
        if (!actualDate) return;

        if (blockedByEmployee[empId]?.[actualDate]) {
          if (!mapped[empId]) mapped[empId] = {};
          mapped[empId][dayKey] = true;
        }
      });
    });

    return mapped;
  }, [blockedByEmployee, weekStart]);

  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;

    const s = toMinutes(start);
    const eRaw = toMinutes(end);

    if (s == null || eRaw == null) return 0;

    let e = eRaw;
    if (e < s) e += 24 * 60;

    let hours = (e - s) / 60;

    if (hours > 6 + 1 / 60) {
      hours -= 0.5;
    }

    return hours;
  };

  const calculateTotals = () => {
    let airlineTotal = 0;
    const employeeTotals = {};

    const dailyTotals = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };

    rows.forEach((r) => {
      let employeeWeekly = 0;

      DAY_KEYS.forEach((dKey) => {
        let employeeDay = 0;

        (r[dKey] || []).forEach((shift) => {
          const h = diffHours(shift.start, shift.end);
          employeeDay += h;
        });

        dailyTotals[dKey] += employeeDay;
        employeeWeekly += employeeDay;
      });

      if (r.employeeId) {
        employeeTotals[r.employeeId] = employeeWeekly;
      }

      airlineTotal += employeeWeekly;
    });

    return {
      employeeTotals,
      airlineTotal,
      dailyTotals,
    };
  };

  const calculateDailyHeadcount = () => {
    const dailyHeadcount = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };

    DAY_KEYS.forEach((dayKey) => {
      let count = 0;

      rows.forEach((row) => {
        const hasShift = (row[dayKey] || []).some(
          (shift) =>
            shift.start &&
            shift.end &&
            shift.start !== "OFF" &&
            shift.end !== "OFF"
        );

        if (row.employeeId && hasShift) {
          count += 1;
        }
      });

      dailyHeadcount[dayKey] = count;
    });

    return dailyHeadcount;
  };

  const { employeeTotals, airlineTotal, dailyTotals } =
    calculateTotals();

  const dailyHeadcount = useMemo(
    () => calculateDailyHeadcount(),
    [rows]
  );

  const budgetKey = `${normalizeAirlineName(
    airlineKey
  )}__${normalizeDepartmentName(department)}__${String(
    weekStart || ""
  ).trim()}`;

  const selectedWeeklyBudget = airlineBudgets[budgetKey] || 0;

  const checkConflictsWithOtherAirlines = async () => {
    const weekTag = buildWeekTagFromWeekStart(weekStart).trim();

    if (!weekTag) {
      return {
        conflicts: [],
        weekTag: null,
      };
    }

    const q = query(
      collection(db, "schedules"),
      where("weekTag", "==", weekTag)
    );

    const snap = await getDocs(q);

    const existingSchedules = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .filter((sch) => sch.id !== editingScheduleId);

    if (!existingSchedules.length) {
      return {
        conflicts: [],
        weekTag,
      };
    }

    const empMap = {};

    employees.forEach((e) => {
      empMap[e.id] =
        e.name ||
        e.fullName ||
        e.displayName ||
        e.employeeName ||
        "Unknown";
    });

    const conflicts = [];

    existingSchedules.forEach((sch) => {
      DAY_KEYS.forEach((dayKey) => {
        (sch.grid || []).forEach((oldRow) => {
          (rows || []).forEach((newRow) => {
            if (
              !newRow.employeeId ||
              newRow.employeeId !== oldRow.employeeId
            ) {
              return;
            }

            const oldShifts = oldRow[dayKey] || [];
            const newShifts = newRow[dayKey] || [];

            oldShifts.forEach((os) => {
              newShifts.forEach((ns) => {
                if (
                  !os.start ||
                  !ns.start ||
                  os.start === "OFF" ||
                  ns.start === "OFF"
                ) {
                  return;
                }

                if (
                  intervalsOverlap(
                    os.start,
                    os.end,
                    ns.start,
                    ns.end
                  )
                ) {
                  conflicts.push({
                    employeeName:
                      empMap[newRow.employeeId] || "Unknown",
                    dayKey,
                    newShift: ns,
                    existingShift: os,
                    otherAirline:
                      sch.airlineDisplayName || sch.airline,
                    otherDept: sch.department,
                  });
                }
              });
            });
          });
        });
      });
    });

    return {
      conflicts,
      weekTag,
    };
  };

  const buildSchedulePayload = (status, weekTagToSave) => ({
    airline: normalizeAirlineName(airlineKey),
    airlineDisplayName: effectiveAirlineDisplayName,
    department,
    weekStart,
    days: dayNumbers,
    weekTag: weekTagToSave,
    grid: rows,
    totals: employeeTotals,
    airlineWeeklyHours: airlineTotal,
    airlineDailyHours: dailyTotals,
    airlineDailyHeadcount: dailyHeadcount,
    budget: selectedWeeklyBudget,
    status,
    createdBy: user?.username || null,
    role: user?.role || null,
    updatedAt: serverTimestamp(),
  });

  const handleSaveDraft = async () => {
    if (!airlineKey || !department || !weekStart) {
      setStatusMessage(
        "Please select airline, department and week start."
      );
      return;
    }

    try {
      const weekTagToSave = buildWeekTagFromWeekStart(weekStart);
      const payload = buildSchedulePayload(
        "draft",
        weekTagToSave
      );

      if (editingScheduleId) {
        await updateDoc(
          doc(db, "schedules", editingScheduleId),
          payload
        );

        setStatusMessage(
          "Schedule draft updated successfully."
        );
      } else {
        const ref = await addDoc(collection(db, "schedules"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        setEditingScheduleId(ref.id);
        setLoadedExistingSchedule(true);
        setStatusMessage("Schedule saved as draft.");
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Error saving draft.");
    }
  };

  const handleSaveSchedule = async () => {
    if (!airlineKey || !department || !weekStart) {
      setStatusMessage(
        "Please select airline, department and week start."
      );
      return;
    }

    const { conflicts, weekTag } =
      await checkConflictsWithOtherAirlines();

    if (conflicts.length > 0) {
      const previewLines = conflicts.slice(0, 6).map((c) => {
        const dayLabel =
          DAY_LABELS[c.dayKey] ||
          c.dayKey.toUpperCase();

        return `- ${c.employeeName} | ${dayLabel} | ${c.newShift.start}\u2013${c.newShift.end} (already on ${c.otherAirline} \u2014 ${c.otherDept} ${c.existingShift.start}\u2013${c.existingShift.end})`;
      });

      const extra =
        conflicts.length > 6
          ? `\n...and ${conflicts.length - 6} more conflicts.`
          : "";

      const proceed = window.confirm(
        "RED FLAG \u2014 Employee double assigned in another airline for the same day / time.\n\n" +
          previewLines.join("\n") +
          extra +
          "\n\nDo you still want to submit this schedule?"
      );

      if (!proceed) return;
    }

    try {
      const weekTagToSave =
        weekTag || buildWeekTagFromWeekStart(weekStart);

      const payload = buildSchedulePayload(
        "pending",
        weekTagToSave
      );

      if (editingScheduleId) {
        await updateDoc(
          doc(db, "schedules", editingScheduleId),
          payload
        );

        setStatusMessage(
          "Schedule re-submitted for approval."
        );
      } else {
        const ref = await addDoc(collection(db, "schedules"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        setEditingScheduleId(ref.id);
        setLoadedExistingSchedule(true);

        setStatusMessage(
          "Schedule submitted for approval."
        );
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Error submitting schedule.");
    }
  };

  const exportPDF = async () => {
    const container = document.getElementById(
      "schedule-print-area"
    );

    if (!container) {
      alert("Printable area not found.");
      return;
    }

    const airlineLogoUrl = getAirlineLogo(
      airlineKey,
      airlineDisplayName
    );

    const appLogoUrl = `${window.location.origin}/icons/aerostation-icon.png`;

    const [airlineLogoImg, appLogoImg] = await Promise.all([
      airlineLogoUrl ? loadImage(airlineLogoUrl) : Promise.resolve(null),
      loadImage(appLogoUrl),
    ]);

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFFFFF",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setProperties({
      title: `${APP_NAME} - Weekly Schedule`,
      subject: `${effectiveAirlineDisplayName || airlineKey || "Airline"} ${
        department || ""
      } Weekly Schedule`,
      creator: APP_NAME,
    });

    let headerY = 20;

    if (appLogoImg) {
      pdf.addImage(appLogoImg, "PNG", 20, headerY, 48, 48);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text(APP_NAME, 78, 39);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(APP_SUBTITLE, 78, 54);

    if (airlineLogoImg) {
      pdf.addImage(
        airlineLogoImg,
        "PNG",
        pageWidth - 170,
        headerY,
        150,
        55
      );
    }

    const imgData = canvas.toDataURL("image/png");
    const yOffset = 88;
    const imgWidth = pageWidth - 40;
    const imgHeight =
      (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(
      imgData,
      "PNG",
      20,
      yOffset,
      imgWidth,
      imgHeight
    );

    const safeAirline = (
      effectiveAirlineDisplayName ||
      airlineKey ||
      "AIRLINE"
    )
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");

    const safeDept = (department || "DEPT").replace(/\s+/g, "_");
    const safeWeek = (weekStart || "week").replace(/[^\d-]/g, "");

    pdf.save(
      `Schedule_${safeAirline}_${safeDept}_${safeWeek}.pdf`
    );
  };

  const employeeNameMap = {};

  employees.forEach((e) => {
    employeeNameMap[e.id] =
      e.name ||
      e.fullName ||
      e.displayName ||
      e.employeeName ||
      "Unknown";
  });

  const canEditAirlineName =
    normalizeAirlineName(airlineKey) === "WestJet" ||
    normalizeAirlineName(airlineKey) === "OTHER";

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
          background: buildHeroGradient(themeColor),
          borderRadius: 18,
          padding: "14px 16px",
          color: "#fff",
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
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                flex: "0 0 42px",
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
                  fontSize: 8.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.72)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Scheduling
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                {loadedExistingSchedule
                  ? "Edit Weekly Schedule"
                  : "Create Weekly Schedule"}
              </h1>

              <p
                style={{
                  margin: "4px 0 0",
                  maxWidth: 720,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {loadedExistingSchedule
                  ? `${APP_SUBTITLE} \u00B7 Continue working on the existing schedule, then save or re-submit it for approval.`
                  : `${APP_SUBTITLE} \u00B7 Build, review, save, submit or export a weekly schedule.`}
              </p>

              {(effectiveAirlineDisplayName || department || weekStart) && (
                <div
                  style={{
                    marginTop: 7,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {effectiveAirlineDisplayName && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.14)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        fontSize: 9.5,
                        fontWeight: 800,
                      }}
                    >
                      {effectiveAirlineDisplayName}
                    </span>
                  )}

                  {department && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.14)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        fontSize: 9.5,
                        fontWeight: 800,
                      }}
                    >
                      {department}
                    </span>
                  )}

                  {weekStart && (
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.14)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        fontSize: 9.5,
                        fontWeight: 800,
                      }}
                    >
                      Week of {weekStart}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => navigate("/dashboard")}
          >
            {"\u2190"} Back to Dashboard
          </ActionButton>
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

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Schedule Setup
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: "#64748b",
            }}
          >
            Select airline, department and week start before assigning shifts.
          </p>
        </div>

        {editingScheduleId && (
          <div
            style={{
              marginBottom: 14,
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#1769aa",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            Editing existing schedule: <b>{editingScheduleId}</b>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 13,
          }}
        >
          <div>
            <FieldLabel>Airline</FieldLabel>

            <SelectInput
              value={airlineKey}
              onChange={(e) => {
                const normalizedKey = normalizeAirlineName(
                  e.target.value
                );

                setAirlineKey(normalizedKey);

                if (normalizedKey === "OTHER") {
                  setAirlineDisplayName("");
                } else {
                  setAirlineDisplayName(normalizedKey);
                }
              }}
            >
              <option value="">Select airline</option>
              <option value="SY">SY</option>
              <option value="WestJet">WestJet</option>
              <option value="WL Invicta">WL Invicta</option>
              <option value="AV">AV</option>
              <option value="EA">EA</option>
              <option value="WCHR">WCHR</option>
              <option value="CABIN">Cabin Service</option>
              <option value="AA-BSO">AA-BSO</option>
              <option value="OTHER">Other</option>
            </SelectInput>

            <div style={{ marginTop: 11 }}>
              <FieldLabel>
                Airline display name{" "}
                {canEditAirlineName ? "(editable)" : "(locked)"}
              </FieldLabel>

              <TextInput
                value={airlineDisplayName}
                disabled={!canEditAirlineName}
                onChange={(e) => {
                  const rawValue = e.target.value;

                  setAirlineDisplayName(
                    normalizeAirlineName(airlineKey) === "OTHER"
                      ? normalizeCustomOtherAirline(rawValue)
                      : rawValue
                  );
                }}
                placeholder={
                  normalizeAirlineName(airlineKey) === "OTHER"
                    ? "Example: AM or AMS"
                    : "Example: WestJet"
                }
                style={{
                  background: canEditAirlineName ? "#fff" : "#f8fafc",
                  color: canEditAirlineName ? "#0f172a" : "#64748b",
                  border:
                    normalizeAirlineName(airlineKey) === "OTHER" &&
                    effectiveAirlineDisplayName !== "OTHER" &&
                    effectiveAirlineDisplayName !== ""
                      ? `2px solid ${themeColor}`
                      : "1px solid #dbeafe",
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>

            <SelectInput
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Select department</option>
              <option value="Ramp">Ramp</option>
              <option value="TC">Ticket Counter</option>
              <option value="BSO">BSO</option>
              <option value="Cabin Service">Cabin Service</option>
              <option value="WCHR">WCHR</option>
              <option value="Other">Other</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Week Start</FieldLabel>

            <TextInput
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 17 }}>
          <FieldLabel>Week Dates</FieldLabel>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(70px, 1fr))",
              gap: 9,
              overflowX: "auto",
            }}
          >
            {DAY_KEYS.map((key) => (
              <div key={key} style={{ minWidth: 72 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 5,
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#475569",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {DAY_LABELS[key]}
                </label>

                <TextInput
                  value={dayNumbers[key]}
                  disabled
                  style={{
                    textAlign: "center",
                    padding: "9px 7px",
                    background: "#f8fafc",
                    color: "#475569",
                    fontWeight: 700,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </PageCard>

      <div id="schedule-print-area">
        <ScheduleGrid
          employees={employees}
          dayNumbers={dayNumbers}
          rows={rows}
          setRows={setRows}
          airline={effectiveAirlineDisplayName}
          airlineKey={airlineKey}
          airlineDisplayName={effectiveAirlineDisplayName}
          airlineThemeColor={themeColor}
          department={department}
          onSave={handleSaveSchedule}
          onSaveDraft={handleSaveDraft}
          blockedByEmployee={blockedByEmployeeForSelectedWeek}
          dailyHeadcount={dailyHeadcount}
        />
      </div>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Weekly Summary
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: "#64748b",
            }}
          >
            Review total hours, daily totals and weekly employee hours before
            exporting or submitting.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 11,
            marginBottom: 17,
          }}
        >
          <SummaryMetric
            label="Total Hours"
            value={airlineTotal.toFixed(2)}
            accent={themeColor}
          />

          <SummaryMetric
            label="Weekly Budget"
            value={Number(selectedWeeklyBudget || 0).toFixed(2)}
          />
        </div>

        <div style={{ marginBottom: 17 }}>
          <h3
            style={{
              margin: "0 0 9px",
              fontSize: 12,
              fontWeight: 800,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Daily Hours (All employees)
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 9,
            }}
          >
            {DAY_KEYS.map((dKey) => (
              <div
                key={dKey}
                style={{
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  borderRadius: 13,
                  padding: "11px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {DAY_LABELS[dKey]} {dayNumbers[dKey]}
                </div>

                <div
                  style={{
                    marginTop: 5,
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {dailyTotals[dKey].toFixed(2)} hrs
                </div>

                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#1769aa",
                  }}
                >
                  Headcount: {dailyHeadcount[dKey] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3
            style={{
              margin: "0 0 9px",
              fontSize: 12,
              fontWeight: 800,
              color: "#0f172a",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Employee Weekly Hours
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 9,
            }}
          >
            {rows.map((r, idx) => {
              if (!r.employeeId) return null;

              const total = employeeTotals[r.employeeId] || 0;
              const over = total > 40;
              const name =
                employeeNameMap[r.employeeId] || "Unknown";

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderRadius: 13,
                    padding: "11px 13px",
                    background: over ? "#fff1f2" : "#f8fbff",
                    border: `1px solid ${
                      over ? "#fecdd3" : "#dbeafe"
                    }`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: over ? "#9f1239" : "#0f172a",
                    }}
                  >
                    {name}
                  </span>

                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: over ? "#9f1239" : "#0f172a",
                    }}
                  >
                    {total.toFixed(2)} hrs
                  </span>
                </div>
              );
            })}
          </div>

          <p
            style={{
              marginTop: 9,
              marginBottom: 0,
              fontSize: 11.5,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Employees with more than 40 hours in this schedule are highlighted
            in red.
          </p>
        </div>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            {loadedExistingSchedule
              ? "Existing schedule loaded"
              : "New weekly schedule"}
            {weekStart ? ` \u00B7 Week of ${weekStart}` : ""}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <ActionButton
              onClick={handleSaveDraft}
              variant="secondary"
            >
              {editingScheduleId ? "Update Draft" : "Save Draft"}
            </ActionButton>

            <ActionButton
              onClick={handleSaveSchedule}
              variant="primary"
            >
              {editingScheduleId
                ? "Re-Submit for Approval"
                : "Submit for Approval"}
            </ActionButton>

            <ActionButton
              onClick={exportPDF}
              variant="success"
            >
              Export PDF
            </ActionButton>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
