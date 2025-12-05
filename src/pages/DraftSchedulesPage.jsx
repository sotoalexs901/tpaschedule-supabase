// src/pages/DraftSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import jsPDF from "jspdf";

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

// Helper: convierte los shifts de un día a texto
function dayShiftsToText(shifts) {
  if (!Array.isArray(shifts) || shifts.length === 0) return "OFF";

  const parts = [];
  shifts.forEach((s) => {
    if (!s || !s.start || s.start === "OFF") return;
    const piece = s.end ? `${s.start}-${s.end}` : s.start;
    parts.push(piece);
  });

  return parts.length ? parts.join(", ") : "OFF";
}

// Helper: etiqueta bonita de semana tipo "MON 03 | TUESD 04 ..."
function formatWeekLabelFromSchedule(schedule) {
  if (!schedule?.days) return "Week not defined";

  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = schedule.days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

export default function DraftSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar drafts + empleados
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Empleados (para poder mostrar nombre)
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        // Schedules en estado DRAFT creados por este usuario
        const qDrafts = query(
          collection(db, "schedules"),
          where("status", "==", "draft"),
          where("createdBy", "==", user?.username || "")
        );
        const schSnap = await getDocs(qDrafts);

        const draftList = schSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

        setDrafts(draftList);
      } catch (err) {
        console.error("Error loading draft schedules:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, [user?.username]);

  // Mapa rápido id -> nombre
  const employeeNameMap = {};
  employees.forEach((e) => {
    employeeNameMap[e.id] = e.name;
  });

  // Abrir draft en /schedule
  const handleOpenDraft = (draft) => {
    navigate("/schedule", {
      state: {
        template: {
          airline: draft.airline,
          department: draft.department,
          days: draft.days,
          grid: draft.grid,
          // podrías pasar también un flag si luego quieres saber
          // que viene desde un draft específico
        },
      },
    });
  };

  // Exportar un draft a PDF (simple, legible)
  const handleExportDraft = (draft) => {
    try {
      const pdf = new jsPDF("portrait", "pt", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const marginX = 40;
      let y = 50;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(
        `Draft Schedule: ${draft.airline || "AIRLINE"} — ${
          draft.department || "Department"
        }`,
        marginX,
        y
      );
      y += 20;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const weekLabel = formatWeekLabelFromSchedule(draft);
      pdf.text(`Week of: ${weekLabel}`, marginX, y);
      y += 20;

      pdf.setFontSize(9);

      // Por cada empleado: 1 línea con todos los días
      (draft.grid || []).forEach((row) => {
        const empName =
          employeeNameMap[row.employeeId] || row.employeeId || "Unknown";

        const parts = DAY_KEYS.map((dKey) => {
          const dayText = dayShiftsToText(row[dKey]);
          return `${DAY_LABELS[dKey]}: ${dayText}`;
        });

        const line = `${empName}  |  ${parts.join("  |  ")}`;

        const lines = pdf.splitTextToSize(line, pageWidth - marginX * 2);

        lines.forEach((ln) => {
          if (y > pdf.internal.pageSize.getHeight() - 40) {
            pdf.addPage();
            y = 40;
          }
          pdf.text(ln, marginX, y);
          y += 12;
        });

        y += 6; // espacio entre empleados
      });

      pdf.save(
        `Draft_${draft.airline || "AIRLINE"}_${draft.department || "DEPT"}.pdf`
      );
    } catch (err) {
      console.error("Error exporting draft PDF:", err);
      alert("Error exporting draft PDF. Check console for details.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Back */}
      <button
        type="button"
        className="btn btn-soft mb-2"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-lg font-semibold mb-1">Draft Schedules</h1>
      <p className="text-xs text-slate-500 mb-3">
        Here you can see your saved drafts, reopen them to continue editing,
        or export them to PDF.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading draft schedules...</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-slate-500">
          You don&apos;t have any draft schedules yet.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="card border border-slate-200 bg-white shadow-sm text-sm flex flex-col justify-between"
            >
              <div>
                <p className="font-semibold text-slate-800">
                  {draft.airline} — {draft.department}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Week: {formatWeekLabelFromSchedule(draft)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Total hours (stored):{" "}
                  {typeof draft.airlineWeeklyHours === "number"
                    ? draft.airlineWeeklyHours.toFixed(2)
                    : "N/A"}
                </p>
                {draft.createdAt?.seconds && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Saved on:{" "}
                    {new Date(
                      draft.createdAt.seconds * 1000
                    ).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="flex-1 btn btn-soft text-xs"
                  onClick={() => handleOpenDraft(draft)}
                >
                  Open Draft
                </button>
                <button
                  type="button"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded px-2 py-1"
                  onClick={() => handleExportDraft(draft)}
                >
                  Export PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

