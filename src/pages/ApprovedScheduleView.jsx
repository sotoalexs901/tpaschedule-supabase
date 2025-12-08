// src/pages/ApprovedScheduleView.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useUser } from "../UserContext.jsx";

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
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4b5f-b126-9c6a69f6dcc6",
};

// 🔵 Colores por aerolínea
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

// Helper: hex -> rgba con alpha
function hexToRgba(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

// ============= TABLA ESTILO EXCEL =============
function ExcelScheduleTable({ schedule, employees, compact = false }) {
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

  // Colores para filas alternadas según aerolínea
  const stripeBg = hexToRgba(headerColor, 0.18); // fila con trabajo
  const stripeOffBg = hexToRgba(headerColor, 0.32); // OFF más oscuro
  const defaultWorkBg = "#ffffff";
  const defaultOffBg = "#f3f4f6";

  // Estilo base del contenedor, con opción compact
  const wrapperStyle = {
    background: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
    padding: compact ? "10px" : "16px",
    transform: compact ? "scale(0.7)" : "none", // 👈 escala reducida en full-screen
    transformOrigin: "top left",
  };

  return (
    <div className="excel-schedule-wrapper" style={wrapperStyle}>
      {/* HEADER */}
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

            // Fila alternada: una sí, una no
            const isStriped = idx % 2 === 0;

            const employeeCellStyle = isStriped
              ? { backgroundColor: stripeBg }
              : {};

            return (
              <React.Fragment key={idx}>
                {/* Fila 1: Primer turno */}
                <tr>
                  <td
                    className="excel-employee-cell"
                    rowSpan={2}
                    style={employeeCellStyle}
                  >
                    {name}
                  </td>
                  {DAY_KEYS.map((dKey) => {
                    const shiftObj = (row[dKey] && row[dKey][0]) || null;
                    const baseText = getShiftText(row[dKey], 0);
                    const isOff = baseText === "OFF";
                    const isTraining = !!shiftObj?.training;

                    const displayText =
                      isTraining && !isOff
                        ? `${baseText} (TRN)`
                        : baseText;

                    const bgColor = isStriped
                      ? isOff
                        ? stripeOffBg
                        : stripeBg
                      : isOff
                      ? defaultOffBg
                      : defaultWorkBg;

                    const cellStyle = {
                      backgroundColor: bgColor,
                      border:
                        isTraining && !isOff
                          ? `2px solid ${headerColor}`
                          : undefined,
                    };

                    return (
                      <td
                        key={dKey}
                        className={
                          "excel-cell " +
                          (isOff ? "excel-cell-off" : "excel-cell-work")
                        }
                        style={cellStyle}
                      >
                        {displayText}
                      </td>
                    );
                  })}
                </tr>

                {/* Fila 2: Segundo turno */}
                <tr>
                  {DAY_KEYS.map((dKey) => {
                    const shiftObj = (row[dKey] && row[dKey][1]) || null;
                    const baseText = getShiftText(row[dKey], 1);
                    const isOff = baseText === "OFF";
                    const isTraining = !!shiftObj?.training;

                    const displayText =
                      isTraining && !isOff
                        ? `${baseText} (TRN)`
                        : baseText;

                    const bgColor = isStriped
                      ? isOff
                        ? stripeOffBg
                        : stripeBg
                      : isOff
                      ? defaultOffBg
                      : defaultWorkBg;

                    const cellStyle = {
                      backgroundColor: bgColor,
                      border:
                        isTraining && !isOff
                          ? `2px solid ${headerColor}`
                          : undefined,
                    };

                    return (
                      <td
                        key={dKey}
                        className={
                          "excel-cell " +
                          (isOff ? "excel-cell-off" : "excel-cell-work")
                        }
                        style={cellStyle}
                      >
                        {displayText}
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
  const { user } = useUser();

  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

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

  const handleDeleteSchedule = async () => {
    if (!user || user.role !== "station_manager") return;

    const confirmDelete = window.confirm(
      "⚠️ Are you sure you want to permanently delete this approved schedule?"
    );
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      await deleteDoc(doc(db, "schedules", schedule.id));
      alert("Schedule deleted successfully.");
      navigate("/approved");
    } catch (err) {
      console.error("Error deleting schedule:", err);
      alert("Error deleting schedule. Check console for details.");
    } finally {
      setDeleting(false);
    }
  };

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

      // Evitar tainted canvas
      const imgs = Array.from(element.querySelectorAll("img"));
      const originalDisplay = imgs.map((img) => img.style.display);
      imgs.forEach((img) => (img.style.display = "none"));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      imgs.forEach((img, idx) => {
        img.style.display = originalDisplay[idx] || "";
      });

      const pdf = new jsPDF("landscape", "pt", "a4");
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const marginX = 20;
      let y = 20;

      if (logoImg) {
        pdf.addImage(logoImg, "PNG", marginX, y, 140, 60);
        y += 70;
      }

      const availableHeight = pageHeight - y - 20;
      let imgWidth = pageWidth - marginX * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

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
    <>
      {/* VISTA NORMAL */}
      <div className="p-2 md:p-4 lg:p-6 space-y-4 approved-page">
        <button
          onClick={() => navigate("/approved")}
          className="btn btn-soft"
          style={{ marginBottom: "0.75rem" }}
          type="button"
        >
          ← Back to Approved Schedules
        </button>

        {/* Área principal del horario, con scroll horizontal y ancho cómodo */}
        <div
          id="approved-print-area"
          className="overflow-x-auto -mx-2 md:mx-0"
        >
          <div className="inline-block min-w-[900px] md:min-w-[1100px] w-full">
            <ExcelScheduleTable schedule={schedule} employees={employees} />
          </div>
        </div>

        <div className="card text-sm mt-4 space-y-1">
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

        {/* BOTONES DE ACCIÓN */}
        <div className="grid md:grid-cols-4 gap-3 mt-2">
          {/* Template */}
          <button
            type="button"
            onClick={handleUseAsTemplate}
            className="btn w-full text-sm"
            style={{
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontWeight: 600,
              opacity: 1,
            }}
          >
            Use this schedule as template for new week
          </button>

          {/* Export PDF */}
          <button
            type="button"
            onClick={exportPDF}
            className="btn w-full text-sm"
            style={{
              backgroundColor: "#16a34a",
              color: "#ffffff",
              fontWeight: 600,
              opacity: 1,
            }}
          >
            Export PDF
          </button>

          {/* FULL SCREEN VIEW */}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="btn w-full text-sm"
            style={{
              backgroundColor: "#0f172a",
              color: "#ffffff",
              fontWeight: 600,
              opacity: 1,
            }}
          >
            Open full-screen schedule view
          </button>

          {/* Delete */}
          {user?.role === "station_manager" && (
            <button
              type="button"
              onClick={handleDeleteSchedule}
              disabled={deleting}
              className="btn w-full text-sm"
              style={{
                backgroundColor: "#dc2626",
                color: "#ffffff",
                fontWeight: 600,
                opacity: deleting ? 0.6 : 1,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "Deleting..." : "Delete this schedule"}
            </button>
          )}
        </div>
      </div>

      {/* OVERLAY FULL-SCREEN PARA SCREENSHOT LIMPIO */}
      {fullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#000",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Botón cerrar, arriba a la derecha */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.5)",
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#fff",
                fontSize: 12,
              }}
            >
              Close
            </button>
          </div>

          {/* Horario ocupando casi toda la pantalla */}
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "auto",
              padding: 0,
            }}
          >
            <div
              style={{
                backgroundColor: "#fff",
                maxWidth: "100%",
                maxHeight: "100%",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  minWidth: 900,
                }}
              >
                <ExcelScheduleTable
                  schedule={schedule}
                  employees={employees}
                  compact={true} // 👈 versión reducida para screenshot
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
