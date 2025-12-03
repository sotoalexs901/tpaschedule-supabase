// src/pages/ApprovedScheduleView.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// 🔵 Logos oficiales desde Firebase (mismos que usas en SchedulePage / ScheduleGrid)
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

// 🔵 Colores por aerolínea (igual que en ApprovalsPage / ScheduleGrid)
const AIRLINE_COLORS = {
  SY: "#F28C28",
  "WL Havana Air": "#3A7BD5",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
};

// Helper para cargar imágenes de logo (para PDF)
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

// ============= TABLA ESTILO SUN COUNTRY / EXCEL =============
function ExcelScheduleTable({ schedule, employees }) {
  const { days, grid, airline, department } = schedule;

  const logo = AIRLINE_LOGOS[airline];
  const headerColor = AIRLINE_COLORS[airline] || "#0f172a";

  // Mapa id => nombre
  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = e.name;
  });

  // Texto corto de días para el subtítulo
  const weekText = DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = days?.[key] || "";
    return num ? `${label} ${num}` : label;
  }).join("  |  ");

  return (
    <div
      className="excel-schedule-wrapper"
      style={{
        background: "#ffffff",
        borderRadius: "10px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
        padding: "16px",
      }}
    >
      {/* HEADER CON LOGO + COLOR POR AEROLÍNEA */}
      <div
        className="excel-header"
        style={{
          backgroundColor: headerColor,
          color: "#ffffff",
          padding: "12px 16px",
          borderRadius: "8px 8px 0 0",
          margin: "-16px -16px 12px -16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div
            className="excel-title"
            style={{
              fontSize: "22px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {airline} — {department}
          </div>
          <div style={{ fontSize: "11px", opacity: 0.85, marginTop: 4 }}>
            WEEKLY SCHEDULE &nbsp;•&nbsp; {weekText}
          </div>
        </div>

        {logo && (
          <img
            src={logo}
            alt={airline}
            className="excel-logo"
            style={{ height: 60, objectFit: "contain" }}
          />
        )}
      </div>

      {/* TABLA PRINCIPAL */}
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
                {/* Fila 1: Primer turno */}
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
                        className={
                          "excel-cell " +
                          (hasWork ? "excel-cell-work" : "excel-cell-off")
                        }
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>

                {/* Fila 2: Segundo turno */}
                <tr>
                  {DAY_KEYS.map((dKey) => {
                    const text = getShiftText(row[dKey], 1);
                    const hasWork = text !== "OFF";
                    return (
                      <td
                        key={dKey}
                        className={
                          "excel-cell " +
                          (hasWork ? "excel-cell-work" : "excel-cell-off")
                        }
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

// ============= PÁGINA PRINCIPAL =============
export default function ApprovedScheduleView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function load() {
      // Cargar schedule
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) {
        setSchedule({ id: snap.id, ...snap.data() });
      }

      // Cargar empleados para mostrar nombres
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    load().catch(console.error);
  }, [id]);

  if (!schedule) {
    return <p className="p-6">Loading approved schedule...</p>;
  }

  // ✅ Clonar este horario como plantilla en /schedule
  const handleUseAsTemplate = () => {
    navigate("/schedule", {
      state: {
        template: {
          airline: schedule.airline,
          department: schedule.department,
          days: schedule.days,
          grid: schedule.grid,
        },
      },
    });
  };

  // ✅ Exportar PDF (con workaround para imágenes remotas)
  const exportPDF = async () => {
    try {
      const element = document.getElementById("approved-print-area");
      if (!element) {
        alert("Printable area not found");
        return;
      }

      const logoUrl = AIRLINE_LOGOS[schedule.airline];
      let logoImg = null;
      if (logoUrl) {
        try {
          logoImg = await loadImage(logoUrl);
        } catch (e) {
          console.warn("Logo could not be loaded for PDF header", e);
        }
      }

      // ⛔ Evitar tainted canvas: ocultar imágenes dentro del área capturada
      const imgs = Array.from(element.querySelectorAll("img"));
      const originalDisplay = imgs.map((img) => img.style.display);
      imgs.forEach((img) => {
        img.style.display = "none";
      });

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      // Restaurar imágenes
      imgs.forEach((img, idx) => {
        img.style.display = originalDisplay[idx] || "";
      });

      const pdf = new jsPDF("landscape", "pt", "a4");
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const marginX = 20;
      let y = 20;

      // Logo en header del PDF
      if (logoImg) {
        pdf.addImage(logoImg, "PNG", marginX, y, 140, 60);
        y += 70;
      }

      const availableHeight = pageHeight - y - 20;
      let imgWidth = pageWidth - marginX * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Ajustar si es más alto que la página
      if (imgHeight > availableHeight) {
        const ratio = availableHeight / imgHeight;
        imgWidth *= ratio;
        imgHeight *= ratio;
      }

      pdf.addImage(imgData, "PNG", marginX, y, imgWidth, imgHeight);
      pdf.save(`Approved_${schedule.airline}_${schedule.department}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Error exporting PDF. Check the console for details.");
    }
  };

  return (
    <div className="p-6 space-y-4 approved-page">
      {/* ← Volver al dashboard */}
      <button
        onClick={() => navigate("/dashboard")}
        className="btn btn-soft"
        style={{ marginBottom: "0.75rem" }}
      >
        ← Back to Dashboard
      </button>

      {/* Zona que se imprime en el PDF */}
      <div id="approved-print-area">
        <ExcelScheduleTable schedule={schedule} employees={employees} />
      </div>

      {/* Resumen debajo */}
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

      {/* ✅ Clonar como plantilla */}
      <button
        onClick={handleUseAsTemplate}
        className="bg-blue-600 text-white py-2 rounded w-full mt-2"
      >
        Use this schedule as template for new week
      </button>

      {/* Exportar PDF */}
      <button
        onClick={exportPDF}
        className="bg-green-600 text-white py-2 rounded w-full mt-2"
      >
        Export PDF
      </button>
    </div>
  );
}
