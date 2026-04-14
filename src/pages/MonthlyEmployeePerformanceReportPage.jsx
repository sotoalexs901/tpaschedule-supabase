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
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  let earnedPoints = 0;
  let maxPoints = 0;

  (questions || []).forEach((question) => {
    const weight = Number(question.weight || 0);
    const rating = answers?.[question.id]?.rating || "";
    const ratingPoints = getRatingPoints(rating);

    earnedPoints += ratingPoints * weight;
    maxPoints += 4 * weight;
  });

  if (!maxPoints) return 0;

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

function printReportHtml(report, language = "en") {
  const title =
    language === "es"
      ? "Reporte Mensual de Desempeño"
      : "Monthly Employee Performance Report";

  const followUpItems = Array.isArray(report.followUpItems)
    ? report.followUpItems
    : [];

  const answers = report.answers || {};

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
          <div><strong>Status:</strong> ${report.managerStatus || report.performanceStatus || "-"}</div>
          <div><strong>Assigned Duty Manager:</strong> ${report.assignedDutyManagerName || "-"}</div>
        </div>

        <div class="card">
          <h3>Comments</h3>
          <div><strong>Company:</strong> ${report.commentsCompany || "-"}</div>
          <div style="margin-top:8px;"><strong>Employee:</strong> ${report.commentsEmployee || "-"}</div>
          <div style="margin-top:8px;"><strong>Manager Note:</strong> ${report.managerNote || "-"}</div>
        </div>

        <div class="card">
          <h3>Follow Up Items</h3>
          ${
            followUpItems.length
              ? followUpItems
                  .map(
                    (item) =>
                      `<div class="q">• ${item[language] || item.en || item.es || "-"}${
                        item.note ? ` — ${item.note}` : ""
                      }</div>`
                  )
                  .join("")
              : "<div>No follow up items.</div>"
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
      "Supervisors and managers can complete EPRs by month. Duty and station managers manage follow-up, congratulations, closures and employee notifications.",
    createTab: "Create EPR",
    managementTab: "Management",
    draftsTab: "Drafts",
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
    receivedReports: "Received Reports",
    managerAction: "Manager Action",
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
    print: "Print",
    messageSent: "Message sent to employee.",
    monthClosed: "Month closed successfully.",
    congratulationsSent: "Congratulations sent successfully.",
    dutyAssigned: "Duty manager assigned successfully.",
    managerUpdated: "Management status updated successfully.",
    reportUpdated: "Report updated successfully.",
    reportDeleted: "Report deleted successfully.",
    draftSaved: "Draft saved successfully.",
    draftUpdated: "Draft updated successfully.",
    closed: "Closed",
    followUp: "Follow Up",
    approved: "Approved",
    submitted: "Submitted",
    draft: "Draft",
  },
  es: {
    title: "Reporte Mensual de Desempeño del Empleado",
    subtitle:
      "Supervisores y managers pueden completar EPR por mes. Duty managers y station managers administran seguimiento, felicitaciones, cierre de mes y notificación al empleado.",
    createTab: "Crear EPR",
    managementTab: "Management",
    draftsTab: "Borradores",
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
    receivedReports: "Reportes Recibidos",
    managerAction: "Acción Manager",
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
    print: "Imprimir",
    messageSent: "Mensaje enviado al empleado.",
    monthClosed: "Mes cerrado correctamente.",
    congratulationsSent: "Felicitación enviada correctamente.",
    dutyAssigned: "Duty manager asignado correctamente.",
    managerUpdated: "Estado actualizado correctamente.",
    reportUpdated: "Reporte actualizado correctamente.",
    reportDeleted: "Reporte borrado correctamente.",
    draftSaved: "Borrador guardado correctamente.",
    draftUpdated: "Borrador actualizado correctamente.",
    closed: "Cerrado",
    followUp: "Seguimiento",
    approved: "Aprobado",
    submitted: "Enviado",
    draft: "Borrador",
  },
};

/* -------------------- Question bank -------------------- */

const COMMON_QUESTIONS = [
  {
    id: "1",
    es: "Acepta la responsabilidad de las acciones y responde a las consecuencias.",
    en: "Accepts responsibility for actions and responds to consequences.",
    weight: 3,
  },
  {
    id: "2",
    es: "Rara vez está ausente, llega puntualmente y trabaja las horas requeridas.",
    en: "Is rarely absent, arrives on time, and works required hours.",
    weight: 3,
  },
  {
    id: "3",
    es: "Tiene capacidad para llevarse bien con compañeros y administración de manera cooperativa.",
    en: "Works cooperatively with coworkers and management.",
    weight: 3,
  },
  {
    id: "4",
    es: "Muestra iniciativa, optimismo y cortesía de manera activa y respetuosa.",
    en: "Shows initiative, optimism, and courtesy in an active and respectful way.",
    weight: 3,
  },
  {
    id: "5",
    es: "Aprende de sugerencias, acata instrucciones y ajusta su comportamiento.",
    en: "Learns from feedback, follows instructions, and adjusts behavior.",
    weight: 3,
  },
  {
    id: "6",
    es: "Responde adecuadamente a cambios en situaciones y expectativas.",
    en: "Responds well to changing situations and expectations.",
    weight: 3,
  },
  {
    id: "7",
    es: "Sigue políticas y procedimientos de la organización.",
    en: "Follows organizational policies and procedures.",
    weight: 3,
  },
  {
    id: "8",
    es: "Completa tareas y funciones propias del cargo cumpliendo tiempos.",
    en: "Completes duties and job tasks on time.",
    weight: 3,
  },
  {
    id: "9",
    es: "Garantiza atención de alta calidad con respeto y amabilidad.",
    en: "Provides high-quality service with respect and kindness.",
    weight: 3,
  },
  {
    id: "10",
    es: "Es minucioso, preciso y limpio en el trabajo.",
    en: "Is thorough, accurate, and clean in the work performed.",
    weight: 3,
  },
];

const TEMPLATE_MAP = {
  wchr: {
    key: "wchr",
    label: "WCHR Service",
    role: "WCHR Agent",
    department: "WCHR Service",
    questions: COMMON_QUESTIONS,
  },
  baggage: {
    key: "baggage",
    label: "Baggage Handling",
    role: "Baggage Handler",
    department: "Baggage Handling",
    questions: COMMON_QUESTIONS,
  },
  passenger: {
    key: "passenger",
    label: "Passenger Service",
    role: "Passenger Service Agent",
    department: "Passenger Service",
    questions: COMMON_QUESTIONS,
  },
  gate: {
    key: "gate",
    label: "Gate Agent",
    role: "Gate Agent",
    department: "Passenger Service - Gate",
    questions: COMMON_QUESTIONS,
  },
};

export default function MonthlyEmployeePerformanceReportPage() {
  const { user } = useUser();
  const printAreaRef = useRef(null);

  const canCreate =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManage =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [tab, setTab] = useState("create");
  const [language, setLanguage] = useState("en");
  const t = LABELS[language];

  const userDepartmentNormalized = useMemo(() => {
    return normalizeDepartment(user?.department || "");
  }, [user?.department]);

  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [editingReportId, setEditingReportId] = useState("");
  const [editingDraftId, setEditingDraftId] = useState("");

  const [managementEdit, setManagementEdit] = useState({});

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const availableTemplates = useMemo(() => {
    return Object.values(TEMPLATE_MAP);
  }, []);

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

  useEffect(() => {
    if (!availableTemplates.length) return;

    setForm((prev) => {
      const currentTemplateExists = availableTemplates.some(
        (template) => template.key === prev.templateKey
      );

      if (currentTemplateExists) return prev;

      const preferredTemplate =
        availableTemplates.find((item) => item.key === "passenger") ||
        availableTemplates[0];

      return {
        ...prev,
        templateKey: preferredTemplate.key,
      };
    });
  }, [availableTemplates]);

  const activeTemplate =
    TEMPLATE_MAP[form.templateKey] ||
    availableTemplates[0] ||
    TEMPLATE_MAP.passenger;

  const [answers, setAnswers] = useState({});

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
      department: prev.department || selectedEmployee.department || "",
    }));
  }, [selectedEmployee]);

  const calculatedScore = useMemo(() => {
    return calculatePerformanceScore(answers, activeTemplate.questions);
  }, [answers, activeTemplate]);

  const followUpItems = useMemo(() => {
    return getFollowUpItems(answers, activeTemplate.questions);
  }, [answers, activeTemplate]);

  const needsFollowUp = calculatedScore < 70 || followUpItems.length > 0;

  const dutyManagers = useMemo(() => {
    return employees.filter(
      (emp) =>
        normalizeLookup(emp.role) === "duty_manager" ||
        normalizeLookup(emp.role) === "duty manager"
    );
  }, [employees]);

  const supervisorNames = useMemo(() => {
    return Array.from(
      new Set(
        reports
          .map((r) => normalizeText(r.supervisorName))
          .filter(Boolean)
      )
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
      return;
    }

    try {
      setSaving(true);

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
        assignedDutyManagerId: "",
        assignedDutyManagerName: "",
        managerNote: "",
        monthClosed: false,
        congratulationsSent: false,
        updatedAt: serverTimestamp(),
      };

      if (editingDraftId) {
        await updateDoc(doc(db, "employeePerformanceReports", editingDraftId), payload);

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

        setStatusMessage(t.draftUpdated);
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
      setStatusMessage(t.draftSaved);
    } catch (err) {
      console.error("Error saving draft:", err);
      setStatusMessage("Could not save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveReport() {
    if (!form.employeeId || !form.month || !form.templateKey) {
      setStatusMessage("Please complete employee, month, and template.");
      return;
    }

    try {
      setSaving(true);

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
        updatedAt: serverTimestamp(),
      };

      if (editingDraftId) {
        const updatePayload = {
          ...basePayload,
          managerStatus: needsFollowUp ? "follow_up" : "submitted",
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
        setStatusMessage("Performance report saved successfully.");
        resetCreateForm();
        return;
      }

      if (editingReportId) {
        const currentReport = reports.find((r) => r.id === editingReportId);

        const updatePayload = {
          ...basePayload,
          managerStatus:
            currentReport?.managerStatus ||
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

        setStatusMessage(t.reportUpdated);
        resetCreateForm();
        return;
      }

      const payload = {
        ...basePayload,
        managerStatus: needsFollowUp ? "follow_up" : "submitted",
        assignedDutyManagerId: "",
        assignedDutyManagerName: "",
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
      setStatusMessage("Performance report saved successfully.");
      resetCreateForm();
    } catch (err) {
      console.error("Error saving performance report:", err);
      setStatusMessage("Could not save performance report.");
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

      setStatusMessage(t.reportDeleted);
    } catch (err) {
      console.error("Error deleting report:", err);
      setStatusMessage("Could not delete report.");
    }
  }

  async function updateManagerStatus(reportId, nextStatus, extra = {}) {
    try {
      const payload = {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
              }
            : item
        )
      );

      setStatusMessage(t.managerUpdated);
    } catch (err) {
      console.error("Error updating manager status:", err);
      setStatusMessage("Could not update manager status.");
    }
  }

  async function assignDutyManager(report) {
    try {
      const assignedDutyManagerId = getManagementField(report, "assignedDutyManagerId");
      const duty = dutyManagers.find((item) => item.id === assignedDutyManagerId);

      const payload = {
        assignedDutyManagerId: assignedDutyManagerId || "",
        assignedDutyManagerName: duty?.name || "",
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
              }
            : item
        )
      );

      setStatusMessage(t.dutyAssigned);
    } catch (err) {
      console.error("Error assigning duty manager:", err);
      setStatusMessage("Could not assign duty manager.");
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

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        congratulationsSent: true,
        congratulationsSentBy: getVisibleUserName(user),
        congratulationsSentAt: serverTimestamp(),
        managerStatus: "approved",
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
              }
            : item
        )
      );

      setStatusMessage(t.congratulationsSent);
    } catch (err) {
      console.error("Error sending congratulations:", err);
      setStatusMessage("Could not send congratulations.");
    }
  }

  async function closeMonth(report) {
    try {
      const managerNote = normalizeText(getManagementField(report, "managerNote"));

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        monthClosed: true,
        closedMonthBy: getVisibleUserName(user),
        closedMonthAt: serverTimestamp(),
        managerNote,
        managerStatus: report.needsFollowUp ? "follow_up" : "closed",
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
            `Your ${formatMonthValue(report.month)} employee performance report has been processed and closed.`,
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
              }
            : item
        )
      );

      setStatusMessage(t.monthClosed);
    } catch (err) {
      console.error("Error closing month:", err);
      setStatusMessage("Could not close month.");
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
              <TabButton
                active={tab === "create"}
                onClick={() => setTab("create")}
              >
                {t.createTab}
              </TabButton>
            )}

            {canCreate && (
              <TabButton
                active={tab === "drafts"}
                onClick={() => setTab("drafts")}
              >
                {t.draftsTab}
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
            <SelectInput
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
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

            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                      <ActionButton
                        variant="primary"
                        onClick={() => handleLoadDraft(draft)}
                      >
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
                            value={report.managerStatus || report.performanceStatus || "-"}
                            tone={
                              normalizeLookup(report.managerStatus) === "approved"
                                ? "green"
                                : normalizeLookup(report.managerStatus) === "follow_up"
                                ? "amber"
                                : normalizeLookup(report.managerStatus) === "closed"
                                ? "blue"
                                : normalizeLookup(report.managerStatus) === "draft"
                                ? "default"
                                : "default"
                            }
                          />
                          <InfoCard
                            label={t.assignedDutyManager}
                            value={report.assignedDutyManagerName || "-"}
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
                              value={getManagementField(report, "assignedDutyManagerId")}
                              onChange={(e) =>
                                setManagementEdit((prev) => ({
                                  ...prev,
                                  [report.id]: {
                                    ...(prev[report.id] || {}),
                                    assignedDutyManagerId: e.target.value,
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

                          {normalizeLookup(report.managerStatus) === "follow_up" && (
                            <ActionButton
                              variant="danger"
                              onClick={() =>
                                updateManagerStatus(report.id, "closed", {
                                  managerNote: normalizeText(
                                    getManagementField(report, "managerNote")
                                  ),
                                })
                              }
                            >
                              {t.closeFollowUp}
                            </ActionButton>
                          )}
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
                                    <div key={item.id} style={{ color: "#7c2d12", fontSize: 14 }}>
                                      • {(language === "es" ? item.es : item.en) || item.en || item.es}
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
                              <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.7 }}>
                                <div>
                                  <strong>Company:</strong> {report.commentsCompany || "-"}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Employee:</strong> {report.commentsEmployee || "-"}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Manager:</strong>{" "}
                                  {getManagementField(report, "managerNote") || report.managerNote || "-"}
                                </div>
                              </div>
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
