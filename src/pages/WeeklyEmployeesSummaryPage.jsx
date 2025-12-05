// src/pages/WeeklyEmployeesSummaryPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

// Claves y etiquetas de días
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

export default function WeeklyEmployeesSummaryPage() {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [weekTags, setWeekTags] = useState([]);
  const [selectedWeekTag, setSelectedWeekTag] = useState("");
  const [summaryByAirline, setSummaryByAirline] = useState({});
  const [loading, setLoading] = useState(true);

  // 🔎 Filtro por horas mínimas
  const [minTotalHours, setMinTotalHours] = useState(0);

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

  // Mapa rápido id -> nombre (para la parte de resumen por aerolínea)
  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  // Recalcular resumen cuando cambie la semana seleccionada o schedules
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

  const airlineKeys = Object.keys(summaryByAirline).sort();

  // 🔁 Estados base de carga / falta de datos
  if (loading) {
    return (
      <div className="p-4">
        <button
          className="btn btn-soft mb-3 text-xs"
          type="button"
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>
        <p className="text-sm text-slate-400">Loading weekly summary...</p>
      </div>
    );
  }

  if (!loading && weekTags.length === 0) {
    return (
      <div className="p-4">
        <button
          className="btn btn-soft mb-3 text-xs"
          type="button"
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>
        <p className="text-sm text-slate-500">
          There are no approved schedules yet to build a weekly summary.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Back + selector de semana */}
      <div className="flex items-center justify-between mb-2">
        <button
          className="btn btn-soft text-xs"
          type="button"
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Week:</span>
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
      </div>

      {/* CARD PRINCIPAL CON TABLA TIPO EXCEL */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-md font-semibold">
            Week of: {formatWeekLabel(selectedWeekTag)}
          </h2>

          {/* 🔎 Filtro por horas mínimas */}
          <div className="flex items-center gap-2 text-xs">
            <label className="font-semibold">
              Min weekly hours filter:
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={minTotalHours}
              onChange={(e) => setMinTotalHours(Number(e.target.value || 0))}
              className="border rounded px-2 py-1 w-20 text-right text-xs"
            />
            <span className="text-[11px] text-slate-500">
              Employees with less than this total will be hidden.
            </span>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] border text-xs">
            <thead>
              <tr className="bg-gray-100 border">
                <th className="border px-2 py-1">Employee Name</th>

                {/* Columnas fijas de aerolíneas en orden estándar */}
                {[
                  "WL Havana Air",
                  "WL Invicta",
                  "AV",
                  "AA-BSO",
                  "CABIN",
                  "WCHR",
                  "SY",
                  "OTHER",
                ].map((air) => (
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
                  const rowHours = summaryByAirline
                    ? {
                        "WL Havana Air":
                          summaryByAirline["WL Havana Air"]?.[emp.id] || 0,
                        "WL Invicta":
                          summaryByAirline["WL Invicta"]?.[emp.id] || 0,
                        AV: summaryByAirline["AV"]?.[emp.id] || 0,
                        "AA-BSO": summaryByAirline["AA-BSO"]?.[emp.id] || 0,
                        CABIN: summaryByAirline["CABIN"]?.[emp.id] || 0,
                        WCHR: summaryByAirline["WCHR"]?.[emp.id] || 0,
                        SY: summaryByAirline["SY"]?.[emp.id] || 0,
                        OTHER: summaryByAirline["OTHER"]?.[emp.id] || 0,
                      }
                    : {};

                  const total = Object.values(rowHours).reduce(
                    (a, b) => a + b,
                    0
                  );

                  // Ocultar empleados sin horas
                  if (total === 0) return null;

                  // Aplicar filtro de horas mínimas
                  if (total < minTotalHours) return null;

                  const overLimit = total > 40; // 🔴 más de 40 horas

                  return (
                    <tr
                      key={emp.id}
                      className={
                        "border" + (overLimit ? " bg-red-50" : "")
                      }
                    >
                      <td className="border px-2 py-1">{emp.name}</td>

                      {Object.values(rowHours).map((h, i) => (
                        <td
                          key={i}
                          className="border px-2 py-1 text-center"
                        >
                          {h === 0 ? "" : h.toFixed(2)}
                        </td>
                      ))}

                      <td
                        className={
                          "border px-2 py-1 text-center font-semibold " +
                          (overLimit ? "text-red-700" : "")
                        }
                      >
                        {total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}

              {/* TOTAL POR AEROLÍNEA */}
              <tr className="bg-gray-100 border font-semibold">
                <td className="border px-2 py-1">
                  TOTAL HOURS PER AIRLINE
                </td>

                {[
                  "WL Havana Air",
                  "WL Invicta",
                  "AV",
                  "AA-BSO",
                  "CABIN",
                  "WCHR",
                  "SY",
                  "OTHER",
                ].map((air, i) => {
                  const total = Object.values(summaryByAirline[air] || {}).reduce(
                    (sum, h) => sum + (typeof h === "number" ? h : Number(h || 0)),
                    0
                  );
                  return (
                    <td key={i} className="border px-2 py-1 text-center">
                      {total === 0 ? "" : total.toFixed(2)}
                    </td>
                  );
                })}

                <td className="border px-2 py-1 text-center">
                  {Object.values(summaryByAirline)
                    .flatMap((air) => Object.values(air))
                    .reduce((a, b) => a + b, 0)
                    .toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* OPCIONAL: Resumen por aerolínea debajo (lo mantenemos) */}
      {airlineKeys.length === 0 ? (
        <p className="text-sm text-slate-500">
          No data for the selected week.
        </p>
      ) : (
        <div className="space-y-4">
          {airlineKeys.map((airline) => {
            const empTotals = summaryByAirline[airline];
            const totalHoursAirline = Object.values(empTotals).reduce(
              (sum, h) => sum + (typeof h === "number" ? h : Number(h || 0)),
              0
            );

            return (
              <div key={airline} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      {airline}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Total hours (all employees):{" "}
                      {totalHoursAirline.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="table min-w-[320px] text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left">Employee</th>
                        <th className="text-right">Total hours (week)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(empTotals)
                        .sort((a, b) => {
                          const nameA =
                            employeeNameMap[a[0]] || a[0] || "";
                          const nameB =
                            employeeNameMap[b[0]] || b[0] || "";
                          return nameA.localeCompare(nameB);
                        })
                        .map(([employeeId, hours]) => {
                          const h = Number(hours || 0);
                          const overLimit = h > 40;

                          return (
                            <tr
                              key={employeeId}
                              className={overLimit ? "bg-red-50" : ""}
                            >
                              <td>
                                {employeeNameMap[employeeId] || employeeId}
                              </td>
                              <td
                                className={
                                  "text-right " +
                                  (overLimit ? "text-red-700 font-semibold" : "")
                                }
                              >
                                {h.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
