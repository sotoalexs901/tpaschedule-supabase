import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
}

function hasWork(shifts) {
  if (!Array.isArray(shifts)) return false;
  return shifts.some((s) => s && s.start && s.start !== "OFF");
}

function countWorkedDays(row) {
  return DAY_KEYS.filter((dayKey) => hasWork(row?.[dayKey])).length;
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
  if (!user || !Array.isArray(employees) || employees.length === 0) return null;

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

function SummaryCard({ label, value, subValue }) {
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
          marginTop: 8,
          fontSize: 24,
          fontWeight: 800,
          color: "#0f172a",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {subValue ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.4,
          }}
        >
          {subValue}
        </div>
      ) : null}
    </div>
  );
}

function ShiftBadge({ text, off = false }) {
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
        fontWeight: 700,
        background: off ? "#f1f5f9" : "#eff6ff",
        color: off ? "#64748b" : "#1d4ed8",
        border: off ? "1px solid #e2e8f0" : "1px solid #bfdbfe",
      }}
    >
      {text}
    </div>
  );
}

export default function MySchedulePage() {
  const { user } = useUser();

  const [employees, setEmployees] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [mySchedules, setMySchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openCoworkers, setOpenCoworkers] = useState({});

  const toggleCoworkers = (scheduleId) => {
    setOpenCoworkers((prev) => ({
      ...prev,
      [scheduleId]: !prev[scheduleId],
    }));
  };

  useEffect(() => {
    async function loadData() {
      if (!user) return;

      try {
        setLoading(true);
        setError("");

        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const me = buildEmployeeMatch(user, empList);

        if (!me) {
          setCurrentEmployee(null);
          setMySchedules([]);
          return;
        }

        setCurrentEmployee(me);

        const schSnap = await getDocs(
          query(collection(db, "schedules"), where("status", "==", "approved"))
        );

        const allApproved = schSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const mine = allApproved
          .filter((sch) =>
            Array.isArray(sch.grid)
              ? sch.grid.some((row) => row.employeeId === me.id)
              : false
          )
          .sort((a, b) => {
            const ad = String(a.createdAt?.seconds || a.updatedAt?.seconds || 0);
            const bd = String(b.createdAt?.seconds || b.updatedAt?.seconds || 0);
            return bd.localeCompare(ad);
          });

        setMySchedules(mine);
      } catch (err) {
        console.error("Error loading my schedule:", err);
        setError("There was an error loading your schedule.");
        setMySchedules([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  const totalSchedules = mySchedules.length;

  const totalWorkedDays = useMemo(() => {
    return mySchedules.reduce((sum, sch) => {
      const row = (sch.grid || []).find(
        (item) => item.employeeId === currentEmployee?.id
      );
      return sum + countWorkedDays(row);
    }, 0);
  }, [mySchedules, currentEmployee]);

  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 14, color: "#475569" }}>
          Please log in to see your schedule.
        </p>
      </div>
    );
  }

  if (!loading && !currentEmployee) {
    return (
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
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
            Crew Portal
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
            My Schedule
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            We could not match your login with any employee profile.
          </p>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 20,
            boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
            Please contact your station manager or HR so they can link your user
            account to your employee profile.
          </p>

          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.7,
            }}
          >
            Recommended fields to match:
            <br />
            <code>employeeId</code>, <code>linkedUserId</code>, or{" "}
            <code>loginUsername</code> = <b>{user.username}</b>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
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
            Crew Portal
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
            My Schedule
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "rgba(255,255,255,0.92)",
              fontWeight: 600,
            }}
          >
            {getEmployeeDisplayName(currentEmployee)} · {user.role}
          </p>

          <p
            style={{
              margin: "10px 0 0",
              maxWidth: 780,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Review your approved schedules and expand each card to see who is
            working with you during the same days.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        <SummaryCard
          label="Approved Schedules"
          value={loading ? "..." : totalSchedules}
        />
        <SummaryCard
          label="Worked Days"
          value={loading ? "..." : totalWorkedDays}
          subValue="Across all approved schedules"
        />
        <SummaryCard
          label="Employee Profile"
          value={currentEmployee ? "Linked" : "Missing"}
          subValue={currentEmployee?.id || "No linked employee profile"}
        />
      </div>

      {loading && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 20,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading your schedules...
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 20,
            padding: 20,
            color: "#9f1239",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && mySchedules.length === 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            padding: 20,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          No approved schedules found for your profile.
        </div>
      )}

      {!loading &&
        !error &&
        mySchedules.map((sch) => {
          const myRow = (sch.grid || []).find(
            (row) => row.employeeId === currentEmployee.id
          );

          const workedDays = countWorkedDays(myRow);

          const empMap = employees.reduce((acc, e) => {
            acc[e.id] = getEmployeeDisplayName(e);
            return acc;
          }, {});

          const coworkersByDay = DAY_KEYS.map((dayKey) => {
            const myDayShifts = myRow ? myRow[dayKey] : null;
            if (!hasWork(myDayShifts)) return null;

            const names = Array.from(
              new Set(
                (sch.grid || [])
                  .filter((row) => row.employeeId !== currentEmployee.id)
                  .filter((row) => hasWork(row[dayKey]))
                  .map((row) => empMap[row.employeeId])
                  .filter(Boolean)
              )
            );

            return {
              key: dayKey,
              names,
            };
          }).filter(Boolean);

          const isOpen = !!openCoworkers[sch.id];

          return (
            <div
              key={sch.id}
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 24,
                padding: 20,
                boxShadow: "0 10px 28px rgba(15,23,42,0.05)",
                display: "grid",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
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
                    {sch.airline || "Airline"} · {sch.department || "Department"}
                  </h2>

                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                      lineHeight: 1.6,
                    }}
                  >
                    Weekly schedule ·{" "}
                    {sch.days
                      ? DAY_KEYS.map(
                          (key) =>
                            `${DAY_LABELS[key]}${
                              sch.days?.[key] ? ` ${sch.days[key]}` : ""
                            }`
                        ).join(" · ")
                      : "No week labels"}
                  </p>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    color: "#1769aa",
                    borderRadius: 999,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  Worked days: {workedDays}
                </div>
              </div>

              {myRow ? (
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
                      minWidth: 860,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyleLeft}>Your schedule</th>
                        {DAY_KEYS.map((key) => (
                          <th key={key} style={thStyleCenter}>
                            <div>{DAY_LABELS[key]}</div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#64748b",
                              }}
                            >
                              {sch.days?.[key] || ""}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      <tr style={{ background: "#ffffff" }}>
                        <td style={nameCellStyle} rowSpan={2}>
                          {getEmployeeDisplayName(currentEmployee)}
                        </td>

                        {DAY_KEYS.map((key) => {
                          const text = getShiftText(myRow[key], 0);
                          const off = text === "OFF";
                          return (
                            <td key={key} style={tdCenterStyle}>
                              <ShiftBadge text={text} off={off} />
                            </td>
                          );
                        })}
                      </tr>

                      <tr style={{ background: "#fbfdff" }}>
                        {DAY_KEYS.map((key) => {
                          const text = getShiftText(myRow[key], 1);
                          const off = text === "OFF";
                          return (
                            <td key={key} style={tdCenterStyle}>
                              <ShiftBadge text={text} off={off} />
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  style={{
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    borderRadius: 16,
                    padding: 14,
                    color: "#64748b",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Could not find your row inside this schedule.
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid #eef2f7",
                  paddingTop: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCoworkers(sch.id)}
                  style={{
                    width: "100%",
                    border: "1px solid #e2e8f0",
                    background: "#f8fbff",
                    borderRadius: 16,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#0f172a",
                    fontWeight: 700,
                  }}
                >
                  <span>Employees on duty with you</span>
                  <span style={{ color: "#64748b", fontWeight: 700 }}>
                    {coworkersByDay.length > 0
                      ? `${coworkersByDay.length} day${
                          coworkersByDay.length !== 1 ? "s" : ""
                        }`
                      : "No overlap"}{" "}
                    {isOpen ? "▲" : "▼"}
                  </span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      marginTop: 12,
                      border: "1px solid #eef2f7",
                      borderRadius: 16,
                      background: "#ffffff",
                      padding: 14,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {coworkersByDay.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No coworkers assigned with you in this schedule.
                      </div>
                    ) : (
                      coworkersByDay.map(({ key, names }) => (
                        <div
                          key={key}
                          style={{
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                            borderRadius: 14,
                            padding: "12px 14px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#1769aa",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {DAY_FULL[key]}
                            {sch.days?.[key] ? ` · ${sch.days[key]}` : ""}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 13,
                              color: "#334155",
                              lineHeight: 1.7,
                            }}
                          >
                            {names.length > 0
                              ? names.join(", ")
                              : "No coworkers scheduled."}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

const thStyleLeft = {
  padding: "14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
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
  fontWeight: 800,
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
  fontWeight: 800,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const tdCenterStyle = {
  padding: "10px",
  textAlign: "center",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};
