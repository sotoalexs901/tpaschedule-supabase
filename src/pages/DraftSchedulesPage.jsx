// src/pages/DraftSchedulesPage.jsx
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
import html2canvas from "html2canvas";

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

// 🔵 Logos oficiales (mismo mapping que usas en Schedule/Approved)
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
        },
      },
    });
  };

// 🧾 Exportar un draft a PDF usando la tabla "excel" pero ocupando bien la página
const handleExportDraft = async (draft) => {
  try {
    const printContainer = document.createElement("div");
    printContainer.style.position = "fixed";
    printContainer.style.left = "-10000px";
    printContainer.style.top = "0";
    printContainer.style.backgroundColor = "#ffffff";
    printContainer.style.zIndex = "-1";

    const logoUrl =
      AIRLINE_LOGOS[draft.airline] || AIRLINE_LOGOS["OTHER"] || "";

    const weekLabel = formatWeekLabelFromSchedule(draft);

    // ---- construimos header + tabla ----
    let theadHtml = `
      <thead>
        <tr>
          <th class="excel-header-employee">EMPLOYEE</th>
    `;

    DAY_KEYS.forEach((dKey) => {
      const dayNum = draft.days?.[dKey] || "";
      theadHtml += `<th>${DAY_LABELS[dKey]}${dayNum ? " " + dayNum : ""}</th>`;
    });

    theadHtml += `</tr></thead>`;

    let tbodyHtml = "<tbody>";

    (draft.grid || []).forEach((row) => {
      const empName =
        employeeNameMap[row.employeeId] || row.employeeId || "Unknown";

      tbodyHtml += `<tr>`;
      tbodyHtml += `<td class="excel-employee-cell">${empName}</td>`;

      DAY_KEYS.forEach((dKey) => {
        const cellText = dayShiftsToText(row[dKey]);
        const isOff = cellText === "OFF";
        const cellClass = isOff ? "excel-cell-off" : "excel-cell-work";
        tbodyHtml += `<td class="${cellClass}">${cellText}</td>`;
      });

      tbodyHtml += `</tr>`;
    });

    tbodyHtml += "</tbody>";

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" class="excel-logo" />`
      : "";

    printContainer.innerHTML = `
      <div id="draft-excel-print">
        <div class="excel-header">
          ${logoHtml}
          <h1 class="excel-title">
            ${draft.airline || "AIRLINE"} - ${draft.department || "Department"}
          </h1>
          <div style="font-size:12px;margin-top:4px;">${weekLabel}</div>
        </div>

        <table class="excel-table">
          ${theadHtml}
          ${tbodyHtml}
        </table>
      </div>
    `;

    document.body.appendChild(printContainer);

    const target = printContainer.querySelector("#draft-excel-print");
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    // 🔍 Ajustar la imagen para que use ALTO y ANCHO de la página
    const pdf = new jsPDF("landscape", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL("image/png");

    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);

    const renderWidth = imgWidth * scale;
    const renderHeight = imgHeight * scale;

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;

    pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);

    pdf.save(
      `Draft_${draft.airline || "AIRLINE"}_${draft.department || "DEPT"}.pdf`
    );

    document.body.removeChild(printContainer);
  } catch (err) {
    console.error("Error exporting draft PDF:", err);
    alert("Error exporting draft PDF. Check console for details.");
  }
};


  // ❌ Borrar draft
  const handleDeleteDraft = async (draftId) => {
    const ok = window.confirm(
      "Are you sure you want to delete this draft? This cannot be undone."
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(collection(db, "schedules"), draftId));
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (err) {
      console.error("Error deleting draft:", err);
      alert("Error deleting draft. Check console for details.");
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
        export them to PDF, or delete drafts you no longer need.
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
                <button
                  type="button"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded px-2 py-1"
                  onClick={() => handleDeleteDraft(draft.id)}
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
