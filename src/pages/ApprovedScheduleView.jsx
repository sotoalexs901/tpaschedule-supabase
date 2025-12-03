// src/pages/ApprovedScheduleView.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ===================== LOGOS POR AEROLÍNEA (PON TUS URLs REALES) =====================
const AIRLINE_LOGOS = {
  SY: "URL_LOGO_SY",
  "WL Havana Air": "URL_LOGO_WL_HAVANA",
  "WL Invicta": "URL_LOGO_WL_INVICTA",
  AV: "URL_LOGO_AV",
  EA: "URL_LOGO_EA",
  WCHR: "URL_LOGO_WCHR",
  CABIN: "URL_LOGO_CABIN",
  "AA-BSO": "URL_LOGO_AA_BSO",
  OTHER: "URL_LOGO_OTHER",
};

// ===================== COLORES POR AEROLÍNEA =====================
const AIRLINE_COLORS = {
  SY: "#FFA500", // Sun Country style
  "WL Havana Air": "#005BBB",
  "WL Invicta": "#00695C",
  AV: "#D32F2F",
  EA: "#1A73E8",
  WCHR: "#9B59B6",
  CABIN: "#4CAF50",
  "AA-BSO": "#B0BEC5",
  OTHER: "#FFD966",
};

// Helper para cargar imagen (para PDF)
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Orden de días
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

// ===================== TABLA ESTILO EXCEL (SOLO TABLA) =====================
function ExcelScheduleTable({ schedule, employees }) {
  const { days, grid, airline } = schedule;

  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = e.name;
  });

  const color = AIRLINE_COLORS[airline] || "#FFD966";

  return (
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
  );
}

// ===================== PÁGINA PRINCIPAL =====================
export default function ApprovedScheduleView() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) {
        setSchedule({ id: snap.id, ...snap.data() });
      }

      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    load().catch(console.error);
  }, [id]);

  if (!schedule) {
    return <p className="p-6">Loading approved schedule...</p>;
  }

  const logoUrl = AIRLINE_LOGOS[schedule.airline];

  // ---------- EXPORTAR PDF ----------
  const exportPDF = async () => {
    const element = document.getElementById("approved-print-area");
    if (!element) {
      alert("Printable area not found");
      return;
    }

    try {
      // Capturamos SOLO el título + tabla (sin el <img> del logo)
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("landscape", "pt", "a4");
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();

      // Si hay logo, lo agregamos manualmente arriba del PDF
      let yOffset = 20;
      if (logoUrl) {
        try {
          const logoImg = await loadImage(logoUrl);
          pdf.addImage(logoImg, "PNG", 20, yOffset, 150, 70);
          yOffset += 80; // un poco de espacio debajo del logo
        } catch (e) {
          console.warn("No se pudo cargar el logo para el PDF:", e);
        }
      }

      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);
      pdf.save(`Approved_${schedule.airline}_${schedule.department}.pdf`);
    } catch (err) {
      console.error("Error exportando PDF:", err);
      alert("Hubo un problema al exportar el PDF. Revisa la consola del navegador.");
    }
  };

  return (
    <div className="p-6 space-y-4 approved-page">
      {/* HEADER VISUAL CON LOGO (NO SE CAPTURA EN html2canvas) */}
      <div className="excel-header">
        {logoUrl && (
          <img src={logoUrl} alt={schedule.airline} className="excel-logo" />
        )}
        <h1 className="excel-title">
          {schedule.airline} — {schedule.department}
        </h1>
      </div>

      {/* ÁREA QUE SE CAPTURA PARA EL PDF: TÍTULO TEXTO + TABLA */}
      <div id="approved-print-area">
        <h2 className="excel-title-pdf">
          {schedule.airline} — {schedule.department}
        </h2>
        <ExcelScheduleTable schedule={schedule} employees={employees} />
      </div>

      {/* RESUMEN */}
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
