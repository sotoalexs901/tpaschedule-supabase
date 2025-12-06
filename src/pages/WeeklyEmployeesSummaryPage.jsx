// src/pages/WeeklyEmployeesSummaryPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
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

// Orden fijo de aerolíneas en la tabla
const AIRLINES_ORDER = [
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
  const [employees, setEmployees] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [weekTags, setWeekTags] = useState([]);
  const [selectedWeekTag, setSelectedWeekTag] = useState("");
  const [summaryByAirline, setSummaryByAirline] = useState({});
  const [statusFilter, setStatusFilter] = useState("approved"); // "approved" | "draft" | "both"
  const [loading, setLoading] = useState(true);

  // Cargar empleados + TODOS los schedules (cualquier status)
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        const schSnap = await getDocs(collection(db, "schedules"));

        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        const schList = schSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSchedules(schList);
      } catch (err) {
        console.error("Error loading weekly summary data:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, []);

  // Helper: ¿el schedule pasa el filtro de status?
  const scheduleMatchesStatus = (s) => {
    if (!s.status) return false;
    if (statusFilter === "both") {
      return s.status === "approved" || s.status === "draft";
    }
    return s.status === statusFilter;
  };

  // Mapa rápido id -> nombre
  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  // Recalcular weekTags cuando cambian schedules o statusFilter
  useEffect(() => {
    const filteredByStatus = schedules.filter(scheduleMatchesStatus);
    const tags = Array.from(
      new Set(filteredByStatus.map((s) => s.weekTag).filter(Boolean))
    ).sort();

    setWeekTags(tags);

    // Si la semana seleccionada ya no existe con este filtro, movemos al primer tag
    if (!tags.includes(selectedWeekTag)) {
      setSelectedWeekTag(tags[0] || "");
    }
  }, [schedules, statusFilter, selectedWeekTag]);

  // Recalcular resumen cuando cambian: semana seleccionada, schedules o filtro
  useEffect(() => {
    if (!selectedWeekTag || schedules.length === 0) {
      setSummaryByAirline({});
      return;
    }

    const filtered = schedules.filter(
      (s) => s.weekTag === selectedWeekTag && scheduleMatchesStatus(s)
    );

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
  }, [selectedWeekTag, schedules, statusFilter]);

  // Texto bonito de la semana (usando el primer schedule que coincida con tag + filtro)
  const formatWeekLabel = (tag) => {
    const sample = schedules.find(
      (s) => s.weekTag === tag && scheduleMatchesStatus(s)
    );
    if (!sample || !sample.days) return tag || "No week selected";

    return DAY_KEYS.map((key) => {
      const label = DAY_LABELS[key];
      const num = sample.days[key];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  const airlineKeys = Object.keys(summaryByAirline).sort();

  const statusLabel =
    statusFilter === "approved"
      ? "Approved only"
      : statusFilter === "draft"
      ? "Draft only"
      : "Approved + Draft";

  if (loading) {
    return (
      <p className="text-sm text-slate-400 p-4">
        Loading weekly summary...
      </p>
    );
  }

  const filteredSchedulesCount = schedules.filter(scheduleMatchesStatus).length;

  if (filteredSchedulesCount === 0) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        There are no <b>{statusFilter}</b> schedules to build a weekly summary.
      </div>
    );
  }

  if (weekTags.length === 0) {
    return (
      <div className="card p-4 text-sm text-slate-500">
        There are no schedules with week tags for the selected filter.
      </div>
    );
  }

  const totalAllAirlines = Object.values(summaryByAirline)
    .flatMap((air) => Object.values(air))
    .reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* HEADER + FILTROS */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Weekly Employees Summary
          </h1>
          <p className="text-xs text-slate-500">
            View total hours per employee and per airline for a given week.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Filtro de status */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-700">Status:</span>
            <select
              className="border rounded px-2 py-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="approved">Approved</option>
              <option value="draft">Draft</option>
              <option value="both">Approved + Draft</option>
            </select>
          </div>

          {/* Selector de semana */}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-700">Week:</span>
            <select
              className="border rounded px-2 py-1"
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
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="card p-4">
        <h2 className="text-md font-semibold mb-2">
          Week of: {formatWeekLabel(selectedWeekTag)}
          <span className="ml-2 text-[11px] text-slate-500">
            ({statusLabel})
          </span>
        </h2>

        {airlineKeys.length === 0 ? (
          <p className="text-sm text-slate-500">
            No data for the selected week and status filter.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[900px] border text-xs">
              <thead>
                <tr className="bg-gray-100 border">
                  <th className="border px-2 py-1">Employee Name</th>

                  {AIRLINES_ORDER.map((air) => (
                    <th
                      key={air}
                      className="border px-2 py-1 text-center"
                    >
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
                    const rowHours = {
                      "WL Havana Air":
                        summaryByAirline["WL Havana Air"]?.[emp.id] || 0,
                      "WL Invicta":
                        summaryByAirline["WL Invicta"]?.[emp.id] || 0,
                      AV: summaryByAirline["AV"]?.[emp.id] || 0,
                      "AA-BSO":
                        summaryByAirline["AA-BSO"]?.[emp.id] || 0,
                      CABIN: summaryByAirline["CABIN"]?.[emp.id] || 0,
                      WCHR: summaryByAirline["WCHR"]?.[emp.id] || 0,
                      SY: summaryByAirline["SY"]?.[emp.id] || 0,
                      OTHER: summaryByAirline["OTHER"]?.[emp.id] || 0,
                    };

                    const total = Object.values(rowHours).reduce(
                      (a, b) => a + b,
                      0
                    );

                    if (total === 0) return null; // ocultar empleados sin horas

                    return (
                      <tr key={emp.id} className="border">
                        <td className="border px-2 py-1">{emp.name}</td>

                        {AIRLINES_ORDER.map((air, i) => {
                          const h = rowHours[air] || 0;
                          return (
                            <td
                              key={i}
                              className="border px-2 py-1 text-center"
                            >
                              {h === 0 ? "" : h.toFixed(2)}
                            </td>
                          );
                        })}

                        <td className="border px-2 py-1 text-center font-semibold">
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

                  {AIRLINES_ORDER.map((air, i) => {
                    const total = Object.values(
                      summaryByAirline[air] || {}
                    ).reduce((sum, h) => sum + h, 0);
                    return (
                      <td
                        key={i}
                        className="border px-2 py-1 text-center"
                      >
                        {total === 0 ? "" : total.toFixed(2)}
                      </td>
                    );
                  })}

                  <td className="border px-2 py-1 text-center">
                    {totalAllAirlines.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-2">
          Empty cells mean the employee has 0 hours for that airline in the
          selected week and status filter.
        </p>
      </div>
    </div>
  );
}
