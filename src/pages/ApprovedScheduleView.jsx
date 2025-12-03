// src/pages/ApprovedScheduleView.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ===================== LOGOS POR AEROLÍNEA =====================
const AIRLINE_LOGOS = {
  SY: "URL_DE_LOGO_SY",
  "WL Havana Air": "URL_DE_LOGO_WL_HAVANA",
  "WL Invicta": "URL_DE_LOGO_WL_INVICTA",
  AV: "URL_DE_LOGO_AV",
  EA: "URL_DE_LOGO_EA",
  WCHR: "URL_DE_LOGO_WCHR",
  CABIN: "URL_DE_LOGO_CABIN",
  "AA-BSO": "URL_DE_LOGO_AA_BSO",
  OTHER: "URL_DE_LOGO_OTHER",
};

// ===================== COLORES POR AEROLÍNEA =====================
const AIRLINE_COLORS = {
  SY: "#FFA500", // Naranja tipo Sun Country
  "WL Havana Air": "#005BBB",
  "WL Invicta": "#00695C",
  AV: "#D32F2F",
  EA: "#1A73E8",
  WCHR: "#9B59B6",
  CABIN: "#4CAF50",
  "AA-BSO": "#B0BEC5",
  OTHER: "#FFD966",
};

// Orden fijo de días
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

// Convierte arreglo de shifts a texto
function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
}

// ===================== TABLA ESTILO EXCEL =====================
function ExcelScheduleTable({ schedule, employees }) {
  const { days, grid, airline, department } = schedule;

  // Mapa id -> nombre
  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = e.name;
  });

  const logo = AIRLINE_LOGOS[airline];
  const color = AIRLINE_COLORS[airline] || "#FFD966";

  return (
    <div className="excel-schedule-wrapper">
      {/* HEADER CON LOGO + TÍTULO */}
      <div className="excel-header">
        {logo && <img src={logo} alt={airline} className="excel-logo" />}
        <h1 className="excel-title">
          {airline} — {department}
        </h1>
      </div>

      <table className="excel-table">
        <thead>
          <tr>
            <th className="excel-header-employee">EMPLOYEE</th>
            {DAY_KEYS.map((key) => (
              <th key={key} className="excel-header-day">
                {DAY_LABELS[key]} {days?.[key] ? `/ ${days[key]}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, idx) => {
            const name = empMap[row.employeeId] || "Unknown";

            return (
              <React.Fragment key={idx}>
                {/* Fila 1: primer turno */}
                <tr>
                  <td className="excel-employee-cell" rowSpan={2}>
                    {name}
                  </td>
                  {DAY_KEYS.map((dKey) => {
                    const text = getShiftText(row[dKey], 0);
                    const hasWork = text !== "OFF";
                    return (
                      <td
                        key={dKey}
                        className="excel-cell"
                        style={{
                          background: hasWork ? color : "#FFFFFF",
                          fontWeight: hasWork ? 600 : 400,
                        }}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>

                {/* Fila 2: segundo turno */}
                <tr>
                  {DAY_KEYS.map((dKey) => {
                    const text = getShiftText(row[dKey], 1);
                    const hasWork = text !== "OFF";
                    return (
                      <td
                        key={dKey}
                        className="excel-cell"
                        style={{
                          background: hasWork ? color : "#FFFFFF",
                          fontWeight: hasWork ? 600 : 400,
                        }}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===================== PÁGINA PRINCIPAL =====================
export default function ApprovedScheduleView() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function load() {
      // Schedule
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) {
        setSchedule({ id: snap.id, ...snap.data() });
      }

      // Empleados para mostrar nombres
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    load().catch(console.error);
  }, [id]);

  if (!schedule) {
    return <p className="p-6">Loading approved schedule...</p>;
  }

  // ---------- EXPORTAR PDF (incluye logo y colores) ----------
  const exportPDF = async () => {
    const element = document.getElementById("approved-print-area");
    if (!element) {
      alert("Printable area not found");
      return;
    }

    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    pdf.save(`Approved_${schedule.airline}_${schedule.department}.pdf`);
  };

  return (
    <div className="p-6 space-y-4 approved-page">
      {/* Zona que se captura para el PDF */}
      <div id="approved-print-area">
        <ExcelScheduleTable schedule={schedule} employees={employees} />
      </div>

      {/* Resumen abajo */}
      <div className="card text-sm mt-4">
        <h2 className="font-semibold mb-2">Weekly Summary</h2>
        <p>
          <b>Total Hours:</b>{" "}
          {schedule.airlineWeeklyHours?.toFixed(2) ?? "0.00"}
        </p>
        <p>
          <b>Budget:</b> {schedule.budget}
        </p>
        <p
          className={
            schedule.airlineWeeklyHours > schedule.budget
              ? "text-red-600 font-bold"
              : "text-green-700 font-bold"
          }
        >
          {schedule.airlineWeeklyHours > schedule.budget
            ? "Over budget"
            : "Within budget"}
        </p>
      </div>

      <button
        onClick={exportPDF}
        className="bg-green-600 text-white py-2 rounded w-full mt-2"
      >
        Export PDF
      </button>
    </div>
  );
}
