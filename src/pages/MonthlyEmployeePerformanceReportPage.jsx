import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* -------------------- UI -------------------- */

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

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 700,
        color: "#475569",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(220,38,38,0.18)",
    },
    dark: {
      background: "#0f172a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(15,23,42,0.16)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        border: active ? "1px solid #1769aa" : "1px solid #dbeafe",
        background: active ? "#1769aa" : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        boxShadow: active ? "0 10px 22px rgba(23,105,170,0.16)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 18,
          fontWeight: 900,
          color: current.color,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CenterToast({ message, tone = "blue" }) {
  const tones = {
    blue: {
      bg: "#edf7ff",
      border: "#cfe7fb",
      color: "#1769aa",
    },
    green: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#166534",
    },
    amber: {
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
    red: {
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
    },
  };

  const current = tones[tone] || tones.blue;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          minWidth: 320,
          maxWidth: 760,
          textAlign: "center",
          background: current.bg,
          border: `1px solid ${current.border}`,
          borderRadius: 18,
          padding: "14px 18px",
          color: current.color,
          fontSize: 14,
          fontWeight: 800,
          boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
        }}
      >
        {message}
      </div>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLookup(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDepartment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeRoleLike(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");
}

function isDutyManagerUser(emp) {
  const values = [
    emp?.role,
    emp?.position,
    emp?.title,
    emp?.jobTitle,
    emp?.job_title,
    emp?.employeeRole,
    emp?.userRole,
    emp?.profileRole,
  ]
    .map(normalizeRoleLike)
    .filter(Boolean);

  return values.some(
    (value) =>
      value === "duty manager" ||
      value.includes("duty manager") ||
      value.includes("duty mgr")
  );
}

function buildUserMatchKeys(user) {
  return [
    user?.id,
    user?.uid,
    user?.username,
    user?.email,
    user?.displayName,
    user?.fullName,
    user?.name,
  ]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function buildReportDutyMatchKeys(report) {
  return [
    report?.followUpDutyManagerId,
    report?.assignedDutyManagerId,
    report?.followUpDutyManagerName,
    report?.assignedDutyManagerName,
  ]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function formatMonthValue(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return value || "-";
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getCurrentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions() {
  const now = new Date();
  const result = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    result.push({
      value,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return result;
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function getRatingPoints(rating) {
  const key = String(rating || "").trim().toLowerCase();
  if (key === "exceeds") return 4;
  if (key === "meets") return 3;
  if (key === "below") return 2;
  return 0;
}

function calculatePerformanceScore(answers, questions) {
  const items = Array.isArray(questions) ? questions : [];
  if (!items.length) return 0;

  let earnedPoints = 0;
  const maxPoints = items.length * 4;

  items.forEach((question) => {
    const rating = answers?.[question.id]?.rating || "";
    earnedPoints += getRatingPoints(rating);
  });

  return Number(((earnedPoints / maxPoints) * 100).toFixed(2));
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function getPerformanceStatus(score) {
  const n = Number(score || 0);
  if (n >= 85) return "exceeds";
  if (n >= 70) return "meets";
  return "below";
}

function getPerformanceTone(score) {
  const s = getPerformanceStatus(score);
  if (s === "exceeds") return "green";
  if (s === "meets") return "blue";
  return "red";
}

function getFollowUpItems(answers, questions) {
  return questions
    .map((q) => {
      const answer = answers[q.id];
      return {
        ...q,
        rating: answer?.rating || "",
        note: answer?.note || "",
      };
    })
    .filter((item) => item.rating === "below");
}

function getStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (
    value === "approved" ||
    value === "recognized" ||
    value === "closed" ||
    value === "follow_up_completed"
  ) {
    return "green";
  }
  if (
    value === "follow_up" ||
    value === "follow_up_assigned" ||
    value === "follow_up_in_progress" ||
    value === "follow_up_resubmitted" ||
    value === "returned_to_supervisor" ||
    value === "resubmitted_to_manager"
  ) {
    return "amber";
  }
  if (value === "draft") return "default";
  return "blue";
}

function getStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "returned_to_supervisor") return "Returned to Supervisor";
  if (value === "follow_up_assigned") return "Follow Up Assigned";
  if (value === "follow_up_in_progress") return "Follow Up In Progress";
  if (value === "follow_up_completed") return "Follow Up Completed";
  if (value === "follow_up_resubmitted") return "Resubmitted to Manager";
  if (value === "resubmitted_to_manager") return "Resubmitted to Manager";
  if (value === "recognized") return "Recognized";
  if (value === "approved") return "Approved";
  if (value === "follow_up") return "Follow Up";
  if (value === "closed") return "Closed";
  if (value === "submitted") return "Submitted";
  if (value === "draft") return "Draft";
  return status || "-";
}

function buildHistoryEntry(type, byUser, note = "", extra = {}) {
  return {
    type,
    byUserId: byUser?.id || "",
    byUserName: getVisibleUserName(byUser),
    note: normalizeText(note),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function printReportHtml(report, language = "en") {
  const title =
    language === "es"
      ? "Reporte Mensual de Desempeño"
      : "Monthly Employee Performance Report";

  const followUpItems = Array.isArray(report.followUpItems)
    ? report.followUpItems
    : [];

  const answers = report.answers || {};
  const history = Array.isArray(report.followUpHistory) ? report.followUpHistory : [];

  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #0f172a;
          }
          h1,h2,h3 { margin: 0 0 12px; }
          .card {
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .q { margin-bottom: 12px; }
          .history-item {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="card">
          <div><strong>Employee:</strong> ${report.employeeName || "-"}</div>
          <div><strong>Month:</strong> ${formatMonthValue(report.month)}</div>
          <div><strong>Template:</strong> ${report.templateLabel || "-"}</div>
          <div><strong>Supervisor:</strong> ${report.supervisorName || "-"}</div>
          <div><strong>Score:</strong> ${formatScore(report.score)} / 100</div>
          <div><strong>Status:</strong> ${getStatusLabel(
            report.managerStatus || report.performanceStatus || "-"
          )}</div>
          <div><strong>Assigned Duty Manager:</strong> ${
            report.followUpDutyManagerName ||
            report.assignedDutyManagerName ||
            "-"
          }</div>
        </div>

        <div class="card">
          <h3>Comments</h3>
          <div><strong>Company:</strong> ${report.commentsCompany || "-"}</div>
          <div style="margin-top:8px;"><strong>Employee:</strong> ${
            report.commentsEmployee || "-"
          }</div>
          <div style="margin-top:8px;"><strong>Manager Note:</strong> ${
            report.managerNote || "-"
          }</div>
          <div style="margin-top:8px;"><strong>Return Reason:</strong> ${
            report.returnReason || "-"
          }</div>
        </div>

        <div class="card">
          <h3>Follow Up Items</h3>
          ${
            followUpItems.length
              ? followUpItems
                  .map(
                    (item) =>
                      `<div class="q">• ${
                        item[language] || item.en || item.es || "-"
                      }${item.note ? ` — ${item.note}` : ""}</div>`
                  )
                  .join("")
              : "<div>No follow up items.</div>"
          }
        </div>

        <div class="card">
          <h3>Follow Up History</h3>
          ${
            history.length
              ? history
                  .map(
                    (item) => `
                <div class="history-item">
                  <div><strong>Type:</strong> ${item.type || "-"}</div>
                  <div><strong>By:</strong> ${item.byUserName || "-"}</div>
                  <div><strong>Date:</strong> ${
                    item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : "-"
                  }</div>
                  <div><strong>Note:</strong> ${item.note || "-"}</div>
                  ${
                    item.actionTaken
                      ? `<div><strong>Action:</strong> ${item.actionTaken}</div>`
                      : ""
                  }
                  ${
                    item.details
                      ? `<div><strong>Details:</strong> ${item.details}</div>`
                      : ""
                  }
                </div>
              `
                  )
                  .join("")
              : "<div>No follow up history.</div>"
          }
        </div>

        <div class="card">
          <h3>Answers</h3>
          ${Object.keys(answers)
            .map((key) => {
              const a = answers[key] || {};
              return `
                <div class="q">
                  <strong>Q${key}</strong> — ${a.rating || "-"}${
                a.note ? ` | ${a.note}` : ""
              }
                </div>
              `;
            })
            .join("")}
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

/* -------------------- Language -------------------- */

const LABELS = {
  en: {
    title: "Monthly Employee Performance Report",
    subtitle:
      "Supervisors and managers can complete EPRs by month. Duty and station managers manage follow-up, returns, congratulations, closures and employee notifications.",
    createTab: "Create EPR",
    managementTab: "Management",
    draftsTab: "Drafts",
    followUpTab: "My Follow Up Cases",
    draftsSaved: "Saved Drafts",
    saveDraft: "Save Draft",
    continueEditing: "Continue Editing",
    noDrafts: "No drafts found.",
    lastUpdated: "Last Updated",
    language: "Language",
    month: "Month",
    employee: "Employee",
    template: "Template",
    evaluator: "Evaluator",
    department: "Department",
    hireDate: "Hire Date",
    commentsCompany: "Company Comments / Recommendations",
    commentsEmployee: "Employee Comments",
    saveReport: "Save Performance Report",
    updateReport: "Update Report",
    score: "Final Score",
    status: "Status",
    followUpNeeded: "Follow Up Needed",
    questionsToFollow: "Questions Requiring Follow Up",
    approve: "Approve",
    markFollowUp: "Mark Follow Up",
    closeFollowUp: "Close Follow Up",
    openReport: "Open Report",
    editReport: "Edit Report",
    deleteReport: "Delete Report",
    cancelEdit: "Cancel Edit",
    noReports: "No reports found.",
    lowScoreAlert: "Low score alert",
    rating: "Rating",
    note: "Follow Up Note",
    exceeds: "Exceeds",
    meets: "Meets",
    below: "Does Not Meet",
    managementFilters: "Management Filters",
    supervisor: "Supervisor",
    followUpStatus: "Follow Up Status",
    scoreBand: "Score Band",
    all: "All",
    assignedDutyManager: "Assigned Duty Manager",
    assignDutyManager: "Assign Duty Manager",
    congratulations: "Congratulations",
    closeMonth: "Close Month",
    managerNote: "Manager Note",
    returnReason: "Return Reason",
    returnToSupervisor: "Return to Supervisor",
    print: "Print",
    closed: "Closed",
    followUp: "Follow Up",
    approved: "Approved",
    submitted: "Submitted",
    draft: "Draft",
  },
  es: {
    title: "Reporte Mensual de Desempeño del Empleado",
    subtitle:
      "Supervisores y managers pueden completar EPR por mes. Duty managers y station managers administran seguimiento, retorno, felicitaciones, cierre de mes y notificación al empleado.",
    createTab: "Crear EPR",
    managementTab: "Management",
    draftsTab: "Borradores",
    followUpTab: "Mis Casos de Seguimiento",
    draftsSaved: "Borradores Guardados",
    saveDraft: "Guardar Borrador",
    continueEditing: "Continuar Editando",
    noDrafts: "No se encontraron borradores.",
    lastUpdated: "Última Actualización",
    language: "Idioma",
    month: "Mes",
    employee: "Empleado",
    template: "Formato",
    evaluator: "Evaluador",
    department: "Departamento",
    hireDate: "Fecha de Ingreso",
    commentsCompany: "Comentarios / Recomendaciones de la Empresa",
    commentsEmployee: "Comentarios del Empleado",
    saveReport: "Guardar Performance Report",
    updateReport: "Actualizar Reporte",
    score: "Puntuación Final",
    status: "Estado",
    followUpNeeded: "Requiere Seguimiento",
    questionsToFollow: "Preguntas que Requieren Seguimiento",
    approve: "Aprobar",
    markFollowUp: "Marcar Seguimiento",
    closeFollowUp: "Cerrar Seguimiento",
    openReport: "Abrir Reporte",
    editReport: "Editar Reporte",
    deleteReport: "Borrar Reporte",
    cancelEdit: "Cancelar Edición",
    noReports: "No se encontraron reportes.",
    lowScoreAlert: "Alerta de puntuación baja",
    rating: "Calificación",
    note: "Nota de Seguimiento",
    exceeds: "Supera",
    meets: "Cumple",
    below: "No Cumple",
    managementFilters: "Filtros de Management",
    supervisor: "Supervisor",
    followUpStatus: "Estado de Seguimiento",
    scoreBand: "Rango de Puntuación",
    all: "Todos",
    assignedDutyManager: "Duty Manager Asignado",
    assignDutyManager: "Asignar Duty Manager",
    congratulations: "Felicitaciones",
    closeMonth: "Cerrar Mes",
    managerNote: "Nota de Manager",
    returnReason: "Razón del Retorno",
    returnToSupervisor: "Retornar al Supervisor",
    print: "Imprimir",
    closed: "Cerrado",
    followUp: "Seguimiento",
    approved: "Aprobado",
    submitted: "Enviado",
    draft: "Borrador",
  },
};

/* -------------------- Question bank -------------------- */

const PASSENGER_SERVICE_QUESTIONS = [
  { id: "1", es: "Acepta la responsabilidad de las acciones y responde a las consecuencias.", en: "Accepts responsibility for actions and responds to consequences.", weight: 1 },
  { id: "2", es: "Rara vez está ausente, llega puntualmente y trabaja las horas requeridas.", en: "Is rarely absent, arrives on time, and works required hours.", weight: 1 },
  { id: "3", es: "Tiene capacidad para llevarse bien con compañeros y administración de manera cooperativa.", en: "Works cooperatively with coworkers and management.", weight: 1 },
  { id: "4", es: "Muestra iniciativa, optimismo y cortesía de manera activa y respetuosa.", en: "Shows initiative, optimism, and courtesy in an active and respectful way.", weight: 1 },
  { id: "5", es: "Aprende de sugerencias, acata instrucciones y ajusta su comportamiento.", en: "Learns from feedback, follows instructions, and adjusts behavior.", weight: 1 },
  { id: "6", es: "Responde adecuadamente a cambios en situaciones y expectativas.", en: "Responds well to changing situations and expectations.", weight: 1 },
  { id: "7", es: "Sigue políticas y procedimientos de la organización.", en: "Follows organizational policies and procedures.", weight: 1 },
  { id: "8", es: "Completa tareas y funciones propias del cargo cumpliendo tiempos.", en: "Completes duties and job tasks on time.", weight: 1 },
  { id: "9", es: "Garantiza atención de alta calidad con respeto y amabilidad.", en: "Provides high-quality service with respect and kindness.", weight: 1 },
  { id: "10", es: "Es minucioso, preciso y limpio en el trabajo.", en: "Is thorough, accurate, and clean in the work performed.", weight: 1 },
  { id: "11", es: "Realiza correctamente el proceso de check-in, validando documentos, itinerario y requisitos del pasajero.", en: "Performs the check-in process correctly, validating documents, itinerary, and passenger requirements.", weight: 1 },
  { id: "12", es: "Verifica correctamente pasaporte, identificación, visa y demás documentos requeridos antes de emitir el pase de abordar.", en: "Correctly verifies passport, ID, visa, and other required documents before issuing the boarding pass.", weight: 1 },
  { id: "13", es: "Maneja con precisión el etiquetado de equipaje y confirma que el destino final sea correcto.", en: "Handles baggage tagging accurately and confirms the final destination is correct.", weight: 1 },
  { id: "14", es: "Brinda instrucciones claras al pasajero sobre puertas, horario de abordaje, conexión y documentación.", en: "Provides clear instructions to the passenger about gate, boarding time, connection, and documentation.", weight: 1 },
  { id: "15", es: "Gestiona filas y tiempos de atención de manera organizada, manteniendo flujo eficiente en counters.", en: "Manages lines and service times in an organized way, maintaining efficient flow at counters.", weight: 1 },
  { id: "16", es: "Realiza anuncios de puerta de forma clara, profesional y a tiempo.", en: "Makes gate announcements clearly, professionally, and on time.", weight: 1 },
  { id: "17", es: "Controla correctamente el proceso de abordaje por zonas, prioridades o grupos asignados.", en: "Properly controls the boarding process by zones, priorities, or assigned groups.", weight: 1 },
  { id: "18", es: "Resuelve adecuadamente situaciones de puerta como cambios de asiento, standby, upgrades o pasajeros tardíos.", en: "Properly resolves gate situations such as seat changes, standby, upgrades, or late passengers.", weight: 1 },
  { id: "19", es: "Mantiene comunicación efectiva con operaciones, rampa, tripulación y otros equipos durante la salida del vuelo.", en: "Maintains effective communication with operations, ramp, crew, and other teams during flight departure.", weight: 1 },
  { id: "20", es: "Cierra el vuelo correctamente asegurando conteo final, documentación y cumplimiento del procedimiento de salida.", en: "Closes the flight correctly, ensuring final count, documentation, and compliance with departure procedures.", weight: 1 },
];

const BAGGAGE_QUESTIONS = [
  { id: "1", es: "Asistencia y Puntualidad. Mantiene un nivel adecuado de asistencia, puntualidad y cumplimiento del horario laboral establecido, de acuerdo con las políticas de la organización.", en: "Attendance and Punctuality. Maintains adequate attendance, punctuality, and compliance with the established work schedule according to company policies.", weight: 1 },
  { id: "2", es: "Trabajo en Equipo y Relaciones Laborales. Demuestra capacidad para interactuar de manera profesional, respetuosa y cooperativa con compañeros de trabajo, supervisores y la administración.", en: "Teamwork and Working Relationships. Demonstrates the ability to interact professionally, respectfully, and cooperatively with coworkers, supervisors, and management.", weight: 1 },
  { id: "3", es: "Actitud y Comportamiento Profesional. Mantiene una actitud positiva, mostrando iniciativa, disposición al trabajo, cortesía y respeto en el entorno laboral.", en: "Attitude and Professional Behavior. Maintains a positive attitude, showing initiative, willingness to work, courtesy, and respect in the workplace.", weight: 1 },
  { id: "4", es: "Adaptabilidad y Responsabilidad. Demuestra apertura para recibir retroalimentación, seguir instrucciones, adaptarse a cambios operacionales y asumir responsabilidad por sus acciones y resultados.", en: "Adaptability and Accountability. Shows openness to feedback, follows instructions, adapts to operational changes, and takes responsibility for actions and results.", weight: 1 },
  { id: "5", es: "Cumplimiento de Políticas y Procedimientos. Cumple consistentemente con las políticas, procedimientos y estándares establecidos por la organización.", en: "Compliance with Policies and Procedures. Consistently complies with the policies, procedures, and standards established by the organization.", weight: 1 },
  { id: "6", es: "Tiene habilidades de comunicación transmitiendo información de manera efectiva y eficiente.", en: "Has communication skills, conveying information effectively and efficiently.", weight: 1 },
  { id: "7", es: "Tiene habilidades organizativas, capacidad para mantenerse centrado en la tarea y usar el tiempo de manera efectiva.", en: "Has organizational skills, ability to stay focused on tasks and use time effectively.", weight: 1 },
  { id: "8", es: "Proyecta una apariencia profesional y cuidada, correcto uso del uniforme manteniendo la buena imagen corporativa.", en: "Projects a professional appearance, uses the uniform correctly, and maintains the corporate image.", weight: 1 },
  { id: "9", es: "Contribuye a un entorno seguro siguiendo los procedimientos establecidos de seguridad, prevención y autocuidado.", en: "Contributes to a safe environment by following established safety, prevention, and self-care procedures.", weight: 1 },
  { id: "10", es: "Start of Day (Inicio de Turno). ¿El empleado ejecuta correctamente los procesos de inicio de turno, asegurando que los equipos funcionen, los sistemas estén activos y no existan pendientes críticos sin atender?", en: "Start of Day. Does the employee properly execute start-of-shift processes, ensuring equipment works, systems are active, and critical pending tasks are handled?", weight: 1 },
  { id: "11", es: "Observing an Inbound Flight (Atención en Llegadas - Belt). ¿El empleado demuestra presencia activa en el área de carrusel, brinda orientación al pasajero, comunica retrasos oportunamente y gestiona la recolección de equipaje en tiempos establecidos?", en: "Observing an Inbound Flight (Arrivals - Belt). Does the employee show active presence at the carousel, guide passengers, communicate delays on time, and manage baggage collection within expected times?", weight: 1 },
  { id: "12", es: "Creating a File – Delay (Creación de Reportes de Equipaje Demorado). ¿El empleado crea reportes de equipaje demorado de manera precisa y completa, asistiendo al cliente adecuadamente y documentando correctamente la información en el sistema?", en: "Creating a File – Delay. Does the employee create delayed baggage reports accurately and completely, assisting the customer properly and documenting the information correctly in the system?", weight: 1 },
  { id: "13", es: "On-Hand (OHD Management). ¿El empleado gestiona correctamente los casos On-Hand asegurando documentación completa del equipaje dentro del tiempo establecido?", en: "On-Hand (OHD Management). Does the employee properly manage On-Hand cases, ensuring complete baggage documentation within the required timeframe?", weight: 1 },
  { id: "14", es: "Delayed (AHL) File Management. ¿El empleado administra correctamente los archivos de equipaje demorado, asegurando que la información del pasajero, itinerario y equipaje esté completa y que el cliente reciba orientación adecuada?", en: "Delayed (AHL) File Management. Does the employee properly manage delayed baggage files, ensuring passenger, itinerary, and baggage information is complete and the customer receives proper guidance?", weight: 1 },
  { id: "15", es: "Damage Handling (Equipaje Dañado). ¿El empleado maneja correctamente los casos de equipaje dañado, guiando al cliente según el proceso y documentando correctamente en el sistema?", en: "Damage Handling. Does the employee properly handle damaged baggage cases, guide the customer according to process, and document correctly in the system?", weight: 1 },
  { id: "16", es: "Pilferage / Missing Articles. ¿El empleado gestiona correctamente los casos de artículos faltantes, documentando de forma precisa y brindando al cliente expectativas claras?", en: "Pilferage / Missing Articles. Does the employee properly manage missing-article cases, documenting accurately and giving the customer clear expectations?", weight: 1 },
  { id: "17", es: "Special Items Handling (Car Seats / Strollers). ¿El empleado sigue correctamente el proceso para manejo de artículos especiales, incluyendo entrega, registro y control de inventario?", en: "Special Items Handling (Car Seats / Strollers). Does the employee properly follow the process for special items, including delivery, registration, and inventory control?", weight: 1 },
  { id: "18", es: "Assistive Devices Handling - Delayed and Damage File. ¿El empleado cumple con los procedimientos establecidos para dispositivos de asistencia, incluyendo correcta categorización y soporte adecuado al cliente?", en: "Assistive Devices Handling - Delayed and Damage File. Does the employee follow established procedures for assistive devices, including correct categorization and proper customer support?", weight: 1 },
  { id: "19", es: "Shipping to Warehouse (LZ). ¿El empleado sigue correctamente los procedimientos para envío de equipaje al warehouse, asegurando intentos previos de contacto y documentación completa en el sistema?", en: "Shipping to Warehouse (LZ). Does the employee properly follow procedures for shipping baggage to the warehouse, ensuring prior contact attempts and complete documentation in the system?", weight: 1 },
  { id: "20", es: "Delivery Process (BDO / Entrega al Cliente). ¿El empleado gestiona correctamente el proceso de entrega de equipaje, asegurando verificación de datos, documentación correcta y coordinación eficiente con proveedores?", en: "Delivery Process (BDO / Customer Delivery). Does the employee properly manage baggage delivery, ensuring data verification, proper documentation, and efficient coordination with providers?", weight: 1 },
];

const WCHR_QUESTIONS = [
  { id: "1", es: "Se responsabiliza por los pasajeros asignados y completa el servicio de principio a fin.", en: "Takes ownership of assigned passengers and completes service from start to finish.", weight: 1 },
  { id: "2", es: "Llega a tiempo, mantiene buena asistencia y está listo para comenzar sus funciones puntualmente.", en: "Arrives on time, maintains attendance, and is ready to begin duties promptly.", weight: 1 },
  { id: "3", es: "Brinda asistencia de silla de ruedas de manera oportuna y sin demoras innecesarias.", en: "Provides timely wheelchair assistance without unnecessary delays.", weight: 1 },
  { id: "4", es: "Verifica correctamente la información del pasajero antes del servicio.", en: "Accurately verifies passenger information before service.", weight: 1 },
  { id: "5", es: "Ingresa y actualiza correctamente la información del pasajero en el sistema.", en: "Correctly inputs and updates passenger information in the system.", weight: 1 },
  { id: "6", es: "Escolta de forma segura a los pasajeros por TSA, terminales y puertas.", en: "Safely escorts passengers through TSA, terminals, and gates.", weight: 1 },
  { id: "7", es: "Demuestra procedimientos correctos de seguridad al asistir pasajeros.", en: "Demonstrates proper safety procedures when assisting passengers.", weight: 1 },
  { id: "8", es: "Se comunica efectivamente con pasajeros y personal.", en: "Communicates effectively with passengers and staff.", weight: 1 },
  { id: "9", es: "Muestra empatía y profesionalismo con los pasajeros.", en: "Shows empathy and professionalism with passengers.", weight: 1 },
  { id: "10", es: "Mantiene una actitud respetuosa y cortés.", en: "Maintains a respectful and courteous attitude.", weight: 1 },
  { id: "11", es: "Responde eficazmente a situaciones inesperadas.", en: "Responds effectively to unexpected situations.", weight: 1 },
  { id: "12", es: "Sigue las políticas de la empresa y las regulaciones del aeropuerto.", en: "Follows company policies and airport regulations.", weight: 1 },
  { id: "13", es: "Trabaja eficientemente en un entorno de ritmo acelerado.", en: "Works efficiently in a fast-paced environment.", weight: 1 },
  { id: "14", es: "Completa tareas dentro de los tiempos esperados.", en: "Completes tasks within expected timeframes.", weight: 1 },
  { id: "15", es: "Mantiene limpias las sillas de ruedas y el equipo.", en: "Maintains cleanliness of wheelchairs and equipment.", weight: 1 },
  { id: "16", es: "Demuestra trabajo en equipo y apoya a sus compañeros.", en: "Demonstrates teamwork and supports coworkers.", weight: 1 },
  { id: "17", es: "Aplica retroalimentación y sigue instrucciones del supervisor.", en: "Applies feedback and follows supervisor instructions.", weight: 1 },
  { id: "18", es: "Muestra iniciativa al asistir pasajeros.", en: "Shows initiative in assisting passengers.", weight: 1 },
  { id: "19", es: "Asegura la correcta entrega y relevo de pasajeros.", en: "Ensures proper handoff of passengers.", weight: 1 },
  { id: "20", es: "Mantiene el uniforme y una apariencia profesional adecuada.", en: "Maintains proper uniform and professional appearance.", weight: 1 },
];

const TEMPLATE_MAP = {
  passenger: {
    key: "passenger",
    label: "Passenger Service",
    role: "Passenger Service Agent",
    department: "Passenger Service",
    questions: PASSENGER_SERVICE_QUESTIONS,
  },
  baggage: {
    key: "baggage",
    label: "Baggage Handling",
    role: "Baggage Handler",
    department: "Baggage Handling",
    questions: BAGGAGE_QUESTIONS,
  },
  wchr: {
    key: "wchr",
    label: "WCHR Service",
    role: "WCHR Agent",
    department: "WCHR Service",
    questions: WCHR_QUESTIONS,
  },
};

export default function MonthlyEmployeePerformanceReportPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const printAreaRef = useRef(null);

  const canCreate =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManage =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canHandleFollowUp =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [tab, setTab] = useState("create");
  const [language, setLanguage] = useState("en");
  const t = LABELS[language];

  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("blue");
  const [saving, setSaving] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [editingReportId, setEditingReportId] = useState("");
  const [editingDraftId, setEditingDraftId] = useState("");

  const [managementEdit, setManagementEdit] = useState({});
  const [followUpEdit, setFollowUpEdit] = useState({});

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const availableTemplates = useMemo(() => Object.values(TEMPLATE_MAP), []);

  const [filters, setFilters] = useState({
    month: "all",
    employeeId: "all",
    supervisorName: "all",
    followUpStatus: "all",
    scoreBand: "all",
  });

  const [form, setForm] = useState({
    employeeId: "",
    employeeName: "",
    month: getCurrentMonthValue(),
    templateKey: "passenger",
    department: "",
    roleTitle: "",
    hireDate: "",
    commentsCompany: "",
    commentsEmployee: "",
  });

  const [answers, setAnswers] = useState({});

  useEffect(() => {
    let timer;
    if (statusMessage) {
      timer = setTimeout(() => setStatusMessage(""), 3500);
    }
    return () => clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    async function loadData() {
      try {
        const [employeesSnap, reportsSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(
            query(
              collection(db, "employeePerformanceReports"),
              orderBy("createdAt", "desc")
            )
          ),
        ]);

        const employeeRows = employeesSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((emp) => emp.active !== false)
          .map((emp) => ({
            id: emp.id,
            name:
              emp.name ||
              emp.fullName ||
              emp.employeeName ||
              emp.displayName ||
              emp.username ||
              "Unnamed Employee",
            department: emp.department || "",
            hireDate: emp.hireDate || emp.startDate || "",
            role: emp.role || "",
            username: emp.username || "",
            email: emp.email || "",
            position: emp.position || "",
            title: emp.title || "",
            jobTitle: emp.jobTitle || emp.job_title || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const reportRows = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setEmployees(employeeRows);
        setReports(reportRows);
      } catch (err) {
        console.error("Error loading EPR data:", err);
        setStatusMessage("Could not load performance report data.");
        setStatusTone("red");
      } finally {
        setLoading(false);
      }
    }

    if (canCreate || canManage) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canCreate, canManage]);

  useEffect(() => {
    const template = TEMPLATE_MAP[form.templateKey] || TEMPLATE_MAP.passenger;
    setForm((prev) => ({
      ...prev,
      department: template.department,
      roleTitle: template.role,
    }));

    setAnswers((prev) => {
      const next = {};
      template.questions.forEach((q) => {
        next[q.id] = prev[q.id] || { rating: "", note: "" };
      });
      return next;
    });
  }, [form.templateKey]);

  const selectedEmployee = useMemo(() => {
    return employees.find((emp) => emp.id === form.employeeId) || null;
  }, [employees, form.employeeId]);

  useEffect(() => {
    if (!selectedEmployee) return;
    setForm((prev) => ({
      ...prev,
      employeeName: selectedEmployee.name,
      hireDate: selectedEmployee.hireDate || "",
      department:
        TEMPLATE_MAP[prev.templateKey]?.department ||
        selectedEmployee.department ||
        "",
    }));
  }, [selectedEmployee]);

  const activeTemplate =
    TEMPLATE_MAP[form.templateKey] ||
    availableTemplates[0] ||
    TEMPLATE_MAP.passenger;

  const calculatedScore = useMemo(() => {
    return calculatePerformanceScore(answers, activeTemplate.questions);
  }, [answers, activeTemplate]);

  const followUpItems = useMemo(() => {
    return getFollowUpItems(answers, activeTemplate.questions);
  }, [answers, activeTemplate]);

  const needsFollowUp = calculatedScore < 70 || followUpItems.length > 0;

  const dutyManagers = useMemo(() => {
    return employees
      .filter((emp) => isDutyManagerUser(emp))
      .map((emp) => ({
        ...emp,
        name:
          emp.name ||
          emp.fullName ||
          emp.employeeName ||
          emp.displayName ||
          emp.username ||
          "Unnamed Duty Manager",
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees]);

  const supervisorNames = useMemo(() => {
    return Array.from(
      new Set(reports.map((r) => normalizeText(r.supervisorName)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filters.month !== "all" && report.month !== filters.month) return false;
      if (filters.employeeId !== "all" && report.employeeId !== filters.employeeId)
        return false;
      if (
        filters.supervisorName !== "all" &&
        normalizeText(report.supervisorName) !== filters.supervisorName
      )
        return false;

      if (filters.followUpStatus !== "all") {
        const status = normalizeLookup(report.managerStatus || "");
        if (status !== normalizeLookup(filters.followUpStatus)) return false;
      }

      if (filters.scoreBand !== "all") {
        const score = Number(report.score || 0);
        if (filters.scoreBand === "high" && score < 85) return false;
        if (filters.scoreBand === "medium" && (score < 70 || score >= 85))
          return false;
        if (filters.scoreBand === "low" && score >= 70) return false;
      }

      return true;
    });
  }, [reports, filters]);

  const groupedReportsByEmployee = useMemo(() => {
    const map = {};
    filteredReports.forEach((report) => {
      const employeeName = report.employeeName || "Unknown Employee";
      if (!map[employeeName]) map[employeeName] = [];
      map[employeeName].push(report);
    });

    Object.keys(map).forEach((key) => {
      map[key] = map[key].sort((a, b) => {
        const left = a.month || "";
        const right = b.month || "";
        return right.localeCompare(left);
      });
    });

    return map;
  }, [filteredReports]);

  const selectedReport = useMemo(() => {
    return reports.find((r) => r.id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  const savedDrafts = useMemo(() => {
    return reports
      .filter(
        (r) =>
          normalizeLookup(r.managerStatus || "") === "draft" &&
          String(r.supervisorId || "") === String(user?.id || "")
      )
      .sort((a, b) => {
        const left =
          typeof a?.updatedAt?.toDate === "function"
            ? a.updatedAt.toDate().getTime()
            : new Date(a?.updatedAt || 0).getTime();

        const right =
          typeof b?.updatedAt?.toDate === "function"
            ? b.updatedAt.toDate().getTime()
            : new Date(b?.updatedAt || 0).getTime();

        return right - left;
      });
  }, [reports, user?.id]);

  const returnedReports = useMemo(() => {
    return reports
      .filter(
        (r) =>
          String(r.supervisorId || "") === String(user?.id || "") &&
          normalizeLookup(r.managerStatus || "") === "returned_to_supervisor"
      )
      .sort((a, b) => {
        const left =
          typeof a?.updatedAt?.toDate === "function"
            ? a.updatedAt.toDate().getTime()
            : new Date(a?.updatedAt || 0).getTime();
        const right =
          typeof b?.updatedAt?.toDate === "function"
            ? b.updatedAt.toDate().getTime()
            : new Date(b?.updatedAt || 0).getTime();
        return right - left;
      });
  }, [reports, user?.id]);

  const myFollowUpCases = useMemo(() => {
    return reports
      .filter((r) => {
        if (!canHandleFollowUp) return false;

        const status = normalizeLookup(r.managerStatus || "");
        const validStatuses = [
          "follow_up_assigned",
          "follow_up_in_progress",
          "follow_up_completed",
          "follow_up_resubmitted",
        ];

        if (!validStatuses.includes(status)) return false;

        if (user?.role === "station_manager") return true;

        const userKeys = buildUserMatchKeys(user);
        const reportKeys = buildReportDutyMatchKeys(r);

        return reportKeys.some((key) => userKeys.includes(key));
      })
      .sort((a, b) => {
        const left =
          typeof a?.updatedAt?.toDate === "function"
            ? a.updatedAt.toDate().getTime()
            : new Date(a?.updatedAt || 0).getTime();
        const right =
          typeof b?.updatedAt?.toDate === "function"
            ? b.updatedAt.toDate().getTime()
            : new Date(b?.updatedAt || 0).getTime();
        return right - left;
      });
  }, [reports, user, canHandleFollowUp]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reportId = params.get("reportId");
    const action = params.get("action");

    if (reportId && reports.some((r) => r.id === reportId)) {
      const report = reports.find((r) => r.id === reportId);
      setSelectedReportId(reportId);

      if (action === "edit" && report) {
        loadReportIntoForm(report);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, reports]);

  function handleAnswerChange(questionId, field, value) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [field]: value,
      },
    }));
  }

  function getManagementField(report, field) {
    return managementEdit[report.id]?.[field] ?? report[field] ?? "";
  }

  function getFollowUpField(report, field) {
    return followUpEdit[report.id]?.[field] ?? "";
  }

  function loadReportIntoForm(report) {
    if (!report) return;

    setTab("create");
    setEditingReportId(report.id);
    setEditingDraftId("");

    setForm({
      employeeId: report.employeeId || "",
      employeeName: report.employeeName || "",
      month: report.month || getCurrentMonthValue(),
      templateKey: report.templateKey || "passenger",
      department: report.department || "",
      roleTitle: report.roleTitle || "",
      hireDate: report.hireDate || "",
      commentsCompany: report.commentsCompany || "",
      commentsEmployee: report.commentsEmployee || "",
    });

    const template = TEMPLATE_MAP[report.templateKey] || TEMPLATE_MAP.passenger;
    const nextAnswers = {};
    template.questions.forEach((q) => {
      nextAnswers[q.id] = report.answers?.[q.id] || { rating: "", note: "" };
    });
    setAnswers(nextAnswers);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleLoadDraft(draft) {
    if (!draft) return;

    setEditingDraftId(draft.id || "");
    setEditingReportId("");
    setSelectedReportId(draft.id || "");
    setTab("create");

    setForm({
      employeeId: draft.employeeId || "",
      employeeName: draft.employeeName || "",
      month: draft.month || getCurrentMonthValue(),
      templateKey: draft.templateKey || "passenger",
      department: draft.department || "",
      roleTitle: draft.roleTitle || "",
      hireDate: draft.hireDate || "",
      commentsCompany: draft.commentsCompany || "",
      commentsEmployee: draft.commentsEmployee || "",
    });

    const template = TEMPLATE_MAP[draft.templateKey] || TEMPLATE_MAP.passenger;
    const nextAnswers = {};
    template.questions.forEach((q) => {
      nextAnswers[q.id] = draft.answers?.[q.id] || { rating: "", note: "" };
    });
    setAnswers(nextAnswers);

    setStatusMessage(
      `${t.draft} loaded: ${draft.employeeName || "-"} · ${formatMonthValue(
        draft.month
      )}`
    );
    setStatusTone("blue");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetCreateForm() {
    setEditingReportId("");
    setEditingDraftId("");

    const fallbackTemplate =
      availableTemplates.find((item) => item.key === "passenger") ||
      availableTemplates[0] ||
      TEMPLATE_MAP.passenger;

    setForm({
      employeeId: "",
      employeeName: "",
      month: getCurrentMonthValue(),
      templateKey: fallbackTemplate.key,
      department: fallbackTemplate.department,
      roleTitle: fallbackTemplate.role,
      hireDate: "",
      commentsCompany: "",
      commentsEmployee: "",
    });

    const resetAnswers = {};
    fallbackTemplate.questions.forEach((q) => {
      resetAnswers[q.id] = { rating: "", note: "" };
    });
    setAnswers(resetAnswers);
  }

  async function handleSaveDraft() {
    if (!form.employeeId || !form.month || !form.templateKey) {
      setStatusMessage("Please complete employee, month, and template.");
      setStatusTone("red");
      return;
    }

    try {
      setSaving(true);

      const existingReport =
        reports.find((r) => r.id === editingDraftId) ||
        reports.find((r) => r.id === editingReportId) ||
        null;

      const payload = {
        employeeId: form.employeeId,
        employeeName: form.employeeName,
        month: form.month,
        templateKey: form.templateKey,
        templateLabel: activeTemplate.label,
        roleTitle: form.roleTitle,
        department: form.department,
        hireDate: form.hireDate || "",
        language,
        supervisorId: user?.id || "",
        supervisorName: getVisibleUserName(user),
        commentsCompany: normalizeText(form.commentsCompany),
        commentsEmployee: normalizeText(form.commentsEmployee),
        answers,
        score: Number(formatScore(calculatedScore)),
        performanceStatus: getPerformanceStatus(calculatedScore),
        needsFollowUp,
        followUpItems,
        managerStatus: "draft",
        assignedDutyManagerId: existingReport?.assignedDutyManagerId || "",
        assignedDutyManagerName: existingReport?.assignedDutyManagerName || "",
        followUpDutyManagerId: existingReport?.followUpDutyManagerId || "",
        followUpDutyManagerName: existingReport?.followUpDutyManagerName || "",
        managerNote: existingReport?.managerNote || "",
        returnReason: "",
        monthClosed: false,
        congratulationsSent: false,
        followUpHistory: existingReport?.followUpHistory || [],
        updatedAt: serverTimestamp(),
      };

      if (editingDraftId) {
        await updateDoc(
          doc(db, "employeePerformanceReports", editingDraftId),
          payload
        );

        setReports((prev) =>
          prev.map((item) =>
            item.id === editingDraftId
              ? {
                  ...item,
                  ...payload,
                  updatedAt: new Date(),
                }
              : item
          )
        );

        setStatusMessage("Draft saved correctly.");
        setStatusTone("green");
        return;
      }

      const ref = await addDoc(collection(db, "employeePerformanceReports"), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      setReports((prev) => [
        {
          id: ref.id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ...prev,
      ]);

      setEditingDraftId(ref.id);
      setSelectedReportId(ref.id);
      setStatusMessage("Draft saved correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error saving draft:", err);
      setStatusMessage("Could not save draft.");
      setStatusTone("red");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveReport() {
    if (!form.employeeId || !form.month || !form.templateKey) {
      setStatusMessage("Please complete employee, month, and template.");
      setStatusTone("red");
      return;
    }

    try {
      setSaving(true);

      const currentReport =
        reports.find((r) => r.id === editingDraftId) ||
        reports.find((r) => r.id === editingReportId) ||
        null;

      let nextStatus = needsFollowUp ? "follow_up" : "submitted";

      if (
        normalizeLookup(currentReport?.managerStatus || "") ===
        "returned_to_supervisor"
      ) {
        nextStatus = "resubmitted_to_manager";
      }

      const nextHistory = Array.isArray(currentReport?.followUpHistory)
        ? [...currentReport.followUpHistory]
        : [];

      if (
        normalizeLookup(currentReport?.managerStatus || "") ===
        "returned_to_supervisor"
      ) {
        nextHistory.push(
          buildHistoryEntry(
            "resubmitted_to_manager",
            user,
            "Supervisor corrected and resubmitted the report."
          )
        );
      }

      const basePayload = {
        employeeId: form.employeeId,
        employeeName: form.employeeName,
        month: form.month,
        templateKey: form.templateKey,
        templateLabel: activeTemplate.label,
        roleTitle: form.roleTitle,
        department: form.department,
        hireDate: form.hireDate || "",
        language,
        supervisorId: user?.id || "",
        supervisorName: getVisibleUserName(user),
        commentsCompany: normalizeText(form.commentsCompany),
        commentsEmployee: normalizeText(form.commentsEmployee),
        answers,
        score: Number(formatScore(calculatedScore)),
        performanceStatus: getPerformanceStatus(calculatedScore),
        needsFollowUp,
        followUpItems,
        followUpHistory: nextHistory,
        returnReason: "",
        updatedAt: serverTimestamp(),
      };

      if (editingDraftId) {
        const updatePayload = {
          ...basePayload,
          managerStatus: nextStatus,
        };

        await updateDoc(
          doc(db, "employeePerformanceReports", editingDraftId),
          updatePayload
        );

        setReports((prev) =>
          prev.map((item) =>
            item.id === editingDraftId
              ? {
                  ...item,
                  ...updatePayload,
                  updatedAt: new Date(),
                }
              : item
          )
        );

        setSelectedReportId(editingDraftId);
        setEditingDraftId("");
        setStatusMessage("Performance report submitted correctly.");
        setStatusTone("green");
        resetCreateForm();
        return;
      }

      if (editingReportId) {
        const updatePayload = {
          ...basePayload,
          managerStatus:
            normalizeLookup(currentReport?.managerStatus || "") ===
            "returned_to_supervisor"
              ? "resubmitted_to_manager"
              : currentReport?.managerStatus ||
                (needsFollowUp ? "follow_up" : "submitted"),
        };

        await updateDoc(
          doc(db, "employeePerformanceReports", editingReportId),
          updatePayload
        );

        setReports((prev) =>
          prev.map((item) =>
            item.id === editingReportId
              ? {
                  ...item,
                  ...updatePayload,
                  updatedAt: new Date(),
                }
              : item
          )
        );

        setStatusMessage("Performance report updated correctly.");
        setStatusTone("green");
        resetCreateForm();
        return;
      }

      const payload = {
        ...basePayload,
        managerStatus: needsFollowUp ? "follow_up" : "submitted",
        assignedDutyManagerId: "",
        assignedDutyManagerName: "",
        followUpDutyManagerId: "",
        followUpDutyManagerName: "",
        managerNote: "",
        monthClosed: false,
        congratulationsSent: false,
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "employeePerformanceReports"), payload);

      setReports((prev) => [
        {
          id: ref.id,
          ...payload,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ...prev,
      ]);

      setSelectedReportId(ref.id);
      setStatusMessage("Performance report submitted correctly.");
      setStatusTone("green");
      resetCreateForm();
    } catch (err) {
      console.error("Error saving performance report:", err);
      setStatusMessage("Could not save performance report.");
      setStatusTone("red");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteReport(report) {
    const ok = window.confirm(
      `Delete report for ${report.employeeName || "employee"} - ${formatMonthValue(
        report.month
      )}?`
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "employeePerformanceReports", report.id));

      setReports((prev) => prev.filter((item) => item.id !== report.id));

      if (selectedReportId === report.id) {
        setSelectedReportId("");
      }

      if (editingReportId === report.id || editingDraftId === report.id) {
        resetCreateForm();
      }

      setStatusMessage("Report deleted correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error deleting report:", err);
      setStatusMessage("Could not delete report.");
      setStatusTone("red");
    }
  }

  async function updateManagerStatus(reportId, nextStatus, extra = {}) {
    try {
      const report = reports.find((r) => r.id === reportId);
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry(
          nextStatus,
          user,
          extra?.managerNote || report?.managerNote || ""
        )
      );

      const payload = {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        followUpHistory: history,
        ...extra,
      };

      await updateDoc(doc(db, "employeePerformanceReports", reportId), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                ...extra,
                managerStatus: nextStatus,
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Management status updated correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error updating manager status:", err);
      setStatusMessage("Could not update manager status.");
      setStatusTone("red");
    }
  }

  async function assignDutyManager(report) {
    try {
      const assignedDutyManagerId = getManagementField(
        report,
        "followUpDutyManagerId"
      );
      const duty = dutyManagers.find((item) => item.id === assignedDutyManagerId);

      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry(
          "follow_up_assigned",
          user,
          getManagementField(report, "managerNote"),
          {
            dutyManagerId: assignedDutyManagerId || "",
            dutyManagerName: duty?.name || "",
          }
        )
      );

      const payload = {
        followUpDutyManagerId: assignedDutyManagerId || "",
        followUpDutyManagerName: duty?.name || "",
        assignedDutyManagerId: assignedDutyManagerId || "",
        assignedDutyManagerName: duty?.name || "",
        managerStatus: assignedDutyManagerId ? "follow_up_assigned" : report.managerStatus,
        managerNote: normalizeText(getManagementField(report, "managerNote")),
        followUpHistory: history,
      };

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        ...payload,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Duty manager assigned correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error assigning duty manager:", err);
      setStatusMessage("Could not assign duty manager.");
      setStatusTone("red");
    }
  }

  async function returnToSupervisor(report) {
    const reason = normalizeText(getManagementField(report, "returnReason"));
    if (!reason) {
      setStatusMessage("You must write the return reason.");
      setStatusTone("red");
      return;
    }

    try {
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry("returned_to_supervisor", user, reason)
      );

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "returned_to_supervisor",
        returnReason: reason,
        managerNote: normalizeText(getManagementField(report, "managerNote")),
        returnedBy: getVisibleUserName(user),
        returnedAt: serverTimestamp(),
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "returned_to_supervisor",
                returnReason: reason,
                managerNote: normalizeText(getManagementField(report, "managerNote")),
                returnedBy: getVisibleUserName(user),
                returnedAt: new Date(),
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Returned correctly to supervisor.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error returning report to supervisor:", err);
      setStatusMessage("Could not return report to supervisor.");
      setStatusTone("red");
    }
  }

  async function sendCongratulations(report) {
    try {
      const managerNote = normalizeText(getManagementField(report, "managerNote"));
      const body =
        managerNote ||
        `Congratulations ${report.employeeName}. Your ${formatMonthValue(
          report.month
        )} performance report was reviewed positively. Keep up the great work.`;

      await addDoc(collection(db, "messages"), {
        toUserId: report.employeeId || "",
        toUserName: report.employeeName || "",
        fromUserId: user?.id || "",
        fromUserName: getVisibleUserName(user),
        subject: `Congratulations - ${formatMonthValue(report.month)} EPR`,
        body,
        read: false,
        category: "employee_performance",
        createdAt: serverTimestamp(),
      });

      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];
      history.push(buildHistoryEntry("recognized", user, managerNote));

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        congratulationsSent: true,
        congratulationsSentBy: getVisibleUserName(user),
        congratulationsSentAt: serverTimestamp(),
        managerStatus: "approved",
        managerNote,
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                congratulationsSent: true,
                congratulationsSentBy: getVisibleUserName(user),
                congratulationsSentAt: new Date(),
                managerStatus: "approved",
                managerNote,
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Congratulations sent correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error sending congratulations:", err);
      setStatusMessage("Could not send congratulations.");
      setStatusTone("red");
    }
  }

  async function closeMonth(report) {
    try {
      const managerNote = normalizeText(getManagementField(report, "managerNote"));
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];
      history.push(buildHistoryEntry("closed", user, managerNote));

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        monthClosed: true,
        closedMonthBy: getVisibleUserName(user),
        closedMonthAt: serverTimestamp(),
        managerNote,
        managerStatus: report.needsFollowUp ? "follow_up" : "closed",
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      if (report.employeeId) {
        await addDoc(collection(db, "messages"), {
          toUserId: report.employeeId,
          toUserName: report.employeeName || "",
          fromUserId: user?.id || "",
          fromUserName: getVisibleUserName(user),
          subject: `Monthly EPR Closed - ${formatMonthValue(report.month)}`,
          body:
            managerNote ||
            `Your ${formatMonthValue(
              report.month
            )} employee performance report has been processed and closed.`,
          read: false,
          category: "employee_performance",
          createdAt: serverTimestamp(),
        });
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                monthClosed: true,
                closedMonthBy: getVisibleUserName(user),
                closedMonthAt: new Date(),
                managerNote,
                managerStatus: item.needsFollowUp ? "follow_up" : "closed",
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Month closed correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error closing month:", err);
      setStatusMessage("Could not close month.");
      setStatusTone("red");
    }
  }

  async function acceptFollowUpCase(report) {
    try {
      const note = normalizeText(getFollowUpField(report, "acceptanceNote"));
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(buildHistoryEntry("follow_up_accepted", user, note));

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "follow_up_in_progress",
        followUpAcceptedBy: getVisibleUserName(user),
        followUpAcceptedAt: serverTimestamp(),
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "follow_up_in_progress",
                followUpAcceptedBy: getVisibleUserName(user),
                followUpAcceptedAt: new Date(),
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Follow up case accepted correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error accepting follow up case:", err);
      setStatusMessage("Could not accept follow up case.");
      setStatusTone("red");
    }
  }

  async function saveFollowUpProgress(report) {
    const actionTaken = normalizeText(getFollowUpField(report, "actionTaken"));
    const details = normalizeText(getFollowUpField(report, "details"));

    if (!actionTaken && !details) {
      setStatusMessage("Write follow up action or details first.");
      setStatusTone("red");
      return;
    }

    try {
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry("follow_up_progress", user, details, {
          actionTaken,
          details,
        })
      );

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "follow_up_in_progress",
        followUpLastAction: actionTaken,
        followUpLastDetails: details,
        followUpLastUpdatedBy: getVisibleUserName(user),
        followUpLastUpdatedAt: serverTimestamp(),
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "follow_up_in_progress",
                followUpLastAction: actionTaken,
                followUpLastDetails: details,
                followUpLastUpdatedBy: getVisibleUserName(user),
                followUpLastUpdatedAt: new Date(),
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Follow up progress saved correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error saving follow up progress:", err);
      setStatusMessage("Could not save follow up progress.");
      setStatusTone("red");
    }
  }

  async function resubmitFollowUpToManager(report) {
    const actionTaken = normalizeText(getFollowUpField(report, "actionTaken"));
    const details = normalizeText(getFollowUpField(report, "details"));

    if (!actionTaken && !details) {
      setStatusMessage("Write what was done before resubmitting.");
      setStatusTone("red");
      return;
    }

    try {
      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry("follow_up_resubmitted", user, details, {
          actionTaken,
          details,
        })
      );

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "follow_up_resubmitted",
        followUpCompletedBy: getVisibleUserName(user),
        followUpCompletedAt: serverTimestamp(),
        followUpLastAction: actionTaken,
        followUpLastDetails: details,
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "follow_up_resubmitted",
                followUpCompletedBy: getVisibleUserName(user),
                followUpCompletedAt: new Date(),
                followUpLastAction: actionTaken,
                followUpLastDetails: details,
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Follow up resubmitted to manager correctly.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error resubmitting follow up:", err);
      setStatusMessage("Could not resubmit follow up.");
      setStatusTone("red");
    }
  }

  if (!canCreate && !canManage) {
    return (
      <PageCard style={{ padding: 22 }}>
        Only Supervisors, Duty Managers, and Station Managers can access this page.
      </PageCard>
    );
  }

  return (
    <div
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
        }}
      >
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
          TPA OPS · EPR
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
          {t.title}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 920,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          {t.subtitle}
        </p>
      </div>

      {statusMessage && <CenterToast message={statusMessage} tone={statusTone} />}

      {returnedReports.length > 0 && user?.role === "supervisor" && (
        <PageCard style={{ padding: 18 }}>
          <div
            style={{
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: 18,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#9a3412",
                marginBottom: 10,
              }}
            >
              Returned Reports Requiring Correction
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {returnedReports.map((report) => (
                <div
                  key={report.id}
                  style={{
                    border: "1px solid #fdba74",
                    borderRadius: 14,
                    background: "#ffffff",
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.employeeName} · {formatMonthValue(report.month)}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#7c2d12",
                          lineHeight: 1.6,
                        }}
                      >
                        <strong>Return reason:</strong> {report.returnReason || "-"}
                      </div>
                    </div>

                    <ActionButton
                      variant="warning"
                      onClick={() => loadReportIntoForm(report)}
                    >
                      Fix and Resubmit
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {canCreate && (
              <TabButton active={tab === "create"} onClick={() => setTab("create")}>
                {t.createTab}
              </TabButton>
            )}

            {canCreate && (
              <TabButton active={tab === "drafts"} onClick={() => setTab("drafts")}>
                {t.draftsTab}
              </TabButton>
            )}

            {canHandleFollowUp && (
              <TabButton active={tab === "followups"} onClick={() => setTab("followups")}>
                {t.followUpTab}
              </TabButton>
            )}

            {canManage && (
              <TabButton
                active={tab === "management"}
                onClick={() => setTab("management")}
              >
                {t.managementTab}
              </TabButton>
            )}
          </div>

          <div style={{ minWidth: 180 }}>
            <FieldLabel>{t.language}</FieldLabel>
            <SelectInput value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {tab === "create" && canCreate && (
        <>
          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {editingDraftId
                  ? `${t.draft} · ${t.continueEditing}`
                  : editingReportId
                  ? t.editReport
                  : t.createTab}
              </div>

              {(editingReportId || editingDraftId) && (
                <ActionButton variant="secondary" onClick={resetCreateForm}>
                  {t.cancelEdit}
                </ActionButton>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <FieldLabel>{t.month}</FieldLabel>
                <SelectInput
                  value={form.month}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, month: e.target.value }))
                  }
                >
                  {monthOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.employee}</FieldLabel>
                <SelectInput
                  value={form.employeeId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, employeeId: e.target.value }))
                  }
                >
                  <option value="">Select employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.template}</FieldLabel>
                <SelectInput
                  value={form.templateKey}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, templateKey: e.target.value }))
                  }
                >
                  {availableTemplates.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.evaluator}</FieldLabel>
                <TextInput value={getVisibleUserName(user)} disabled />
              </div>

              <div>
                <FieldLabel>{t.department}</FieldLabel>
                <TextInput value={form.department} disabled />
              </div>

              <div>
                <FieldLabel>{t.hireDate}</FieldLabel>
                <TextInput value={form.hireDate || ""} disabled />
              </div>
            </div>
          </PageCard>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <InfoCard
              label={t.score}
              value={`${formatScore(calculatedScore)} / 100`}
              tone={getPerformanceTone(calculatedScore)}
            />
            <InfoCard
              label={t.status}
              value={getPerformanceStatus(calculatedScore)}
              tone={getPerformanceTone(calculatedScore)}
            />
            <InfoCard
              label={t.followUpNeeded}
              value={needsFollowUp ? "Yes" : "No"}
              tone={needsFollowUp ? "amber" : "green"}
            />
          </div>

          <PageCard style={{ padding: 22 }}>
            <div style={{ marginBottom: 14 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {activeTemplate.label} · {formatMonthValue(form.month)}
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                {form.employeeName || "Select employee to begin."}
              </p>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {activeTemplate.questions.map((question) => (
                <div
                  key={question.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    padding: 16,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#0f172a",
                      lineHeight: 1.6,
                    }}
                  >
                    {language === "es" ? question.es : question.en}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <FieldLabel>{t.rating}</FieldLabel>
                      <SelectInput
                        value={answers[question.id]?.rating || ""}
                        onChange={(e) =>
                          handleAnswerChange(question.id, "rating", e.target.value)
                        }
                      >
                        <option value="">Select</option>
                        <option value="exceeds">{t.exceeds}</option>
                        <option value="meets">{t.meets}</option>
                        <option value="below">{t.below}</option>
                      </SelectInput>
                    </div>

                    <div>
                      <FieldLabel>Weight</FieldLabel>
                      <TextInput value={question.weight} disabled />
                    </div>
                  </div>

                  {(answers[question.id]?.rating || "") === "below" && (
                    <div style={{ marginTop: 12 }}>
                      <FieldLabel>{t.note}</FieldLabel>
                      <TextArea
                        value={answers[question.id]?.note || ""}
                        onChange={(e) =>
                          handleAnswerChange(question.id, "note", e.target.value)
                        }
                        placeholder="Add follow-up details..."
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </PageCard>

          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <FieldLabel>{t.commentsCompany}</FieldLabel>
                <TextArea
                  value={form.commentsCompany}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      commentsCompany: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <FieldLabel>{t.commentsEmployee}</FieldLabel>
                <TextArea
                  value={form.commentsEmployee}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      commentsEmployee: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {needsFollowUp && (
              <div
                style={{
                  marginTop: 16,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  borderRadius: 16,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#9a3412",
                  }}
                >
                  {t.lowScoreAlert}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 8,
                    color: "#7c2d12",
                    fontSize: 14,
                  }}
                >
                  {followUpItems.length > 0 ? (
                    followUpItems.map((item) => (
                      <div key={item.id}>
                        • {language === "es" ? item.es : item.en}
                      </div>
                    ))
                  ) : (
                    <div>• Score under threshold.</div>
                  )}
                </div>
              </div>
            )}

            <div
              style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}
            >
              <ActionButton
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saving}
              >
                {saving ? "Saving..." : t.saveDraft}
              </ActionButton>

              <ActionButton
                variant="primary"
                onClick={handleSaveReport}
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingReportId || editingDraftId
                  ? t.updateReport
                  : t.saveReport}
              </ActionButton>

              {(editingReportId || editingDraftId) && (
                <ActionButton variant="secondary" onClick={resetCreateForm}>
                  {t.cancelEdit}
                </ActionButton>
              )}
            </div>
          </PageCard>
        </>
      )}

      {tab === "drafts" && canCreate && (
        <PageCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {t.draftsSaved}
            </h2>
          </div>

          {returnedReports.length > 0 && (
            <div style={{ marginBottom: 18, display: "grid", gap: 12 }}>
              {returnedReports.map((draft) => (
                <div
                  key={draft.id}
                  style={{
                    border: "1px solid #fdba74",
                    borderRadius: 18,
                    padding: 16,
                    background: "#fff7ed",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {draft.employeeName || "-"} · {formatMonthValue(draft.month)}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#9a3412",
                        }}
                      >
                        <strong>Return reason:</strong> {draft.returnReason || "-"}
                      </div>
                    </div>

                    <ActionButton
                      variant="warning"
                      onClick={() => handleLoadDraft(draft)}
                    >
                      Fix and Resubmit
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {savedDrafts.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 14 }}>{t.noDrafts}</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {savedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 18,
                    padding: 16,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {draft.employeeName || "-"} · {formatMonthValue(draft.month)}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {t.template}: {draft.templateLabel || "-"} · {t.lastUpdated}:{" "}
                        {formatDateTime(draft.updatedAt)}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton variant="primary" onClick={() => handleLoadDraft(draft)}>
                        {t.continueEditing}
                      </ActionButton>

                      <ActionButton
                        variant="danger"
                        onClick={() => handleDeleteReport(draft)}
                      >
                        {t.deleteReport}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>
      )}

      {tab === "followups" && canHandleFollowUp && (
        <PageCard style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {t.followUpTab}
            </h2>
          </div>

          {myFollowUpCases.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 14 }}>
              No follow up cases assigned.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {myFollowUpCases.map((report) => (
                <div
                  key={report.id}
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 18,
                    padding: 16,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {report.employeeName} · {formatMonthValue(report.month)}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {report.templateLabel || "-"} · Supervisor:{" "}
                        {report.supervisorName || "-"}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: "#9a3412",
                        }}
                      >
                        <strong>Status:</strong> {getStatusLabel(report.managerStatus)}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton
                        variant="secondary"
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        {t.openReport}
                      </ActionButton>
                      <ActionButton
                        variant="dark"
                        onClick={() => printReportHtml(report, language)}
                      >
                        {t.print}
                      </ActionButton>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <FieldLabel>Acceptance Note</FieldLabel>
                      <TextArea
                        value={getFollowUpField(report, "acceptanceNote")}
                        onChange={(e) =>
                          setFollowUpEdit((prev) => ({
                            ...prev,
                            [report.id]: {
                              ...(prev[report.id] || {}),
                              acceptanceNote: e.target.value,
                            },
                          }))
                        }
                        style={{ minHeight: 70 }}
                      />
                    </div>

                    <div>
                      <FieldLabel>Action Taken</FieldLabel>
                      <TextArea
                        value={getFollowUpField(report, "actionTaken")}
                        onChange={(e) =>
                          setFollowUpEdit((prev) => ({
                            ...prev,
                            [report.id]: {
                              ...(prev[report.id] || {}),
                              actionTaken: e.target.value,
                            },
                          }))
                        }
                        style={{ minHeight: 70 }}
                      />
                    </div>

                    <div>
                      <FieldLabel>Follow Up Details</FieldLabel>
                      <TextArea
                        value={getFollowUpField(report, "details")}
                        onChange={(e) =>
                          setFollowUpEdit((prev) => ({
                            ...prev,
                            [report.id]: {
                              ...(prev[report.id] || {}),
                              details: e.target.value,
                            },
                          }))
                        }
                        style={{ minHeight: 70 }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {normalizeLookup(report.managerStatus) === "follow_up_assigned" && (
                      <ActionButton
                        variant="success"
                        onClick={() => acceptFollowUpCase(report)}
                      >
                        Accept Case
                      </ActionButton>
                    )}

                    <ActionButton
                      variant="warning"
                      onClick={() => saveFollowUpProgress(report)}
                    >
                      Save Progress
                    </ActionButton>

                    <ActionButton
                      variant="primary"
                      onClick={() => resubmitFollowUpToManager(report)}
                    >
                      Resubmit to Manager
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>
      )}

      {tab === "management" && canManage && (
        <>
          <PageCard style={{ padding: 22 }}>
            <div style={{ marginBottom: 14 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                {t.managementFilters}
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <FieldLabel>{t.month}</FieldLabel>
                <SelectInput
                  value={filters.month}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, month: e.target.value }))
                  }
                >
                  <option value="all">{t.all}</option>
                  {monthOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.employee}</FieldLabel>
                <SelectInput
                  value={filters.employeeId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, employeeId: e.target.value }))
                  }
                >
                  <option value="all">{t.all}</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.supervisor}</FieldLabel>
                <SelectInput
                  value={filters.supervisorName}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      supervisorName: e.target.value,
                    }))
                  }
                >
                  <option value="all">{t.all}</option>
                  {supervisorNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.followUpStatus}</FieldLabel>
                <SelectInput
                  value={filters.followUpStatus}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      followUpStatus: e.target.value,
                    }))
                  }
                >
                  <option value="all">{t.all}</option>
                  <option value="draft">{t.draft}</option>
                  <option value="submitted">{t.submitted}</option>
                  <option value="approved">{t.approved}</option>
                  <option value="follow_up">{t.followUp}</option>
                  <option value="follow_up_assigned">Follow Up Assigned</option>
                  <option value="follow_up_in_progress">Follow Up In Progress</option>
                  <option value="follow_up_resubmitted">Resubmitted to Manager</option>
                  <option value="returned_to_supervisor">Returned to Supervisor</option>
                  <option value="closed">{t.closed}</option>
                </SelectInput>
              </div>

              <div>
                <FieldLabel>{t.scoreBand}</FieldLabel>
                <SelectInput
                  value={filters.scoreBand}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, scoreBand: e.target.value }))
                  }
                >
                  <option value="all">{t.all}</option>
                  <option value="high">85 - 100</option>
                  <option value="medium">70 - 84.99</option>
                  <option value="low">0 - 69.99</option>
                </SelectInput>
              </div>
            </div>
          </PageCard>

          <div ref={printAreaRef} style={{ display: "grid", gap: 14 }}>
            {loading ? (
              <PageCard style={{ padding: 22 }}>Loading...</PageCard>
            ) : Object.keys(groupedReportsByEmployee).length === 0 ? (
              <PageCard style={{ padding: 22 }}>{t.noReports}</PageCard>
            ) : (
              Object.entries(groupedReportsByEmployee).map(([employeeName, items]) => (
                <PageCard key={employeeName} style={{ padding: 18 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 900,
                          color: "#0f172a",
                        }}
                      >
                        {employeeName}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {items.length} report(s)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    {items.map((report) => (
                      <div
                        key={report.id}
                        style={{
                          border: "1px solid #dbeafe",
                          borderRadius: 18,
                          padding: 16,
                          background:
                            selectedReportId === report.id ? "#edf7ff" : "#ffffff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: "#0f172a",
                              }}
                            >
                              {report.templateLabel} · {formatMonthValue(report.month)}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 13,
                                color: "#64748b",
                              }}
                            >
                              {t.supervisor}: {report.supervisorName || "-"} ·{" "}
                              {formatDateTime(report.createdAt)}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <ActionButton
                              variant="secondary"
                              onClick={() => setSelectedReportId(report.id)}
                            >
                              {t.openReport}
                            </ActionButton>
                            <ActionButton
                              variant="warning"
                              onClick={() => loadReportIntoForm(report)}
                            >
                              {t.editReport}
                            </ActionButton>
                            <ActionButton
                              variant="dark"
                              onClick={() => printReportHtml(report, language)}
                            >
                              {t.print}
                            </ActionButton>
                            <ActionButton
                              variant="danger"
                              onClick={() => handleDeleteReport(report)}
                            >
                              {t.deleteReport}
                            </ActionButton>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 10,
                          }}
                        >
                          <InfoCard
                            label={t.score}
                            value={`${formatScore(report.score)} / 100`}
                            tone={getPerformanceTone(report.score)}
                          />
                          <InfoCard
                            label={t.status}
                            value={getStatusLabel(
                              report.managerStatus || report.performanceStatus || "-"
                            )}
                            tone={getStatusTone(report.managerStatus)}
                          />
                          <InfoCard
                            label={t.assignedDutyManager}
                            value={
                              report.followUpDutyManagerName ||
                              report.assignedDutyManagerName ||
                              "-"
                            }
                            tone="default"
                          />
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <div>
                            <FieldLabel>{t.assignDutyManager}</FieldLabel>
                            <SelectInput
                              value={getManagementField(report, "followUpDutyManagerId")}
                              onChange={(e) =>
                                setManagementEdit((prev) => ({
                                  ...prev,
                                  [report.id]: {
                                    ...(prev[report.id] || {}),
                                    followUpDutyManagerId: e.target.value,
                                  },
                                }))
                              }
                            >
                              <option value="">{t.all}</option>
                              {dutyManagers.map((dm) => (
                                <option key={dm.id} value={dm.id}>
                                  {dm.name}
                                </option>
                              ))}
                            </SelectInput>
                          </div>

                          <div>
                            <FieldLabel>{t.managerNote}</FieldLabel>
                            <TextArea
                              value={getManagementField(report, "managerNote")}
                              onChange={(e) =>
                                setManagementEdit((prev) => ({
                                  ...prev,
                                  [report.id]: {
                                    ...(prev[report.id] || {}),
                                    managerNote: e.target.value,
                                  },
                                }))
                              }
                              style={{ minHeight: 70 }}
                            />
                          </div>

                          <div>
                            <FieldLabel>{t.returnReason}</FieldLabel>
                            <TextArea
                              value={getManagementField(report, "returnReason")}
                              onChange={(e) =>
                                setManagementEdit((prev) => ({
                                  ...prev,
                                  [report.id]: {
                                    ...(prev[report.id] || {}),
                                    returnReason: e.target.value,
                                  },
                                }))
                              }
                              style={{ minHeight: 70 }}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton
                            variant="secondary"
                            onClick={() => assignDutyManager(report)}
                          >
                            {t.assignDutyManager}
                          </ActionButton>

                          <ActionButton
                            variant="success"
                            onClick={() =>
                              updateManagerStatus(report.id, "approved", {
                                managerNote: normalizeText(
                                  getManagementField(report, "managerNote")
                                ),
                              })
                            }
                          >
                            {t.approve}
                          </ActionButton>

                          <ActionButton
                            variant="warning"
                            onClick={() =>
                              updateManagerStatus(report.id, "follow_up", {
                                managerNote: normalizeText(
                                  getManagementField(report, "managerNote")
                                ),
                              })
                            }
                          >
                            {t.markFollowUp}
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => returnToSupervisor(report)}
                          >
                            {t.returnToSupervisor}
                          </ActionButton>

                          <ActionButton
                            variant="primary"
                            onClick={() => sendCongratulations(report)}
                          >
                            {t.congratulations}
                          </ActionButton>

                          <ActionButton
                            variant="dark"
                            onClick={() => closeMonth(report)}
                          >
                            {t.closeMonth}
                          </ActionButton>
                        </div>

                        {selectedReportId === report.id && (
                          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                            <div
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 16,
                                padding: 14,
                                background: "#ffffff",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: "#0f172a",
                                  marginBottom: 8,
                                }}
                              >
                                {t.questionsToFollow}
                              </div>

                              {Array.isArray(report.followUpItems) &&
                              report.followUpItems.length > 0 ? (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {report.followUpItems.map((item) => (
                                    <div
                                      key={item.id}
                                      style={{ color: "#7c2d12", fontSize: 14 }}
                                    >
                                      •{" "}
                                      {(language === "es" ? item.es : item.en) ||
                                        item.en ||
                                        item.es}
                                      {item.note ? ` — ${item.note}` : ""}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ color: "#64748b", fontSize: 14 }}>
                                  No follow up items.
                                </div>
                              )}
                            </div>

                            <div
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 16,
                                padding: 14,
                                background: "#ffffff",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: "#0f172a",
                                  marginBottom: 8,
                                }}
                              >
                                Comments
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  color: "#334155",
                                  lineHeight: 1.7,
                                }}
                              >
                                <div>
                                  <strong>Company:</strong>{" "}
                                  {report.commentsCompany || "-"}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Employee:</strong>{" "}
                                  {report.commentsEmployee || "-"}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Manager:</strong>{" "}
                                  {getManagementField(report, "managerNote") ||
                                    report.managerNote ||
                                    "-"}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Return Reason:</strong>{" "}
                                  {report.returnReason || "-"}
                                </div>
                              </div>
                            </div>

                            <div
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 16,
                                padding: 14,
                                background: "#ffffff",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color: "#0f172a",
                                  marginBottom: 8,
                                }}
                              >
                                Follow Up History
                              </div>

                              {Array.isArray(report.followUpHistory) &&
                              report.followUpHistory.length > 0 ? (
                                <div style={{ display: "grid", gap: 10 }}>
                                  {report.followUpHistory.map((item, index) => (
                                    <div
                                      key={`${report.id}-hist-${index}`}
                                      style={{
                                        border: "1px solid #e2e8f0",
                                        borderRadius: 12,
                                        padding: 12,
                                        background: "#f8fbff",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: 13,
                                          fontWeight: 800,
                                          color: "#0f172a",
                                        }}
                                      >
                                        {String(item.type || "")
                                          .replace(/_/g, " ")
                                          .toUpperCase()}
                                      </div>
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 12,
                                          color: "#64748b",
                                        }}
                                      >
                                        {item.byUserName || "-"} ·{" "}
                                        {item.createdAt
                                          ? formatDateTime(item.createdAt)
                                          : "-"}
                                      </div>
                                      {item.note ? (
                                        <div
                                          style={{
                                            marginTop: 6,
                                            fontSize: 14,
                                            color: "#334155",
                                          }}
                                        >
                                          <strong>Note:</strong> {item.note}
                                        </div>
                                      ) : null}
                                      {item.actionTaken ? (
                                        <div
                                          style={{
                                            marginTop: 6,
                                            fontSize: 14,
                                            color: "#334155",
                                          }}
                                        >
                                          <strong>Action:</strong> {item.actionTaken}
                                        </div>
                                      ) : null}
                                      {item.details ? (
                                        <div
                                          style={{
                                            marginTop: 6,
                                            fontSize: 14,
                                            color: "#334155",
                                          }}
                                        >
                                          <strong>Details:</strong> {item.details}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ color: "#64748b", fontSize: 14 }}>
                                  No follow up history.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </PageCard>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
