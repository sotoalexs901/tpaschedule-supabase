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

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
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
        //    PRIORIDAD:
        //    - loginUsername  (recomendado)
        //    - username
        //    - code
        //    - name (solo como último recurso)
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
        <h1 className="text-lg font-semibold mb-2">My Schedule</h1>
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
      <div>
        <h1 className="text-xl font-semibold">My Schedule</h1>
        <p className="text-sm text-slate-600">
          {currentEmployee?.name || user.username} · {user.role}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          View your approved schedules and see the operational crew assigned to
          each airline schedule.
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

          // Crew operativo de este schedule (todos los empleados en grid)
          const crewNames = Array.from(
            new Set(
              (sch.grid || [])
                .map((row) => empMap[row.employeeId])
                .filter(Boolean)
            )
          );

          return (
            <div
              key={sch.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3"
            >
              {/* Encabezado del schedule */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {sch.airline} — {sch.department}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    WEEKLY SCHEDULE •{" "}
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

              {/* Tabla compacta con la fila del usuario */}
              {myRow ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px] border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="px-2 py-1 border border-slate-200 text-left">
                          EMPLOYEE
                        </th>
                        {DAY_KEYS.map((key) => (
                          <th
                            key={key}
                            className="px-2 py-1 border border-slate-200 text-center"
                          >
                            {DAY_LABELS[key]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Fila 1: primer turno */}
                      <tr className="bg-slate-50">
                        <td
                          className="px-2 py-1 border border-slate-200 font-semibold"
                          rowSpan={2}
                        >
                          {currentEmployee.name}
                        </td>
                        {DAY_KEYS.map((key) => (
                          <td
                            key={key}
                            className="px-2 py-1 border border-slate-200 text-center"
                          >
                            {getShiftText(myRow[key], 0)}
                          </td>
                        ))}
                      </tr>
                      {/* Fila 2: segundo turno */}
                      <tr className="bg-slate-50">
                        {DAY_KEYS.map((key) => (
                          <td
                            key={key}
                            className="px-2 py-1 border border-slate-200 text-center"
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

              {/* Crew operacional por aerolínea (todo el grid) */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-700 mb-1">
                  Crew in this schedule (operational team):
                </p>
                {crewNames.length > 0 ? (
                  <p className="text-[11px] text-slate-600">
                    {crewNames.join(", ")}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    No employees found in this schedule.
                  </p>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
