// src/pages/SchedulePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// 🔵 Logos oficiales desde Firebase
const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  "WL Havana Air":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2006_28_07%20p.m..png?alt=media&token=7bcf90fd-c854-400e-a28a-f838adca89f4",
  "WL Invicta":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_49%20p.m..png?alt=media&token=092a1deb-3285-41e1-ab0c-2e48a8faab92",
  AV: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_37%20p.m..png?alt=media&token=f133d1c8-51f9-4513-96df-8a75c6457b5b",
  EA: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_41%20p.m..png?alt=media&token=13fe584f-078f-4073-8d92-763ac549e5eb",
  WCHR:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_32%20p.m..png?alt=media&token=4f7e9ddd-692b-4288-af0a-8027a1fc6e1c",
  CABIN:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_28%20p.m..png?alt=media&token=b269ad02-0761-4b6b-b2f1-b510365cce49",
  "AA-BSO":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_25%20p.m..png?alt=media&token=09862a10-d237-43e9-a373-8bd07c30ce62",
  OTHER:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4d5f-b126-9c6a69f6dcc6",
};

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

// Helper para logo PDF
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

// Helpers para solapamiento de horas
const toMinutes = (timeStr) => {
  if (!timeStr || timeStr === "OFF") return null;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const normalizeInterval = (start, end) => {
  const s = toMinutes(start);
  const eRaw = toMinutes(end);
  if (s == null || eRaw == null) return null;
  let e = eRaw;
  if (e <= s) e += 24 * 60; // cruza medianoche
  return [s, e];
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => {
  const a = normalizeInterval(aStart, aEnd);
  const b = normalizeInterval(bStart, bEnd);
  if (!a || !b) return false;
  const [s1, e1] = a;
  const [s2, e2] = b;
  return s1 < e2 && s2 < e1;
};

// Crea un “tag” de semana basado en los números de días
const buildWeekTag = (days) =>
  DAY_KEYS.map((k) => days?.[k]?.toString().trim() || "").join("|");

export default function SchedulePage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [airline, setAirline] = useState("");
  const [department, setDepartment] = useState("");
  const [dayNumbers, setDayNumbers] = useState({
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
    sat: "",
    sun: "",
  });

  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [airlineBudgets, setAirlineBudgets] = useState({});

  // 🔁 Si venimos desde un ApprovedScheduleView con plantilla:
  useEffect(() => {
    if (location.state?.template) {
      const { airline, department, days, grid } = location.state.template;

      if (airline) setAirline(airline);
      if (department) setDepartment(department);
      if (days) setDayNumbers(days);
      if (grid) setRows(grid);
    }
  }, [location.state]);

  // Cargar empleados
  useEffect(() => {
    getDocs(collection(db, "employees")).then((snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  // Cargar budgets por aerolínea
  useEffect(() => {
    getDocs(collection(db, "airlineBudgets")).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.airline] = data.budgetHours;
      });
      setAirlineBudgets(map);
    });
  }, []);

  // ========= CÁLCULO DE HORAS (con lunch) =========
  // Regla: si un shift dura más de 6h 1min, se descuenta 0.5h
  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;
    const s = toMinutes(start);
    const eRaw = toMinutes(end);
    if (s == null || eRaw == null) return 0;
    let e = eRaw;
    if (e < s) e += 24 * 60;

    let hours = (e - s) / 60;
    if (hours > 6 + 1 / 60) {
      hours -= 0.5;
    }
    return hours;
  };

  const calculateTotals = () => {
    let airlineTotal = 0;
    const employeeTotals = {};
    const dailyTotals = {
      mon: 0,
      tue: 0,
      wed: 0,
      thu: 0,
      fri: 0,
      sat: 0,
      sun: 0,
    };

    rows.forEach((r) => {
      let employeeWeekly = 0;

      DAY_KEYS.forEach((dKey) => {
        let employeeDay = 0;

        (r[dKey] || []).forEach((shift) => {
          const h = diffHours(shift.start, shift.end);
          employeeDay += h;
        });

        dailyTotals[dKey] += employeeDay;
        employeeWeekly += employeeDay;
      });

      employeeTotals[r.employeeId] = employeeWeekly;
      airlineTotal += employeeWeekly;
    });

    return { employeeTotals, airlineTotal, dailyTotals };
  };

  const { employeeTotals, airlineTotal, dailyTotals } = calculateTotals();

  // ⚠️ Comprobación de conflictos con otras aerolíneas (misma semana)
  const checkConflictsWithOtherAirlines = async () => {
    const weekTag = buildWeekTag(dayNumbers).trim();

    if (!weekTag) {
      return { conflicts: [], weekTag: null };
    }

    const q = query(
      collection(db, "schedules"),
      where("weekTag", "==", weekTag)
    );

    const snap = await getDocs(q);
    const existingSchedules = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    if (!existingSchedules.length) {
      return { conflicts: [], weekTag };
    }

    const empMap = {};
    employees.forEach((e) => {
      empMap[e.id] = e.name;
    });

    const conflicts = [];

    existingSchedules.forEach((sch) => {
      DAY_KEYS.forEach((dayKey) => {
        (sch.grid || []).forEach((oldRow) => {
          (rows || []).forEach((newRow) => {
            if (
              !newRow.employeeId ||
              newRow.employeeId !== oldRow.employeeId
            ) {
              return;
            }

            const oldShifts = oldRow[dayKey] || [];
            const newShifts = newRow[dayKey] || [];

            oldShifts.forEach((os) => {
              newShifts.forEach((ns) => {
                if (
                  !os.start ||
                  !ns.start ||
                  os.start === "OFF" ||
                  ns.start === "OFF"
                ) {
                  return;
                }

                if (intervalsOverlap(os.start, os.end, ns.start, ns.end)) {
                  conflicts.push({
                    employeeName: empMap[newRow.employeeId] || "Unknown",
                    dayKey,
                    newShift: ns,
                    existingShift: os,
                    otherAirline: sch.airline,
                    otherDept: sch.department,
                  });
                }
              });
            });
          });
        });
      });
    });

    return { conflicts, weekTag };
  };

  // ✅ Guardar como DRAFT
  const handleSaveDraft = async () => {
    if (!airline || !department) {
      alert("Please select airline and department.");
      return;
    }

    const weekTagToSave = buildWeekTag(dayNumbers);

    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      weekTag: weekTagToSave,
      grid: rows,
      totals: employeeTotals,
      airlineWeeklyHours: airlineTotal,
      airlineDailyHours: dailyTotals,
      budget: airlineBudgets[airline] || 0,
      status: "draft",
      createdBy: user?.username || null,
      role: user?.role || null,
    });

    alert("Schedule saved as draft.");
  };

  // Guardar schedule (PENDING → para approval)
  const handleSaveSchedule = async () => {
    if (!airline || !department) {
      alert("Please select airline and department.");
      return;
    }

    const { conflicts, weekTag } = await checkConflictsWithOtherAirlines();

    if (conflicts.length > 0) {
      const previewLines = conflicts.slice(0, 6).map((c) => {
        const dayLabel = DAY_LABELS[c.dayKey] || c.dayKey.toUpperCase();
        return `- ${c.employeeName} | ${dayLabel} | ${c.newShift.start}–${
          c.newShift.end
        }  (already on ${c.otherAirline} — ${c.otherDept} ${
          c.existingShift.start
        }–${c.existingShift.end})`;
      });

      const extra =
        conflicts.length > 6
          ? `\n...and ${conflicts.length - 6} more conflicts.`
          : "";

      const proceed = window.confirm(
        "⚠️ RED FLAG – Employee double assigned in another airline for the same day / time.\n\n" +
          previewLines.join("\n") +
          extra +
          "\n\nDo you still want to submit this schedule?"
      );

      if (!proceed) {
        return;
      }
    }

    const weekTagToSave = weekTag || buildWeekTag(dayNumbers);

    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      weekTag: weekTagToSave,
      grid: rows,
      totals: employeeTotals,
      airlineWeeklyHours: airlineTotal,
      airlineDailyHours: dailyTotals,
      budget: airlineBudgets[airline] || 0,
      status: "pending",
      createdBy: user?.username || null,
      role: user?.role || null,
    });

    alert("Schedule submitted for approval!");
  };

  // EXPORT PDF
  const exportPDF = async () => {
    const container = document.getElementById("schedule-print-area");
    if (!container) {
      alert("Printable area not found.");
      return;
    }

    const logoUrl = AIRLINE_LOGOS[airline];
    let logoImg = null;

    if (logoUrl) {
      logoImg = await loadImage(logoUrl);
    }

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFFFFF",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();

    if (logoImg) {
      pdf.addImage(logoImg, "PNG", 20, 20, 150, 70);
    }

    const imgData = canvas.toDataURL("image/png");
    const yOffset = logoImg ? 110 : 20;

    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);
    pdf.save(`Schedule_${airline}_${department}.pdf`);
  };

  // Mapa id → nombre para el resumen
  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  // RENDER
  return (
    <div className="p-4 space-y-4">
      {/* 🔙 Back to Dashboard */}
      <button
        type="button"
        className="btn btn-soft"
        style={{ marginBottom: "0.75rem" }}
        onClick={() => navigate("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-lg font-semibold">Create Weekly Schedule</h1>

      {/* Airline + Department */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="font-medium text-sm">Airline</label>
          <select
            className="border p-1 rounded w-full"
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
          >
            <option value="">Select airline</option>
            <option value="SY">SY</option>
            <option value="WL Havana Air">WL Havana Air</option>
            <option value="WL Invicta">WL Invicta</option>
            <option value="AV">AV</option>
            <option value="EA">EA</option>
            <option value="WCHR">WCHR</option>
            <option value="CABIN">Cabin Service</option>
            <option value="AA-BSO">AA-BSO</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div>
          <label className="font-medium text-sm">Department</label>
          <select
            className="border p-1 rounded w-full"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select department</option>
            <option value="Ramp">Ramp</option>
            <option value="TC">Ticket Counter</option>
            <option value="BSO">BSO</option>
            <option value="Cabin">Cabin Service</option>
            <option value="WCHR">WCHR</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Day numbers */}
      <div className="grid grid-cols-7 gap-2 text-xs">
        {DAY_KEYS.map((key) => (
          <div key={key}>
            <label className="uppercase text-[11px] font-semibold">
              {DAY_LABELS[key]}
            </label>
            <input
              className="border rounded text-center px-1 py-1 w-full"
              value={dayNumbers[key]}
              onChange={(e) =>
                setDayNumbers({ ...dayNumbers, [key]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

      {/* Área imprimible */}
      <div id="schedule-print-area">
        <ScheduleGrid
          employees={employees}
          dayNumbers={dayNumbers}
          rows={rows}
          setRows={setRows}
          airline={airline}
          department={department}
          onSave={handleSaveSchedule}
          onSaveDraft={handleSaveDraft} // ✅ NUEVO
        />
      </div>

      {/* Resumen semanal */}
      <div className="card text-sm">
        <h2 className="font-semibold mb-1">Weekly Summary</h2>
        <p>Total Hours (with lunch): {airlineTotal.toFixed(2)}</p>
        <p>Budget: {airlineBudgets[airline] || 0}</p>

        <h3 className="font-semibold mt-3 mb-1 text-xs">
          Daily Hours (All employees)
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          {DAY_KEYS.map((dKey) => (
            <div key={dKey} className="bg-gray-50 border rounded px-2 py-1">
              <div className="font-semibold">{DAY_LABELS[dKey]}</div>
              <div>{dailyTotals[dKey].toFixed(2)} hrs</div>
            </div>
          ))}
        </div>

        {/* 🔍 Horas por empleado en ESTE schedule */}
        <h3 className="font-semibold mt-3 mb-1 text-xs">
          Employee weekly hours (this schedule)
        </h3>
        <div className="grid md:grid-cols-2 gap-2 text-[11px]">
          {rows.map((r, idx) => {
            if (!r.employeeId) return null;
            const total = employeeTotals[r.employeeId] || 0;
            const over = total > 40;
            const name = employeeNameMap[r.employeeId] || "Unknown";

            return (
              <div
                key={idx}
                className={
                  "flex items-center justify-between border rounded px-2 py-1 " +
                  (over ? "bg-red-50" : "bg-gray-50")
                }
              >
                <span
                  className={
                    over ? "font-semibold text-red-700" : "font-semibold"
                  }
                >
                  {name}
                </span>
                <span className={over ? "font-semibold text-red-700" : ""}>
                  {total.toFixed(2)} hrs
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Employees with more than 40 hrs in this schedule are highlighted in
          red.
        </p>
      </div>

      {/* Botón PDF */}
      <button
        onClick={exportPDF}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Export PDF
      </button>
    </div>
  );}
