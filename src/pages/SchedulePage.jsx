import React, { useState, useEffect } from "react";
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

// 🔵 Logos oficiales desde Firebase (pon aquí tus URLs reales)
const AIRLINE_LOGOS = {
  SY: "URL",
  "WL Havana Air": "URL",
  "WL Invicta": "URL",
  AV: "URL",
  EA: "URL",
  WCHR: "URL",
  CABIN: "URL",
  "AA-BSO": "URL",
  OTHER: "URL",
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
  // Si el fin es menor o igual que el inicio, asumimos que cruza medianoche
  if (e <= s) e += 24 * 60;
  return [s, e];
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => {
  const a = normalizeInterval(aStart, aEnd);
  const b = normalizeInterval(bStart, bEnd);
  if (!a || !b) return false;
  const [s1, e1] = a;
  const [s2, e2] = b;
  return s1 < e2 && s2 < e1; // solapamiento estándar de intervalos
};

// Crea un “tag” de semana basado en los números de días
const buildWeekTag = (days) =>
  DAY_KEYS.map((k) => days?.[k]?.toString().trim() || "").join("|");

export default function SchedulePage() {
  const { user } = useUser();
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

  // Cálculo de horas
  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;
    const s = toMinutes(start);
    const eRaw = toMinutes(end);
    if (s == null || eRaw == null) return 0;
    let e = eRaw;
    if (e < s) e += 24 * 60;
    return (e - s) / 60;
  };

  const calculateTotals = () => {
    let airlineTotal = 0;
    const employeeTotals = {};

    rows.forEach((r) => {
      let subtotal = 0;
      DAY_KEYS.forEach((d) => {
        r[d]?.forEach((shift) => {
          subtotal += diffHours(shift.start, shift.end);
        });
      });
      employeeTotals[r.employeeId] = subtotal;
      airlineTotal += subtotal;
    });

    return { employeeTotals, airlineTotal };
  };

  const { employeeTotals, airlineTotal } = calculateTotals();

  // ⚠️ Comprobación de conflictos con otras aerolíneas (misma semana)
  const checkConflictsWithOtherAirlines = async () => {
    const weekTag = buildWeekTag(dayNumbers).trim();

    // Si no hay números de días, no intentamos comparar
    if (!weekTag) {
      return { conflicts: [], weekTag: null };
    }

    // Buscar TODOS los schedules con la misma semana (pendientes o aprobados)
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
      // Puedes excluir el mismo airline/department si quieres solo “otras” aerolíneas
      // if (sch.airline === airline && sch.department === department) return;

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

  // Guardar schedule (con chequeo de conflictos)
  const handleSaveSchedule = async () => {
    if (!airline || !department) {
      alert("Please select airline and department.");
      return;
    }

    // 1) Chequeo de conflictos cross-airline
    const { conflicts, weekTag } = await checkConflictsWithOtherAirlines();

    if (conflicts.length > 0) {
      const previewLines = conflicts.slice(0, 6).map((c) => {
        const dayLabel = DAY_LABELS[c.dayKey] || c.dayKey.toUpperCase();
        return `- ${c.employeeName} | ${dayLabel} | ${c.newShift.start}–${
          c.newShift.end
        }  (already on ${c.otherAirline} — ${c.otherDept} ${
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
        return; // el usuario canceló
      }
    }

    const weekTagToSave = weekTag || buildWeekTag(dayNumbers);

    // 2) Guardar en Firestore
    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      weekTag: weekTagToSave,
      grid: rows,
      totals: employeeTotals,
      airlineWeeklyHours: airlineTotal,
      budget: airlineBudgets[airline] || 0,
      status: "pending",
      createdBy: user?.username || null,
      role: user?.role || null,
    });

    alert("Schedule submitted for approval!");
  };

  // ------------------------------------------------------
  // EXPORT PDF (igual que antes, usando el logo de airline)
  // ------------------------------------------------------
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

  // ------------------------------------------------------
  // RENDER
  // ------------------------------------------------------
  return (
    <div className="p-4 space-y-4">
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
        />
      </div>

      {/* Resumen semanal */}
      <div className="card text-sm">
        <h2 className="font-semibold">Weekly Summary</h2>
        <p>Total Hours: {airlineTotal.toFixed(2)}</p>
        <p>Budget: {airlineBudgets[airline] || 0}</p>
      </div>

      {/* Botón PDF */}
      <button
        onClick={exportPDF}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Export PDF
      </button>
    </div>
  );
}
