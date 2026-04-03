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

const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  WestJet: "/logos/westjet.png",
  "WL Havana Air": "/logos/westjet.png",
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

const AIRLINE_COLORS = {
  SY: "#F28C28",
  WestJet: "#22B8B0",
  "WL Havana Air": "#22B8B0",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

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

const normalizeAirlineName = (value) => {
  const airline = String(value || "").trim();

  if (
    airline.toUpperCase() === "WL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA" ||
    airline.toUpperCase() === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
};

function normalizeDateString(value) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashWithYear = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashWithYear) {
    const [, mm, dd, yyyy] = slashWithYear;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return "";
}

function weekStartFromDays(days) {
  const mon = days?.mon;
  if (!mon) return "";

  const match = String(mon).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";

  const [, mm, dd] = match;

  const today = new Date();
  const thisYear = today.getFullYear();
  const candidateThisYear = new Date(
    thisYear,
    Number(mm) - 1,
    Number(dd)
  );

  if (!Number.isNaN(candidateThisYear.getTime())) {
    return `${candidateThisYear.getFullYear()}-${String(
      candidateThisYear.getMonth() + 1
    ).padStart(2, "0")}-${String(candidateThisYear.getDate()).padStart(2, "0")}`;
  }

  return "";
}

function cloneGrid(grid = []) {
  return grid.map((row) => ({
    ...row,
    mon: (row.mon || []).map((s) => ({ ...s })),
    tue: (row.tue || []).map((s) => ({ ...s })),
    wed: (row.wed || []).map((s) => ({ ...s })),
    thu: (row.thu || []).map((s) => ({ ...s })),
    fri: (row.fri || []).map((s) => ({ ...s })),
    sat: (row.sat || []).map((s) => ({ ...s })),
    sun: (row.sun || []).map((s) => ({ ...s })),
  }));
}

function getShiftText(shifts, idx) {
  const s = (shifts && shifts[idx]) || null;
  if (!s || !s.start || s.start === "OFF") return "OFF";
  if (!s.end) return s.start;
  return `${s.start} - ${s.end}`;
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    dark: {
      background: "#0f172a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(15,23,42,0.16)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "11px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ overBudget }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: overBudget ? "#fff1f2" : "#ecfdf5",
        color: overBudget ? "#9f1239" : "#065f46",
        border: `1px solid ${overBudget ? "#fecdd3" : "#a7f3d0"}`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: overBudget ? "#e11d48" : "#10b981",
        }}
      />
      {overBudget ? "Over budget" : "Within budget"}
    </span>
  );
}

function ExcelScheduleTable({ schedule, employees, compact = false }) {
  const { days, grid, airline, department } = schedule;
  const displayAirline = normalizeAirlineName(
    schedule.airlineDisplayName || airline
  );

  const logo = AIRLINE_LOGOS[displayAirline] || AIRLINE_LOGOS[airline];
  const headerColor =
    AIRLINE_COLORS[displayAirline] || AIRLINE_COLORS[airline] || "#0f172a";

  const empMap = {};
  employees.forEach((e) => {
    empMap[e.id] = e.name;
  });

  const weekText = DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = days?.[key] || "";
    return num ? `${label} ${num}` : label;
  }).join("  |  ");

  const stripeBg = hexToRgba(headerColor, 0.35);
  const plainBg = "#ffffff";

  const wrapperStyle = {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #dbeafe",
    boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
    padding: compact ? "10px" : "16px",
    transform: compact ? "scale(0.7)" : "none",
    transformOrigin: "top left",
  };

  const baseCellStyle = {
    padding: compact ? "6px 1px" : "9px 1px",
    fontSize: compact ? "12px" : "15px",
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    textAlign: "center",
  };

  const headerCellStyle = {
    ...baseCellStyle,
    fontWeight: 700,
    fontSize: compact ? "12px" : "14px",
    width: "10%",
  };

  const employeeHeaderCellStyle = {
    ...headerCellStyle,
    width: "12%",
    minWidth: 120,
    maxWidth: 150,
    textAlign: "left",
    paddingLeft: "8px",
    paddingRight: "4px",
    whiteSpace: "normal",
  };

  return (
    <div className="excel-schedule-wrapper" style={wrapperStyle}>
      <div
        className="excel-header"
        style={{
          backgroundColor: headerColor,
          color: "#ffffff",
          padding: "14px 16px",
          borderRadius: "12px 12px 0 0",
          margin: "-16px -16px 12px -16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
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
            {displayAirline} — {department}
          </div>
          <div style={{ fontSize: "11px", opacity: 0.9, marginTop: 4 }}>
            WEEKLY SCHEDULE &nbsp;•&nbsp; {weekText}
          </div>
        </div>

        {logo && (
          <img
            src={logo}
            alt={displayAirline}
            className="excel-logo"
            style={{ height: 60, objectFit: "contain" }}
          />
        )}
      </div>

      <table
        className="excel-table"
        style={{
          borderCollapse: "collapse",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            <th
              className="excel-header-employee"
              style={employeeHeaderCellStyle}
            >
              EMPLOYEE
            </th>
            {DAY_KEYS.map((key) => (
              <th
                key={key}
                className="excel-header-day"
                style={headerCellStyle}
              >
                {DAY_LABELS[key]} {days?.[key] ? `/ ${days[key]}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, idx) => {
            const name = empMap[row.employeeId] || "Unknown";
            const isStriped = idx % 2 === 0;
            const rowBg = isStriped ? stripeBg : plainBg;

            const employeeCellStyle = {
              ...baseCellStyle,
              width: "12%",
              minWidth: 120,
              maxWidth: 150,
              backgroundColor: rowBg,
              fontWeight: 600,
              textAlign: "left",
              whiteSpace: "normal",
              paddingLeft: "8px",
              paddingRight: "4px",
              borderTop: "2px solid #111",
              borderBottom: "2px solid #111",
            };

            return (
              <React.Fragment key={idx}>
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
                      isTraining && !isOff ? `${baseText} (TRN)` : baseText;

                    const cellStyle = {
                      ...baseCellStyle,
                      backgroundColor: rowBg,
                      borderTop: "2px solid #111",
                      borderLeft: "1px solid #111",
                      borderRight: "1px solid #111",
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

                <tr>
                  {DAY_KEYS.map((dKey) => {
                    const shiftObj = (row[dKey] && row[dKey][1]) || null;
                    const baseText = getShiftText(row[dKey], 1);
                    const isOff = baseText === "OFF";
                    const isTraining = !!shiftObj?.training;

                    const displayText =
                      isTraining && !isOff ? `${baseText} (TRN)` : baseText;

                    const cellStyle = {
                      ...baseCellStyle,
                      backgroundColor: rowBg,
                      borderBottom: "2px solid #111",
                      borderLeft: "1px solid #111",
                      borderRight: "1px solid #111",
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

export default function ApprovedScheduleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) {
        setSchedule({ id: snap.id, ...snap.data() });
      }

      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    load().catch((err) => {
      console.error(err);
      setStatusMessage("Could not load approved schedule.");
    });
  }, [id]);

  if (!schedule) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Loading approved schedule...
        </p>
      </PageCard>
    );
  }

  const displayAirline = normalizeAirlineName(
    schedule.airlineDisplayName || schedule.airline
  );

  const handleUseAsTemplate = () => {
    const resolvedWeekStart =
      normalizeDateString(schedule.weekStart) ||
      normalizeDateString(schedule.weekTag) ||
      weekStartFromDays(schedule.days);

    navigate("/schedule", {
      state: {
        template: {
          airline: schedule.airline || displayAirline,
          airlineDisplayName: schedule.airlineDisplayName || displayAirline,
          department: schedule.department || "",
          weekStart: resolvedWeekStart,
          days: schedule.days || null,
          grid: cloneGrid(schedule.grid || []),
        },
      },
    });
  };

  const handleDeleteSchedule = async () => {
    if (!user || user.role !== "station_manager") return;

    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this approved schedule?"
    );
    if (!confirmDelete) return;

    try {
      setDeleting(true);
      await deleteDoc(doc(db, "schedules", schedule.id));
      navigate("/approved");
    } catch (err) {
      console.error("Error deleting schedule:", err);
      setStatusMessage("Error deleting schedule.");
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

      const logoUrl =
        AIRLINE_LOGOS[displayAirline] || AIRLINE_LOGOS[schedule.airline];

      let logoImg = null;
      if (logoUrl) {
        try {
          logoImg = await loadImage(logoUrl);
        } catch (e) {
          console.warn("Logo could not be loaded for PDF header", e);
        }
      }

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
      const safeAirline = displayAirline.replace(/\s+/g, "_");
      pdf.save(`Approved_${safeAirline}_${schedule.department}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Error exporting PDF. Check the console for details.");
    }
  };

  const overBudget =
    schedule.budget && schedule.airlineWeeklyHours > schedule.budget;

  return (
    <>
      <div
        className="approved-page"
        style={{
          display: "grid",
          gap: 18,
          fontFamily: "Poppins, Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
            boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 220,
              height: 220,
              borderRadius: "999px",
              background: "rgba(255,255,255,0.08)",
              top: -80,
              right: -40,
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.22em",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 700,
                }}
              >
                TPA OPS · Approved Schedule
              </p>

              <h1
                style={{
                  margin: "10px 0 6px",
                  fontSize: 32,
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: "-0.04em",
                }}
              >
                {displayAirline} — {schedule.department}
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: 760,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.88)",
                }}
              >
                View the final approved schedule, export it to PDF, use it as a
                template, or open a full-screen version.
              </p>
            </div>

            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => navigate("/approved")}
            >
              ← Back to Approved Schedules
            </ActionButton>
          </div>
        </div>

        {statusMessage && (
          <PageCard style={{ padding: 16 }}>
            <div
              style={{
                background: "#edf7ff",
                border: "1px solid #cfe7fb",
                borderRadius: 16,
                padding: "14px 16px",
                color: "#1769aa",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>
          </PageCard>
        )}

        <div id="approved-print-area" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <ExcelScheduleTable schedule={schedule} employees={employees} />
          </div>
        </div>

        <PageCard style={{ padding: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Total Hours
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.03em",
                }}
              >
                {schedule.airlineWeeklyHours?.toFixed(2) ?? "0.00"}
              </p>
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 16,
                padding: "16px 18px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Budget
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.03em",
                }}
              >
                {schedule.budget ?? 0}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "16px 18px",
              }}
            >
              <StatusBadge overBudget={overBudget} />
            </div>
          </div>
        </PageCard>

        <PageCard style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <ActionButton
              type="button"
              variant="primary"
              onClick={handleUseAsTemplate}
            >
              Use this schedule as template
            </ActionButton>

            <ActionButton
              type="button"
              variant="success"
              onClick={exportPDF}
            >
              Export PDF
            </ActionButton>

            <ActionButton
              type="button"
              variant="dark"
              onClick={() => setFullscreen(true)}
            >
              Open full-screen schedule view
            </ActionButton>

            {user?.role === "station_manager" && (
              <ActionButton
                type="button"
                variant="danger"
                disabled={deleting}
                onClick={handleDeleteSchedule}
              >
                {deleting ? "Deleting..." : "Delete this schedule"}
              </ActionButton>
            )}
          </div>
        </PageCard>
      </div>

      {fullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#020617",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p
              style={{
                margin: 0,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Full-screen schedule preview
            </p>

            <button
              type="button"
              onClick={() => setFullscreen(false)}
              style={{
                padding: "7px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.28)",
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "auto",
              padding: 10,
            }}
          >
            <div
              style={{
                backgroundColor: "#fff",
                maxWidth: "100%",
                maxHeight: "100%",
                overflow: "auto",
                borderRadius: 14,
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
                  compact={true}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
