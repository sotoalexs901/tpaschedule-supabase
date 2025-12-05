// src/pages/ReturnedSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
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

// Convierte shifts de un día a texto legible
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

// Texto tipo "MON 03 | TUESD 04 ..."
function formatWeekLabelFromSchedule(schedule) {
  if (!schedule?.days) return "Week not defined";

  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = schedule.days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

export default function ReturnedSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [returned, setReturned] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar schedules devueltos + empleados
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Empleados para mostrar nombres
        const empSnap = await getDocs(collection(db, "employees"));
        const empList = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(empList);

        // Schedules con status "returned" creados por este usuario
        const qReturned = query(
          collection(db, "schedules"),
          where("status", "==", "returned"),
          where("createdBy", "==", user?.username || "")
        );
        const schSnap = await getDocs(qReturned);

        const list = schSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
          });

        setReturned(list);
      } catch (err) {
        console.error("Error loading returned schedules:", err);
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

  // Abrir schedule devuelto en /schedule para corregirlo
  const handleOpenReturned = (sch) => {
    navigate("/schedule", {
      state: {
        template: {
          airline: sch.airline,
          department: sch.department,
          days: sch.days,
          grid: sch.grid,
        },
        // Opcional: si luego quieres que SchedulePage actualice este mismo doc:
        returnedId: sch.id,
      },
    });
  };

  // Exportar schedule devuelto a PDF
  const handleExportReturned = (sch) => {
    try {
      const pdf = new jsPDF("portrait", "pt", "letter");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const marginX = 40;
      let y = 50;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(
        `Returned Schedule: ${sch.airline || "AIRLINE"} — ${
          sch.department || "Department"
        }`,
        marginX,
        y
      );
      y += 20;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const weekLabel = formatWeekLabelFromSchedule(sch);
      pdf.text(`Week of: ${weekLabel}`, marginX, y);
      y += 16;

      if (sch.returnReason || sch.returnComment) {
        pdf.setFont("helvetica", "bold");
        pdf.text("Return reason:", marginX, y);
        y += 12;
        pdf.setFont("helvetica", "normal");
        const reasonText =
          sch.returnReason || sch.returnComment || "(no reason provided)";
        const linesReason = pdf.splitTextToSize(
          reasonText,
          pageWidth - marginX * 2
        );
        linesReason.forEach((ln) => {
          if (y > pdf.internal.pageSize.getHeight() - 40) {
            pdf.addPage();
            y = 40;
          }
          pdf.text(ln, marginX, y);
          y += 12;
        });
        y += 10;
      }

      pdf.setFontSize(9);

      // Una línea por empleado con sus días
      (sch.grid || []).forEach((row) => {
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

        y += 6;
      });

      pdf.save(
        `Returned_${sch.airline || "AIRLINE"}_${sch.department || "DEPT"}.pdf`
      );
    } catch (err) {
      console.error("Error exporting returned PDF:", err);
      alert("Error exporting returned PDF. Check console for details.");
    }
  };

  // ❌ Eliminar schedule devuelto
  const handleDeleteReturned = async (id) => {
    const ok = window.confirm(
      "Are you sure you want to delete this returned schedule? This cannot be undone."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(collection(db, "schedules"), id));
      setReturned((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Error deleting returned schedule:", err);
      alert("Error deleting returned schedule. Check console for details.");
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

      <h1 className="text-lg font-semibold mb-1">Returned Schedules</h1>
      <p className="text-xs text-slate-500 mb-3">
        These schedules were returned by the Station Manager. You can open them
        to fix the issues, export a copy, or delete them if you won&apos;t use
        them anymore.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading returned schedules...</p>
      ) : returned.length === 0 ? (
        <p className="text-sm text-slate-500">
          You don&apos;t have any returned schedules at the moment.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {returned.map((sch) => (
            <div
              key={sch.id}
              className="card border border-amber-200 bg-white shadow-sm text-sm flex flex-col justify-between"
            >
              <div>
                <p className="font-semibold text-slate-800">
                  {sch.airline} — {sch.department}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Week: {formatWeekLabelFromSchedule(sch)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Total hours:{" "}
                  {typeof sch.airlineWeeklyHours === "number"
                    ? sch.airlineWeeklyHours.toFixed(2)
                    : "N/A"}
                </p>

                {sch.returnReason || sch.returnComment ? (
                  <p className="text-[11px] text-red-600 mt-2">
                    <span className="font-semibold">Reason:</span>{" "}
                    {sch.returnReason || sch.returnComment}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-2">
                    No reason text was provided.
                  </p>
                )}

                {sch.createdAt?.seconds && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Sent on:{" "}
                    {new Date(
                      sch.createdAt.seconds * 1000
                    ).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="flex-1 btn btn-soft text-xs"
                  onClick={() => handleOpenReturned(sch)}
                >
                  Open to Fix
                </button>
                <button
                  type="button"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded px-2 py-1"
                  onClick={() => handleExportReturned(sch)}
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded px-2 py-1"
                  onClick={() => handleDeleteReturned(sch.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
