// src/pages/MySchedulePage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

// mismos días que usamos en ApprovedScheduleView
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUES",
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

// combina máximo 2 turnos en un texto corto
function formatDayShifts(dayArray) {
  const first = getShiftText(dayArray, 0);
  const second = getShiftText(dayArray, 1);

  if (first === "OFF" && second === "OFF") return "OFF";
  if (second === "OFF") return first;
  if (first === "OFF") return second;
  if (first === second) return first;
  return `${first} / ${second}`;
}

export default function MySchedulePage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]); // lista de semanas donde trabaja

  useEffect(() => {
    async function load() {
      if (!user || !user.employeeId) {
        setLoading(false);
        return;
      }

      try {
        // traemos sólo schedules aprobados
        const q = query(
          collection(db, "schedules"),
          where("status", "==", "approved")
        );
        const snap = await getDocs(q);

        const result = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const grid = data.grid || [];

          // buscamos la fila de ESTE empleado
          const row = grid.find((r) => r.employeeId === user.employeeId);
          if (!row) return;

          result.push({
            id: docSnap.id,
            airline: data.airline,
            department: data.department,
            days: data.days || {},
            row,
          });
        });

        // opcional: podríamos ordenar por fecha si lo necesitas más adelante
        setItems(result);
      } catch (err) {
        console.error("Error loading my schedules:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  if (!user?.employeeId) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold mb-2">My Schedule</h1>
        <p className="text-sm">
          Your user is not linked to an <b>employee profile</b> yet. Please ask
          your Station Manager or HR to link your account to your employee
          record.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6">Loading your schedules...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold mb-2">My Schedule</h1>
      <p className="text-sm text-slate-600 mb-4">
        Here you can see your weekly schedules that have been approved.
      </p>

      {items.length === 0 && (
        <div className="card p-4 text-sm">
          No approved schedules found for your profile yet.
        </div>
      )}

      {items.map((item) => {
        const { airline, department, days, row } = item;

        const weekText = DAY_KEYS.map((k) => {
          const num = days?.[k];
          return num ? `${DAY_LABELS[k]} ${num}` : DAY_LABELS[k];
        }).join(" · ");

        return (
          <div key={item.id} className="card p-4 space-y-3">
            {/* Encabezado de la semana */}
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wider">
                  {airline} — {department}
                </div>
                <div className="text-xs text-slate-500">
                  WEEKLY SCHEDULE · {weekText}
                </div>
              </div>
            </div>

            {/* Tabla compacta con solo este empleado */}
            <div className="overflow-x-auto">
              <table className="min-w-full border border-slate-300 text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    {DAY_KEYS.map((k) => (
                      <th
                        key={k}
                        className="border border-slate-300 px-2 py-1 text-center"
                      >
                        {DAY_LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {DAY_KEYS.map((k) => (
                      <td
                        key={k}
                        className="border border-slate-300 px-2 py-1 text-center"
                      >
                        {formatDayShifts(row[k])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
