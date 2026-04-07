import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
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

function getScoreValue(rating, weight) {
  if (rating === "exceeds") return Number(weight || 0);
  if (rating === "meets") return Number(weight || 0) * (2 / 3);
  if (rating === "below") return Number(weight || 0) * (1 / 3);
  return 0;
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

/* -------------------- Language -------------------- */

const LABELS = {
  en: {
    title: "Monthly Employee Performance Report",
    subtitle:
      "Supervisors complete the EPR by month and managers receive reports by employee folder with follow-up alerts.",
    supervisorTab: "Supervisor EPR",
    managerTab: "Manager Inbox",
    followUpTab: "Follow Up Alerts",
    language: "Language",
    month: "Month",
    employee: "Employee",
    template: "Template",
    evaluator: "Supervisor",
    department: "Department",
    hireDate: "Hire Date",
    commentsCompany: "Company Comments / Recommendations",
    commentsEmployee: "Employee Comments",
    saveReport: "Save Performance Report",
    score: "Final Score",
    status: "Status",
    followUpNeeded: "Follow Up Needed",
    questionsToFollow: "Questions Requiring Follow Up",
    receivedReports: "Received Reports",
    employeeFolder: "Employee Folder",
    managerAction: "Manager Action",
    approve: "Approve",
    markFollowUp: "Mark Follow Up",
    closeFollowUp: "Close Follow Up",
    openReport: "Open Report",
    noReports: "No reports found.",
    noAlerts: "No active alerts.",
    reportSaved: "Performance report saved successfully.",
    reportApproved: "Report approved successfully.",
    reportFollowUp: "Report marked for follow up.",
    followUpClosed: "Follow up closed successfully.",
    lowScoreAlert: "Low score alert",
    rating: "Rating",
    note: "Follow Up Note",
    exceeds: "Exceeds",
    meets: "Meets",
    below: "Does Not Meet",
    folderInfo: "Grouped by employee so managers can review processed reports.",
  },
  es: {
    title: "Reporte Mensual de Desempeño del Empleado",
    subtitle:
      "Los supervisores completan el EPR por mes y managers reciben los reportes por carpeta de empleado con alertas de seguimiento.",
    supervisorTab: "EPR Supervisor",
    managerTab: "Bandeja Manager",
    followUpTab: "Alertas de Seguimiento",
    language: "Idioma",
    month: "Mes",
    employee: "Empleado",
    template: "Formato",
    evaluator: "Supervisor",
    department: "Departamento",
    hireDate: "Fecha de Vinculación",
    commentsCompany: "Comentarios y Recomendaciones de la Empresa",
    commentsEmployee: "Comentarios del Empleado",
    saveReport: "Guardar Performance Report",
    score: "Puntuación Final",
    status: "Estado",
    followUpNeeded: "Requiere Seguimiento",
    questionsToFollow: "Preguntas que Requieren Seguimiento",
    receivedReports: "Reportes Recibidos",
    employeeFolder: "Carpeta del Empleado",
    managerAction: "Acción Manager",
    approve: "Aprobar",
    markFollowUp: "Marcar Seguimiento",
    closeFollowUp: "Cerrar Seguimiento",
    openReport: "Abrir Reporte",
    noReports: "No se encontraron reportes.",
    noAlerts: "No hay alertas activas.",
    reportSaved: "Performance report guardado correctamente.",
    reportApproved: "Reporte aprobado correctamente.",
    reportFollowUp: "Reporte marcado para seguimiento.",
    followUpClosed: "Seguimiento cerrado correctamente.",
    lowScoreAlert: "Alerta de puntuación baja",
    rating: "Calificación",
    note: "Nota de Seguimiento",
    exceeds: "Supera",
    meets: "Cumple",
    below: "No Cumple",
    folderInfo: "Agrupado por empleado para que managers revisen los reportes procesados.",
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
  {
    id: "11",
    es: "Demuestra disposición para desarrollar habilidades y asumir desafíos.",
    en: "Shows willingness to develop skills and take on challenges.",
    weight: 3,
  },
  {
    id: "12",
    es: "Tiene habilidades de comunicación efectivas y eficientes.",
    en: "Has effective and efficient communication skills.",
    weight: 3,
  },
  {
    id: "13",
    es: "Tiene habilidades organizativas y usa el tiempo de manera efectiva.",
    en: "Has organizational skills and uses time effectively.",
    weight: 3,
  },
  {
    id: "14",
    es: "Mantiene confidencialidad y no discute eventos internos.",
    en: "Maintains confidentiality and does not discuss internal matters.",
    weight: 3,
  },
  {
    id: "15",
    es: "Proyecta apariencia profesional y correcto uso del uniforme.",
    en: "Maintains a professional appearance and proper uniform use.",
    weight: 3,
  },
  {
    id: "16",
    es: "Mantiene el área de trabajo ordenada y limpia.",
    en: "Keeps the work area organized and clean.",
    weight: 3,
  },
  {
    id: "17",
    es: "Busca métodos constructivos para resolver problemas o conflictos.",
    en: "Uses constructive methods to resolve problems or conflicts.",
    weight: 3,
  },
  {
    id: "18",
    es: "Contribuye a un entorno seguro siguiendo procedimientos de seguridad.",
    en: "Contributes to a safe environment by following safety procedures.",
    weight: 3,
  },
  {
    id: "19",
    es: "Muestra conocimiento del trabajo sobre procesos y procedimientos.",
    en: "Demonstrates job knowledge of processes and procedures.",
    weight: 3,
  },
  {
    id: "20",
    es: "Comprende normativas y realiza tareas de forma adecuada.",
    en: "Understands rules and completes tasks correctly.",
    weight: 3,
  },
  {
    id: "21",
    es: "Usa suministros buscando eficiencia de costos y buen manejo de inventario.",
    en: "Uses supplies efficiently and supports proper inventory control.",
    weight: 3,
  },
  {
    id: "22",
    es: "Está disponible para trabajar cualquier turno según la operación.",
    en: "Is available to work any shift required by the operation.",
    weight: 3,
  },
];

const TEMPLATE_MAP = {
  wchr: {
    key: "wchr",
    label: "WCHR Service",
    role: "WCHR Agent",
    department: "WCHR Service",
    questions: [
      ...COMMON_QUESTIONS,
      {
        id: "23",
        es: "Hace uso individualizado de credenciales y navega eficazmente por sistemas informáticos necesarios.",
        en: "Uses credentials individually and navigates required systems effectively.",
        weight: 5,
      },
      {
        id: "24",
        es: "Es profesional y usa técnicas de comunicación en anuncios, orientación y atención telefónica.",
        en: "Uses professional communication techniques in announcements, guidance, and phone support.",
        weight: 5,
      },
      {
        id: "25",
        es: "Realiza asistencia a pasajeros WCHR con trato humano, empatía y respeto.",
        en: "Provides WCHR passenger assistance with empathy, dignity, and respect.",
        weight: 4,
      },
      {
        id: "26",
        es: "Aplica correctamente procedimientos de seguridad, movilización y acompañamiento del pasajero.",
        en: "Correctly applies safety, mobility, and passenger escort procedures.",
        weight: 4,
      },
      {
        id: "27",
        es: "Coordina con rampa, seguridad, gate, cabina y conexiones para asegurar asistencia continua.",
        en: "Coordinates with ramp, security, gate, cabin, and connections for continuous support.",
        weight: 4,
      },
      {
        id: "28",
        es: "Verifica documentación, tiempos de conexión y necesidades especiales antes del servicio.",
        en: "Checks documentation, connection times, and special needs before service.",
        weight: 4,
      },
      {
        id: "29",
        es: "Utiliza sillas de ruedas y equipos de apoyo de forma segura y reporta novedades.",
        en: "Uses wheelchairs and support equipment safely and reports issues.",
        weight: 4,
      },
      {
        id: "30",
        es: "Mantiene control de tiempos, relevos y entrega del pasajero al área correspondiente.",
        en: "Maintains timing, handoff, and passenger delivery to the correct area.",
        weight: 4,
      },
    ],
  },
  baggage: {
    key: "baggage",
    label: "Baggage Handling",
    role: "Baggage Handler",
    department: "Baggage Handling",
    questions: [
      ...COMMON_QUESTIONS,
      {
        id: "23",
        es: "Prepara equipos, impresoras, dispositivos KIKO y teléfonos para la operación.",
        en: "Prepares equipment, printers, KIKO devices, and phones for the operation.",
        weight: 4,
      },
      {
        id: "24",
        es: "Hace uso individualizado de credenciales y sistemas necesarios.",
        en: "Uses credentials individually and works correctly in required systems.",
        weight: 4,
      },
      {
        id: "25",
        es: "Es profesional y utiliza técnicas de comunicación de manera exitosa.",
        en: "Uses professional communication techniques successfully.",
        weight: 4,
      },
      {
        id: "26",
        es: "Realiza carga, descarga y clasificación de equipaje siguiendo prioridades operacionales.",
        en: "Loads, unloads, and sorts baggage following operational priorities.",
        weight: 4,
      },
      {
        id: "27",
        es: "Manipula equipaje de manera segura para evitar daños, pérdidas y reclamaciones.",
        en: "Handles baggage safely to prevent damage, loss, and claims.",
        weight: 4,
      },
      {
        id: "28",
        es: "Identifica y procesa correctamente equipaje rush, transfer, priority y odd-size.",
        en: "Correctly identifies and processes rush, transfer, priority, and odd-size baggage.",
        weight: 4,
      },
      {
        id: "29",
        es: "Cumple procedimientos de seguridad en rampa y belt area.",
        en: "Follows ramp and belt-area safety procedures.",
        weight: 4,
      },
      {
        id: "30",
        es: "Garantiza envío oportuno de equipaje al claim, conexiones o warehouse.",
        en: "Ensures timely baggage movement to claim, connections, or warehouse.",
        weight: 3,
      },
      {
        id: "31",
        es: "Mantiene control y cuidado de equipos y herramientas de trabajo.",
        en: "Maintains control and care of equipment and tools.",
        weight: 3,
      },
    ],
  },
  passenger: {
    key: "passenger",
    label: "Passenger Service",
    role: "Passenger Service Agent",
    department: "Passenger Service",
    questions: [
      ...COMMON_QUESTIONS,
      {
        id: "23",
        es: "Hace uso individualizado de credenciales y navega eficazmente por sistemas.",
        en: "Uses credentials individually and navigates systems effectively.",
        weight: 5,
      },
      {
        id: "24",
        es: "Es profesional y utiliza con éxito técnicas de comunicación con clientes.",
        en: "Uses professional communication techniques successfully with customers.",
        weight: 5,
      },
      {
        id: "25",
        es: "Realiza check-in, documentación y validaciones con precisión.",
        en: "Performs check-in, documentation, and validations accurately.",
        weight: 4,
      },
      {
        id: "26",
        es: "Atiende casos especiales y resuelve situaciones del pasajero correctamente.",
        en: "Handles special cases and resolves passenger situations correctly.",
        weight: 4,
      },
      {
        id: "27",
        es: "Orienta a pasajeros sobre políticas, documentación, exceso de equipaje y proceso.",
        en: "Guides passengers on policies, documents, excess baggage, and process.",
        weight: 4,
      },
      {
        id: "28",
        es: "Realiza preguntas de seguridad, etiquetado y cobros aplicables con precisión.",
        en: "Handles security questions, tagging, and applicable charges accurately.",
        weight: 4,
      },
      {
        id: "29",
        es: "Mantiene counter, lobby y áreas de atención organizadas y listas para la operación.",
        en: "Keeps counter, lobby, and service areas organized and operation-ready.",
        weight: 4,
      },
      {
        id: "30",
        es: "Domina sistemas y procedimientos de servicio al pasajero para casos especiales.",
        en: "Demonstrates strong knowledge of passenger service systems and procedures.",
        weight: 4,
      },
    ],
  },
  gate: {
    key: "gate",
    label: "Gate Agent",
    role: "Gate Agent",
    department: "Passenger Service - Gate",
    questions: [
      ...COMMON_QUESTIONS,
      {
        id: "23",
        es: "Hace uso individualizado de credenciales y sistemas necesarios en gate.",
        en: "Uses credentials individually and works properly in gate systems.",
        weight: 5,
      },
      {
        id: "24",
        es: "Realiza anuncios y manejo de puerta con comunicación profesional.",
        en: "Handles gate announcements and communication professionally.",
        weight: 5,
      },
      {
        id: "25",
        es: "Ejecuta procesos de abordaje correctamente respetando prioridades y seguridad.",
        en: "Executes boarding correctly while respecting priorities and safety.",
        weight: 4,
      },
      {
        id: "26",
        es: "Controla documentos, conteos y validaciones antes del cierre de vuelo.",
        en: "Controls documents, counts, and validations before flight closure.",
        weight: 4,
      },
      {
        id: "27",
        es: "Maneja cambios, demoras y irregularidades manteniendo control y servicio.",
        en: "Handles changes, delays, and irregular operations with control and service focus.",
        weight: 4,
      },
      {
        id: "28",
        es: "Coordina eficientemente con crew, operations, ramp y customer service.",
        en: "Coordinates efficiently with crew, operations, ramp, and customer service.",
        weight: 4,
      },
      {
        id: "29",
        es: "Maneja stand-by, UMNR, WCHR, conexiones y casos especiales correctamente.",
        en: "Handles stand-by, UMNR, WCHR, connections, and special cases correctly.",
        weight: 4,
      },
      {
        id: "30",
        es: "Completa documentación de puerta y reportes post-embarque con exactitud.",
        en: "Completes gate documentation and post-boarding reports accurately.",
        weight: 4,
      },
    ],
  },
};

/* -------------------- Main page -------------------- */

export default function MonthlyEmployeePerformanceReportPage() {
  const { user } = useUser();

  const canSupervisor =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManager =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [tab, setTab] = useState("supervisor");
  const [language, setLanguage] = useState("en");
  const t = LABELS[language];

  const [employees, setEmployees] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState("");

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [form, setForm] = useState({
    employeeId: "",
    employeeName: "",
    month: getCurrentMonthValue(),
    templateKey: "wchr",
    department: "",
    roleTitle: "",
    hireDate: "",
    commentsCompany: "",
    commentsEmployee: "",
  });

  const activeTemplate = TEMPLATE_MAP[form.templateKey];
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [employeesSnap, reportsSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(query(collection(db, "employeePerformanceReports"), orderBy("createdAt", "desc"))),
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
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const reportRows = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setEmployees(employeeRows);
        setReports(reportRows);
      } catch (err) {
        console.error("Error loading performance report data:", err);
        setStatusMessage("Could not load performance report data.");
      } finally {
        setLoading(false);
      }
    }

    if (canSupervisor || canManager) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canSupervisor, canManager]);

  useEffect(() => {
    const template = TEMPLATE_MAP[form.templateKey];
    setForm((prev) => ({
      ...prev,
      department: template.department,
      roleTitle: template.role,
    }));

    const nextAnswers = {};
    template.questions.forEach((q) => {
      nextAnswers[q.id] = answers[q.id] || { rating: "", note: "" };
    });
    setAnswers(nextAnswers);
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
    return activeTemplate.questions.reduce((sum, q) => {
      const answer = answers[q.id];
      return sum + getScoreValue(answer?.rating, q.weight);
    }, 0);
  }, [answers, activeTemplate]);

  const followUpItems = useMemo(() => {
    return getFollowUpItems(answers, activeTemplate.questions);
  }, [answers, activeTemplate]);

  const needsFollowUp = calculatedScore < 70 || followUpItems.length > 0;

  const groupedReportsByEmployee = useMemo(() => {
    const map = {};

    reports.forEach((report) => {
      const employeeName = report.employeeName || "Unknown Employee";
      if (!map[employeeName]) {
        map[employeeName] = [];
      }
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
  }, [reports]);

  const alertReports = useMemo(() => {
    return reports.filter(
      (report) =>
        report.needsFollowUp === true &&
        String(report.managerStatus || "").toLowerCase() !== "closed"
    );
  }, [reports]);

  const selectedReport = useMemo(() => {
    return reports.find((r) => r.id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  function handleAnswerChange(questionId, field, value) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {}),
        [field]: value,
      },
    }));
  }

  async function handleSaveReport() {
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
        managerStatus: needsFollowUp ? "follow_up" : "submitted",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

      setStatusMessage(t.reportSaved);

      setForm((prev) => ({
        ...prev,
        commentsCompany: "",
        commentsEmployee: "",
      }));

      const resetAnswers = {};
      activeTemplate.questions.forEach((q) => {
        resetAnswers[q.id] = { rating: "", note: "" };
      });
      setAnswers(resetAnswers);
      setSelectedReportId(ref.id);
    } catch (err) {
      console.error("Error saving performance report:", err);
      setStatusMessage("Could not save performance report.");
    } finally {
      setSaving(false);
    }
  }

  async function updateManagerStatus(reportId, nextStatus) {
    try {
      await updateDoc(doc(db, "employeePerformanceReports", reportId), {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                managerStatus: nextStatus,
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
              }
            : item
        )
      );

      if (nextStatus === "approved") setStatusMessage(t.reportApproved);
      if (nextStatus === "follow_up") setStatusMessage(t.reportFollowUp);
      if (nextStatus === "closed") setStatusMessage(t.followUpClosed);
    } catch (err) {
      console.error("Error updating manager status:", err);
      setStatusMessage("Could not update manager status.");
    }
  }

  if (!canSupervisor && !canManager) {
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
            maxWidth: 900,
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
            {canSupervisor && (
              <TabButton
                active={tab === "supervisor"}
                onClick={() => setTab("supervisor")}
              >
                {t.supervisorTab}
              </TabButton>
            )}

            {canManager && (
              <>
                <TabButton
                  active={tab === "manager"}
                  onClick={() => setTab("manager")}
                >
                  {t.managerTab}
                </TabButton>

                <TabButton
                  active={tab === "alerts"}
                  onClick={() => setTab("alerts")}
                >
                  {t.followUpTab}
                </TabButton>
              </>
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

      {tab === "supervisor" && canSupervisor && (
        <>
          <PageCard style={{ padding: 22 }}>
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
                  {Object.values(TEMPLATE_MAP).map((item) => (
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

            <div style={{ marginTop: 18 }}>
              <ActionButton
                variant="primary"
                onClick={handleSaveReport}
                disabled={saving}
              >
                {saving ? "Saving..." : t.saveReport}
              </ActionButton>
            </div>
          </PageCard>
        </>
      )}

      {tab === "manager" && canManager && (
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
              {t.receivedReports}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {t.folderInfo}
            </p>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : Object.keys(groupedReportsByEmployee).length === 0 ? (
            <div>{t.noReports}</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {Object.entries(groupedReportsByEmployee).map(([employeeName, items]) => (
                <div
                  key={employeeName}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 20,
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
                          fontSize: 18,
                          fontWeight: 800,
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
                        {t.employeeFolder} · {items.length} report(s)
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    {items.map((report) => (
                      <div
                        key={report.id}
                        style={{
                          border: "1px solid #dbeafe",
                          borderRadius: 16,
                          padding: 14,
                          background:
                            selectedReportId === report.id ? "#edf7ff" : "#f8fbff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
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
                              {report.templateLabel} · {formatMonthValue(report.month)}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 13,
                                color: "#64748b",
                              }}
                            >
                              Supervisor: {report.supervisorName || "-"} ·{" "}
                              {formatDateTime(report.createdAt)}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <ActionButton
                              variant="secondary"
                              onClick={() => setSelectedReportId(report.id)}
                            >
                              {t.openReport}
                            </ActionButton>

                            <ActionButton
                              variant="success"
                              onClick={() => updateManagerStatus(report.id, "approved")}
                            >
                              {t.approve}
                            </ActionButton>

                            <ActionButton
                              variant="warning"
                              onClick={() => updateManagerStatus(report.id, "follow_up")}
                            >
                              {t.markFollowUp}
                            </ActionButton>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
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
                              String(report.managerStatus || "").toLowerCase() === "approved"
                                ? "green"
                                : String(report.managerStatus || "").toLowerCase() === "follow_up"
                                ? "amber"
                                : "blue"
                            }
                          />
                        </div>

                        {selectedReportId === report.id && (
                          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
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
                                      • {item.es || item.en}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ color: "#64748b", fontSize: 14 }}>No follow up items.</div>
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
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>
      )}

      {tab === "alerts" && canManager && (
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

          {alertReports.length === 0 ? (
            <div>{t.noAlerts}</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {alertReports.map((report) => (
                <div
                  key={report.id}
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
                          color: "#7c2d12",
                        }}
                      >
                        {report.employeeName} · {report.templateLabel}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#9a3412",
                        }}
                      >
                        {formatMonthValue(report.month)} · Score {formatScore(report.score)} / 100
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
                        variant="success"
                        onClick={() => updateManagerStatus(report.id, "closed")}
                      >
                        {t.closeFollowUp}
                      </ActionButton>
                    </div>
                  </div>

                  {Array.isArray(report.followUpItems) && report.followUpItems.length > 0 && (
                    <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                      {report.followUpItems.map((item) => (
                        <div key={item.id} style={{ fontSize: 14, color: "#7c2d12" }}>
                          • {item.es || item.en}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PageCard>
      )}
    </div>
  );
}
