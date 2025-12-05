// src/pages/WeeklyEmployeesSummaryPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

// Claves y etiquetas de días (igual que en otros archivos)
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUESD",
  wed: "WED",
  thu: "THURSD",
  fri: "FRIDAY",
  sat: "SATURD",
  sun: "SUND",
};

// Orden fijo de aerolíneas para las columnas
const ORDERED_AIRLINES = [
  "WL Havana Air",
  "WL Invicta",
  "AV",
  "AA-BSO",
  "CABIN",
  "WCHR",
  "SY",
  "OTHER",
];

export default function WeeklyEmployeesSummaryPage() {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [weekTags, setWeekTags] = useState([]);
  const [selectedWeekTag, setSelectedWeekTag] = useState("");
  const [summaryByAirline, setSummaryByAirline] = useState({});
  const [loading, setLoading] = useState(true);

  // Cargar empleados + schedules aprobados
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [empSnap, schSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(
            query(collection(db, "schedules"), where("status", "==", "approved"))
          ),
        ]);

        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const schList = schSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSchedules(schList);

        const tags = Array.from(
          new Set(schList.map((s) => s.weekTag).filter(Boolean))
        ).sort();

        setWeekTags(tags);
        if (tags.length > 0) {
          setSelectedWeekTag((prev) => prev || tags[0]);
        }
      } catch (err) {
        console.error("Error loading weekly summary data:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, []);

  // Recalcular resumen cuando cambie la semana seleccionada o los schedules
  useEffect(() => {
    if (!selectedWeekTag || schedules.length === 0) {
      setSummaryByAirline({});
      return;
    }

    const filtered = schedules.filter((s) => s.weekTag === selectedWeekTag);
    const summary = {};

    filtered.forEach((sch) => {
      const airline = sch.airline || "Unknown";
      if (!summary[airline]) summary[airline] = {};

      const totals = sch.totals || {};
      Object.entries(totals).forEach(([employeeId, hours]) => {
        const h = typeof hours === "number" ? hours : Number(hours || 0);
        if (!summary[airline][employeeId]) {
          summary[airline][employeeId] = 0;
        }
        summary[airline][employeeId] += h;
      });
    });

    setSummaryByAirline(summary);
  }, [selectedWeekTag, schedules]);

  // Texto bonito de la semana (usando el primer schedule que tenga ese weekTag)
  const formatWeekLabel = (tag) => {
    const sample = schedules.find((s) => s.weekTag === tag);
    if (!sample || !sample.days) return tag || "No week selected";

    return DAY_KEYS.map((key) => {
      const label = DAY_LABELS[key];
      const num = sample.days[key];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  const hasData = Object.keys(summaryByAirline).length > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <button
        type="button"
        className="btn btn-soft mb-2"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      {/* Header + selector de semana */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Weekly Employees Summary</h1>
          <p className="text-xs text-slate-500">
            Total hours per employee and airline for approved schedules.
          </p>
        </div>

        {weekTags.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Select week:</span>
            <select
              className="border rounded px-2 py-1 text-xs"
              value={selectedWeekTag}
              onChange={(e) => setSelectedWeekTag(e.target.value)}
            >
              {weekTags.map((tag) => (
                <option key={tag} value={tag}>
                  {formatWeekLabel(tag)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Estados de carga / sin datos */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading weekly summary...</p>
      ) : weekTags.length === 0 ? (
        <p className="text-sm text-slate-500">
          There are no approved schedules yet to build a weekly summary.
        </p>
      ) : !hasData ? (
        <p className="text-sm text-slate-500">
          No data for the selected week.
        </p>
      ) : (
        // TABLA TIPO EXCEL
        <div className="card p-4">
          <h2 className="text-md font-semibold mb-3">
            Week of: {formatWeekLabel(selectedWeekTag)}
          </h2>

          <div className="overflow-auto">
            <table className="min-w-[900px] border text-xs">
              <thead>
                <tr className="bg-gray-100 border">
                  <th className="border px-2 py-1">Employee Name</th>

                  {ORDERED_AIRLINES.map((air) => (
                    <th key={air} className="border px-2 py-1 text-center">
                      {air}
                    </th>
                  ))}

                  <th className="border px-2 py-1 text-center">
                    Total weekly hours
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* FILAS POR EMPLEADO */}
                {employees
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((emp) => {
                    const rowHours = ORDERED_AIRLINES.reduce(
                      (acc, air) => ({
                        ...acc,
                        [air]: summaryByAirline[air]?.[emp.id] || 0,
                      }),
                      {}
                    );

                    const total = Object.values(rowHours).reduce(
                      (a, b) => a + b,
                      0
                    );

                    // Ocultar empleados con cero horas en todas las aerolíneas
                    if (total === 0) return null;

                    return (
                      <tr key={emp.id} className="border">
                        <td className="border px-2 py-1">{emp.name}</td>

                        {ORDERED_AIRLINES.map((air, i) => (
                          <td
                            key={air + i}
                            className="border px-2 py-1 text-center"
                          >
                            {rowHours[air] === 0 ? "" : rowHours[air]}
                          </td>
                        ))}

                        <td className="border px-2 py-1 text-center font-semibold">
                          {total}
                        </td>
                      </tr>
                    );
                  })}

                {/* TOTAL POR AEROLÍNEA */}
                <tr className="bg-gray-100 border font-semibold">
                  <td className="border px-2 py-1">
                    TOTAL HOURS PER AIRLINE
                  </td>

                  {ORDERED_AIRLINES.map((air, i) => {
                    const total = Object.values(summaryByAirline[air] || {}).reduce(
                      (sum, h) => sum + (typeof h === "number" ? h : Number(h || 0)),
                      0
                    );
                    return (
                      <td
                        key={air + i}
                        className="border px-2 py-1 text-center"
                      >
                        {total === 0 ? "" : total}
                      </td>
                    );
                  })}

                  <td className="border px-2 py-1 text-center">
                    {Object.values(summaryByAirline)
                      .flatMap((air) => Object.values(air))
                      .reduce(
                        (a, b) =>
                          a +
                          (typeof b === "number" ? b : Number(b || 0)),
                        0
                      )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
