// src/pages/WeeklyEmployeesSummaryPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// ============================================================
// CONSTANTS
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
  const upper = department.toUpperCase();

  // Cabin Service
  if (
    upper === "CABIN SERVICE" ||
    upper === "DL CABIN SERVICE" ||
    upper.includes("DL CABIN")
  ) {
    return "Cabin Service";
  }

  // World Atlantic / WAL
  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WORLD ATLANTIC" ||
    upper === "WORLD ATLANTIC AIRLINES" ||
    upper === "WAL"
  ) {
    return "World Atlantic";
  }

  // Avianca
  if (
    upper === "AV" ||
    upper === "AVIANCA"
  ) {
    return "Avianca";
  }

  // Sun Country
  if (
    upper === "SY" ||
    upper === "SUN COUNTRY" ||
    upper === "SUN COUNTRY AIRLINES"
  ) {
    return "Sun Country";
  }

  // Aeromexico
  if (
    upper === "AM" ||
    upper === "AEROMEXICO" ||
    upper === "AEROMÉXICO"
  ) {
    return "Aeromexico";
  }

  return department || "Unknown";
}

function getEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.employeeName ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.username ||
    "Unknown Employee"
  );
}

function getEmployeeDepartment(employee) {
  return (
    employee?.department ||
    employee?.departmentName ||
    employee?.assignedDepartment ||
    ""
  );
}

// ============================================================
// TIME HELPERS
// ============================================================

function toMinutes(value) {
  if (!value) return null;

  const [hours, minutes] = String(value)
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
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

  if (
    clean === "yes" ||
    clean.includes("30")
  ) {
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
// WORKED HOURS
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
    end -
    start -
    getBreakMinutes(row?.breakTaken);

  return Math.max(0, workedMinutes) / 60;
}

// ============================================================
// ASSIGNED HOURS
// ============================================================

function calculateScheduledShiftHours(shift) {
  if (
    !shift?.start ||
    !shift?.end ||
    shift.start === "OFF"
  ) {
    return 0;
  }

  const start = toMinutes(shift.start);
  const endRaw = toMinutes(shift.end);

  if (start == null || endRaw == null) {
    return 0;
  }

  let end = endRaw;

  if (end < start) {
    end += 24 * 60;
  }

  let hours = (end - start) / 60;

  // Automatically deduct 30 minute break
  // when the scheduled shift exceeds 6 hours.
  if (hours > 6 + 1 / 60) {
    hours -= 0.5;
  }

  return Math.max(0, hours);
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
// DATE HELPERS
// ============================================================

function dateKey(date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function buildWeekDates(weekTag, schedules) {
  const sample = schedules[0];

  const startValue = String(
    sample?.weekStart || weekTag || ""
  ).trim();

  const result = {};

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startValue)
  ) {
    DAY_KEYS.forEach((key) => {
      result[key] = "";
    });

    return result;
  }

  const baseDate = new Date(
    `${startValue}T00:00:00`
  );

  DAY_KEYS.forEach((key, index) => {
    const currentDate = new Date(baseDate);

    currentDate.setDate(
      baseDate.getDate() + index
    );

    result[key] = dateKey(currentDate);
  });

  return result;
}

function formatDisplayDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
    }
  );
}

// ============================================================
// UI COMPONENTS
// ============================================================

function PageCard({
  children,
  style = {},
}) {
  return (
    <div
      style={{
        background:
          "rgba(255,255,255,0.94)",
        border:
          "1px solid rgba(255,255,255,0.96)",
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
        fontWeight: 700,
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
        background: alert
          ? "#fff1f2"
          : "#f8fbff",
        border: alert
          ? "1px solid #fecdd3"
          : "1px solid #dbeafe",
        borderRadius: 18,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: alert
            ? "#9f1239"
            : "#64748b",
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
          color: alert
            ? "#9f1239"
            : "#0f172a",
        }}
      >
        {value}
      </div>

      {subValue && (
        <div
          style={{
            marginTop: 7,
            fontSize: 12,
            color: alert
              ? "#be123c"
              : "#64748b",
            lineHeight: 1.5,
          }}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  tone = "blue",
}) {
  const colors = {
    blue: [
      "#eff6ff",
      "#1d4ed8",
      "#bfdbfe",
    ],
    green: [
      "#ecfdf5",
      "#047857",
      "#a7f3d0",
    ],
    amber: [
      "#fffbeb",
      "#b45309",
      "#fde68a",
    ],
    red: [
      "#fff1f2",
      "#be123c",
      "#fecdd3",
    ],
    gray: [
      "#f8fafc",
      "#475569",
      "#e2e8f0",
    ],
  };

  const [background, color, border] =
    colors[tone] || colors.blue;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
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
  const [employees, setEmployees] =
    useState([]);

  const [schedules, setSchedules] =
    useState([]);

  const [timesheets, setTimesheets] =
    useState([]);

  const [
    selectedWeekTag,
    setSelectedWeekTag,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("approved");

  // Employee currently expanded.
  // null = summary report only.
  const [
    expandedEmployeeId,
    setExpandedEmployeeId,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

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
        ] = await Promise.all([
          getDocs(
            collection(db, "employees")
          ),

          getDocs(
            collection(db, "schedules")
          ),

          getDocs(
            collection(
              db,
              "timesheet_reports"
            )
          ),
        ]);

        setEmployees(
          employeeSnapshot.docs.map(
            (document) => ({
              id: document.id,
              ...document.data(),
            })
          )
        );

        setSchedules(
          scheduleSnapshot.docs.map(
            (document) => ({
              id: document.id,
              ...document.data(),
            })
          )
        );

        setTimesheets(
          timesheetSnapshot.docs.map(
            (document) => ({
              id: document.id,
              ...document.data(),
            })
          )
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

  // Close expanded detail when changing week/filter.
  useEffect(() => {
    setExpandedEmployeeId(null);
  }, [selectedWeekTag, statusFilter]);

  // ==========================================================
  // SCHEDULE STATUS
  // ==========================================================

  const scheduleMatchesStatus = (
    schedule
  ) => {
    const status = String(
      schedule?.status || ""
    )
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
    return Array.from(
      new Set(
        schedules
          .filter(scheduleMatchesStatus)
          .map(
            (schedule) =>
              schedule.weekTag ||
              schedule.weekStart
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      String(b).localeCompare(
        String(a)
      )
    );
  }, [schedules, statusFilter]);

  useEffect(() => {
    if (!weekTags.length) {
      setSelectedWeekTag("");
      return;
    }

    if (
      !weekTags.includes(
        selectedWeekTag
      )
    ) {
      setSelectedWeekTag(
        weekTags[0]
      );
    }
  }, [weekTags, selectedWeekTag]);

  // ==========================================================
  // SELECTED WEEK
  // ==========================================================

  const selectedWeekSchedules =
    useMemo(() => {
      if (!selectedWeekTag) {
        return [];
      }

      return schedules.filter(
        (schedule) => {
          const scheduleWeek =
            schedule.weekTag ||
            schedule.weekStart;

          return (
            scheduleWeek ===
              selectedWeekTag &&
            scheduleMatchesStatus(
              schedule
            )
          );
        }
      );
    }, [
      schedules,
      selectedWeekTag,
      statusFilter,
    ]);

  const weekDates = useMemo(() => {
    return buildWeekDates(
      selectedWeekTag,
      selectedWeekSchedules
    );
  }, [
    selectedWeekTag,
    selectedWeekSchedules,
  ]);

  // ==========================================================
  // EMPLOYEE LOOKUP
  // ==========================================================

  const employeeLookup =
    useMemo(() => {
      const byId = {};
      const byName = {};

      employees.forEach(
        (employee) => {
          byId[employee.id] =
            employee;

          const employeeName =
            normalizeText(
              getEmployeeName(
                employee
              )
            );

          if (employeeName) {
            byName[employeeName] =
              employee;
          }
        }
      );

      return {
        byId,
        byName,
      };
    }, [employees]);

  // ==========================================================
  // APPROVED TIMESHEETS FOR WEEK
  // ==========================================================

  const approvedTimesheetsForWeek =
    useMemo(() => {
      const validDates = new Set(
        Object.values(
          weekDates
        ).filter(Boolean)
      );

      return timesheets.filter(
        (report) => {
          const status = String(
            report?.status || ""
          )
            .trim()
            .toLowerCase();

          const reportDate =
            String(
              report?.reportDate ||
                ""
            ).trim();

          return (
            status ===
              "approved" &&
            validDates.has(
              reportDate
            )
          );
        }
      );
    }, [timesheets, weekDates]);
    // ==========================================================
  // BUILD EMPLOYEE WEEKLY DATA
  // ==========================================================

  const employeeWeeklyData = useMemo(() => {
    const result = {};

    const ensureEmployee = (
      employeeId,
      fallbackName = ""
    ) => {
      const employeeRecord =
        employeeLookup.byId[employeeId] || null;

      const employeeName = employeeRecord
        ? getEmployeeName(employeeRecord)
        : fallbackName || "Unknown Employee";

      const employeeDepartment =
        employeeRecord
          ? getEmployeeDepartment(employeeRecord)
          : "";

      if (!result[employeeId]) {
        result[employeeId] = {
          employeeId,
          employeeName,
          employeeDepartment,

          days: DAY_KEYS.reduce(
            (accumulator, dayKey) => {
              accumulator[dayKey] = {
                date: weekDates[dayKey] || "",

                assignedByDepartment: {},
                workedByDepartment: {},

                assignedTotal: 0,
                workedTotal: 0,
              };

              return accumulator;
            },
            {}
          ),

          assignedByDepartment: {},
          workedByDepartment: {},

          assignedTotal: 0,
          workedTotal: 0,

          daysOff: 0,
        };
      }

      return result[employeeId];
    };

    // ========================================================
    // ASSIGNED HOURS FROM SCHEDULES
    // ========================================================

    selectedWeekSchedules.forEach(
      (schedule) => {
        const department =
          normalizeDepartmentName(
            schedule.airlineDisplayName ||
              schedule.airline ||
              schedule.department ||
              "Unknown"
          );

        const scheduleRows =
          Array.isArray(schedule.grid)
            ? schedule.grid
            : [];

        scheduleRows.forEach((row) => {
          if (!row?.employeeId) {
            return;
          }

          const employeeData =
            ensureEmployee(
              row.employeeId
            );

          DAY_KEYS.forEach(
            (dayKey) => {
              const assignedHours =
                calculateScheduledDayHours(
                  row,
                  dayKey
                );

              if (
                assignedHours <= 0
              ) {
                return;
              }

              // Daily department total
              employeeData.days[
                dayKey
              ].assignedByDepartment[
                department
              ] =
                (employeeData.days[
                  dayKey
                ].assignedByDepartment[
                  department
                ] || 0) +
                assignedHours;

              // Daily employee total
              employeeData.days[
                dayKey
              ].assignedTotal +=
                assignedHours;

              // Weekly department total
              employeeData
                .assignedByDepartment[
                department
              ] =
                (employeeData
                  .assignedByDepartment[
                  department
                ] || 0) +
                assignedHours;

              // Weekly employee total
              employeeData.assignedTotal +=
                assignedHours;
            }
          );
        });
      }
    );

    // ========================================================
    // WORKED HOURS FROM APPROVED TIMESHEETS
    // ========================================================

    approvedTimesheetsForWeek.forEach(
      (report) => {
        const department =
          normalizeDepartmentName(
            report.airline ||
              report.department ||
              "Unknown"
          );

        const reportDate = String(
          report.reportDate || ""
        ).trim();

        const matchingDayKey =
          DAY_KEYS.find(
            (dayKey) =>
              weekDates[dayKey] ===
              reportDate
          );

        if (!matchingDayKey) {
          return;
        }

        const rows = Array.isArray(
          report.rows
        )
          ? report.rows
          : [];

        rows.forEach((row) => {
          const rowEmployeeId =
            String(
              row?.employeeId || ""
            ).trim();

          const rowEmployeeName =
            String(
              row?.employeeName || ""
            ).trim();

          let employeeId =
            rowEmployeeId;

          // Some older timesheets may not contain
          // employeeId, so match by employee name.
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

          const workedHours =
            calculateActualHours(row);

          if (workedHours <= 0) {
            return;
          }

          const employeeData =
            ensureEmployee(
              employeeId,
              rowEmployeeName
            );

          // Daily department worked hours
          employeeData.days[
            matchingDayKey
          ].workedByDepartment[
            department
          ] =
            (employeeData.days[
              matchingDayKey
            ].workedByDepartment[
              department
            ] || 0) +
            workedHours;

          // Daily worked total
          employeeData.days[
            matchingDayKey
          ].workedTotal +=
            workedHours;

          // Weekly department worked hours
          employeeData
            .workedByDepartment[
            department
          ] =
            (employeeData
              .workedByDepartment[
              department
            ] || 0) +
            workedHours;

          // Weekly employee worked total
          employeeData.workedTotal +=
            workedHours;
        });
      }
    );

    // ========================================================
    // CALCULATE DAYS OFF
    // ========================================================

    Object.values(result).forEach(
      (employeeData) => {
        employeeData.daysOff =
          DAY_KEYS.filter(
            (dayKey) =>
              employeeData.days[
                dayKey
              ].assignedTotal <= 0
          ).length;
      }
    );

    // ========================================================
    // FINAL EMPLOYEE LIST
    // ========================================================

    return Object.values(result)
      .filter(
        (employeeData) =>
          employeeData.assignedTotal >
            0 ||
          employeeData.workedTotal > 0
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
    approvedTimesheetsForWeek,
    employeeLookup,
    weekDates,
  ]);

  // ==========================================================
  // STATION TOTALS
  // ==========================================================

  const stationAssignedTotal =
    useMemo(() => {
      return employeeWeeklyData.reduce(
        (sum, employee) =>
          sum +
          employee.assignedTotal,
        0
      );
    }, [employeeWeeklyData]);

  const stationWorkedTotal =
    useMemo(() => {
      return employeeWeeklyData.reduce(
        (sum, employee) =>
          sum +
          employee.workedTotal,
        0
      );
    }, [employeeWeeklyData]);

  const stationVariance =
    stationWorkedTotal -
    stationAssignedTotal;

  // ==========================================================
  // EMPLOYEES OVER 40 HOURS
  // ==========================================================

  const employeesOverForty =
    useMemo(() => {
      return employeeWeeklyData.filter(
        (employee) =>
          employee.assignedTotal >
            40 ||
          employee.workedTotal > 40
      );
    }, [employeeWeeklyData]);

  // ==========================================================
  // DAILY STATION TOTALS
  // ==========================================================

  const stationDailyTotals =
    useMemo(() => {
      return DAY_KEYS.reduce(
        (accumulator, dayKey) => {
          accumulator[dayKey] = {
            assigned:
              employeeWeeklyData.reduce(
                (sum, employee) =>
                  sum +
                  employee.days[
                    dayKey
                  ].assignedTotal,
                0
              ),

            worked:
              employeeWeeklyData.reduce(
                (sum, employee) =>
                  sum +
                  employee.days[
                    dayKey
                  ].workedTotal,
                0
              ),
          };

          return accumulator;
        },
        {}
      );
    }, [employeeWeeklyData]);

  // ==========================================================
  // DEPARTMENT TOTALS FOR ENTIRE STATION
  // ==========================================================

  const departmentWeeklyTotals =
    useMemo(() => {
      const totals = {};

      employeeWeeklyData.forEach(
        (employee) => {
          Object.entries(
            employee.assignedByDepartment
          ).forEach(
            ([department, hours]) => {
              if (!totals[department]) {
                totals[department] = {
                  assigned: 0,
                  worked: 0,
                };
              }

              totals[
                department
              ].assigned += hours;
            }
          );

          Object.entries(
            employee.workedByDepartment
          ).forEach(
            ([department, hours]) => {
              if (!totals[department]) {
                totals[department] = {
                  assigned: 0,
                  worked: 0,
                };
              }

              totals[
                department
              ].worked += hours;
            }
          );
        }
      );

      return Object.entries(totals)
        .map(
          ([
            department,
            values,
          ]) => ({
            department,
            assigned:
              values.assigned,
            worked:
              values.worked,
            variance:
              values.worked -
              values.assigned,
          })
        )
        .sort((a, b) =>
          a.department.localeCompare(
            b.department
          )
        );
    }, [employeeWeeklyData]);

  // ==========================================================
  // EXPANDED EMPLOYEE
  // ==========================================================

  const expandedEmployee =
    useMemo(() => {
      if (!expandedEmployeeId) {
        return null;
      }

      return (
        employeeWeeklyData.find(
          (employee) =>
            employee.employeeId ===
            expandedEmployeeId
        ) || null
      );
    }, [
      expandedEmployeeId,
      employeeWeeklyData,
    ]);

  // ==========================================================
  // EXPANDED EMPLOYEE DEPARTMENT TOTALS
  // ==========================================================

  const expandedEmployeeDepartments =
    useMemo(() => {
      if (!expandedEmployee) {
        return [];
      }

      const departments = new Set([
        ...Object.keys(
          expandedEmployee
            .assignedByDepartment
        ),
        ...Object.keys(
          expandedEmployee
            .workedByDepartment
        ),
      ]);

      return Array.from(departments)
        .map((department) => {
          const assigned =
            expandedEmployee
              .assignedByDepartment[
              department
            ] || 0;

          const worked =
            expandedEmployee
              .workedByDepartment[
              department
            ] || 0;

          return {
            department,
            assigned,
            worked,
            variance:
              worked - assigned,
          };
        })
        .sort((a, b) =>
          a.department.localeCompare(
            b.department
          )
        );
    }, [expandedEmployee]);

  // ==========================================================
  // WEEK LABEL
  // ==========================================================

  const formatWeekLabel = () => {
    const sample =
      selectedWeekSchedules[0];

    if (!sample?.days) {
      return (
        selectedWeekTag ||
        "No week selected"
      );
    }

    return DAY_KEYS.map(
      (dayKey) => {
        const label =
          DAY_LABELS[dayKey];

        const dayNumber =
          sample.days?.[dayKey];

        return dayNumber
          ? `${label} ${dayNumber}`
          : label;
      }
    ).join("  |  ");
  };

  const statusLabel =
    statusFilter === "approved"
      ? "Approved schedules only"
      : statusFilter === "draft"
      ? "Draft schedules only"
      : "Approved and draft schedules";

  // ==========================================================
  // EMPLOYEE DETAIL TOGGLE
  // ==========================================================

  const toggleEmployee = (
    employeeId
  ) => {
    setExpandedEmployeeId(
      (current) =>
        current === employeeId
          ? null
          : employeeId
    );
  };

  // ==========================================================
  // LOADING / ERROR
  // ==========================================================

  if (loading) {
    return (
      <PageCard
        style={{ padding: 22 }}
      >
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

  if (error) {
    return (
      <PageCard
        style={{ padding: 22 }}
      >
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
  // RENDER
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
          HERO
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
            borderRadius: 999,
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
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.22em",
                color:
                  "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Weekly Summary
            </p>

            <h1
              style={{
                margin:
                  "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing:
                  "-0.04em",
              }}
            >
              Weekly Employees Summary
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color:
                  "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Review total assigned and
              worked hours by employee.
              Select an employee to view
              the detailed weekly
              breakdown.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              width:
                "min(100%, 390px)",
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
                Approved + Draft
                schedules
              </option>
            </SelectInput>

            <SelectInput
              value={
                selectedWeekTag
              }
              onChange={(event) =>
                setSelectedWeekTag(
                  event.target.value
                )
              }
              disabled={
                !weekTags.length
              }
            >
              {!weekTags.length && (
                <option value="">
                  No weeks available
                </option>
              )}

              {weekTags.map(
                (tag) => (
                  <option
                    key={tag}
                    value={tag}
                  >
                    {tag}
                  </option>
                )
              )}
            </SelectInput>
          </div>
        </div>
      </div>

      {/* ======================================================
          STATION SUMMARY CARDS
      ====================================================== */}

      <PageCard
        style={{ padding: 20 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          <SummaryCard
            label="Assigned Hours"
            value={stationAssignedTotal.toFixed(
              2
            )}
            subValue={statusLabel}
          />

          <SummaryCard
            label="Worked Hours"
            value={stationWorkedTotal.toFixed(
              2
            )}
            subValue={`${approvedTimesheetsForWeek.length} approved timesheet report(s)`}
          />

          <SummaryCard
            label="Variance"
            value={`${
              stationVariance >= 0
                ? "+"
                : ""
            }${stationVariance.toFixed(
              2
            )}`}
            subValue="Worked minus assigned"
            alert={
              stationVariance > 0
            }
          />

          <SummaryCard
            label="Employees"
            value={
              employeeWeeklyData.length
            }
            subValue={`${employeesOverForty.length} employee(s) over 40 hrs`}
            alert={
              employeesOverForty.length >
              0
            }
          />
        </div>
      </PageCard>

      {/* ======================================================
          WEEK INFORMATION
      ====================================================== */}

      <PageCard
        style={{ padding: 20 }}
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
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Week of:{" "}
              {formatWeekLabel()}
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              Worked hours include only
              approved timesheet reports.
              Click an employee name below
              to review the full detail.
            </p>
          </div>

          <Badge tone="blue">
            {
              employeeWeeklyData.length
            }{" "}
            Employees
          </Badge>
        </div>
      </PageCard>

      {/* ======================================================
          EMPLOYEE SUMMARY REPORT
      ====================================================== */}

      <PageCard
        style={{
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom:
              "1px solid #e2e8f0",
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
            Employee Summary Report
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Weekly totals by employee.
            Click the employee name to
            open or close the detailed
            report.
          </p>
        </div>

        {!selectedWeekTag ||
        employeeWeeklyData.length ===
          0 ? (
          <div
            style={{
              margin: 20,
              background: "#f8fbff",
              border:
                "1px solid #dbeafe",
              borderRadius: 16,
              padding: 16,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No employee hours were found
            for the selected week and
            filter.
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling:
                "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "separate",
                borderSpacing: 0,
                minWidth: 760,
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
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Employee
                  </th>

                  <th
                    style={thStyle({
                      textAlign:
                        "center",
                    })}
                  >
                    Assigned Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign:
                        "center",
                    })}
                  >
                    Worked Hours
                  </th>

                  <th
                    style={thStyle({
                      textAlign:
                        "center",
                    })}
                  >
                    Variance
                  </th>

                  <th
                    style={thStyle({
                      textAlign:
                        "center",
                    })}
                  >
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {employeeWeeklyData.map(
                  (
                    employee,
                    index
                  ) => {
                    const variance =
                      employee.workedTotal -
                      employee.assignedTotal;

                    const overForty =
                      employee.assignedTotal >
                        40 ||
                      employee.workedTotal >
                        40;

                    const isExpanded =
                      expandedEmployeeId ===
                      employee.employeeId;

                    return (
                      <React.Fragment
                        key={
                          employee.employeeId
                        }
                      >
                        <tr
                          style={{
                            background:
                              isExpanded
                                ? "#edf7ff"
                                : index %
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
                            <button
                              type="button"
                              onClick={() =>
                                toggleEmployee(
                                  employee.employeeId
                                )
                              }
                              style={{
                                border:
                                  "none",
                                background:
                                  "transparent",
                                padding: 0,
                                margin: 0,
                                color:
                                  "#1769aa",
                                fontSize:
                                  14,
                                fontWeight:
                                  900,
                                cursor:
                                  "pointer",
                                textAlign:
                                  "left",
                                display:
                                  "inline-flex",
                                alignItems:
                                  "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius:
                                    8,
                                  background:
                                    isExpanded
                                      ? "#1769aa"
                                      : "#e8f4ff",
                                  color:
                                    isExpanded
                                      ? "#ffffff"
                                      : "#1769aa",
                                  display:
                                    "inline-flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "center",
                                  fontSize:
                                    13,
                                  fontWeight:
                                    900,
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
                              textAlign:
                                "center",
                              fontWeight:
                                900,
                            }}
                          >
                            {employee.assignedTotal.toFixed(
                              2
                            )}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign:
                                "center",
                              fontWeight:
                                900,
                              color:
                                "#047857",
                            }}
                          >
                            {employee.workedTotal.toFixed(
                              2
                            )}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign:
                                "center",
                              fontWeight:
                                900,
                              color:
                                variance > 0
                                  ? "#be123c"
                                  : variance <
                                    0
                                  ? "#b45309"
                                  : "#475569",
                            }}
                          >
                            {variance >= 0
                              ? "+"
                              : ""}
                            {variance.toFixed(
                              2
                            )}
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign:
                                "center",
                            }}
                          >
                            {overForty ? (
                              <Badge tone="red">
                                Over 40 hrs
                              </Badge>
                            ) : (
                              <Badge tone="green">
                                Regular
                              </Badge>
                            )}
                          </td>
                        </tr>
                                                {/* =====================================
                            EXPANDED EMPLOYEE DETAIL
                        ===================================== */}

                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={5}
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
                                  padding: 20,
                                  display:
                                    "grid",
                                  gap: 18,
                                }}
                              >
                                {/* =============================
                                    EMPLOYEE HEADER
                                ============================= */}

                                <div
                                  style={{
                                    display:
                                      "flex",
                                    justifyContent:
                                      "space-between",
                                    alignItems:
                                      "flex-start",
                                    gap: 14,
                                    flexWrap:
                                      "wrap",
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        fontSize:
                                          11,
                                        fontWeight:
                                          900,
                                        color:
                                          "#1769aa",
                                        textTransform:
                                          "uppercase",
                                        letterSpacing:
                                          "0.1em",
                                      }}
                                    >
                                      Employee
                                      Detail
                                    </div>

                                    <h3
                                      style={{
                                        margin:
                                          "5px 0 0",
                                        fontSize:
                                          21,
                                        fontWeight:
                                          900,
                                        color:
                                          "#0f172a",
                                      }}
                                    >
                                      {
                                        employee.employeeName
                                      }
                                    </h3>

                                    {employee.employeeDepartment && (
                                      <div
                                        style={{
                                          marginTop:
                                            6,
                                          fontSize:
                                            13,
                                          color:
                                            "#64748b",
                                          fontWeight:
                                            700,
                                        }}
                                      >
                                        Employee
                                        Department:{" "}
                                        {
                                          employee.employeeDepartment
                                        }
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleEmployee(
                                        employee.employeeId
                                      )
                                    }
                                    style={{
                                      border:
                                        "1px solid #cfe7fb",
                                      background:
                                        "#ffffff",
                                      color:
                                        "#1769aa",
                                      borderRadius:
                                        12,
                                      padding:
                                        "9px 13px",
                                      fontSize:
                                        12,
                                      fontWeight:
                                        900,
                                      cursor:
                                        "pointer",
                                    }}
                                  >
                                    Close Detail
                                  </button>
                                </div>

                                {/* =============================
                                    EMPLOYEE WEEKLY TOTALS
                                ============================= */}

                                <div
                                  style={{
                                    display:
                                      "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(150px, 1fr))",
                                    gap: 10,
                                  }}
                                >
                                  <DetailMetric
                                    label="Assigned"
                                    value={`${employee.assignedTotal.toFixed(
                                      2
                                    )} hrs`}
                                  />

                                  <DetailMetric
                                    label="Worked"
                                    value={`${employee.workedTotal.toFixed(
                                      2
                                    )} hrs`}
                                    tone="green"
                                  />

                                  <DetailMetric
                                    label="Variance"
                                    value={`${
                                      variance >=
                                      0
                                        ? "+"
                                        : ""
                                    }${variance.toFixed(
                                      2
                                    )} hrs`}
                                    tone={
                                      variance >
                                      0
                                        ? "red"
                                        : variance <
                                          0
                                        ? "amber"
                                        : "gray"
                                    }
                                  />

                                  <DetailMetric
                                    label="Days Off"
                                    value={
                                      employee.daysOff
                                    }
                                    tone="gray"
                                  />
                                </div>

                                {/* =============================
                                    DEPARTMENT BREAKDOWN
                                ============================= */}

                                <div
                                  style={{
                                    background:
                                      "#ffffff",
                                    border:
                                      "1px solid #dbeafe",
                                    borderRadius:
                                      18,
                                    overflow:
                                      "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding:
                                        "15px 16px",
                                      borderBottom:
                                        "1px solid #e2e8f0",
                                      background:
                                        "#f8fbff",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize:
                                          15,
                                        fontWeight:
                                          900,
                                        color:
                                          "#0f172a",
                                      }}
                                    >
                                      Department
                                      Breakdown
                                    </div>

                                    <div
                                      style={{
                                        marginTop:
                                          4,
                                        fontSize:
                                          12,
                                        color:
                                          "#64748b",
                                      }}
                                    >
                                      Weekly
                                      assigned and
                                      worked hours
                                      by operational
                                      department.
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      overflowX:
                                        "auto",
                                    }}
                                  >
                                    <table
                                      style={{
                                        width:
                                          "100%",
                                        minWidth:
                                          600,
                                        borderCollapse:
                                          "separate",
                                        borderSpacing:
                                          0,
                                      }}
                                    >
                                      <thead>
                                        <tr>
                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "left",
                                              }
                                            )}
                                          >
                                            Department
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
                                        {(() => {
                                          const departments =
                                            new Set(
                                              [
                                                ...Object.keys(
                                                  employee.assignedByDepartment
                                                ),
                                                ...Object.keys(
                                                  employee.workedByDepartment
                                                ),
                                              ]
                                            );

                                          const rows =
                                            Array.from(
                                              departments
                                            )
                                              .map(
                                                (
                                                  department
                                                ) => {
                                                  const assigned =
                                                    employee
                                                      .assignedByDepartment[
                                                      department
                                                    ] ||
                                                    0;

                                                  const worked =
                                                    employee
                                                      .workedByDepartment[
                                                      department
                                                    ] ||
                                                    0;

                                                  return {
                                                    department,
                                                    assigned,
                                                    worked,
                                                    variance:
                                                      worked -
                                                      assigned,
                                                  };
                                                }
                                              )
                                              .sort(
                                                (
                                                  a,
                                                  b
                                                ) =>
                                                  a.department.localeCompare(
                                                    b.department
                                                  )
                                              );

                                          if (
                                            rows.length ===
                                            0
                                          ) {
                                            return (
                                              <tr>
                                                <td
                                                  colSpan={
                                                    4
                                                  }
                                                  style={{
                                                    ...tdStyle,
                                                    color:
                                                      "#94a3b8",
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      700,
                                                  }}
                                                >
                                                  No
                                                  department
                                                  information
                                                  available.
                                                </td>
                                              </tr>
                                            );
                                          }

                                          return rows.map(
                                            (
                                              row
                                            ) => (
                                              <tr
                                                key={
                                                  row.department
                                                }
                                              >
                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    fontWeight:
                                                      900,
                                                  }}
                                                >
                                                  {
                                                    row.department
                                                  }
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      800,
                                                  }}
                                                >
                                                  {row.assigned.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      800,
                                                    color:
                                                      "#047857",
                                                  }}
                                                >
                                                  {row.worked.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      900,
                                                    color:
                                                      row.variance >
                                                      0
                                                        ? "#be123c"
                                                        : row.variance <
                                                          0
                                                        ? "#b45309"
                                                        : "#475569",
                                                  }}
                                                >
                                                  {row.variance >=
                                                  0
                                                    ? "+"
                                                    : ""}
                                                  {row.variance.toFixed(
                                                    2
                                                  )}
                                                </td>
                                              </tr>
                                            )
                                          );
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* =============================
                                    DAILY BREAKDOWN
                                ============================= */}

                                <div
                                  style={{
                                    background:
                                      "#ffffff",
                                    border:
                                      "1px solid #dbeafe",
                                    borderRadius:
                                      18,
                                    overflow:
                                      "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding:
                                        "15px 16px",
                                      background:
                                        "#f8fbff",
                                      borderBottom:
                                        "1px solid #e2e8f0",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize:
                                          15,
                                        fontWeight:
                                          900,
                                        color:
                                          "#0f172a",
                                      }}
                                    >
                                      Daily
                                      Breakdown
                                    </div>

                                    <div
                                      style={{
                                        marginTop:
                                          4,
                                        fontSize:
                                          12,
                                        color:
                                          "#64748b",
                                      }}
                                    >
                                      Monday
                                      through Sunday
                                      assigned and
                                      worked hours.
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      width:
                                        "100%",
                                      overflowX:
                                        "auto",
                                      WebkitOverflowScrolling:
                                        "touch",
                                    }}
                                  >
                                    <table
                                      style={{
                                        width:
                                          "100%",
                                        borderCollapse:
                                          "separate",
                                        borderSpacing:
                                          0,
                                        minWidth:
                                          920,
                                      }}
                                    >
                                      <thead>
                                        <tr>
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
                                            Assigned
                                            Department
                                          </th>

                                          <th
                                            style={thStyle(
                                              {
                                                textAlign:
                                                  "left",
                                              }
                                            )}
                                          >
                                            Worked
                                            Department
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
                                              day.workedTotal -
                                              day.assignedTotal;

                                            const isDayOff =
                                              day.assignedTotal <=
                                              0;

                                            const assignedDepartments =
                                              Object.entries(
                                                day.assignedByDepartment
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

                                            const workedDepartments =
                                              Object.entries(
                                                day.workedByDepartment
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
                                                {/* DAY */}

                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  <div
                                                    style={{
                                                      fontWeight:
                                                        900,
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
                                                      marginTop:
                                                        4,
                                                      fontSize:
                                                        12,
                                                      color:
                                                        "#64748b",
                                                    }}
                                                  >
                                                    {formatDisplayDate(
                                                      day.date
                                                    )}
                                                  </div>
                                                </td>

                                                {/* ASSIGNED DEPARTMENT */}

                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  {isDayOff ? (
                                                    <Badge tone="gray">
                                                      DAY
                                                      OFF
                                                    </Badge>
                                                  ) : assignedDepartments.length ===
                                                    0 ? (
                                                    <span
                                                      style={{
                                                        color:
                                                          "#94a3b8",
                                                        fontSize:
                                                          12,
                                                        fontWeight:
                                                          700,
                                                      }}
                                                    >
                                                      No
                                                      assignment
                                                    </span>
                                                  ) : (
                                                    <div
                                                      style={{
                                                        display:
                                                          "grid",
                                                        gap: 5,
                                                      }}
                                                    >
                                                      {assignedDepartments.map(
                                                        ([
                                                          department,
                                                          hours,
                                                        ]) => (
                                                          <div
                                                            key={
                                                              department
                                                            }
                                                            style={{
                                                              fontSize:
                                                                12,
                                                              color:
                                                                "#334155",
                                                              fontWeight:
                                                                800,
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

                                                {/* WORKED DEPARTMENT */}

                                                <td
                                                  style={
                                                    tdStyle
                                                  }
                                                >
                                                  {workedDepartments.length ===
                                                  0 ? (
                                                    <span
                                                      style={{
                                                        color:
                                                          "#94a3b8",
                                                        fontSize:
                                                          12,
                                                        fontWeight:
                                                          700,
                                                      }}
                                                    >
                                                      No
                                                      approved
                                                      timesheet
                                                    </span>
                                                  ) : (
                                                    <div
                                                      style={{
                                                        display:
                                                          "grid",
                                                        gap: 5,
                                                      }}
                                                    >
                                                      {workedDepartments.map(
                                                        ([
                                                          department,
                                                          hours,
                                                        ]) => (
                                                          <div
                                                            key={
                                                              department
                                                            }
                                                            style={{
                                                              fontSize:
                                                                12,
                                                              color:
                                                                "#047857",
                                                              fontWeight:
                                                                800,
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

                                                {/* ASSIGNED HOURS */}

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      900,
                                                  }}
                                                >
                                                  {day.assignedTotal.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                {/* WORKED HOURS */}

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      900,
                                                    color:
                                                      "#047857",
                                                  }}
                                                >
                                                  {day.workedTotal.toFixed(
                                                    2
                                                  )}
                                                </td>

                                                {/* VARIANCE */}

                                                <td
                                                  style={{
                                                    ...tdStyle,
                                                    textAlign:
                                                      "center",
                                                    fontWeight:
                                                      900,
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
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {/* ======================================================
          OVERTIME ALERT
      ====================================================== */}

      {employeesOverForty.length >
        0 && (
        <PageCard
          style={{ padding: 20 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 19,
                  fontWeight: 900,
                  color: "#9f1239",
                }}
              >
                Weekly Overtime Alert
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: 13,
                }}
              >
                Employees with more
                than 40 assigned or
                worked hours.
              </p>
            </div>

            <Badge tone="red">
              {
                employeesOverForty.length
              }{" "}
              Employee(s)
            </Badge>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
            }}
          >
            {employeesOverForty.map(
              (employee) => {
                const variance =
                  employee.workedTotal -
                  employee.assignedTotal;

                return (
                  <button
                    key={
                      employee.employeeId
                    }
                    type="button"
                    onClick={() =>
                      toggleEmployee(
                        employee.employeeId
                      )
                    }
                    style={{
                      width: "100%",
                      border:
                        "1px solid #fecdd3",
                      background:
                        "#fff1f2",
                      borderRadius: 14,
                      padding:
                        "12px 14px",
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      gap: 12,
                      flexWrap: "wrap",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: "#9f1239",
                      }}
                    >
                      {
                        employee.employeeName
                      }
                    </span>

                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#9f1239",
                      }}
                    >
                      Assigned{" "}
                      {employee.assignedTotal.toFixed(
                        2
                      )}{" "}
                      · Worked{" "}
                      {employee.workedTotal.toFixed(
                        2
                      )}{" "}
                      · Variance{" "}
                      {variance >= 0
                        ? "+"
                        : ""}
                      {variance.toFixed(
                        2
                      )}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </PageCard>
      )}
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
            Total assigned and approved worked hours for the
            entire station by day.
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
            const totals = stationDailyTotals[dayKey] || {
              assigned: 0,
              worked: 0,
            };

            const variance =
              totals.worked - totals.assigned;

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
                    marginTop: 4,
                    fontSize: 11,
                    color: "#94a3b8",
                    fontWeight: 700,
                  }}
                >
                  {formatDisplayDate(weekDates[dayKey])}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    color: "#334155",
                    fontWeight: 700,
                  }}
                >
                  Assigned: {totals.assigned.toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "#047857",
                    fontWeight: 800,
                  }}
                >
                  Worked: {totals.worked.toFixed(2)}
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
                    fontWeight: 900,
                  }}
                >
                  Variance: {variance >= 0 ? "+" : ""}
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
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
              Total assigned and approved worked hours by
              operational department for the selected week.
            </p>
          </div>

          <Badge tone="blue">
            {departmentWeeklyTotals.length} Department(s)
          </Badge>
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
            No department totals found for the selected week.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
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
                </tr>
              </thead>

              <tbody>
                {departmentWeeklyTotals.map(
                  (row, index) => (
                    <tr
                      key={row.department}
                      style={{
                        background:
                          index % 2 === 0
                            ? "#ffffff"
                            : "#fbfdff",
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle,
                          fontWeight: 900,
                        }}
                      >
                        {row.department}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
                        }}
                      >
                        {row.assigned.toFixed(2)}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
                          color: "#047857",
                        }}
                      >
                        {row.worked.toFixed(2)}
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
                        {row.variance >= 0 ? "+" : ""}
                        {row.variance.toFixed(2)}
                      </td>
                    </tr>
                  )
                )}

                {/* =============================================
                    STATION TOTAL
                ============================================= */}

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
                      color: "#0f172a",
                    }}
                  >
                    {stationAssignedTotal.toFixed(2)}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 900,
                      color: "#047857",
                    }}
                  >
                    {stationWorkedTotal.toFixed(2)}
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
                    {stationVariance >= 0 ? "+" : ""}
                    {stationVariance.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {/* ======================================================
          REPORT FOOTER
      ====================================================== */}

      <PageCard
        style={{
          padding: 18,
          background:
            "linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: "#1769aa",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Weekly Report Summary
            </div>

            <div
              style={{
                marginTop: 5,
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              {employeeWeeklyData.length} employee(s) included
              in the selected week.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <Badge tone="blue">
              Assigned: {stationAssignedTotal.toFixed(2)} hrs
            </Badge>

            <Badge tone="green">
              Worked: {stationWorkedTotal.toFixed(2)} hrs
            </Badge>

            <Badge
              tone={
                stationVariance > 0
                  ? "red"
                  : stationVariance < 0
                  ? "amber"
                  : "gray"
              }
            >
              Variance: {stationVariance >= 0 ? "+" : ""}
              {stationVariance.toFixed(2)} hrs
            </Badge>
          </div>
        </div>
      </PageCard>
    </div>
  );
}

// ============================================================
// DETAIL METRIC
// ============================================================

function DetailMetric({
  label,
  value,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background: "#eff6ff",
      border: "#bfdbfe",
      label: "#1d4ed8",
      value: "#0f172a",
    },

    green: {
      background: "#ecfdf5",
      border: "#a7f3d0",
      label: "#047857",
      value: "#065f46",
    },

    amber: {
      background: "#fffbeb",
      border: "#fde68a",
      label: "#b45309",
      value: "#92400e",
    },

    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      label: "#be123c",
      value: "#9f1239",
    },

    gray: {
      background: "#f8fafc",
      border: "#e2e8f0",
      label: "#64748b",
      value: "#334155",
    },
  };

  const selectedTone =
    tones[tone] || tones.blue;

  return (
    <div
      style={{
        background:
          selectedTone.background,
        border: `1px solid ${selectedTone.border}`,
        borderRadius: 14,
        padding: "13px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          color: selectedTone.label,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 18,
          fontWeight: 900,
          color: selectedTone.value,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// TABLE HEADER STYLE
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
    borderBottom:
      "1px solid #e2e8f0",
    ...extra,
  };
}

// ============================================================
// TABLE CELL STYLE
// ============================================================

const tdStyle = {
  padding: "14px",
  borderBottom:
    "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
