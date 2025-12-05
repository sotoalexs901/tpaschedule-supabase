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

  // Mapa rápido id -> nombre
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

    const filtered = schedules.filter(
      (s) => s.weekTag === selectedWeekTag
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

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        className="btn btn-soft"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Weekly Employees by Airline
          </h1>
          <p className="text-xs text-slate-500">
            Shows employees assigned for a selected week, grouped by airline
            with total weekly hours.
          </p>
        </div>

        {/* Selector de semana */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Week:</span>
          {weekTags.length === 0 ? (
            <span className="text-xs text-slate-400">
              No approved schedules found
            </span>
          ) : (
            <select
              className="border rounded text-xs px-2 py-1"
              value={selectedWeekTag}
              onChange={(e) => setSelectedWeekTag(e.target.value)}
            >
              {weekTags.map((tag) => (
                <option key={tag} value={tag}>
                  {formatWeekLabel(tag)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading weekly summary...</p>
      ) : weekTags.length === 0 ? (
        <p className="text-sm text-slate-500">
          There are no approved schedules yet to build a weekly summary.
        </p>
      ) : airlineKeys.length === 0 ? (
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
                        .map(([employeeId, hours]) => (
                          <tr key={employeeId}>
                            <td>
                              {employeeNameMap[employeeId] || employeeId}
                            </td>
                            <td className="text-right">
                              {Number(hours || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
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
