// src/pages/WeeklyEmployeesSummaryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

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

  return airline || "Unknown";
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

function toMinutes(value) {
  if (!value) return null;

  const [hours, minutes] = String(value).split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function getBreakMinutes(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase();

  if (!clean || clean === "no") return 0;

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

function calculateScheduledShiftHours(shift) {
  if (!shift?.start || !shift?.end || shift.start === "OFF") {
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
    sample?.weekStart || weekTag || ""
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

export default function WeeklyEmployeesSummaryPage() {
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [timesheets, setTimesheets] = useState([]);

  const [selectedWeekTag, setSelectedWeekTag] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("approved");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const [employeeSnapshot, scheduleSnapshot, timesheetSnapshot] =
          await Promise.all([
            getDocs(collection(db, "employees")),
            getDocs(collection(db, "schedules")),
            getDocs(
              collection(db, "timesheet_reports")
            ),
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
    const scheduleMatchesStatus = (schedule) => {
    const status = String(schedule?.status || "")
      .trim()
      .toLowerCase();

    if (statusFilter === "both") {
      return status === "approved" || status === "draft";
    }

    return status === statusFilter;
  };

  const weekTags = useMemo(() => {
    return Array.from(
      new Set(
        schedules
          .filter(scheduleMatchesStatus)
          .map(
            (schedule) =>
              schedule.weekTag || schedule.weekStart
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      String(b).localeCompare(String(a))
    );
  }, [schedules, statusFilter]);

  useEffect(() => {
    if (!weekTags.length) {
      setSelectedWeekTag("");
      return;
    }

    if (!weekTags.includes(selectedWeekTag)) {
      setSelectedWeekTag(weekTags[0]);
    }
  }, [weekTags, selectedWeekTag]);

  const selectedWeekSchedules = useMemo(() => {
    if (!selectedWeekTag) {
      return [];
    }

    return schedules.filter((schedule) => {
      const scheduleWeek =
        schedule.weekTag || schedule.weekStart;

      return (
        scheduleWeek === selectedWeekTag &&
        scheduleMatchesStatus(schedule)
      );
    });
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
  }, [selectedWeekTag, selectedWeekSchedules]);

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
    });

    return {
      byId,
      byName,
    };
  }, [employees]);

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

      if (!result[employeeId]) {
        result[employeeId] = {
          employeeId,
          employeeName,

          days: DAY_KEYS.reduce(
            (accumulator, dayKey) => {
              accumulator[dayKey] = {
                date: weekDates[dayKey] || "",

                scheduledByAirline: {},
                actualByAirline: {},

                scheduledTotal: 0,
                actualTotal: 0,
              };

              return accumulator;
            },
            {}
          ),

          scheduledByAirline: {},
          actualByAirline: {},

          scheduledTotal: 0,
          actualTotal: 0,

          daysOff: 0,
        };
      }

      return result[employeeId];
    };

    selectedWeekSchedules.forEach((schedule) => {
      const airline = normalizeAirlineName(
        schedule.airlineDisplayName ||
          schedule.airline ||
          "Unknown"
      );

      const scheduleRows = Array.isArray(schedule.grid)
        ? schedule.grid
        : [];

      scheduleRows.forEach((row) => {
        if (!row?.employeeId) {
          return;
        }

        const employeeData = ensureEmployee(
          row.employeeId
        );

        DAY_KEYS.forEach((dayKey) => {
          const scheduledHours =
            calculateScheduledDayHours(
              row,
              dayKey
            );

          if (scheduledHours <= 0) {
            return;
          }

          employeeData.days[
            dayKey
          ].scheduledByAirline[airline] =
            (employeeData.days[dayKey]
              .scheduledByAirline[airline] || 0) +
            scheduledHours;

          employeeData.days[
            dayKey
          ].scheduledTotal += scheduledHours;

          employeeData.scheduledByAirline[airline] =
            (employeeData.scheduledByAirline[
              airline
            ] || 0) + scheduledHours;

          employeeData.scheduledTotal +=
            scheduledHours;
        });
      });
    });

    approvedTimesheetsForWeek.forEach((report) => {
      const airline = normalizeAirlineName(
        report.airline || "Unknown"
      );

      const reportDate = String(
        report.reportDate || ""
      ).trim();

      const matchingDayKey = DAY_KEYS.find(
        (dayKey) =>
          weekDates[dayKey] === reportDate
      );

      if (!matchingDayKey) {
        return;
      }

      const rows = Array.isArray(report.rows)
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

        if (!employeeId && rowEmployeeName) {
          const matchingEmployee =
            employeeLookup.byName[
              normalizeText(rowEmployeeName)
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

        const employeeData = ensureEmployee(
          employeeId,
          rowEmployeeName
        );

        employeeData.days[
          matchingDayKey
        ].actualByAirline[airline] =
          (employeeData.days[matchingDayKey]
            .actualByAirline[airline] || 0) +
          actualHours;

        employeeData.days[
          matchingDayKey
        ].actualTotal += actualHours;

        employeeData.actualByAirline[airline] =
          (employeeData.actualByAirline[
            airline
          ] || 0) + actualHours;

        employeeData.actualTotal +=
          actualHours;
      });
    });

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
    approvedTimesheetsForWeek,
    employeeLookup,
    weekDates,
  ]);

  const stationDailyTotals = useMemo(() => {
    return DAY_KEYS.reduce(
      (accumulator, dayKey) => {
        accumulator[dayKey] = {
          scheduled: employeeWeeklyData.reduce(
            (sum, employee) =>
              sum +
              employee.days[dayKey]
                .scheduledTotal,
            0
          ),

          actual: employeeWeeklyData.reduce(
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

  const airlineWeeklyTotals = useMemo(() => {
    const totals = {};

    employeeWeeklyData.forEach((employee) => {
      Object.entries(
        employee.scheduledByAirline
      ).forEach(([airline, hours]) => {
        if (!totals[airline]) {
          totals[airline] = {
            scheduled: 0,
            actual: 0,
          };
        }

        totals[airline].scheduled += hours;
      });

      Object.entries(
        employee.actualByAirline
      ).forEach(([airline, hours]) => {
        if (!totals[airline]) {
          totals[airline] = {
            scheduled: 0,
            actual: 0,
          };
        }

        totals[airline].actual += hours;
      });
    });

    return Object.entries(totals)
      .map(([airline, values]) => ({
        airline,
        scheduled: values.scheduled,
        actual: values.actual,
        variance:
          values.actual - values.scheduled,
      }))
      .sort((a, b) =>
        a.airline.localeCompare(b.airline)
      );
  }, [employeeWeeklyData]);

  const stationScheduledTotal = useMemo(() => {
    return employeeWeeklyData.reduce(
      (sum, employee) =>
        sum + employee.scheduledTotal,
      0
    );
  }, [employeeWeeklyData]);

  const stationActualTotal = useMemo(() => {
    return employeeWeeklyData.reduce(
      (sum, employee) =>
        sum + employee.actualTotal,
      0
    );
  }, [employeeWeeklyData]);

  const stationVariance =
    stationActualTotal - stationScheduledTotal;

  const employeesOverForty = useMemo(() => {
    return employeeWeeklyData.filter(
      (employee) =>
        employee.scheduledTotal > 40 ||
        employee.actualTotal > 40
    );
  }, [employeeWeeklyData]);

  const formatWeekLabel = () => {
    const sample = selectedWeekSchedules[0];

    if (!sample?.days) {
      return (
        selectedWeekTag ||
        "No week selected"
      );
    }

    return DAY_KEYS.map((dayKey) => {
      const label = DAY_LABELS[dayKey];

      const dayNumber =
        sample.days?.[dayKey];

      return dayNumber
        ? `${label} ${dayNumber}`
        : label;
    }).join("  |  ");
  };

  const statusLabel =
    statusFilter === "approved"
      ? "Approved schedules only"
      : statusFilter === "draft"
      ? "Draft schedules only"
      : "Approved and draft schedules";

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
              Compare scheduled hours with approved
              actual timesheets, review each employee
              day by day, identify days off and monitor
              weekly overtime.
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
              onChange={(event) =>
                setSelectedWeekTag(
                  event.target.value
                )
              }
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

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 14,
          }}
        >
          <SummaryCard
            label="Scheduled Hours"
            value={stationScheduledTotal.toFixed(
              2
            )}
            subValue={statusLabel}
          />

          <SummaryCard
            label="Approved Actual Hours"
            value={stationActualTotal.toFixed(2)}
            subValue={`${approvedTimesheetsForWeek.length} approved timesheet report(s)`}
          />

          <SummaryCard
            label="Station Variance"
            value={`${
              stationVariance >= 0 ? "+" : ""
            }${stationVariance.toFixed(2)}`}
            subValue="Actual minus scheduled"
            alert={stationVariance > 0}
          />

          <SummaryCard
            label="Employees Over 40"
            value={employeesOverForty.length}
            subValue="Scheduled or approved actual hours"
            alert={
              employeesOverForty.length > 0
            }
          />
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
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
          Actual hours include only timesheet
          reports already approved by a duty manager
          or station manager.
        </p>
      </PageCard>

      {employeesOverForty.length > 0 && (
        <PageCard style={{ padding: 20 }}>
          <div
            style={{
              background: "#fff1f2",
              border:
                "1px solid #fecdd3",
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
                      color: "#9f1239",
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {employee.employeeName}:
                    {" "}scheduled{" "}
                    {employee.scheduledTotal.toFixed(
                      2
                    )}{" "}
                    hrs · actual{" "}
                    {employee.actualTotal.toFixed(
                      2
                    )}{" "}
                    hrs
                  </div>
                )
              )}
            </div>
          </div>
        </PageCard>
      )}

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
            Employee Daily Breakdown
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Each employee is displayed as a
            separate section with one row for every
            day of the selected week.
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
            selected week and filter.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {employeeWeeklyData.map(
              (employee) => {
                const variance =
                  employee.actualTotal -
                  employee.scheduledTotal;

                const overForty =
                  employee.scheduledTotal > 40 ||
                  employee.actualTotal > 40;

                return (
                  <div
                    key={employee.employeeId}
                    style={{
                      border: overForty
                        ? "1px solid #fecdd3"
                        : "1px solid #dbeafe",
                      borderRadius: 20,
                      overflow: "hidden",
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        gap: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                        padding:
                          "16px 18px",
                        background: overForty
                          ? "#fff1f2"
                          : "#f8fbff",
                        borderBottom: overForty
                          ? "1px solid #fecdd3"
                          : "1px solid #dbeafe",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 17,
                            fontWeight: 900,
                            color: overForty
                              ? "#9f1239"
                              : "#0f172a",
                          }}
                        >
                          {
                            employee.employeeName
                          }
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 700,
                          }}
                        >
                          Days off:{" "}
                          {employee.daysOff}
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
                          Scheduled:{" "}
                          {employee.scheduledTotal.toFixed(
                            2
                          )}
                        </Badge>

                        <Badge tone="green">
                          Actual:{" "}
                          {employee.actualTotal.toFixed(
                            2
                          )}
                        </Badge>

                        <Badge
                          tone={
                            variance > 0
                              ? "red"
                              : variance < 0
                              ? "amber"
                              : "gray"
                          }
                        >
                          Variance:{" "}
                          {variance >= 0
                            ? "+"
                            : ""}
                          {variance.toFixed(2)}
                        </Badge>

                        {overForty && (
                          <Badge tone="red">
                            Over 40 hrs
                          </Badge>
                        )}
                      </div>
                    </div>

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
                          minWidth: 900,
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              background:
                                "#ffffff",
                            }}
                          >
                            <th
                              style={thStyle({
                                textAlign:
                                  "left",
                              })}
                            >
                              Day
                            </th>

                            <th
                              style={thStyle({
                                textAlign:
                                  "left",
                              })}
                            >
                              Scheduled Assignment
                            </th>

                            <th
                              style={thStyle({
                                textAlign:
                                  "left",
                              })}
                            >
                              Approved Actual
                            </th>

                            <th
                              style={thStyle({
                                textAlign:
                                  "center",
                              })}
                            >
                              Scheduled
                            </th>

                            <th
                              style={thStyle({
                                textAlign:
                                  "center",
                              })}
                            >
                              Actual
                            </th>

                            <th
                              style={thStyle({
                                textAlign:
                                  "center",
                              })}
                            >
                              Variance
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {DAY_KEYS.map(
                            (
                              dayKey,
                              index
                            ) => {
                              const day =
                                employee.days[
                                  dayKey
                                ];

                              const isDayOff =
                                day.scheduledTotal <=
                                0;

                              const dayVariance =
                                day.actualTotal -
                                day.scheduledTotal;

                              const scheduledAssignments =
                                Object.entries(
                                  day.scheduledByAirline
                                ).sort(
                                  ([first], [
                                    second,
                                  ]) =>
                                    first.localeCompare(
                                      second
                                    )
                                );

                              const actualAssignments =
                                Object.entries(
                                  day.actualByAirline
                                ).sort(
                                  ([first], [
                                    second,
                                  ]) =>
                                    first.localeCompare(
                                      second
                                    )
                                );

                              return (
                                <tr
                                  key={dayKey}
                                  style={{
                                    background:
                                      index % 2 ===
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
                                        marginTop: 4,
                                        fontSize: 12,
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
                                    {isDayOff ? (
                                      <Badge tone="gray">
                                        DAY OFF
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
                                            airline,
                                            hours,
                                          ]) => (
                                            <div
                                              key={
                                                airline
                                              }
                                              style={{
                                                fontSize: 13,
                                                color:
                                                  "#334155",
                                                fontWeight: 700,
                                              }}
                                            >
                                              {
                                                airline
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
                                          fontSize: 13,
                                          fontWeight: 700,
                                        }}
                                      >
                                        No approved
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
                                        {actualAssignments.map(
                                          ([
                                            airline,
                                            hours,
                                          ]) => (
                                            <div
                                              key={
                                                airline
                                              }
                                              style={{
                                                fontSize: 13,
                                                color:
                                                  "#047857",
                                                fontWeight: 800,
                                              }}
                                            >
                                              {
                                                airline
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
                                    {dayVariance >= 0
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
                );
              }
            )}
          </div>
        )}
      </PageCard>
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
            }}
          >
            Total scheduled and approved actual
            hours used by the entire station.
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
                  border:
                    "1px solid #dbeafe",
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
                  Scheduled:{" "}
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
                  Actual:{" "}
                  {totals.actual.toFixed(2)}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color:
                      variance > 0
                        ? "#be123c"
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
            Weekly Totals by Airline
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Scheduled and approved actual hours by
            airline for the selected week.
          </p>
        </div>

        {airlineWeeklyTotals.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#f8fbff",
              border:
                "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No airline totals found.
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
                    Airline
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Scheduled
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Approved Actual
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
                {airlineWeeklyTotals.map(
                  (row, index) => (
                    <tr
                      key={row.airline}
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
                        {row.airline}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
                        }}
                      >
                        {row.scheduled.toFixed(2)}
                      </td>

                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
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
                    </tr>
                  )
                )}

                <tr
                  style={{
                    background: "#edf7ff",
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 900,
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
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  );
}

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

const tdStyle = {
  padding: "14px",
  borderBottom:
    "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
