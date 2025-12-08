// src/pages/MySchedulePage.jsx
import React, { useEffect, useState } from "react";
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

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
}

export default function MySchedulePage() {
  const { user } = useUser();

  const [employees, setEmployees] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [mySchedules, setMySchedules] = useState([]);
  const [teamEmployees, setTeamEmployees] = useState([]); // agentes para supervisor
  const [loading, setLoading] = useState(true);

  const isSupervisor = user?.role === "supervisor";

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // 1) Cargar empleados
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        // 2) Identificar el empleado vinculado a este usuario
        //    Aquí asumimos que `user.username` coincide con `employees.name`
        const me =
          empList.find(
            (e) =>
              e.name?.toLowerCase().trim() ===
              (user?.username || "").toLowerCase().trim()
          ) || null;

        setCurrentEmployee(me);

        if (!me) {
          setMySchedules([]);
          setTeamEmployees([]);
          return;
        }

        // 3) Cargar schedules aprobados
        const schSnap = await getDocs(
          query(collection(db, "schedules"), where("status", "==", "approved"))
        );
        const allApproved = schSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // 4) Filtrar los horarios donde aparece este empleado
        const mine = allApproved.filter((sch) =>
          (sch.grid || []).some((row) => row.employeeId === me.id)
        );
        setMySchedules(mine);

        // 5) Si es supervisor, cargar agentes que reportan a él
        if (isSupervisor) {
          const team = empList.filter((e) => e.supervisorId === me.id);
          setTeamEmployees(team);
        } else {
          setTeamEmployees([]);
        }
      } catch (err) {
        console.error("Error loading my schedule:", err);
        setMySchedules([]);
        setTeamEmployees([]);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      loadData();
    }
  }, [user, isSupervisor]);

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
          Please contact your station manager.
        </p>
      </div>
    );
  }

  const mySupervisor =
    !isSupervisor && currentEmployee?.supervisorId
      ? employees.find((e) => e.id === currentEmployee.supervisorId)
      : null;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Schedule</h1>
        <p className="text-sm text-slate-600">
          {currentEmployee?.name} · {user.role}
        </p>
        {mySupervisor && (
          <p className="text-xs text-slate-500 mt-1">
            Supervisor: <b>{mySupervisor.name}</b>
          </p>
        )}
        {isSupervisor && (
          <p className="text-xs text-slate-500 mt-1">
            Agents linked to you will appear under each schedule where they are
            assigned.
          </p>
        )}
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

          // Para supervisores: agentes asignados en ESTE schedule
          let agentsInThisSchedule = [];
          if (isSupervisor && teamEmployees.length > 0) {
            const teamIds = new Set(teamEmployees.map((t) => t.id));
            const rows = sch.grid || [];
            const idsInSchedule = new Set(
              rows.map((r) => r.employeeId).filter(Boolean)
            );
            agentsInThisSchedule = teamEmployees.filter((t) =>
              idsInSchedule.has(t.id)
            );
          }

          return (
            <div
              key={sch.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {sch.airline} — {sch.department}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    WEEKLY SCHEDULE •{" "}
                    {sch.days
                      ? Object.keys(DAY_LABELS)
                          .map(
                            (key) =>
                              `${DAY_LABELS[key]} ${
                                sch.days?.[key] ? `/ ${sch.days[key]}` : ""
                              }`
                          )
                          .join(" | ")
                      : ""}
                  </p>
                </div>
              </div>

              {/* Tabla compacta sólo con mi fila */}
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

              {/* Lista de agentes para supervisores */}
              {isSupervisor && agentsInThisSchedule.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-700 mb-1">
                    Agents in this schedule:
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {agentsInThisSchedule.map((a) => a.name).join(", ")}
                  </p>
                </div>
              )}

              {isSupervisor && agentsInThisSchedule.length === 0 && (
                <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                  No agents linked to you in this schedule.
                </p>
              )}
            </div>
          );
        })}
    </div>
  );
}
