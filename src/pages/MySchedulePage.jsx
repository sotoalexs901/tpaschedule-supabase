// src/pages/MySchedulePage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

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

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth < breakpoint
      : false
  );

  useEffect(() => {
    const handler = () =>
      setIsMobile(window.innerWidth < breakpoint);

    window.addEventListener("resize", handler);

    return () =>
      window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;

  if (!s || !s.start || s.start === "OFF") {
    return "OFF";
  }

  if (!s.end) return s.start;

  return `${s.start} - ${s.end}`;
}

function hasWork(shifts) {
  if (!Array.isArray(shifts)) return false;

  return shifts.some(
    (s) =>
      s &&
      s.start &&
      s.start !== "OFF"
  );
}

function countWorkedDays(row) {
  return DAY_KEYS.filter((dayKey) =>
    hasWork(row?.[dayKey])
  ).length;
}

function getEmployeeDisplayName(emp) {
  return (
    emp?.name ||
    emp?.fullName ||
    emp?.employeeName ||
    emp?.username ||
    "Unknown Employee"
  );
}

function buildEmployeeMatch(user, employees) {
  if (
    !user ||
    !Array.isArray(employees) ||
    employees.length === 0
  ) {
    return null;
  }

  const userId = norm(user.id);
  const employeeId = norm(user.employeeId);
  const username = norm(user.username);
  const loginUsername = norm(user.loginUsername);

  return (
    employees.find((e) => norm(e.id) === employeeId) ||
    employees.find((e) => norm(e.linkedUserId) === userId) ||
    employees.find((e) => norm(e.employeeId) === employeeId) ||
    employees.find((e) => norm(e.loginUsername) === username) ||
    employees.find((e) => norm(e.loginUsername) === loginUsername) ||
    employees.find((e) => norm(e.username) === username) ||
    employees.find((e) => norm(e.code) === username) ||
    employees.find((e) => norm(e.name) === username) ||
    null
  );
}

function timeToMinutes(value) {
  if (!value || !String(value).includes(":")) {
    return null;
  }

  const [hh, mm] = String(value)
    .split(":")
    .map(Number);

  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm)
  ) {
    return null;
  }

  return hh * 60 + mm;
}

function calcShiftHours(shift) {
  if (
    !shift?.start ||
    !shift?.end ||
    shift.start === "OFF"
  ) {
    return 0;
  }

  let start = timeToMinutes(shift.start);
  let end = timeToMinutes(shift.end);

  if (
    start === null ||
    end === null
  ) {
    return 0;
  }

  if (end <= start) {
    end += 24 * 60;
  }

  return (end - start) / 60;
}

function calcRowHours(row) {
  if (!row) return 0;

  return DAY_KEYS.reduce(
    (total, dayKey) => {
      const shifts = Array.isArray(row[dayKey])
        ? row[dayKey]
        : [];

      return (
        total +
        shifts.reduce(
          (sum, shift) =>
            sum + calcShiftHours(shift),
          0
        )
      );
    },
    0
  );
}

function roundHours(value) {
  return Number(value.toFixed(2));
}

function parseScheduleDayDate(sch, dayKey) {
  const raw = sch?.days?.[dayKey];

  if (!raw) return null;

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(raw)
    )
  ) {
    const d = new Date(
      `${raw}T00:00:00`
    );

    return Number.isNaN(d.getTime())
      ? null
      : d;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function isSameDate(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDayVisualState(sch, dayKey) {
  const dayDate =
    parseScheduleDayDate(sch, dayKey);

  if (!dayDate) {
    return "neutral";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const compareDate =
    new Date(dayDate);

  compareDate.setHours(0, 0, 0, 0);

  if (compareDate < today) {
    return "past";
  }

  if (
    isSameDate(compareDate, today)
  ) {
    return "today";
  }

  return "future";
}

function findNextShift(
  schedules,
  currentEmployeeId
) {
  const now = new Date();
  let closest = null;

  for (const sch of schedules || []) {
    const row = (sch.grid || []).find(
      (item) =>
        item.employeeId ===
        currentEmployeeId
    );

    if (!row) continue;

    for (const dayKey of DAY_KEYS) {
      const baseDate =
        parseScheduleDayDate(
          sch,
          dayKey
        );

      if (!baseDate) continue;

      const shifts = Array.isArray(
        row[dayKey]
      )
        ? row[dayKey]
        : [];

      for (const shift of shifts) {
        if (
          !shift?.start ||
          shift.start === "OFF"
        ) {
          continue;
        }

        const [hh, mm] =
          String(shift.start)
            .split(":")
            .map(Number);

        if (
          Number.isNaN(hh) ||
          Number.isNaN(mm)
        ) {
          continue;
        }

        const shiftDate =
          new Date(baseDate);

        shiftDate.setHours(
          hh,
          mm,
          0,
          0
        );

        if (shiftDate < now) {
          continue;
        }

        if (
          !closest ||
          shiftDate <
            closest.startDateTime
        ) {
          closest = {
            scheduleId: sch.id,
            airline:
              sch.airlineDisplayName ||
              sch.airline ||
              "Airline",
            department:
              sch.department ||
              "Department",
            dayKey,
            dateLabel:
              sch.days?.[dayKey] ||
              "",
            start: shift.start,
            end: shift.end || "",
            startDateTime:
              shiftDate,
          };
        }
      }
    }
  }

  return closest;
}

function formatNextShiftText(
  nextShift
) {
  if (!nextShift) {
    return "No upcoming shift found";
  }

  const dateText =
    nextShift.startDateTime?.toLocaleDateString(
      [],
      {
        month: "short",
        day: "numeric",
      }
    ) ||
    nextShift.dateLabel ||
    "";

  const timeText = nextShift.end
    ? `${nextShift.start} - ${nextShift.end}`
    : nextShift.start;

  return `${DAY_FULL[nextShift.dayKey]} ${dateText} \u00B7 ${timeText}`;
}

function getCellTheme({
  isNextDay,
  state,
  off,
}) {
  if (isNextDay) {
    return {
      background: off
        ? "#dbeafe"
        : "#bfdbfe",
      border: "#60a5fa",
      color: "#1e3a8a",
    };
  }

  if (state === "past") {
    return {
      background: off
        ? "#f1f5f9"
        : "#e2e8f0",
      border: "#cbd5e1",
      color: "#64748b",
    };
  }

  if (state === "today") {
    return {
      background: off
        ? "#fef3c7"
        : "#fde68a",
      border: "#f59e0b",
      color: "#92400e",
    };
  }

  return {
    background: off
      ? "#f8fafc"
      : "#eff6ff",
    border: off
      ? "#e2e8f0"
      : "#bfdbfe",
    color: off
      ? "#64748b"
      : "#1d4ed8",
  };
}

function SummaryCard({
  label,
  value,
  subValue,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.98) 100%)",
        border:
          "1px solid rgba(219,234,254,0.95)",
        borderRadius: 20,
        padding: "16px 17px",
        boxShadow:
          "0 12px 28px rgba(15,23,42,0.045)",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 850,
          color: "#64748b",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.09em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 25,
          fontWeight: 900,
          color: "#0f172a",
          lineHeight: 1,
          letterSpacing:
            "-0.035em",
        }}
      >
        {value}
      </div>

      {subValue ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "#64748b",
            lineHeight: 1.45,
          }}
        >
          {subValue}
        </div>
      ) : null}
    </div>
  );
}

function ShiftBadge({
  text,
  off = false,
  isNextDay = false,
  state = "neutral",
}) {
  const theme =
    getCellTheme({
      isNextDay,
      state,
      off,
    });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 88,
        padding: "8px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 800,
        background:
          theme.background,
        color: theme.color,
        border: `1px solid ${theme.border}`,
      }}
    >
      {text}
    </div>
  );
}

function MobileDayCard({
  sch,
  dayKey,
  shifts,
  isNextDay,
}) {
  const state =
    getDayVisualState(
      sch,
      dayKey
    );

  const shiftOne =
    getShiftText(shifts, 0);

  const shiftTwo =
    getShiftText(shifts, 1);

  const working =
    hasWork(shifts);

  const cardBackground =
    isNextDay
      ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)"
      : state === "today"
      ? "linear-gradient(135deg, #fffdf5 0%, #fef3c7 100%)"
      : state === "past"
      ? "#f8fafc"
      : "#ffffff";

  return (
    <div
      style={{
        border: `1px solid ${
          isNextDay
            ? "#93c5fd"
            : state === "today"
            ? "#fbbf24"
            : "#e2e8f0"
        }`,
        borderRadius: 18,
        padding: 14,
        background:
          cardBackground,
        boxShadow:
          isNextDay
            ? "0 10px 24px rgba(37,99,235,0.09)"
            : "0 6px 18px rgba(15,23,42,0.035)",
        opacity:
          state === "past"
            ? 0.82
            : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 900,
              color: "#475569",
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
            }}
          >
            {DAY_FULL[dayKey]}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              fontWeight: 700,
              color: "#94a3b8",
            }}
          >
            {sch.days?.[dayKey] ||
              ""}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent:
              "flex-end",
          }}
        >
          {state === "today" && (
            <span
              style={{
                padding:
                  "5px 8px",
                borderRadius: 999,
                background:
                  "#f59e0b",
                color: "#ffffff",
                fontSize: 9.5,
                fontWeight: 900,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.06em",
              }}
            >
              Today
            </span>
          )}

          {isNextDay && (
            <span
              style={{
                padding:
                  "5px 8px",
                borderRadius: 999,
                background:
                  "#1769aa",
                color: "#ffffff",
                fontSize: 9.5,
                fontWeight: 900,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.06em",
              }}
            >
              Next Shift
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns:
            "1fr 1fr",
          gap: 8,
        }}
      >
        <div
          style={{
            background:
              "rgba(255,255,255,0.72)",
            border:
              "1px solid rgba(226,232,240,0.9)",
            borderRadius: 13,
            padding: 10,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              color: "#94a3b8",
              fontWeight: 850,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.06em",
              marginBottom: 6,
            }}
          >
            Shift 1
          </div>

          <ShiftBadge
            text={shiftOne}
            off={
              shiftOne === "OFF"
            }
            isNextDay={
              isNextDay
            }
            state={state}
          />
        </div>

        <div
          style={{
            background:
              "rgba(255,255,255,0.72)",
            border:
              "1px solid rgba(226,232,240,0.9)",
            borderRadius: 13,
            padding: 10,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              color: "#94a3b8",
              fontWeight: 850,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.06em",
              marginBottom: 6,
            }}
          >
            Shift 2
          </div>

          <ShiftBadge
            text={shiftTwo}
            off={
              shiftTwo === "OFF"
            }
            isNextDay={
              isNextDay
            }
            state={state}
          />
        </div>
      </div>

      {!working && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          Day off
        </div>
      )}
    </div>
  );
}

export default function MySchedulePage() {
  const { user } = useUser();
  const isMobile =
    useIsMobile(760);

  const [employees, setEmployees] =
    useState([]);

  const [
    currentEmployee,
    setCurrentEmployee,
  ] = useState(null);

  const [
    mySchedules,
    setMySchedules,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    openCoworkers,
    setOpenCoworkers,
  ] = useState({});

  const toggleCoworkers = (
    scheduleId
  ) => {
    setOpenCoworkers((prev) => ({
      ...prev,
      [scheduleId]:
        !prev[scheduleId],
    }));
  };

  useEffect(() => {
    async function loadData() {
      if (!user) return;

      try {
        setLoading(true);
        setError("");

        const empSnap =
          await getDocs(
            collection(
              db,
              "employees"
            )
          );

        const empList =
          empSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

        setEmployees(empList);

        const me =
          buildEmployeeMatch(
            user,
            empList
          );

        if (!me) {
          setCurrentEmployee(
            null
          );
          setMySchedules([]);
          return;
        }

        setCurrentEmployee(me);

        const schSnap =
          await getDocs(
            query(
              collection(
                db,
                "schedules"
              ),
              where(
                "status",
                "==",
                "approved"
              )
            )
          );

        const allApproved =
          schSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));

        const mine =
          allApproved
            .filter((sch) =>
              Array.isArray(
                sch.grid
              )
                ? sch.grid.some(
                    (row) =>
                      row.employeeId ===
                      me.id
                  )
                : false
            )
            .sort((a, b) => {
              const ad =
                String(
                  a.createdAt
                    ?.seconds ||
                    a.updatedAt
                      ?.seconds ||
                    0
                );

              const bd =
                String(
                  b.createdAt
                    ?.seconds ||
                    b.updatedAt
                      ?.seconds ||
                    0
                );

              return bd.localeCompare(
                ad
              );
            });

        setMySchedules(mine);
      } catch (err) {
        console.error(
          "Error loading my schedule:",
          err
        );

        setError(
          "There was an error loading your schedule."
        );

        setMySchedules([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  const totalSchedules =
    mySchedules.length;

  const totalWorkedDays =
    useMemo(() => {
      return mySchedules.reduce(
        (sum, sch) => {
          const row =
            (sch.grid || []).find(
              (item) =>
                item.employeeId ===
                currentEmployee?.id
            );

          return (
            sum +
            countWorkedDays(row)
          );
        },
        0
      );
    }, [
      mySchedules,
      currentEmployee,
    ]);

  const totalHours =
    useMemo(() => {
      return roundHours(
        mySchedules.reduce(
          (sum, sch) => {
            const row =
              (sch.grid || []).find(
                (item) =>
                  item.employeeId ===
                  currentEmployee?.id
              );

            return (
              sum +
              calcRowHours(row)
            );
          },
          0
        )
      );
    }, [
      mySchedules,
      currentEmployee,
    ]);

  const nextShift =
    useMemo(() => {
      if (
        !currentEmployee?.id
      ) {
        return null;
      }

      return findNextShift(
        mySchedules,
        currentEmployee.id
      );
    }, [
      mySchedules,
      currentEmployee,
    ]);

  const handlePrint = () => {
    window.print();
  };

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <p
          style={{
            fontSize: 14,
            color: "#475569",
          }}
        >
          Please log in to see your
          schedule.
        </p>
      </div>
    );
  }

  if (
    !loading &&
    !currentEmployee
  ) {
    return (
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gap: 18,
          fontFamily:
            "Poppins, Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, #071c33 0%, #0f4c81 42%, #1769aa 72%, #62c4ef 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            boxShadow:
              "0 24px 60px rgba(23,105,170,0.22)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.2em",
              color:
                "rgba(255,255,255,0.72)",
              fontWeight: 800,
            }}
          >
            {APP_NAME}{" "}
            {"\u00B7"} Crew Portal
          </p>

          <h1
            style={{
              margin:
                "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing:
                "-0.04em",
            }}
          >
            My Schedule
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color:
                "rgba(255,255,255,0.88)",
            }}
          >
            We could not match your
            login with any employee
            profile.
          </p>
        </div>

        <div
          style={{
            background: "#ffffff",
            border:
              "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 20,
            boxShadow:
              "0 8px 24px rgba(15,23,42,0.04)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#475569",
              lineHeight: 1.7,
            }}
          >
            Please contact your station
            manager or HR so they can
            link your user account to
            your employee profile.
          </p>

          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.7,
            }}
          >
            Recommended fields to
            match:
            <br />
            <code>
              employeeId
            </code>
            ,{" "}
            <code>
              linkedUserId
            </code>
            , or{" "}
            <code>
              loginUsername
            </code>{" "}
            ={" "}
            <b>
              {user.username}
            </b>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="my-schedule-page"
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gap: isMobile
          ? 12
          : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #071c33 0%, #0f4c81 42%, #1769aa 72%, #62c4ef 100%)",
          borderRadius:
            isMobile
              ? 22
              : 30,
          padding:
            isMobile
              ? 18
              : 25,
          color: "#fff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
          position:
            "relative",
          overflow:
            "hidden",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width: 240,
            height: 240,
            borderRadius: 999,
            border:
              "1px solid rgba(255,255,255,0.09)",
            top: -120,
            right: -55,
            pointerEvents:
              "none",
          }}
        />

        <div
          style={{
            position:
              "absolute",
            width: 120,
            height: 120,
            borderRadius: 999,
            background:
              "rgba(255,255,255,0.05)",
            bottom: -65,
            left: -30,
            pointerEvents:
              "none",
          }}
        />

        <div
          style={{
            position:
              "relative",
            display: "flex",
            justifyContent:
              "space-between",
            gap: 14,
            flexWrap: "wrap",
            alignItems:
              "flex-start",
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.18em",
                color:
                  "rgba(255,255,255,0.68)",
                fontWeight: 850,
              }}
            >
              {APP_NAME}{" "}
              {"\u00B7"} Crew Portal
            </p>

            <h1
              style={{
                margin:
                  "8px 0 5px",
                fontSize:
                  isMobile
                    ? 27
                    : 34,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing:
                  "-0.045em",
              }}
            >
              My Schedule
            </h1>

            <p
              style={{
                margin: 0,
                fontSize:
                  isMobile
                    ? 12.5
                    : 14,
                color:
                  "rgba(255,255,255,0.94)",
                fontWeight: 750,
              }}
            >
              {getEmployeeDisplayName(
                currentEmployee
              )}
            </p>

            <p
              style={{
                margin:
                  "4px 0 0",
                fontSize: 11,
                color:
                  "rgba(255,255,255,0.7)",
                textTransform:
                  "capitalize",
              }}
            >
              {user.role ||
                "Team Member"}
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            style={{
              border:
                "1px solid rgba(255,255,255,0.28)",
              background:
                "rgba(255,255,255,0.11)",
              color: "#fff",
              borderRadius: 13,
              padding:
                "9px 12px",
              fontWeight: 850,
              fontSize: 11.5,
              cursor: "pointer",
              backdropFilter:
                "blur(8px)",
            }}
          >
            Print Schedule
          </button>
        </div>

        <div
          style={{
            position:
              "relative",
            marginTop: 16,
            padding:
              isMobile
                ? 14
                : 16,
            borderRadius: 18,
            background:
              "rgba(255,255,255,0.11)",
            border:
              "1px solid rgba(255,255,255,0.14)",
            backdropFilter:
              "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 850,
              color:
                "rgba(255,255,255,0.66)",
              textTransform:
                "uppercase",
              letterSpacing:
                "0.11em",
            }}
          >
            Next Shift
          </div>

          <div
            style={{
              marginTop: 6,
              display: "flex",
              justifyContent:
                "space-between",
              gap: 12,
              alignItems:
                "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    isMobile
                      ? 26
                      : 30,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing:
                    "-0.04em",
                }}
              >
                {nextShift
                  ? nextShift.start
                  : "--"}
              </div>

              <div
                style={{
                  marginTop: 7,
                  fontSize:
                    isMobile
                      ? 11.5
                      : 12.5,
                  color:
                    "rgba(255,255,255,0.86)",
                }}
              >
                {formatNextShiftText(
                  nextShift
                )}
              </div>
            </div>

            {nextShift && (
              <div
                style={{
                  textAlign:
                    isMobile
                      ? "left"
                      : "right",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color:
                      "rgba(255,255,255,0.9)",
                  }}
                >
                  {nextShift.airline}
                </div>

                <div
                  style={{
                    marginTop: 2,
                    fontSize: 10.5,
                    color:
                      "rgba(255,255,255,0.65)",
                  }}
                >
                  {nextShift.department}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(4, minmax(0, 1fr))",
          gap:
            isMobile
              ? 9
              : 14,
        }}
      >
        <SummaryCard
          label="Schedules"
          value={
            loading
              ? "..."
              : totalSchedules
          }
          subValue="Approved"
        />

        <SummaryCard
          label="Worked Days"
          value={
            loading
              ? "..."
              : totalWorkedDays
          }
          subValue="All schedules"
        />

        <SummaryCard
          label="Hours"
          value={
            loading
              ? "..."
              : totalHours
          }
          subValue="Estimated"
        />

        <SummaryCard
          label="Next Start"
          value={
            nextShift
              ? nextShift.start
              : "--"
          }
          subValue={
            nextShift
              ? DAY_FULL[
                  nextShift.dayKey
                ]
              : "No upcoming shift"
          }
        />
      </div>

      {loading && (
        <div
          style={{
            background:
              "#ffffff",
            border:
              "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 20,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 650,
            boxShadow:
              "0 10px 26px rgba(15,23,42,0.04)",
          }}
        >
          Loading your schedules...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            background:
              "#fff1f2",
            border:
              "1px solid #fecdd3",
            borderRadius: 20,
            padding: 20,
            color: "#9f1239",
            fontSize: 14,
            fontWeight: 750,
          }}
        >
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        mySchedules.length ===
          0 && (
          <div
            style={{
              background:
                "#ffffff",
              border:
                "1px solid #e2e8f0",
              borderRadius: 20,
              padding: 20,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 650,
              boxShadow:
                "0 10px 26px rgba(15,23,42,0.04)",
            }}
          >
            No approved schedules
            found for your profile.
          </div>
        )}

      {!loading &&
        !error &&
        mySchedules.map(
          (sch) => {
            const myRow =
              (sch.grid ||
                []).find(
                (row) =>
                  row.employeeId ===
                  currentEmployee.id
              );

            const workedDays =
              countWorkedDays(
                myRow
              );

            const workedHours =
              roundHours(
                calcRowHours(
                  myRow
                )
              );

            const empMap =
              employees.reduce(
                (acc, e) => {
                  acc[e.id] =
                    getEmployeeDisplayName(
                      e
                    );
                  return acc;
                },
                {}
              );

            const coworkersByDay =
              DAY_KEYS.map(
                (dayKey) => {
                  const myDayShifts =
                    myRow
                      ? myRow[
                          dayKey
                        ]
                      : null;

                  if (
                    !hasWork(
                      myDayShifts
                    )
                  ) {
                    return null;
                  }

                  const names =
                    Array.from(
                      new Set(
                        (
                          sch.grid ||
                          []
                        )
                          .filter(
                            (
                              row
                            ) =>
                              row.employeeId !==
                              currentEmployee.id
                          )
                          .filter(
                            (
                              row
                            ) =>
                              hasWork(
                                row[
                                  dayKey
                                ]
                              )
                          )
                          .map(
                            (
                              row
                            ) =>
                              empMap[
                                row
                                  .employeeId
                              ]
                          )
                          .filter(
                            Boolean
                          )
                      )
                    );

                  return {
                    key: dayKey,
                    names,
                  };
                }
              ).filter(Boolean);

            const isOpen =
              !!openCoworkers[
                sch.id
              ];

            return (
              <div
                key={sch.id}
                style={{
                  background:
                    "rgba(255,255,255,0.98)",
                  border:
                    "1px solid #e2e8f0",
                  borderRadius:
                    isMobile
                      ? 20
                      : 26,
                  padding:
                    isMobile
                      ? 14
                      : 20,
                  boxShadow:
                    "0 14px 34px rgba(15,23,42,0.055)",
                  display:
                    "grid",
                  gap: 15,
                  overflow:
                    "hidden",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    gap: 12,
                    alignItems:
                      "flex-start",
                    flexWrap:
                      "wrap",
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          9.5,
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
                      Approved Schedule
                    </div>

                    <h2
                      style={{
                        margin:
                          "5px 0 0",
                        fontSize:
                          isMobile
                            ? 18
                            : 21,
                        fontWeight:
                          900,
                        color:
                          "#0f172a",
                        letterSpacing:
                          "-0.025em",
                      }}
                    >
                      {sch.airlineDisplayName ||
                        sch.airline ||
                        "Airline"}{" "}
                      {"\u00B7"}{" "}
                      {sch.department ||
                        "Department"}
                    </h2>

                    <p
                      style={{
                        margin:
                          "6px 0 0",
                        fontSize:
                          11.5,
                        color:
                          "#64748b",
                        lineHeight:
                          1.55,
                      }}
                    >
                      {sch.days
                        ? DAY_KEYS.map(
                            (
                              key
                            ) =>
                              `${DAY_LABELS[key]}${
                                sch
                                  .days?.[
                                  key
                                ]
                                  ? ` ${sch.days[key]}`
                                  : ""
                              }`
                          ).join(
                            " \u00B7 "
                          )
                        : "No week labels"}
                    </p>
                  </div>

                  <div
                    style={{
                      display:
                        "flex",
                      gap: 7,
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div
                      style={{
                        background:
                          "#f8fbff",
                        border:
                          "1px solid #dbeafe",
                        color:
                          "#1769aa",
                        borderRadius:
                          999,
                        padding:
                          "7px 10px",
                        fontSize:
                          10.5,
                        fontWeight:
                          850,
                      }}
                    >
                      {workedDays} days
                    </div>

                    <div
                      style={{
                        background:
                          "#f8fbff",
                        border:
                          "1px solid #dbeafe",
                        color:
                          "#1769aa",
                        borderRadius:
                          999,
                        padding:
                          "7px 10px",
                        fontSize:
                          10.5,
                        fontWeight:
                          850,
                      }}
                    >
                      {workedHours} hrs
                    </div>
                  </div>
                </div>

                {myRow ? (
                  isMobile ? (
                    <div
                      style={{
                        display:
                          "grid",
                        gap: 9,
                      }}
                    >
                      {DAY_KEYS.map(
                        (
                          dayKey
                        ) => {
                          const isNextDay =
                            nextShift?.scheduleId ===
                              sch.id &&
                            nextShift?.dayKey ===
                              dayKey;

                          return (
                            <MobileDayCard
                              key={
                                dayKey
                              }
                              sch={
                                sch
                              }
                              dayKey={
                                dayKey
                              }
                              shifts={
                                myRow[
                                  dayKey
                                ]
                              }
                              isNextDay={
                                isNextDay
                              }
                            />
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        overflowX:
                          "auto",
                        borderRadius:
                          18,
                        border:
                          "1px solid #e2e8f0",
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
                            860,
                          background:
                            "#fff",
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
                              style={
                                thStyleLeft
                              }
                            >
                              Your schedule
                            </th>

                            {DAY_KEYS.map(
                              (
                                key
                              ) => {
                                const state =
                                  getDayVisualState(
                                    sch,
                                    key
                                  );

                                const isNextDay =
                                  nextShift?.scheduleId ===
                                    sch.id &&
                                  nextShift?.dayKey ===
                                    key;

                                return (
                                  <th
                                    key={
                                      key
                                    }
                                    style={{
                                      ...thStyleCenter,
                                      background:
                                        isNextDay
                                          ? "#dbeafe"
                                          : state ===
                                            "past"
                                          ? "#f3f4f6"
                                          : state ===
                                            "today"
                                          ? "#fffbeb"
                                          : "#f8fbff",
                                    }}
                                  >
                                    <div>
                                      {
                                        DAY_LABELS[
                                          key
                                        ]
                                      }
                                    </div>

                                    <div
                                      style={{
                                        marginTop:
                                          4,
                                        fontSize:
                                          11,
                                        fontWeight:
                                          700,
                                        color:
                                          "#64748b",
                                      }}
                                    >
                                      {sch
                                        .days?.[
                                        key
                                      ] ||
                                        ""}
                                    </div>
                                  </th>
                                );
                              }
                            )}
                          </tr>
                        </thead>

                        <tbody>
                          <tr
                            style={{
                              background:
                                "#ffffff",
                            }}
                          >
                            <td
                              style={
                                nameCellStyle
                              }
                              rowSpan={
                                2
                              }
                            >
                              {getEmployeeDisplayName(
                                currentEmployee
                              )}
                            </td>

                            {DAY_KEYS.map(
                              (
                                key
                              ) => {
                                const shiftText =
                                  getShiftText(
                                    myRow[
                                      key
                                    ],
                                    0
                                  );

                                const off =
                                  shiftText ===
                                  "OFF";

                                const state =
                                  getDayVisualState(
                                    sch,
                                    key
                                  );

                                const isNextDay =
                                  nextShift?.scheduleId ===
                                    sch.id &&
                                  nextShift?.dayKey ===
                                    key;

                                return (
                                  <td
                                    key={
                                      key
                                    }
                                    style={{
                                      ...tdCenterStyle,
                                      background:
                                        isNextDay
                                          ? "#eff6ff"
                                          : state ===
                                            "past"
                                          ? "#f9fafb"
                                          : state ===
                                            "today"
                                          ? "#fffdf5"
                                          : "#ffffff",
                                    }}
                                  >
                                    <ShiftBadge
                                      text={
                                        shiftText
                                      }
                                      off={
                                        off
                                      }
                                      isNextDay={
                                        isNextDay
                                      }
                                      state={
                                        state
                                      }
                                    />
                                  </td>
                                );
                              }
                            )}
                          </tr>

                          <tr
                            style={{
                              background:
                                "#fbfdff",
                            }}
                          >
                            {DAY_KEYS.map(
                              (
                                key
                              ) => {
                                const shiftText =
                                  getShiftText(
                                    myRow[
                                      key
                                    ],
                                    1
                                  );

                                const off =
                                  shiftText ===
                                  "OFF";

                                const state =
                                  getDayVisualState(
                                    sch,
                                    key
                                  );

                                const isNextDay =
                                  nextShift?.scheduleId ===
                                    sch.id &&
                                  nextShift?.dayKey ===
                                    key;

                                return (
                                  <td
                                    key={
                                      key
                                    }
                                    style={{
                                      ...tdCenterStyle,
                                      background:
                                        isNextDay
                                          ? "#eff6ff"
                                          : state ===
                                            "past"
                                          ? "#f9fafb"
                                          : state ===
                                            "today"
                                          ? "#fffdf5"
                                          : "#fbfdff",
                                    }}
                                  >
                                    <ShiftBadge
                                      text={
                                        shiftText
                                      }
                                      off={
                                        off
                                      }
                                      isNextDay={
                                        isNextDay
                                      }
                                      state={
                                        state
                                      }
                                    />
                                  </td>
                                );
                              }
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  <div
                    style={{
                      background:
                        "#f8fbff",
                      border:
                        "1px solid #dbeafe",
                      borderRadius:
                        16,
                      padding: 14,
                      color:
                        "#64748b",
                      fontSize:
                        13,
                      fontWeight:
                        650,
                    }}
                  >
                    Could not find
                    your row inside
                    this schedule.
                  </div>
                )}

                <div
                  style={{
                    borderTop:
                      "1px solid #eef2f7",
                    paddingTop:
                      12,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      toggleCoworkers(
                        sch.id
                      )
                    }
                    style={{
                      width:
                        "100%",
                      border:
                        "1px solid #dbeafe",
                      background:
                        "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
                      borderRadius:
                        15,
                      padding:
                        "12px 13px",
                      display:
                        "flex",
                      alignItems:
                        "center",
                      justifyContent:
                        "space-between",
                      gap: 10,
                      cursor:
                        "pointer",
                      fontSize:
                        12.5,
                      color:
                        "#0f172a",
                      fontWeight:
                        800,
                    }}
                  >
                    <span>
                      Employees on duty
                      with you
                    </span>

                    <span
                      style={{
                        color:
                          "#64748b",
                        fontWeight:
                          750,
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {coworkersByDay.length >
                      0
                        ? `${coworkersByDay.length} day${
                            coworkersByDay.length !==
                            1
                              ? "s"
                              : ""
                          }`
                        : "No overlap"}{" "}
                      {isOpen
                        ? "\u25B2"
                        : "\u25BC"}
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        marginTop:
                          10,
                        border:
                          "1px solid #eef2f7",
                        borderRadius:
                          16,
                        background:
                          "#ffffff",
                        padding:
                          isMobile
                            ? 10
                            : 14,
                        display:
                          "grid",
                        gap: 8,
                      }}
                    >
                      {coworkersByDay.length ===
                      0 ? (
                        <div
                          style={{
                            fontSize:
                              12.5,
                            color:
                              "#64748b",
                            fontWeight:
                              650,
                          }}
                        >
                          No coworkers
                          assigned with
                          you in this
                          schedule.
                        </div>
                      ) : (
                        coworkersByDay.map(
                          ({
                            key,
                            names,
                          }) => (
                            <div
                              key={
                                key
                              }
                              style={{
                                background:
                                  "#f8fbff",
                                border:
                                  "1px solid #dbeafe",
                                borderRadius:
                                  13,
                                padding:
                                  "11px 12px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize:
                                    10.5,
                                  fontWeight:
                                    850,
                                  color:
                                    "#1769aa",
                                  textTransform:
                                    "uppercase",
                                  letterSpacing:
                                    "0.05em",
                                }}
                              >
                                {
                                  DAY_FULL[
                                    key
                                  ]
                                }
                                {sch
                                  .days?.[
                                  key
                                ]
                                  ? ` \u00B7 ${sch.days[key]}`
                                  : ""}
                              </div>

                              <div
                                style={{
                                  marginTop:
                                    5,
                                  fontSize:
                                    12.5,
                                  color:
                                    "#334155",
                                  lineHeight:
                                    1.65,
                                }}
                              >
                                {names.length >
                                0
                                  ? names.join(
                                      ", "
                                    )
                                  : "No coworkers scheduled."}
                              </div>
                            </div>
                          )
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }
        )}

      <div
        style={{
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 10,
          padding:
            "2px 0 8px",
        }}
      >
        {APP_NAME}{" "}
        {"\u00B7"}{" "}
        {APP_SUBTITLE}
      </div>
    </div>
  );
}

const thStyleLeft = {
  padding: "14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 850,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const thStyleCenter = {
  padding: "14px 10px",
  textAlign: "center",
  fontSize: 12,
  fontWeight: 850,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  minWidth: 110,
};

const nameCellStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  borderRight: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  fontWeight: 850,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const tdCenterStyle = {
  padding: "10px",
  textAlign: "center",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};

// END MySchedulePage
