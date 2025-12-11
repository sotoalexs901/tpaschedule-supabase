// src/pages/MySchedulePage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUES",
  wed: "WED",
  thu: "THURS",
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

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
}

// ¿Ese arreglo de shifts tiene trabajo real?
function hasWork(shifts) {
  if (!Array.isArray(shifts)) return false;
  return shifts.some((s) => s && s.start && s.start !== "OFF");
}

// helper para comparar strings
function norm(v) {
  return (v || "").toString().trim().toLowerCase();
}

export default function MySchedulePage() {
  const { user } = useUser();

  const [employees, setEmployees] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [mySchedules, setMySchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  // estado para expandir/colapsar coworkers por horario
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

        // 1) Cargar empleados
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const uName = norm(user.username);

        // 2) Buscar el empleado asociado al usuario
        const me =
          empList.find((e) => norm(e.loginUsername) === uName) ||
          empList.find((e) => norm(e.username) === uName) ||
          empList.find((e) => norm(e.code) === uName) ||
          empList.find((e) => norm(e.name) === uName) ||
          null;

        if (!me) {
          console.warn(
            "[MySchedule] No se encontró empleado para el usuario:",
            user.username
          );
          setCurrentEmployee(null);
          setMySchedules([]);
          return;
        }

        setCurrentEmployee(me);

        // 3) Cargar schedules aprobados
        const schSnap = await getDocs(
          query(collection(db, "schedules"), where("status", "==", "approved"))
        );
        const allApproved = schSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // 4) Filtrar horarios donde aparece este empleado
        const mine = allApproved.filter((sch) =>
          (sch.grid || []).some((row) => row.employeeId === me.id)
        );

        setMySchedules(mine);
      } catch (err) {
        console.error("Error loading my schedule:", err);
        setMySchedules([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm">Please log in to see your schedule.</p>
      </div>
    );
  }

  if (!currentEmployee && !loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2 text-slate-900">
          My Schedule
        </h1>
        <p className="text-sm text-slate-600">
          We could not match your user with any employee profile.
          <br />
          Please contact your station manager or HR.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Tip: agrega un campo <code>loginUsername</code> en el empleado con el
          valor <b>{user.username}</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* HEADER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-5">
        <p className="text-[11px] tracking-[0.25em] uppercase text-blue-500 mb-1">
          Crew Portal
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          My Schedule
        </h1>
        <p className="text-sm text-slate-700 mt-1">
          {currentEmployee?.name || user.username} · {user.role}
        </p>
        <p className="text-xs md:text-sm text-slate-500 mt-2 max-w-xl">
          Review your approved weekly schedules and, when needed, expand the
          panel to see which coworkers are on duty with you each day.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Loading your schedules...</p>
      )}

      {!loading && mySchedules.length === 0 && (
        <p className="text-sm text-slate-500">
          No approved schedules found for your profile.
        </p>
      )}

      {!loading &&
        mySchedules.map((sch) => {
          const myRow = (sch.grid || []).find(
            (row) => row.employeeId === currentEmployee.id
          );

          // Mapa rápido id -> nombre
          const empMap = employees.reduce((acc, e) => {
            acc[e.id] = e.name || e.fullName || e.username || "Unknown";
            return acc;
          }, {});

          // Para cada día en el que tú trabajas, buscar quién más trabaja
          const coworkersByDay = DAY_KEYS.map((dayKey) => {
            const myDayShifts = myRow ? myRow[dayKey] : null;
            if (!hasWork(myDayShifts)) return null; // tú estás OFF ese día

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
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-5 space-y-4"
            >
              {/* ENCABEZADO DEL SCHEDULE */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {sch.airline} · {sch.department}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    WEEKLY SCHEDULE ·{" "}
                    {sch.days
                      ? DAY_KEYS.map(
                          (key) =>
                            `${DAY_LABELS[key]}${
                              sch.days?.[key] ? ` / ${sch.days[key]}` : ""
                            }`
                        ).join(" | ")
                      : ""}
                  </p>
                </div>
              </div>

              {/* TU HORARIO PERSONAL */}
              {myRow ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/60">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100/80">
                        <th className="px-3 py-2 border border-slate-200 text-left font-semibold text-slate-700">
                          Your schedule
                        </th>
                        {DAY_KEYS.map((key) => (
                          <th
                            key={key}
                            className="px-3 py-2 border border-slate-200 text-center font-semibold text-slate-700"
                          >
                            {DAY_LABELS[key]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1ra fila: primer turno */}
                      <tr className="bg-white">
                        <td
                          className="px-3 py-2 border border-slate-200 font-semibold text-slate-800"
                          rowSpan={2}
                        >
                          {currentEmployee.name}
                        </td>
                        {DAY_KEYS.map((key) => (
                          <td
                            key={key}
                            className="px-2 py-1.5 border border-slate-200 text-center text-slate-800"
                          >
                            {getShiftText(myRow[key], 0)}
                          </td>
                        ))}
                      </tr>
                      {/* 2da fila: segundo turno (si aplica) */}
                      <tr className="bg-slate-50/70">
                        {DAY_KEYS.map((key) => (
                          <td
                            key={key}
                            className="px-2 py-1.5 border border-slate-200 text-center text-slate-800"
                          >
                            {getShiftText(myRow[key], 1)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Could not find your row in this schedule.
                </p>
              )}

              {/* PANEL DESPLEGABLE: EMPLOYEES ON DUTY WITH YOU */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => toggleCoworkers(sch.id)}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition text-xs md:text-sm text-slate-800"
                >
                  <span className="font-semibold">
                    Employees on duty with you
                  </span>
                  <span className="flex items-center gap-2 text-[11px] text-slate-500">
                    {coworkersByDay.length > 0
                      ? `${coworkersByDay.length} day${
                          coworkersByDay.length !== 1 ? "s" : ""
                        } listed`
                      : "No coworkers listed"}
                    <span className="text-slate-500">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-2 rounded-lg border border-slate-100 bg-white px-3 py-2 space-y-1 text-[11px] md:text-xs text-slate-700">
                    {coworkersByDay.length === 0 ? (
                      <p className="text-slate-500">
                        No coworkers assigned with you in this schedule.
                      </p>
                    ) : (
                      coworkersByDay.map(({ key, names }) => (
                        <div
                          key={key}
                          className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1"
                        >
                          <span className="font-semibold min-w-[130px]">
                            {sch.airline} {sch.department} · {DAY_FULL[key]}
                            {sch.days?.[key] ? ` ${sch.days[key]}` : ""}:
                          </span>
                          <span className="text-slate-700">
                            {names.length > 0
                              ? names.join(", ")
                              : "No coworkers scheduled."}
                          </span>
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
