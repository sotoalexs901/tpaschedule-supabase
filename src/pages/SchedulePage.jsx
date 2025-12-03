// src/pages/SchedulePage.jsx
import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Logos oficiales desde Firebase (rellena tus URLs reales)
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

// Helper: cargar imagen
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

// -------------------------------
// Helpers de tiempo y conflictos
// -------------------------------
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

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftsOverlap(aStart, aEnd, bStart, bEnd) {
  // Asumimos formato HH:MM y que OFF ya fue filtrado
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);

  // Intervalos se solapan si el inicio de uno es menor al fin del otro y viceversa
  return aS < bE && bS < aE;
}

/**
 * Busca conflictos de un MISMO empleado en el MISMO día
 * dentro del schedule que se está editando.
 *
 * Devuelve un array de strings con mensajes de conflicto.
 */
function findConflicts(rows, employees, dayNumbers, airline, department) {
  const conflicts = [];

  // Mapa id->nombre para mensajes
  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = e.name || "Unknown";
  });

  // Por cada fila (empleado)
  rows.forEach((row) => {
    if (!row.employeeId) return;
    const empName = empMap[row.employeeId] || "Unknown";

    DAY_KEYS.forEach((dayKey) => {
      const shifts = row[dayKey] || [];
      if (!shifts.length) return;

      // Revisa combinaciones de turnos de ese día para ese empleado
      for (let i = 0; i < shifts.length; i++) {
        const sA = shifts[i];
        if (!sA.start || sA.start === "OFF" || !sA.end) continue;

        for (let j = i + 1; j < shifts.length; j++) {
          const sB = shifts[j];
          if (!sB.start || sB.start === "OFF" || !sB.end) continue;

          if (shiftsOverlap(sA.start, sA.end, sB.start, sB.end)) {
            const dayLabel = DAY_LABELS[dayKey] || dayKey.toUpperCase();
            const dayNum = dayNumbers?.[dayKey]
              ? ` / ${dayNumbers[dayKey]}`
              : "";

            conflicts.push(
              `• ${empName} — ${airline} / ${department} — ${dayLabel}${dayNum}\n   Turnos: ${sA.start}-${sA.end} y ${sB.start}-${sB.end}`
            );
          }
        }
      }
    });
  });

  return conflicts;
}

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

  // Cargar budgets
  useEffect(() => {
    getDocs(collection(db, "airlineBudgets")).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => (map[d.data().airline] = d.data().budgetHours));
      setAirlineBudgets(map);
    });
  }, []);

  // Cálculo de horas
  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let s = sh * 60 + sm;
    let e = eh * 60 + em;
    if (e < s) e += 1440;
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
      if (r.employeeId) {
        employeeTotals[r.employeeId] = subtotal;
      }
      airlineTotal += subtotal;
    });

    return { employeeTotals, airlineTotal };
  };

  const { employeeTotals, airlineTotal } = calculateTotals();

  // Guardar en Firestore (con chequeo de conflictos interno)
  const handleSaveSchedule = async () => {
    if (!airline || !department) {
      alert("Please select airline and department.");
      return;
    }

    // 1) Buscar conflictos
    const conflicts = findConflicts(
      rows,
      employees,
      dayNumbers,
      airline,
      department
    );

    if (conflicts.length > 0) {
      alert(
        `🚩 Se detectaron empleados programados doble en el mismo día:\n\n${conflicts.join(
          "\n\n"
        )}\n\nPor favor corrige estos turnos antes de enviar.`
      );
      return; // NO guarda mientras existan conflictos
    }

    // 2) Si todo ok, guardar
    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      grid: rows,
      totals: employeeTotals,
      airlineWeeklyHours: airlineTotal,
      budget: airlineBudgets[airline] || 0,
      status: "pending",
      createdBy: user?.username || null,
    });

    alert("Schedule submitted for approval!");
  };

  // Exportar PDF (igual que tenías)
  const exportPDF = async () => {
    const container = document.getElementById("schedule-print-area");
    if (!container) return alert("Printable area not found.");

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
            <option value="">Select</option>
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
        {Object.keys(dayNumbers).map((key) => (
          <div key={key}>
            <label className="uppercase text-[11px] font-semibold">
              {key}
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

      {/* Área imprimible / grid */}
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

      {/* Summary */}
      <div className="card text-sm">
        <h2 className="font-semibold">Weekly Summary</h2>
        <p>Total Hours: {airlineTotal.toFixed(2)}</p>
        <p>Budget: {airlineBudgets[airline] || 0}</p>

        {Object.entries(employeeTotals).map(([id, hrs]) => {
          const emp = employees.find((e) => e.id === id);
          return (
            <p key={id}>
              {emp?.name || "Unknown"} — <b>{hrs.toFixed(2)} hrs</b>
            </p>
          );
        })}
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
