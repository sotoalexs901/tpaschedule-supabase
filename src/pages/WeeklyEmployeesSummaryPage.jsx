// src/pages/WeeklyEmployeesSummaryPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ============================================================
// DAY CONFIGURATION
// ============================================================

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

const DAY_FULL = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const CABIN_DAY_TO_SUMMARY_DAY = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

const CABIN_DEPARTMENT = "Cabin Service";

// ============================================================
// NORMALIZATION HELPERS
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeDepartmentName(value) {
  const department = String(value || "").trim();

  if (!department) {
    return "Unknown";
  }

  const upper = department.toUpperCase();

  if (
    upper === "CABIN SERVICE" ||
    upper === "DL CABIN SERVICE" ||
    upper === "CABIN" ||
    upper.includes("CABIN SERVICE")
  ) {
    return CABIN_DEPARTMENT;
  }

  return department;
}

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();
  const upper = airline.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA"
  ) {
    return "World Atlantic";
  }

  if (upper === "WESTJET") {
    return "WestJet";
  }

  if (
    upper === "CABIN SERVICE" ||
    upper === "DL CABIN SERVICE" ||
    upper === "CABIN"
  ) {
    return CABIN_DEPARTMENT;
  }

  return airline || "Unknown";
}

function isCabinDepartment(value) {
  const normalized = normalizeText(value);

  return (
    normalized === "cabin" ||
    normalized === "cabin service" ||
    normalized === "dl cabin service" ||
    normalized.includes("cabin service")
  );
}

// ============================================================
// EMPLOYEE HELPERS
// ============================================================

function getEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.employeeName ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.username ||
    employee?.loginUsername ||
    "Unknown Employee"
  );
}

function getEmployeeDepartment(employee) {
  return normalizeDepartmentName(
    employee?.department ||
      employee?.departmentName ||
      employee?.dept ||
      ""
  );
}

// ============================================================
// TIME HELPERS
// ============================================================

function toMinutes(value) {
  if (!value) return null;

  const parts = String(value).split(":");

  if (parts.length < 2) {
    return null;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function getBreakMinutes(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase();

  if (!clean || clean === "no") {
    return 0;
  }

  if (clean === "yes" || clean.includes("30")) {
    return 30;
  }

  if (clean.includes("45")) {
    return 45;
  }

  if (clean.includes("60")) {
    return 60;
  }

  return 0;
}

// ============================================================
// ACTUAL / WORKED HOURS
// ============================================================

function calculateActualHours(row) {
  const start = toMinutes(row?.punchIn);
  const endRaw = toMinutes(row?.punchOut);

  if (start == null || endRaw == null) {
    return 0;
  }

  let end = endRaw;

  if (end <= start) {
    end += 24 * 60;
  }

  const workedMinutes =
    end - start - getBreakMinutes(row?.breakTaken);

  return Math.max(0, workedMinutes) / 60;
}

// ============================================================
// REGULAR SCHEDULE HOURS
// ============================================================

function calculateScheduledShiftHours(shift) {
  if (
    !shift?.start ||
    !shift?.end ||
    String(shift.start).toUpperCase() === "OFF"
  ) {
    return 0;
  }

  const start = toMinutes(shift.start);
  const endRaw = toMinutes(shift.end);

  if (start == null || endRaw == null) {
    return 0;
  }

  let end = endRaw;

  if (end <= start) {
    end += 24 * 60;
  }

  let minutes = end - start;

  // Same paid-hours rule used by Cabin:
  // deduct 30 minutes when shift is longer than 6 hours.
  if (minutes >= 361) {
    minutes -= 30;
  }

  return Math.max(0, minutes) / 60;
}

function calculateScheduledDayHours(row, dayKey) {
  const shifts = Array.isArray(row?.[dayKey])
    ? row[dayKey]
    : [];

  return shifts.reduce(
    (sum, shift) =>
      sum + calculateScheduledShiftHours(shift),
    0
  );
}

// ============================================================
// CABIN HOURS
// ============================================================

function calculateCabinSlotHours(slot) {
  const storedPaidHours = Number(slot?.paidHours);

  if (
    Number.isFinite(storedPaidHours) &&
    storedPaidHours >= 0 &&
    String(slot?.paidHours ?? "").trim() !== ""
  ) {
    return storedPaidHours;
  }

  const start = toMinutes(slot?.start);
  const endRaw = toMinutes(slot?.end);

  if (start == null || endRaw == null) {
    return 0;
  }

  let end = endRaw;

  if (end <= start) {
    end += 24 * 60;
  }

  let minutes = end - start;

  if (minutes >= 361) {
    minutes -= 30;
  }

  return Math.max(0, minutes) / 60;
}

// ============================================================
// DATE HELPERS
// ============================================================

function dateKey(date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}

function buildWeekDates(weekTag, schedules) {
  const sample = schedules[0];

  const startValue = String(
    sample?.weekStart ||
      sample?.weekStartDate ||
      weekTag ||
      ""
  ).trim();

  const result = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startValue)) {
    DAY_KEYS.forEach((key) => {
      result[key] = "";
    });

    return result;
  }

  const baseDate = new Date(`${startValue}T00:00:00`);

  DAY_KEYS.forEach((key, index) => {
    const currentDate = new Date(baseDate);

    currentDate.setDate(baseDate.getDate() + index);

    result[key] = dateKey(currentDate);
  });

  return result;
}

function getCabinScheduleWeek(schedule) {
  return String(
    schedule?.weekStartDate ||
      schedule?.weekStart ||
      schedule?.weekTag ||
      ""
  ).trim();
}

// ============================================================
// UI COMPONENTS
// ============================================================

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow:
          "0 18px 42px rgba(15,23,42,0.06)",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
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
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function SummaryCard({
  label,
  value,
  subValue,
  alert = false,
}) {
  return (
    <div
      style={{
        background: alert ? "#fff1f2" : "#f8fbff",
        border: alert
          ? "1px solid #fecdd3"
          : "1px solid #dbeafe",
        borderRadius: 16,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: alert ? "#9f1239" : "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 27,
          fontWeight: 900,
          color: alert ? "#9f1239" : "#0f172a",
        }}
      >
        {value}
      </div>

      {subValue && (
        <div
          style={{
            marginTop: 7,
            fontSize: 12,
            color: alert ? "#be123c" : "#64748b",
          }}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone = "blue" }) {
  const colors = {
    blue: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    green: ["#ecfdf5", "#047857", "#a7f3d0"],
    amber: ["#fffbeb", "#b45309", "#fde68a"],
    red: ["#fff1f2", "#be123c", "#fecdd3"],
    gray: ["#f8fafc", "#475569", "#e2e8f0"],
    purple: ["#faf5ff", "#7e22ce", "#e9d5ff"],
  };

  const [background, color, border] =
    colors[tone] || colors.blue;

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "6px 9px",
        borderRadius: 999,
        background,
        color,
        border: `1px solid ${border}`,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function WeeklyEmployeesSummaryPage() {
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [timesheets, setTimesheets] = useState([]);

  // NEW:
  // Cabin schedules and their individual assigned slots.
  const [cabinSchedules, setCabinSchedules] = useState([]);
  const [cabinSlots, setCabinSlots] = useState([]);

  const [selectedWeekTag, setSelectedWeekTag] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("approved");

  // Employee whose detailed report is currently expanded.
  const [expandedEmployeeId, setExpandedEmployeeId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================================
  // LOAD FIRESTORE DATA
  // ==========================================================

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const [
          employeeSnapshot,
          scheduleSnapshot,
          timesheetSnapshot,
          cabinScheduleSnapshot,
          cabinSlotSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "schedules")),
          getDocs(collection(db, "timesheet_reports")),
          getDocs(collection(db, "cabinSchedules")),
          getDocs(collection(db, "cabinScheduleSlots")),
        ]);

        setEmployees(
          employeeSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );

        setSchedules(
          scheduleSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );

        setTimesheets(
          timesheetSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );

        setCabinSchedules(
          cabinScheduleSnapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          }))
        );

        setCabinSlots(
          cabinSlotSnapshot.docs.map((document) => ({
            firestoreId: document.id,
            ...document.data(),
          }))
        );
      } catch (loadError) {
        console.error(
          "Error loading weekly summary:",
          loadError
        );

        setError(
          "Could not load weekly summary data."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ==========================================================
  // REGULAR SCHEDULE STATUS
  // ==========================================================

  const scheduleMatchesStatus = (schedule) => {
    const status = String(schedule?.status || "")
      .trim()
      .toLowerCase();

    if (statusFilter === "both") {
      return (
        status === "approved" ||
        status === "draft"
      );
    }

    return status === statusFilter;
  };

  // ==========================================================
  // CABIN SCHEDULE STATUS
  // ==========================================================

  const cabinScheduleMatchesStatus = (schedule) => {
    const status = String(schedule?.status || "draft")
      .trim()
      .toLowerCase();

    if (statusFilter === "both") {
      return (
        status === "approved" ||
        status === "draft"
      );
    }

    return status === statusFilter;
  };

  // ==========================================================
  // AVAILABLE WEEKS
  // ==========================================================

  const weekTags = useMemo(() => {
    const regularWeeks = schedules
      .filter(scheduleMatchesStatus)
      .filter((schedule) => {
        const department =
          schedule?.department ||
          schedule?.departmentName ||
          schedule?.airlineDisplayName ||
          schedule?.airline ||
          "";

        // Cabin must never be taken from the old schedule
        // collection. Cabin has its own schedule source now.
        return !isCabinDepartment(department);
      })
      .map(
        (schedule) =>
          schedule.weekTag ||
          schedule.weekStart
      )
      .filter(Boolean);

    const cabinWeeks = cabinSchedules
      .filter(cabinScheduleMatchesStatus)
      .map(getCabinScheduleWeek)
      .filter(Boolean);

    return Array.from(
      new Set([...regularWeeks, ...cabinWeeks])
    ).sort((a, b) =>
      String(b).localeCompare(String(a))
    );
  }, [
    schedules,
    cabinSchedules,
    statusFilter,
  ]);

  useEffect(() => {
    if (!weekTags.length) {
      setSelectedWeekTag("");
      return;
    }

    if (!weekTags.includes(selectedWeekTag)) {
      setSelectedWeekTag(weekTags[0]);
    }
  }, [weekTags, selectedWeekTag]);

  // ==========================================================
  // REGULAR SCHEDULES FOR SELECTED WEEK
  // ==========================================================

  const selectedWeekSchedules = useMemo(() => {
    if (!selectedWeekTag) {
      return [];
    }

    return schedules.filter((schedule) => {
      const scheduleWeek =
        schedule.weekTag || schedule.weekStart;

      const department =
        schedule?.department ||
        schedule?.departmentName ||
        schedule?.airlineDisplayName ||
        schedule?.airline ||
        "";

      return (
        scheduleWeek === selectedWeekTag &&
        scheduleMatchesStatus(schedule) &&
        !isCabinDepartment(department)
      );
    });
  }, [
    schedules,
    selectedWeekTag,
    statusFilter,
  ]);

  // ==========================================================
  // CABIN SCHEDULES FOR SELECTED WEEK
  // ==========================================================

  const selectedCabinSchedules = useMemo(() => {
    if (!selectedWeekTag) {
      return [];
    }

    return cabinSchedules.filter((schedule) => {
      return (
        getCabinScheduleWeek(schedule) ===
          selectedWeekTag &&
        cabinScheduleMatchesStatus(schedule)
      );
    });
  }, [
    cabinSchedules,
    selectedWeekTag,
    statusFilter,
  ]);

  const selectedCabinScheduleIds = useMemo(() => {
    return new Set(
      selectedCabinSchedules.map(
        (schedule) => schedule.id
      )
    );
  }, [selectedCabinSchedules]);

  // Only slots belonging to the selected Cabin week.
  const selectedCabinSlots = useMemo(() => {
    if (!selectedCabinScheduleIds.size) {
      return [];
    }

    return cabinSlots.filter((slot) => {
      if (
        !selectedCabinScheduleIds.has(
          slot?.scheduleId
        )
      ) {
        return false;
      }

      // Delete candidates are not real assignments.
      if (slot?.draftDeleteCandidate) {
        return false;
      }

      // Open slots must not count toward an employee.
      if (
        !String(slot?.employeeId || "").trim() &&
        !String(slot?.employeeName || "").trim()
      ) {
        return false;
      }

      return true;
    });
  }, [
    cabinSlots,
    selectedCabinScheduleIds,
  ]);

  // ==========================================================
  // WEEK DATES
  // ==========================================================

  const weekDates = useMemo(() => {
    const schedulesForDate =
      selectedWeekSchedules.length > 0
        ? selectedWeekSchedules
        : selectedCabinSchedules;

    return buildWeekDates(
      selectedWeekTag,
      schedulesForDate
    );
  }, [
    selectedWeekTag,
    selectedWeekSchedules,
    selectedCabinSchedules,
  ]);

  // ==========================================================
  // EMPLOYEE LOOKUP
  // ==========================================================

  const employeeLookup = useMemo(() => {
    const byId = {};
    const byName = {};

    employees.forEach((employee) => {
      byId[employee.id] = employee;

      const employeeName = normalizeText(
        getEmployeeName(employee)
      );

      if (employeeName) {
        byName[employeeName] = employee;
      }

      [
        employee?.username,
        employee?.loginUsername,
        employee?.email,
        employee?.displayName,
        employee?.fullName,
        employee?.employeeName,
        employee?.name,
      ]
        .map(normalizeText)
        .filter(Boolean)
        .forEach((key) => {
          if (!byName[key]) {
            byName[key] = employee;
          }
        });
    });

    return {
      byId,
      byName,
    };
  }, [employees]);

  // ==========================================================
  // APPROVED TIMESHEETS FOR WEEK
  // ==========================================================

  const approvedTimesheetsForWeek = useMemo(() => {
    const validDates = new Set(
      Object.values(weekDates).filter(Boolean)
    );

    return timesheets.filter((report) => {
      const status = String(report?.status || "")
        .trim()
        .toLowerCase();

      const reportDate = String(
        report?.reportDate || ""
      ).trim();

      return (
        status === "approved" &&
        validDates.has(reportDate)
      );
    });
  }, [timesheets, weekDates]);
    // ==========================================================
  // WEEKLY DATA BY EMPLOYEE
  // ==========================================================

  const employeeWeeklyData = useMemo(() => {
    const result = {};

    // --------------------------------------------------------
    // ENSURE EMPLOYEE
    // --------------------------------------------------------

    const ensureEmployee = (
      employeeId,
      fallbackName = ""
    ) => {
      const employeeRecord =
        employeeLookup.byId[employeeId] || null;

      const employeeName = employeeRecord
        ? getEmployeeName(employeeRecord)
        : fallbackName || "Unknown Employee";

      const employeeDepartment = employeeRecord
        ? getEmployeeDepartment(employeeRecord)
        : "Unknown";

      if (!result[employeeId]) {
        result[employeeId] = {
          employeeId,
          employeeName,
          employeeDepartment,

          days: DAY_KEYS.reduce(
            (accumulator, dayKey) => {
              accumulator[dayKey] = {
                date: weekDates[dayKey] || "",

                scheduledByDepartment: {},
                actualByDepartment: {},

                scheduledTotal: 0,
                actualTotal: 0,
              };

              return accumulator;
            },
            {}
          ),

          scheduledByDepartment: {},
          actualByDepartment: {},

          scheduledTotal: 0,
          actualTotal: 0,

          daysOff: 0,
        };
      }

      return result[employeeId];
    };

    // --------------------------------------------------------
    // HELPER: ADD SCHEDULED HOURS
    // --------------------------------------------------------

    const addScheduledHours = ({
      employeeId,
      employeeName = "",
      dayKey,
      department,
      hours,
    }) => {
      if (!employeeId || !dayKey || hours <= 0) {
        return;
      }

      const employeeData = ensureEmployee(
        employeeId,
        employeeName
      );

      const normalizedDepartment =
        normalizeDepartmentName(department);

      employeeData.days[
        dayKey
      ].scheduledByDepartment[
        normalizedDepartment
      ] =
        (employeeData.days[dayKey]
          .scheduledByDepartment[
            normalizedDepartment
          ] || 0) + hours;

      employeeData.days[
        dayKey
      ].scheduledTotal += hours;

      employeeData.scheduledByDepartment[
        normalizedDepartment
      ] =
        (employeeData.scheduledByDepartment[
          normalizedDepartment
        ] || 0) + hours;

      employeeData.scheduledTotal += hours;
    };

    // --------------------------------------------------------
    // HELPER: ADD ACTUAL HOURS
    // --------------------------------------------------------

    const addActualHours = ({
      employeeId,
      employeeName = "",
      dayKey,
      department,
      hours,
    }) => {
      if (!employeeId || !dayKey || hours <= 0) {
        return;
      }

      const employeeData = ensureEmployee(
        employeeId,
        employeeName
      );

      const normalizedDepartment =
        normalizeDepartmentName(department);

      employeeData.days[
        dayKey
      ].actualByDepartment[
        normalizedDepartment
      ] =
        (employeeData.days[dayKey]
          .actualByDepartment[
            normalizedDepartment
          ] || 0) + hours;

      employeeData.days[
        dayKey
      ].actualTotal += hours;

      employeeData.actualByDepartment[
        normalizedDepartment
      ] =
        (employeeData.actualByDepartment[
          normalizedDepartment
        ] || 0) + hours;

      employeeData.actualTotal += hours;
    };

    // ========================================================
    // 1. REGULAR SCHEDULES
    // ========================================================

    selectedWeekSchedules.forEach((schedule) => {
      const department = normalizeDepartmentName(
        schedule?.department ||
          schedule?.departmentName ||
          schedule?.airlineDisplayName ||
          schedule?.airline ||
          "Unknown"
      );

      // Extra protection:
      // Cabin hours must never come from regular schedules.
      if (isCabinDepartment(department)) {
        return;
      }

      const scheduleRows = Array.isArray(
        schedule?.grid
      )
        ? schedule.grid
        : [];

      scheduleRows.forEach((row) => {
        const rowEmployeeId = String(
          row?.employeeId || ""
        ).trim();

        if (!rowEmployeeId) {
          return;
        }

        DAY_KEYS.forEach((dayKey) => {
          const scheduledHours =
            calculateScheduledDayHours(
              row,
              dayKey
            );

          if (scheduledHours <= 0) {
            return;
          }

          addScheduledHours({
            employeeId: rowEmployeeId,
            employeeName:
              row?.employeeName || "",
            dayKey,
            department,
            hours: scheduledHours,
          });
        });
      });
    });

    // ========================================================
    // 2. CABIN SERVICE SCHEDULE
    // ========================================================
    //
    // IMPORTANT:
    // Cabin assigned hours come exclusively from:
    //
    // cabinSchedules
    //        +
    // cabinScheduleSlots
    //
    // paidHours is used when available.
    //
    // ========================================================

    selectedCabinSlots.forEach((slot) => {
      const cabinDayKey =
        CABIN_DAY_TO_SUMMARY_DAY[
          String(slot?.dayKey || "")
            .trim()
            .toLowerCase()
        ];

      if (!cabinDayKey) {
        return;
      }

      const slotEmployeeId = String(
        slot?.employeeId || ""
      ).trim();

      const slotEmployeeName = String(
        slot?.employeeName || ""
      ).trim();

      let employeeId = slotEmployeeId;

      // Some older Cabin slots may contain the
      // employee name but not the Firestore employee ID.
      if (!employeeId && slotEmployeeName) {
        const matchingEmployee =
          employeeLookup.byName[
            normalizeText(slotEmployeeName)
          ] || null;

        employeeId =
          matchingEmployee?.id ||
          `name:${normalizeText(
            slotEmployeeName
          )}`;
      }

      if (!employeeId) {
        return;
      }

      const scheduledHours =
        calculateCabinSlotHours(slot);

      if (scheduledHours <= 0) {
        return;
      }

      addScheduledHours({
        employeeId,
        employeeName: slotEmployeeName,
        dayKey: cabinDayKey,
        department: CABIN_DEPARTMENT,
        hours: scheduledHours,
      });
    });

    // ========================================================
    // 3. APPROVED ACTUAL TIMESHEETS
    // ========================================================

    approvedTimesheetsForWeek.forEach(
      (report) => {
        const reportDate = String(
          report?.reportDate || ""
        ).trim();

        const matchingDayKey = DAY_KEYS.find(
          (dayKey) =>
            weekDates[dayKey] === reportDate
        );

        if (!matchingDayKey) {
          return;
        }

        // ----------------------------------------------------
        // Determine department for actual hours.
        // ----------------------------------------------------

        let reportDepartment =
          report?.department ||
          report?.departmentName ||
          report?.service ||
          report?.airline ||
          "Unknown";

        reportDepartment =
          normalizeDepartmentName(
            normalizeAirlineName(
              reportDepartment
            )
          );

        const rows = Array.isArray(
          report?.rows
        )
          ? report.rows
          : [];

        rows.forEach((row) => {
          const rowEmployeeId = String(
            row?.employeeId || ""
          ).trim();

          const rowEmployeeName = String(
            row?.employeeName || ""
          ).trim();

          let employeeId = rowEmployeeId;

          if (
            !employeeId &&
            rowEmployeeName
          ) {
            const matchingEmployee =
              employeeLookup.byName[
                normalizeText(
                  rowEmployeeName
                )
              ] || null;

            employeeId =
              matchingEmployee?.id ||
              `name:${normalizeText(
                rowEmployeeName
              )}`;
          }

          if (!employeeId) {
            return;
          }

          const actualHours =
            calculateActualHours(row);

          if (actualHours <= 0) {
            return;
          }

          // Row-level department has priority if
          // the timesheet stores it there.
          let actualDepartment =
            row?.department ||
            row?.departmentName ||
            row?.service ||
            reportDepartment;

          actualDepartment =
            normalizeDepartmentName(
              normalizeAirlineName(
                actualDepartment
              )
            );

          addActualHours({
            employeeId,
            employeeName: rowEmployeeName,
            dayKey: matchingDayKey,
            department: actualDepartment,
            hours: actualHours,
          });
        });
      }
    );

    // ========================================================
    // 4. CALCULATE DAYS OFF
    // ========================================================

    Object.values(result).forEach(
      (employeeData) => {
        employeeData.daysOff =
          DAY_KEYS.filter(
            (dayKey) =>
              employeeData.days[dayKey]
                .scheduledTotal <= 0
          ).length;
      }
    );

    // ========================================================
    // 5. RETURN SORTED EMPLOYEES
    // ========================================================

    return Object.values(result)
      .filter(
        (employeeData) =>
          employeeData.scheduledTotal > 0 ||
          employeeData.actualTotal > 0
      )
      .sort((a, b) =>
        a.employeeName.localeCompare(
          b.employeeName,
          undefined,
          {
            sensitivity: "base",
          }
        )
      );
  }, [
    selectedWeekSchedules,
    selectedCabinSlots,
    approvedTimesheetsForWeek,
    employeeLookup,
    weekDates,
  ]);

  // ==========================================================
  // STATION DAILY TOTALS
  // ==========================================================

  const stationDailyTotals = useMemo(() => {
    return DAY_KEYS.reduce(
      (accumulator, dayKey) => {
        accumulator[dayKey] = {
          scheduled:
            employeeWeeklyData.reduce(
              (sum, employee) =>
                sum +
                employee.days[dayKey]
                  .scheduledTotal,
              0
            ),

          actual:
            employeeWeeklyData.reduce(
              (sum, employee) =>
                sum +
                employee.days[dayKey]
                  .actualTotal,
              0
            ),
        };

        return accumulator;
      },
      {}
    );
  }, [employeeWeeklyData]);

  // ==========================================================
  // WEEKLY TOTALS BY DEPARTMENT
  // ==========================================================

  const departmentWeeklyTotals = useMemo(() => {
    const totals = {};

    employeeWeeklyData.forEach(
      (employee) => {
        Object.entries(
          employee.scheduledByDepartment
        ).forEach(
          ([department, hours]) => {
            if (!totals[department]) {
              totals[department] = {
                scheduled: 0,
                actual: 0,
              };
            }

            totals[
              department
            ].scheduled += hours;
          }
        );

        Object.entries(
          employee.actualByDepartment
        ).forEach(
          ([department, hours]) => {
            if (!totals[department]) {
              totals[department] = {
                scheduled: 0,
                actual: 0,
              };
            }

            totals[
              department
            ].actual += hours;
          }
        );
      }
    );

    return Object.entries(totals)
      .map(
        ([department, values]) => ({
          department,
          scheduled: values.scheduled,
          actual: values.actual,
          variance:
            values.actual -
            values.scheduled,
        })
      )
      .sort((a, b) => {
        // Keep Cabin Service clearly separated
        // and easy to identify.
        if (
          a.department ===
            CABIN_DEPARTMENT &&
          b.department !==
            CABIN_DEPARTMENT
        ) {
          return 1;
        }

        if (
          b.department ===
            CABIN_DEPARTMENT &&
          a.department !==
            CABIN_DEPARTMENT
        ) {
          return -1;
        }

        return a.department.localeCompare(
          b.department
        );
      });
  }, [employeeWeeklyData]);

  // ==========================================================
  // CABIN SERVICE TOTALS
  // ==========================================================

  const cabinWeeklyTotals = useMemo(() => {
    return employeeWeeklyData.reduce(
      (totals, employee) => {
        totals.scheduled +=
          employee.scheduledByDepartment[
            CABIN_DEPARTMENT
          ] || 0;

        totals.actual +=
          employee.actualByDepartment[
            CABIN_DEPARTMENT
          ] || 0;

        return totals;
      },
      {
        scheduled: 0,
        actual: 0,
      }
    );
  }, [employeeWeeklyData]);

  const cabinVariance =
    cabinWeeklyTotals.actual -
    cabinWeeklyTotals.scheduled;

  // ==========================================================
  // STATION TOTALS
  // ==========================================================

  const stationScheduledTotal = useMemo(
    () =>
      employeeWeeklyData.reduce(
        (sum, employee) =>
          sum + employee.scheduledTotal,
        0
      ),
    [employeeWeeklyData]
  );

  const stationActualTotal = useMemo(
    () =>
      employeeWeeklyData.reduce(
        (sum, employee) =>
          sum + employee.actualTotal,
        0
      ),
    [employeeWeeklyData]
  );

  const stationVariance =
    stationActualTotal -
    stationScheduledTotal;

  // ==========================================================
  // OVERTIME
  // ==========================================================

  const employeesOverForty = useMemo(
    () =>
      employeeWeeklyData.filter(
        (employee) =>
          employee.scheduledTotal > 40 ||
          employee.actualTotal > 40
      ),
    [employeeWeeklyData]
  );

  // ==========================================================
  // CABIN EMPLOYEES
  // ==========================================================

  const cabinEmployees = useMemo(() => {
    return employeeWeeklyData.filter(
      (employee) =>
        (employee.scheduledByDepartment[
          CABIN_DEPARTMENT
        ] || 0) > 0 ||
        (employee.actualByDepartment[
          CABIN_DEPARTMENT
        ] || 0) > 0
    );
  }, [employeeWeeklyData]);

  // ==========================================================
  // WEEK LABEL
  // ==========================================================

  const formatWeekLabel = () => {
    if (!selectedWeekTag) {
      return "No week selected";
    }

    return DAY_KEYS.map((dayKey) => {
      const label = DAY_LABELS[dayKey];

      const date = weekDates[dayKey];

      if (!date) {
        return label;
      }

      const parts = date.split("-");

      const dayNumber =
        parts.length === 3
          ? Number(parts[2])
          : "";

      return dayNumber
        ? `${label} ${dayNumber}`
        : label;
    }).join("  |  ");
  };

  // ==========================================================
  // STATUS LABEL
  // ==========================================================

  const statusLabel =
    statusFilter === "approved"
      ? "Approved schedules only"
      : statusFilter === "draft"
      ? "Draft schedules only"
      : "Approved and draft schedules";

  // ==========================================================
  // EXPAND / COLLAPSE EMPLOYEE
  // ==========================================================

  const toggleEmployeeDetails = (
    employeeId
  ) => {
    setExpandedEmployeeId(
      (current) =>
        current === employeeId
          ? ""
          : employeeId
    );
  };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          Loading weekly summary...
        </p>
      </PageCard>
    );
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  if (error) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#9f1239",
            fontWeight: 800,
          }}
        >
          {error}
        </p>
      </PageCard>
    );
  }
    // ==========================================================
  // MAIN PAGE
  // ==========================================================

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        minWidth: 0,
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#ffffff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
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
            background:
              "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                color:
                  "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Weekly Summary
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
              Weekly Employees Summary
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 800,
                fontSize: 14,
                color:
                  "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Weekly employee labor summary comparing
              assigned hours with approved worked hours.
              Select an employee to review department
              and daily details.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              width: "min(100%, 390px)",
            }}
          >
            <SelectInput
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
              }
            >
              <option value="approved">
                Approved schedules
              </option>

              <option value="draft">
                Draft schedules
              </option>

              <option value="both">
                Approved + Draft schedules
              </option>
            </SelectInput>

            <SelectInput
              value={selectedWeekTag}
              onChange={(event) => {
                setSelectedWeekTag(
                  event.target.value
                );

                setExpandedEmployeeId("");
              }}
              disabled={!weekTags.length}
            >
              {!weekTags.length && (
                <option value="">
                  No weeks available
                </option>
              )}

              {weekTags.map((tag) => (
                <option
                  key={tag}
                  value={tag}
                >
                  {tag}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </div>

      {/* ======================================================
          STATION SUMMARY CARDS
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          <SummaryCard
            label="Assigned Hours"
            value={stationScheduledTotal.toFixed(
              2
            )}
            subValue="Total station scheduled labor"
          />

          <SummaryCard
            label="Worked Hours"
            value={stationActualTotal.toFixed(
              2
            )}
            subValue={`${approvedTimesheetsForWeek.length} approved timesheet report(s)`}
          />

          <SummaryCard
            label="Variance"
            value={`${
              stationVariance >= 0 ? "+" : ""
            }${stationVariance.toFixed(2)}`}
            subValue="Worked minus assigned"
            alert={stationVariance > 0}
          />

          <SummaryCard
            label="Employees"
            value={employeeWeeklyData.length}
            subValue="Employees with weekly activity"
          />

          <SummaryCard
            label="Over 40 Hours"
            value={employeesOverForty.length}
            subValue="Assigned or worked hours"
            alert={
              employeesOverForty.length > 0
            }
          />
        </div>
      </PageCard>

      {/* ======================================================
          WEEK INFORMATION
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Week of: {formatWeekLabel()}
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              Worked hours include only approved
              timesheet reports.
            </p>
          </div>

          <Badge tone="blue">
            {statusLabel}
          </Badge>
        </div>
      </PageCard>

      {/* ======================================================
          CABIN SERVICE SUMMARY
      ====================================================== */}

      {(cabinWeeklyTotals.scheduled > 0 ||
        cabinWeeklyTotals.actual > 0) && (
        <PageCard style={{ padding: 20 }}>
          <div
            style={{
              background:
                "linear-gradient(135deg, #eef8ff 0%, #f8fbff 100%)",
              border: "1px solid #bfdbfe",
              borderRadius: 20,
              padding: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 19,
                      fontWeight: 900,
                      color: "#0f4c81",
                    }}
                  >
                    Cabin Service
                  </h2>

                  <Badge tone="blue">
                    Separate Department
                  </Badge>
                </div>

                <p
                  style={{
                    margin: "7px 0 0",
                    color: "#64748b",
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  Assigned hours are calculated from
                  the Cabin Service weekly schedule
                  and its assigned schedule slots.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Badge tone="blue">
                  Assigned:{" "}
                  {cabinWeeklyTotals.scheduled.toFixed(
                    2
                  )}{" "}
                  hrs
                </Badge>

                <Badge tone="green">
                  Worked:{" "}
                  {cabinWeeklyTotals.actual.toFixed(
                    2
                  )}{" "}
                  hrs
                </Badge>

                <Badge
                  tone={
                    cabinVariance > 0
                      ? "red"
                      : cabinVariance < 0
                      ? "amber"
                      : "gray"
                  }
                >
                  Variance:{" "}
                  {cabinVariance >= 0 ? "+" : ""}
                  {cabinVariance.toFixed(2)}
                </Badge>

                <Badge tone="gray">
                  Employees:{" "}
                  {cabinEmployees.length}
                </Badge>
              </div>
            </div>
          </div>
        </PageCard>
      )}

      {/* ======================================================
          OVERTIME ALERT
      ====================================================== */}

      {employeesOverForty.length > 0 && (
        <PageCard style={{ padding: 20 }}>
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
                fontWeight: 900,
                color: "#9f1239",
                marginBottom: 10,
              }}
            >
              Weekly Overtime Alert
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
              }}
            >
              {employeesOverForty.map(
                (employee) => (
                  <div
                    key={employee.employeeId}
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      color: "#9f1239",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span>
                      {employee.employeeName}
                    </span>

                    <span>
                      Assigned{" "}
                      {employee.scheduledTotal.toFixed(
                        2
                      )}{" "}
                      hrs · Worked{" "}
                      {employee.actualTotal.toFixed(
                        2
                      )}{" "}
                      hrs
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </PageCard>
      )}

      {/* ======================================================
          MAIN EMPLOYEE SUMMARY
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Employee Weekly Summary
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Select an employee name to review the
            department and daily breakdown.
          </p>
        </div>

        {!selectedWeekTag ||
        employeeWeeklyData.length === 0 ? (
          <div
            style={{
              background: "#f8fbff",
              border:
                "1px solid #dbeafe",
              borderRadius: 16,
              padding: 16,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No employee hours were found for the
            selected week.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border:
                "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 820,
                background: "#ffffff",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fbff",
                  }}
                >
                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Employee
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Assigned Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Worked Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Variance
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Days Off
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {employeeWeeklyData.map(
                  (employee, index) => {
                    const variance =
                      employee.actualTotal -
                      employee.scheduledTotal;

                    const overForty =
                      employee.scheduledTotal >
                        40 ||
                      employee.actualTotal > 40;

                    const isExpanded =
                      expandedEmployeeId ===
                      employee.employeeId;

                    const departments =
                      Array.from(
                        new Set([
                          ...Object.keys(
                            employee.scheduledByDepartment ||
                              {}
                          ),
                          ...Object.keys(
                            employee.actualByDepartment ||
                              {}
                          ),
                        ])
                      ).sort((a, b) => {
                        if (
                          a ===
                            CABIN_DEPARTMENT &&
                          b !==
                            CABIN_DEPARTMENT
                        ) {
                          return 1;
                        }

                        if (
                          b ===
                            CABIN_DEPARTMENT &&
                          a !==
                            CABIN_DEPARTMENT
                        ) {
                          return -1;
                        }

                        return a.localeCompare(b);
                      });

                    return (
                      <React.Fragment
                        key={
                          employee.employeeId
                        }
                      >
                        {/* ==============================
                            EMPLOYEE SUMMARY ROW
                        ============================== */}

                        <tr
                          style={{
                            background: isExpanded
                              ? "#edf7ff"
                              : index % 2 === 0
                              ? "#ffffff"
                              : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() =>
                                toggleEmployeeDetails(
                                  employee.employeeId
                                )
                              }
                              style={{
                                border: "none",
                                padding: 0,
                                background:
                                  "transparent",
                                cursor: "pointer",
                                color: "#1769aa",
                                fontSize: 14,
                                fontWeight: 900,
                                fontFamily:
                                  "inherit",
                                display:
                                  "inline-flex",
                                alignItems:
                                  "center",
                                gap: 8,
                                textAlign: "left",
                              }}
                            >
                              <span
                                style={{
                                  display:
                                    "inline-flex",
                                  width: 24,
                                  height: 24,
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "center",
                                  borderRadius: 999,
                                  background:
                                    isExpanded
                                      ? "#1769aa"
                                      : "#edf7ff",
                                  color:
                                    isExpanded
                                      ? "#ffffff"
                                      : "#1769aa",
                                  fontSize: 13,
                                  fontWeight: 900,
                                }}
                              >
                                {isExpanded
                                  ? "−"
                                  : "+"}
                              </span>

                              {
                                employee.employeeName
                              }
                            </button>
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: 900,
                            }}
                          >
                            {employee.scheduledTotal.toFixed(
                              2
                            )}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: 900,
                              color: "#047857",
                            }}
                          >
                            {employee.actualTotal.toFixed(
                              2
                            )}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: 900,
                              color:
                                variance > 0
                                  ? "#be123c"
                                  : variance < 0
                                  ? "#b45309"
                                  : "#475569",
                            }}
                          >
                            {variance >= 0
                              ? "+"
                              : ""}
                            {variance.toFixed(2)}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: 800,
                            }}
                          >
                            {employee.daysOff}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                            }}
                          >
                            {overForty ? (
                              <Badge tone="red">
                                Over 40 hrs
                              </Badge>
                            ) : variance > 0 ? (
                              <Badge tone="amber">
                                Over Assigned
                              </Badge>
                            ) : (
                              <Badge tone="green">
                                OK
                              </Badge>
                            )}
                          </td>
                        </tr>

                        {/* ==============================
                            EXPANDED EMPLOYEE DETAILS
                        ============================== */}

                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={6}
                              style={{
                                padding: 0,
                                borderBottom:
                                  "1px solid #dbeafe",
                                background:
                                  "#f8fbff",
                              }}
                            >
                              <div
                                style={{
                                  padding: 18,
                                  display: "grid",
                                  gap: 18,
                                }}
                              >
                                {/* ======================
                                    DEPARTMENT SUMMARY
                                ====================== */}

                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 900,
                                      color:
                                        "#0f172a",
                                      marginBottom: 10,
                                    }}
                                  >
                                    Department Breakdown
                                  </div>

                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(190px, 1fr))",
                                      gap: 10,
                                    }}
                                  >
                                    {departments.map(
                                      (
                                        department
                                      ) => {
                                        const assigned =
                                          employee
                                            .scheduledByDepartment[
                                            department
                                          ] || 0;

                                        const worked =
                                          employee
                                            .actualByDepartment[
                                            department
                                          ] || 0;

                                        const departmentVariance =
                                          worked -
                                          assigned;

                                        const isCabin =
                                          department ===
                                          CABIN_DEPARTMENT;

                                        return (
                                          <div
                                            key={
                                              department
                                            }
                                            style={{
                                              background:
                                                isCabin
                                                  ? "#eef8ff"
                                                  : "#ffffff",
                                              border:
                                                isCabin
                                                  ? "1px solid #93c5fd"
                                                  : "1px solid #dbeafe",
                                              borderRadius: 14,
                                              padding:
                                                "13px 14px",
                                            }}
                                          >
                                            <div
                                              style={{
                                                display:
                                                  "flex",
                                                justifyContent:
                                                  "space-between",
                                                gap: 8,
                                                alignItems:
                                                  "center",
                                                flexWrap:
                                                  "wrap",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontSize: 13,
                                                  fontWeight: 900,
                                                  color:
                                                    isCabin
                                                      ? "#0f5c91"
                                                      : "#334155",
                                                }}
                                              >
                                                {
                                                  department
                                                }
                                              </div>

                                              {isCabin && (
                                                <Badge tone="blue">
                                                  Cabin
                                                </Badge>
                                              )}
                                            </div>

                                            <div
                                              style={{
                                                marginTop: 10,
                                                display:
                                                  "grid",
                                                gap: 5,
                                                fontSize: 12,
                                                fontWeight: 700,
                                              }}
                                            >
                                              <div
                                                style={{
                                                  color:
                                                    "#334155",
                                                }}
                                              >
                                                Assigned:{" "}
                                                <b>
                                                  {assigned.toFixed(
                                                    2
                                                  )}
                                                </b>{" "}
                                                hrs
                                              </div>

                                              <div
                                                style={{
                                                  color:
                                                    "#047857",
                                                }}
                                              >
                                                Worked:{" "}
                                                <b>
                                                  {worked.toFixed(
                                                    2
                                                  )}
                                                </b>{" "}
                                                hrs
                                              </div>

                                              <div
                                                style={{
                                                  color:
                                                    departmentVariance >
                                                    0
                                                      ? "#be123c"
                                                      : departmentVariance <
                                                        0
                                                      ? "#b45309"
                                                      : "#64748b",
                                                }}
                                              >
                                                Variance:{" "}
                                                <b>
                                                  {departmentVariance >=
                                                  0
                                                    ? "+"
                                                    : ""}
                                                  {departmentVariance.toFixed(
                                                    2
                                                  )}
                                                </b>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                </div>

                                {/* ======================
                                    DAILY DETAILS
                                ====================== */}

                                <div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 900,
                                      color:
                                        "#0f172a",
                                      marginBottom: 10,
                                    }}
                                  >
                                    Daily Breakdown
                                  </div>

                                  <div
                                    style={{
                                      overflowX:
                                        "auto",
                                      borderRadius: 16,
                                      border:
                                        "1px solid #dbeafe",
                                    }}
                                  >
                                    <table
                                      style={{
                                        width:
                                          "100%",
                                        borderCollapse:
                                          "separate",
                                        borderSpacing: 0,
                                        minWidth: 900,
                                        background:
                                          "#ffffff",
                                      }}
                                    >
                                      <thead>
                                        <tr
                                          style={{
                                            background:
                                              "#f8fbff",
                                          }}
                                        >
                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "left",
                                              }
                                            )}
                                          >
                                            Day
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "left",
                                              }
                                            )}
                                          >
                                            Assigned Department
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "left",
                                              }
                                            )}
                                          >
                                            Worked Department
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "center",
                                              }
                                            )}
                                          >
                                            Assigned
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "center",
                                              }
                                            )}
                                          >
                                            Worked
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "center",
                                              }
                                            )}
                                          >
                                            Variance
                                          </th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {DAY_KEYS.map(
                                          (
                                            dayKey,
                                            dayIndex
                                          ) => {
                                            const day =
                                              employee
                                                .days[
                                                dayKey
                                              ];

                                            const dayVariance =
                                              day.actualTotal -
                                              day.scheduledTotal;

                                            const scheduledAssignments =
                                              Object.entries(
                                                day.scheduledByDepartment ||
                                                  {}
                                              ).sort(
                                                ([
                                                  first,
                                                ], [
                                                  second,
                                                ]) =>
                                                  first.localeCompare(
                                                    second
                                                  )
                                              );

                                            const actualAssignments =
                                              Object.entries(
                                                day.actualByDepartment ||
                                                  {}
                                              ).sort(
                                                ([
                                                  first,
                                                ], [
                                                  second,
                                                ]) =>
                                                  first.localeCompare(
                                                    second
                                                  )
                                              );

                                            return (
                                              <tr
                                                key={
                                                  dayKey
                                                }
                                                style={{
                                                  background:
                                                    dayIndex %
                                                      2 ===
                                                    0
                                                      ? "#ffffff"
                                                      : "#fbfdff",
                                                }}
                                              >
                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  <div
                                                    style={{
                                                      fontWeight: 900,
                                                      color:
                                                        "#0f172a",
                                                    }}
                                                  >
                                                    {
                                                      DAY_FULL[
                                                        dayKey
                                                      ]
                                                    }
                                                  </div>

                                                  <div
                                                    style={{
                                                      marginTop: 3,
                                                      fontSize: 11,
                                                      color:
                                                        "#64748b",
                                                    }}
                                                  >
                                                    {day.date ||
                                                      ""}
                                                  </div>
                                                </td>

                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  {scheduledAssignments.length ===
                                                  0 ? (
                                                    <Badge tone="gray">
                                                      OFF
                                                    </Badge>
                                                  ) : (
                                                    <div
                                                      style={{
                                                        display:
                                                          "grid",
                                                        gap: 5,
                                                      }}
                                                    >
                                                      {scheduledAssignments.map(
                                                        ([
                                                          department,
                                                          hours,
                                                        ]) => (
                                                          <div
                                                            key={
                                                              department
                                                            }
                                                            style={{
                                                              fontSize: 12,
                                                              color:
                                                                department ===
                                                                CABIN_DEPARTMENT
                                                                  ? "#1769aa"
                                                                  : "#334155",
                                                              fontWeight: 800,
                                                            }}
                                                          >
                                                            {
                                                              department
                                                            }
                                                            :{" "}
                                                            {hours.toFixed(
                                                              2
                                                            )}{" "}
                                                            hrs
                                                          </div>
                                                        )
                                                      )}
                                                    </div>
                                                  )}
                                                </td>

                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  {actualAssignments.length ===
                                                  0 ? (
                                                    <span
                                                      style={{
                                                        color:
                                                          "#94a3b8",
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                      }}
                                                    >
                                                      No approved
                                                      hours
                                                    </span>
                                                  ) : (
                                                    <div
                                                      style={{
                                                        display:
                                                          "grid",
                                                        gap: 5,
                                                      }}
                                                    >
                                                      {actualAssignments.map(
                                                        ([
                                                          department,
                                                          hours,
                                                        ]) => (
                                                          <div
                                                            key={
                                                              department
                                                            }
                                                            style={{
                                                              fontSize: 12,
                                                              color:
                                                                "#047857",
                                                              fontWeight: 800,
                                                            }}
                                                          >
                                                            {
                                                              department
                                                            }
                                                            :{" "}
                                                            {hours.toFixed(
                                                              2
                                                            )}{" "}
                                                            hrs
                                                          </div>
                                                        )
                                                      )}
                                                    </div>
                                                  )}
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight: 900,
                                                  }}
                                                >
                                                  {day.scheduledTotal.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight: 900,
                                                    color:
                                                      "#047857",
                                                  }}
                                                >
                                                  {day.actualTotal.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight: 900,
                                                    color:
                                                      dayVariance >
                                                      0
                                                        ? "#be123c"
                                                        : dayVariance <
                                                          0
                                                        ? "#b45309"
                                                        : "#475569",
                                                  }}
                                                >
                                                  {dayVariance >=
                                                  0
                                                    ? "+"
                                                    : ""}
                                                  {dayVariance.toFixed(
                                                    2
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          }
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }
                )}

                {/* ==============================
                    TOTAL ROW
                ============================== */}

                <tr
                  style={{
                    background: "#edf7ff",
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 900,
                      color: "#0f4c81",
                    }}
                  >
                    STATION TOTAL
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                    }}
                  >
                    {stationScheduledTotal.toFixed(
                      2
                    )}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                      color: "#047857",
                    }}
                  >
                    {stationActualTotal.toFixed(
                      2
                    )}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                      color:
                        stationVariance > 0
                          ? "#be123c"
                          : stationVariance < 0
                          ? "#b45309"
                          : "#475569",
                    }}
                  >
                    {stationVariance >= 0
                      ? "+"
                      : ""}
                    {stationVariance.toFixed(2)}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                    }}
                  >
                    —
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                    }}
                  >
                    <Badge tone="blue">
                      {employeeWeeklyData.length}{" "}
                      Employees
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
            {/* ======================================================
          DAILY STATION TOTALS
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Daily Station Totals
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Total assigned and approved worked hours
            for the entire station by day.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {DAY_KEYS.map((dayKey) => {
            const totals =
              stationDailyTotals[dayKey] || {
                scheduled: 0,
                actual: 0,
              };

            const variance =
              totals.actual - totals.scheduled;

            return (
              <div
                key={dayKey}
                style={{
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  borderRadius: 16,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "#1769aa",
                  }}
                >
                  {DAY_FULL[dayKey]}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "#334155",
                    fontWeight: 700,
                  }}
                >
                  Assigned:{" "}
                  {totals.scheduled.toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "#047857",
                    fontWeight: 800,
                  }}
                >
                  Worked:{" "}
                  {totals.actual.toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color:
                      variance > 0
                        ? "#be123c"
                        : variance < 0
                        ? "#b45309"
                        : "#64748b",
                    fontWeight: 800,
                  }}
                >
                  Variance:{" "}
                  {variance >= 0 ? "+" : ""}
                  {variance.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </PageCard>

      {/* ======================================================
          WEEKLY TOTALS BY DEPARTMENT
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Weekly Totals by Department
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Weekly assigned and approved worked
            hours separated by operational
            department. Cabin Service is reported
            independently from the regular airline
            schedules.
          </p>
        </div>

        {departmentWeeklyTotals.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No department totals found for this
            week.
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
                minWidth: 760,
                background: "#ffffff",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f8fbff",
                  }}
                >
                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Department
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Assigned Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Worked Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Variance
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {departmentWeeklyTotals.map(
                  (row, index) => {
                    const isCabin =
                      row.department ===
                      CABIN_DEPARTMENT;

                    return (
                      <tr
                        key={row.department}
                        style={{
                          background: isCabin
                            ? "#eef8ff"
                            : index % 2 === 0
                            ? "#ffffff"
                            : "#fbfdff",
                        }}
                      >
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 900,
                            color: isCabin
                              ? "#0f5c91"
                              : "#0f172a",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span>
                              {row.department}
                            </span>

                            {isCabin && (
                              <Badge tone="blue">
                                Cabin Schedule
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 900,
                          }}
                        >
                          {row.scheduled.toFixed(2)}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 900,
                            color: "#047857",
                          }}
                        >
                          {row.actual.toFixed(2)}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            fontWeight: 900,
                            color:
                              row.variance > 0
                                ? "#be123c"
                                : row.variance < 0
                                ? "#b45309"
                                : "#475569",
                          }}
                        >
                          {row.variance >= 0
                            ? "+"
                            : ""}
                          {row.variance.toFixed(2)}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                          }}
                        >
                          {row.variance > 0 ? (
                            <Badge tone="amber">
                              Over Assigned
                            </Badge>
                          ) : row.variance < 0 ? (
                            <Badge tone="gray">
                              Under Assigned
                            </Badge>
                          ) : (
                            <Badge tone="green">
                              Balanced
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}

                {/* ==============================
                    STATION TOTAL
                ============================== */}

                <tr
                  style={{
                    background: "#edf7ff",
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 900,
                      color: "#0f4c81",
                    }}
                  >
                    STATION TOTAL
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                    }}
                  >
                    {stationScheduledTotal.toFixed(
                      2
                    )}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                      color: "#047857",
                    }}
                  >
                    {stationActualTotal.toFixed(2)}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                      color:
                        stationVariance > 0
                          ? "#be123c"
                          : stationVariance < 0
                          ? "#b45309"
                          : "#475569",
                    }}
                  >
                    {stationVariance >= 0
                      ? "+"
                      : ""}
                    {stationVariance.toFixed(2)}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                    }}
                  >
                    <Badge tone="blue">
                      Station
                    </Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {/* ======================================================
          CABIN SERVICE DAILY TOTALS
      ====================================================== */}

      {(cabinWeeklyTotals.scheduled > 0 ||
        cabinWeeklyTotals.actual > 0) && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                Cabin Service Daily Totals
              </h2>

              <Badge tone="blue">
                Cabin Schedule
              </Badge>
            </div>

            <p
              style={{
                margin: "5px 0 0",
                color: "#64748b",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              Assigned hours shown below come
              directly from the Cabin Service
              schedule slots for the selected week.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
            }}
          >
            {DAY_KEYS.map((dayKey) => {
              const cabinDay =
                cabinDailyTotals[dayKey] || {
                  scheduled: 0,
                  actual: 0,
                };

              const variance =
                cabinDay.actual -
                cabinDay.scheduled;

              return (
                <div
                  key={dayKey}
                  style={{
                    background: "#eef8ff",
                    border:
                      "1px solid #bfdbfe",
                    borderRadius: 16,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      color: "#0f5c91",
                    }}
                  >
                    {DAY_FULL[dayKey]}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: "#334155",
                      fontWeight: 700,
                    }}
                  >
                    Assigned:{" "}
                    {cabinDay.scheduled.toFixed(
                      2
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: "#047857",
                      fontWeight: 800,
                    }}
                  >
                    Worked:{" "}
                    {cabinDay.actual.toFixed(2)}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color:
                        variance > 0
                          ? "#be123c"
                          : variance < 0
                          ? "#b45309"
                          : "#64748b",
                      fontWeight: 800,
                    }}
                  >
                    Variance:{" "}
                    {variance >= 0 ? "+" : ""}
                    {variance.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </PageCard>
      )}
    </div>
  );
}

// ============================================================
// TABLE STYLES
// ============================================================

function thStyle(extra = {}) {
  return {
    padding: "14px",
    fontSize: 12,
    fontWeight: 900,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
