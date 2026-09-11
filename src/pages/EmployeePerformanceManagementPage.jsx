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
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

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
        minHeight: 100,
        fontFamily: "inherit",
        ...props.style,
      }}
    />
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
      boxShadow: "0 12px 24px rgba(15,23,42,0.18)",
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
    <div style={{ display: "flex", justifyContent: "center" }}>
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

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
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
    if (typeof value === "string") {
      return new Date(value).toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}


function toDateObject(value) {
  if (!value) return null;

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

function toDateTimeLocalValue(value) {
  const date = toDateObject(value);
  if (!date) return "";

  const pad = (number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateTimeLocalToDate(value) {
  const clean = String(value || "").trim();
  if (!clean) return null;

  const date = new Date(clean);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeLocalToIso(value) {
  const date = dateTimeLocalToDate(value);
  return date ? date.toISOString() : "";
}

function getEmployeeLoginName(employee) {
  return (
    employee?.loginUsername ||
    employee?.username ||
    employee?.userName ||
    ""
  );
}

function getAnyUserName(record) {
  return (
    record?.displayName ||
    record?.fullName ||
    record?.name ||
    record?.employeeName ||
    record?.username ||
    record?.loginUsername ||
    ""
  );
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function getPerformanceTone(score) {
  const n = Number(score || 0);
  if (n >= 85) return "green";
  if (n >= 70) return "blue";
  return "red";
}

function getStatusTone(status) {
  const s = String(status || "").toLowerCase();
  if (
    s === "approved" ||
    s === "recognized" ||
    s === "closed" ||
    s === "follow_up_completed"
  ) {
    return "green";
  }
  if (
    s === "follow_up" ||
    s === "follow_up_assigned" ||
    s === "follow_up_in_progress" ||
    s === "follow_up_resubmitted" ||
    s === "returned_to_supervisor"
  ) {
    return "amber";
  }
  if (s === "draft") return "default";
  return "blue";
}

function getStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "submitted") return "Submitted";
  if (s === "approved") return "Approved";
  if (s === "follow_up") return "Follow Up";
  if (s === "recognized") return "Recognized";
  if (s === "closed") return "Closed";
  if (s === "draft") return "Draft";
  if (s === "returned_to_supervisor") return "Returned to Supervisor";
  if (s === "follow_up_assigned") return "Follow Up Assigned";
  if (s === "follow_up_in_progress") return "Follow Up In Progress";
  if (s === "follow_up_resubmitted") return "Resubmitted to Manager";
  if (s === "follow_up_completed") return "Follow Up Completed";
  return status || "-";
}

function safeText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getRatingLabel(value) {
  const v = String(value || "").toLowerCase();
  if (v === "exceeds") return "Exceeds";
  if (v === "meets") return "Meets";
  if (v === "below") return "Does Not Meet";
  return "-";
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

const COMMON_QUESTIONS = [
  { id: "1", en: "Accepts responsibility for actions and responds to consequences.", weight: 3 },
  { id: "2", en: "Is rarely absent, arrives on time, and works required hours.", weight: 3 },
  { id: "3", en: "Works cooperatively with coworkers and management.", weight: 3 },
  { id: "4", en: "Shows initiative, optimism, and courtesy in an active and respectful way.", weight: 3 },
  { id: "5", en: "Learns from feedback, follows instructions, and adjusts behavior.", weight: 3 },
  { id: "6", en: "Responds well to changing situations and expectations.", weight: 3 },
  { id: "7", en: "Follows organizational policies and procedures.", weight: 3 },
  { id: "8", en: "Completes duties and job tasks on time.", weight: 3 },
  { id: "9", en: "Provides high-quality service with respect and kindness.", weight: 3 },
  { id: "10", en: "Is thorough, accurate, and clean in the work performed.", weight: 3 },
  { id: "11", en: "Shows willingness to develop skills and take on challenges.", weight: 3 },
  { id: "12", en: "Has effective and efficient communication skills.", weight: 3 },
  { id: "13", en: "Has organizational skills and uses time effectively.", weight: 3 },
  { id: "14", en: "Maintains confidentiality and does not discuss internal matters.", weight: 3 },
  { id: "15", en: "Maintains a professional appearance and proper uniform use.", weight: 3 },
  { id: "16", en: "Keeps the work area organized and clean.", weight: 3 },
  { id: "17", en: "Uses constructive methods to resolve problems or conflicts.", weight: 3 },
  { id: "18", en: "Contributes to a safe environment by following safety procedures.", weight: 3 },
  { id: "19", en: "Demonstrates job knowledge of processes and procedures.", weight: 3 },
  { id: "20", en: "Understands rules and completes tasks correctly.", weight: 3 },
  { id: "21", en: "Uses supplies efficiently and supports proper inventory control.", weight: 3 },
  { id: "22", en: "Is available to work any shift required by the operation.", weight: 3 },
];

const TEMPLATE_MAP = {
  wchr: {
    questions: [
      ...COMMON_QUESTIONS,
      { id: "23", en: "Uses credentials individually and navigates required systems effectively.", weight: 5 },
      { id: "24", en: "Uses professional communication techniques in announcements, guidance, and phone support.", weight: 5 },
      { id: "25", en: "Provides WCHR passenger assistance with empathy, dignity, and respect.", weight: 4 },
      { id: "26", en: "Correctly applies safety, mobility, and passenger escort procedures.", weight: 4 },
      { id: "27", en: "Coordinates with ramp, security, gate, cabin, and connections for continuous support.", weight: 4 },
      { id: "28", en: "Checks documentation, connection times, and special needs before service.", weight: 4 },
      { id: "29", en: "Uses wheelchairs and support equipment safely and reports issues.", weight: 4 },
      { id: "30", en: "Maintains timing, handoff, and passenger delivery to the correct area.", weight: 4 },
    ],
  },
  baggage: {
    questions: [
      ...COMMON_QUESTIONS,
      { id: "23", en: "Prepares equipment, printers, KIKO devices, and phones for the operation.", weight: 4 },
      { id: "24", en: "Uses credentials individually and works correctly in required systems.", weight: 4 },
      { id: "25", en: "Uses professional communication techniques successfully.", weight: 4 },
      { id: "26", en: "Loads, unloads, and sorts baggage following operational priorities.", weight: 4 },
      { id: "27", en: "Handles baggage safely to prevent damage, loss, and claims.", weight: 4 },
      { id: "28", en: "Correctly identifies and processes rush, transfer, priority, and odd-size baggage.", weight: 4 },
      { id: "29", en: "Follows ramp and belt-area safety procedures.", weight: 4 },
      { id: "30", en: "Ensures timely baggage movement to claim, connections, or warehouse.", weight: 3 },
      { id: "31", en: "Maintains control and care of equipment and tools.", weight: 3 },
    ],
  },
  passenger: {
    questions: [
      ...COMMON_QUESTIONS,
      { id: "23", en: "Uses credentials individually and navigates systems effectively.", weight: 5 },
      { id: "24", en: "Uses professional communication techniques successfully with customers.", weight: 5 },
      { id: "25", en: "Performs check-in, documentation, and validations accurately.", weight: 4 },
      { id: "26", en: "Handles special cases and resolves passenger situations correctly.", weight: 4 },
      { id: "27", en: "Guides passengers on policies, documents, excess baggage, and process.", weight: 4 },
      { id: "28", en: "Handles security questions, tagging, and applicable charges accurately.", weight: 4 },
      { id: "29", en: "Keeps counter, lobby, and service areas organized and operation-ready.", weight: 4 },
      { id: "30", en: "Demonstrates strong knowledge of passenger service systems and procedures.", weight: 4 },
    ],
  },
  gate: {
    questions: [
      ...COMMON_QUESTIONS,
      { id: "23", en: "Uses credentials individually and works properly in gate systems.", weight: 5 },
      { id: "24", en: "Handles gate announcements and communication professionally.", weight: 5 },
      { id: "25", en: "Executes boarding correctly while respecting priorities and safety.", weight: 4 },
      { id: "26", en: "Controls documents, counts, and validations before flight closure.", weight: 4 },
      { id: "27", en: "Handles changes, delays, and irregular operations with control and service focus.", weight: 4 },
      { id: "28", en: "Coordinates efficiently with crew, operations, ramp, and customer service.", weight: 4 },
      { id: "29", en: "Handles stand-by, UMNR, WCHR, connections, and special cases correctly.", weight: 4 },
      { id: "30", en: "Completes gate documentation and post-boarding reports accurately.", weight: 4 },
    ],
  },
};

function getQuestionsForReport(report) {
  if (
    Array.isArray(report?.questionsSnapshot) &&
    report.questionsSnapshot.length > 0
  ) {
    return report.questionsSnapshot;
  }

  const templateKey = String(report?.templateKey || "").toLowerCase();
  return TEMPLATE_MAP[templateKey]?.questions || [];
}

function cloneReportForEdit(report) {
  return {
    employeeName: report?.employeeName || "",
    department: report?.department || "",
    roleTitle: report?.roleTitle || "",
    commentsCompany: report?.commentsCompany || "",
    commentsEmployee: report?.commentsEmployee || "",
    needsFollowUp: Boolean(report?.needsFollowUp),
    managerNote: report?.managerNote || "",
    returnReason: report?.returnReason || "",
    submittedAtLocal: toDateTimeLocalValue(report?.createdAt),
    answers: JSON.parse(JSON.stringify(report?.answers || {})),
    followUpItems: Array.isArray(report?.followUpItems)
      ? report.followUpItems.map((item) => ({
          id: item?.id || "",
          en: item?.en || "",
          es: item?.es || "",
          note: item?.note || "",
        }))
      : [],
    followUpHistory: Array.isArray(report?.followUpHistory)
      ? report.followUpHistory.map((item) => ({
          ...item,
          createdAtLocal: toDateTimeLocalValue(item?.createdAt),
        }))
      : [],
  };
}

export default function EmployeePerformanceManagementPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("blue");
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [selectedDutyManagerId, setSelectedDutyManagerId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [platformUsers, setPlatformUsers] = useState([]);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const [expandedSupervisors, setExpandedSupervisors] = useState({});
  const [expandedEmployees, setExpandedEmployees] = useState({});

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [filters, setFilters] = useState({
    month: getCurrentMonthValue(),
    department: "all",
    employee: "all",
    supervisor: "all",
    managerStatus: "all",
    followUp: "all",
    scoreBand: "all",
  });

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
        const [reportsSnap, employeesSnap, usersSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "employeePerformanceReports"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "users")),
        ]);

        const rows = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const employeeRows = employeesSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter((emp) => emp.active !== false);

        const userRows = usersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
        setEmployees(employeeRows);
        setPlatformUsers(userRows);
      } catch (err) {
        console.error("Error loading EPR management:", err);
        setStatusMessage("Could not load performance reports.");
        setStatusTone("red");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const dutyManagers = useMemo(() => {
    return employees
      .filter((emp) => isDutyManagerUser(emp))
      .map((emp) => {
        const employeeName =
          emp.name ||
          emp.fullName ||
          emp.employeeName ||
          emp.displayName ||
          emp.username ||
          "Unnamed Duty Manager";

        const employeeUsername = normalizeRoleLike(getEmployeeLoginName(emp));
        const employeeNameNormalized = normalizeRoleLike(employeeName);

        const matchingUser =
          platformUsers.find((platformUser) => {
            const userEmployeeId = String(
              platformUser?.employeeId ||
                platformUser?.employee_id ||
                ""
            ).trim();

            if (userEmployeeId && userEmployeeId === emp.id) {
              return true;
            }

            const platformUsername = normalizeRoleLike(
              platformUser?.username || platformUser?.loginUsername || ""
            );

            if (
              employeeUsername &&
              platformUsername &&
              employeeUsername === platformUsername
            ) {
              return true;
            }

            const platformName = normalizeRoleLike(getAnyUserName(platformUser));

            return (
              employeeNameNormalized &&
              platformName &&
              employeeNameNormalized === platformName
            );
          }) || null;

        return {
          id: emp.id,
          name: employeeName,
          username:
            getEmployeeLoginName(emp) ||
            matchingUser?.username ||
            matchingUser?.loginUsername ||
            "",
          notificationUserId:
            emp.userId ||
            emp.user_id ||
            emp.linkedUserId ||
            emp.authUserId ||
            matchingUser?.id ||
            "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, platformUsers]);

  const departmentOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      const dept = safeText(r.department);
      if (dept) set.add(dept);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const employeeOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      const name = safeText(r.employeeName);
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const supervisorOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => {
      const name = safeText(r.supervisorName);
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filters.month !== "all" && report.month !== filters.month) return false;

      if (
        filters.department !== "all" &&
        safeText(report.department) !== filters.department
      ) {
        return false;
      }

      if (
        filters.employee !== "all" &&
        safeText(report.employeeName) !== filters.employee
      ) {
        return false;
      }

      if (
        filters.supervisor !== "all" &&
        safeText(report.supervisorName) !== filters.supervisor
      ) {
        return false;
      }

      if (
        filters.managerStatus !== "all" &&
        String(report.managerStatus || "submitted").toLowerCase() !==
          filters.managerStatus
      ) {
        return false;
      }

      if (filters.followUp === "yes" && report.needsFollowUp !== true) return false;
      if (filters.followUp === "no" && report.needsFollowUp === true) return false;

      const score = Number(report.score || 0);
      if (filters.scoreBand === "low" && score >= 70) return false;
      if (filters.scoreBand === "mid" && (score < 70 || score >= 85)) return false;
      if (filters.scoreBand === "high" && score < 85) return false;

      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return (
      reports.find((r) => r.id === selectedReportId) ||
      filteredReports.find((r) => r.id === selectedReportId) ||
      null
    );
  }, [reports, filteredReports, selectedReportId]);

  useEffect(() => {
    if (selectedReport) {
      setManagerNote(selectedReport.managerNote || "");
      setReturnReason(selectedReport.returnReason || "");
      setSelectedDutyManagerId(
        selectedReport.followUpDutyManagerId ||
          selectedReport.assignedDutyManagerId ||
          ""
      );
      setIsEditingReport(false);
      setEditForm(null);
    } else {
      setManagerNote("");
      setReturnReason("");
      setSelectedDutyManagerId("");
      setIsEditingReport(false);
      setEditForm(null);
    }
  }, [selectedReport]);

  const totals = useMemo(() => {
    const total = filteredReports.length;
    const followUps = filteredReports.filter((r) => r.needsFollowUp === true).length;
    const approved = filteredReports.filter((r) =>
      ["approved", "recognized", "closed"].includes(
        String(r.managerStatus || "").toLowerCase()
      )
    ).length;
    const avgScore =
      total > 0
        ? filteredReports.reduce((sum, r) => sum + Number(r.score || 0), 0) / total
        : 0;

    return {
      total,
      followUps,
      approved,
      avgScore,
    };
  }, [filteredReports]);

  const groupedBySupervisor = useMemo(() => {
    const map = {};

    filteredReports.forEach((report) => {
      const supervisor = safeText(report.supervisorName) || "No Supervisor";
      const employee = safeText(report.employeeName) || "Unknown Employee";

      if (!map[supervisor]) {
        map[supervisor] = {
          supervisorName: supervisor,
          supervisorId: report.supervisorId || "",
          employees: {},
          totalReports: 0,
        };
      }

      if (!map[supervisor].employees[employee]) {
        map[supervisor].employees[employee] = [];
      }

      map[supervisor].employees[employee].push(report);
      map[supervisor].totalReports += 1;
    });

    return Object.values(map)
      .sort((a, b) => a.supervisorName.localeCompare(b.supervisorName))
      .map((group) => ({
        ...group,
        employees: Object.entries(group.employees)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([employeeName, employeeReports]) => ({
            employeeName,
            reports: employeeReports.sort((a, b) => {
              const monthA = String(a.month || "");
              const monthB = String(b.month || "");
              if (monthA !== monthB) return monthB.localeCompare(monthA);
              const dateA =
                typeof a?.createdAt?.toDate === "function"
                  ? a.createdAt.toDate().getTime()
                  : new Date(a?.createdAt || 0).getTime();
              const dateB =
                typeof b?.createdAt?.toDate === "function"
                  ? b.createdAt.toDate().getTime()
                  : new Date(b?.createdAt || 0).getTime();
              return dateB - dateA;
            }),
          })),
      }));
  }, [filteredReports]);

  async function updateManagerStatus(reportId, nextStatus, extra = {}) {
    try {
      setSavingId(reportId);

      const currentReport = reports.find((r) => r.id === reportId);
      const history = Array.isArray(currentReport?.followUpHistory)
        ? [...currentReport.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry(
          nextStatus,
          user,
          extra?.managerNote || managerNote || ""
        )
      );

      await updateDoc(doc(db, "employeePerformanceReports", reportId), {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        managerNote: managerNote || "",
        followUpHistory: history,
        updatedAt: serverTimestamp(),
        ...extra,
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                managerStatus: nextStatus,
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                managerNote: managerNote || "",
                followUpHistory: history,
                updatedAt: new Date(),
                ...extra,
              }
            : item
        )
      );

      setStatusMessage(`Report updated to ${getStatusLabel(nextStatus)}.`);
      setStatusTone("green");
    } catch (err) {
      console.error("Error updating EPR manager status:", err);
      setStatusMessage("Could not update report.");
      setStatusTone("red");
    } finally {
      setSavingId("");
    }
  }

  async function returnToSupervisor(report) {
    const reason = normalizeText(returnReason);
    if (!reason) {
      setStatusMessage("You must write the reason for return.");
      setStatusTone("red");
      return;
    }

    try {
      setSavingId(report.id);

      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(buildHistoryEntry("returned_to_supervisor", user, reason));

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "returned_to_supervisor",
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        managerNote: managerNote || "",
        returnReason: reason,
        returnedBy: getVisibleUserName(user),
        returnedAt: serverTimestamp(),
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "returned_to_supervisor",
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                managerNote: managerNote || "",
                returnReason: reason,
                returnedBy: getVisibleUserName(user),
                returnedAt: new Date(),
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Returned correctly to supervisor.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error returning report:", err);
      setStatusMessage("Could not return report.");
      setStatusTone("red");
    } finally {
      setSavingId("");
    }
  }

  async function assignDutyManagerForFollowUp(report) {
    if (!selectedDutyManagerId) {
      setStatusMessage("Select a duty manager first.");
      setStatusTone("red");
      return;
    }

    try {
      setSavingId(report.id);

      const duty = dutyManagers.find(
        (item) => item.id === selectedDutyManagerId
      );

      if (!duty) {
        setStatusMessage("Could not find the selected duty manager.");
        setStatusTone("red");
        return;
      }

      const history = Array.isArray(report?.followUpHistory)
        ? [...report.followUpHistory]
        : [];

      history.push(
        buildHistoryEntry("follow_up_assigned", user, managerNote, {
          dutyManagerId: selectedDutyManagerId,
          dutyManagerName: duty?.name || "",
        })
      );

      await updateDoc(doc(db, "employeePerformanceReports", report.id), {
        managerStatus: "follow_up_assigned",
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        managerNote: managerNote || "",
        followUpDutyManagerId: selectedDutyManagerId,
        followUpDutyManagerName: duty?.name || "",
        assignedDutyManagerId: selectedDutyManagerId,
        assignedDutyManagerName: duty?.name || "",
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

      let notificationSent = false;
      let notificationWarning = "";

      if (duty.notificationUserId) {
        try {
          const employeeName = report?.employeeName || "Employee";
          const monthLabel = formatMonthValue(report?.month);

          const notificationPayload = {
            userId: duty.notificationUserId,
            read: false,
            type: "employee_performance_follow_up_assigned",
            title: "Employee Performance Follow Up Assigned",
            message: `${getVisibleUserName(
              user
            )} assigned you an Employee Performance follow-up for ${employeeName} (${monthLabel}).`,
            body: `${getVisibleUserName(
              user
            )} assigned you an Employee Performance follow-up for ${employeeName} (${monthLabel}).`,
            link: "/employee-performance-management",
            route: "/employee-performance-management",
            path: "/employee-performance-management",
            reportId: report.id,
            employeeName,
            month: report?.month || "",
            assignedDutyManagerId: selectedDutyManagerId,
            assignedDutyManagerName: duty?.name || "",
            assignedByUserId: user?.id || "",
            assignedByName: getVisibleUserName(user),
            createdAt: serverTimestamp(),
          };

          await addDoc(collection(db, "notifications"), notificationPayload);
          notificationSent = true;
        } catch (notificationError) {
          console.error(
            "Error sending duty manager assignment notification:",
            notificationError
          );
          notificationWarning =
            " The case was assigned, but the notification could not be created.";
        }
      } else {
        notificationWarning =
          " The case was assigned, but this Duty Manager is not linked to a platform user ID, so no notification was created.";
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                managerStatus: "follow_up_assigned",
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                managerNote: managerNote || "",
                followUpDutyManagerId: selectedDutyManagerId,
                followUpDutyManagerName: duty?.name || "",
                assignedDutyManagerId: selectedDutyManagerId,
                assignedDutyManagerName: duty?.name || "",
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage(
        notificationSent
          ? `Duty manager assigned and notification sent to ${duty.name}.`
          : `Duty manager assigned correctly.${notificationWarning}`
      );
      setStatusTone(notificationSent ? "green" : "amber");
    } catch (err) {
      console.error("Error assigning duty manager:", err);
      setStatusMessage("Could not assign duty manager.");
      setStatusTone("red");
    } finally {
      setSavingId("");
    }
  }

  function toggleSupervisor(supervisorName) {
    setExpandedSupervisors((prev) => ({
      ...prev,
      [supervisorName]: !prev[supervisorName],
    }));
  }

  function toggleEmployee(supervisorName, employeeName) {
    const key = `${supervisorName}__${employeeName}`;
    setExpandedEmployees((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function startEditingReport() {
    if (!selectedReport) return;
    setEditForm(cloneReportForEdit(selectedReport));
    setIsEditingReport(true);
  }

  function cancelEditingReport() {
    setIsEditingReport(false);
    setEditForm(null);
  }

  function updateEditField(field, value) {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateAnswerField(questionId, field, value) {
    setEditForm((prev) => ({
      ...prev,
      answers: {
        ...(prev?.answers || {}),
        [questionId]: {
          ...(prev?.answers?.[questionId] || {}),
          [field]: value,
        },
      },
    }));
  }

  function updateFollowUpItem(index, field, value) {
    setEditForm((prev) => {
      const items = [...(prev?.followUpItems || [])];
      items[index] = {
        ...(items[index] || {}),
        [field]: value,
      };
      return {
        ...prev,
        followUpItems: items,
      };
    });
  }

  function updateFollowUpHistoryDate(index, value) {
    setEditForm((prev) => {
      const history = [...(prev?.followUpHistory || [])];

      history[index] = {
        ...(history[index] || {}),
        createdAtLocal: value,
      };

      return {
        ...prev,
        followUpHistory: history,
      };
    });
  }

  function addFollowUpItem() {
    setEditForm((prev) => ({
      ...prev,
      followUpItems: [
        ...(prev?.followUpItems || []),
        { id: `${Date.now()}`, en: "", es: "", note: "" },
      ],
    }));
  }

  function removeFollowUpItem(index) {
    setEditForm((prev) => ({
      ...prev,
      followUpItems: (prev?.followUpItems || []).filter((_, i) => i !== index),
    }));
  }

  async function saveEditedReport() {
    if (!selectedReport || !editForm) return;

    try {
      setSavingId(selectedReport.id);

      const originalCreatedAt = selectedReport?.createdAt || null;
      const editedCreatedAt = dateTimeLocalToDate(editForm.submittedAtLocal);

      const editedFollowUpHistory = Array.isArray(editForm.followUpHistory)
        ? editForm.followUpHistory.map((item) => {
            const {
              createdAtLocal,
              ...rest
            } = item || {};

            return {
              ...rest,
              createdAt:
                dateTimeLocalToIso(createdAtLocal) ||
                rest.createdAt ||
                new Date().toISOString(),
            };
          })
        : [];

      const updatedPayload = {
        employeeName: editForm.employeeName || "",
        department: editForm.department || "",
        roleTitle: editForm.roleTitle || "",
        commentsCompany: editForm.commentsCompany || "",
        commentsEmployee: editForm.commentsEmployee || "",
        needsFollowUp: Boolean(editForm.needsFollowUp),
        managerNote: editForm.managerNote || "",
        returnReason: editForm.returnReason || "",
        answers: editForm.answers || {},
        followUpItems: Array.isArray(editForm.followUpItems)
          ? editForm.followUpItems
              .map((item) => ({
                id: item?.id || `${Date.now()}`,
                en: item?.en || "",
                es: item?.es || "",
                note: item?.note || "",
              }))
              .filter((item) => safeText(item.en || item.es || item.note))
          : [],
        followUpHistory: editedFollowUpHistory,
        ...(editedCreatedAt
          ? {
              createdAt: editedCreatedAt,
              originalCreatedAt:
                selectedReport?.originalCreatedAt || originalCreatedAt,
              officialSubmittedAt: editedCreatedAt,
              administrativeSubmitDate: editedCreatedAt,
              submissionDateEditedBy: getVisibleUserName(user),
              submissionDateEditedAt: serverTimestamp(),
            }
          : {}),
        officialFollowUpHistory: editedFollowUpHistory,
        historyDateEditedBy: getVisibleUserName(user),
        historyDateEditedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        managerEditedBy: getVisibleUserName(user),
        managerEditedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "employeePerformanceReports", selectedReport.id), updatedPayload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === selectedReport.id
            ? {
                ...item,
                ...updatedPayload,
                ...(editedCreatedAt
                  ? {
                      createdAt: editedCreatedAt,
                      officialSubmittedAt: editedCreatedAt,
                      administrativeSubmitDate: editedCreatedAt,
                    }
                  : {}),
                followUpHistory: editedFollowUpHistory,
                officialFollowUpHistory: editedFollowUpHistory,
                updatedAt: new Date(),
                managerEditedBy: getVisibleUserName(user),
                managerEditedAt: new Date(),
              }
            : item
        )
      );

      setManagerNote(editForm.managerNote || "");
      setReturnReason(editForm.returnReason || "");
      setIsEditingReport(false);
      setEditForm(null);
      setStatusMessage("EPR updated successfully.");
      setStatusTone("green");
    } catch (err) {
      console.error("Error updating EPR:", err);
      setStatusMessage("Could not update EPR.");
      setStatusTone("red");
    } finally {
      setSavingId("");
    }
  }

  function exportSelectedReportToPdf() {
    if (!selectedReport) return;

    const report = isEditingReport && editForm
      ? {
          ...selectedReport,
          ...editForm,
          createdAt:
            dateTimeLocalToDate(editForm.submittedAtLocal) ||
            selectedReport.createdAt,
          followUpHistory: Array.isArray(editForm.followUpHistory)
            ? editForm.followUpHistory.map((item) => ({
                ...item,
                createdAt:
                  dateTimeLocalToIso(item?.createdAtLocal) ||
                  item?.createdAt ||
                  "",
              }))
            : selectedReport.followUpHistory,
        }
      : selectedReport;

    const logoUrl = `${window.location.origin}/icons/aerostation-icon.png`;
    const questions = getQuestionsForReport(report);

    const escapeHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const htmlText = (value, fallback = "-") => {
      const clean = String(value ?? "").trim();
      return escapeHtml(clean || fallback).replace(/\n/g, "<br/>");
    };

    const infoCard = (label, value) => `
      <div class="card">
        <div class="card-label">${escapeHtml(label)}</div>
        <div class="card-value">${htmlText(value)}</div>
      </div>
    `;

    const questionsHtml = questions.length
      ? questions
          .map((question, index) => {
            const answer = report?.answers?.[question.id] || {};
            const questionText = question.en || question.es || question.id;
            const spanishText =
              question.es && question.es !== questionText
                ? `<div class="question-es">${htmlText(question.es)}</div>`
                : "";

            return `
              <div class="question-block">
                <div class="question-title">
                  ${index + 1}. ${htmlText(questionText)}
                </div>
                ${spanishText}
                <div class="answer-grid">
                  <div>
                    <span class="mini-label">Answer</span>
                    <span class="answer-value">${htmlText(
                      getRatingLabel(answer.rating)
                    )}</span>
                  </div>
                  <div>
                    <span class="mini-label">Weight</span>
                    <span class="answer-value">${htmlText(
                      question.weight ?? "-"
                    )}</span>
                  </div>
                </div>
                <div class="note-box">
                  <span class="mini-label">Supervisor Note</span>
                  <div>${htmlText(answer.note)}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty-box">No questions available.</div>`;

    const followUpHtml =
      Array.isArray(report?.followUpItems) && report.followUpItems.length
        ? report.followUpItems
            .map(
              (item, index) => `
                <div class="followup-item">
                  <div class="followup-number">${index + 1}</div>
                  <div>
                    <div class="followup-title">${htmlText(
                      item.en || item.es
                    )}</div>
                    ${
                      item.es && item.es !== item.en
                        ? `<div class="followup-es">${htmlText(item.es)}</div>`
                        : ""
                    }
                    <div class="followup-note"><strong>Note:</strong> ${htmlText(
                      item.note
                    )}</div>
                  </div>
                </div>
              `
            )
            .join("")
        : `<div class="empty-box">No follow-up questions.</div>`;

    const historyHtml =
      Array.isArray(report?.followUpHistory) && report.followUpHistory.length
        ? report.followUpHistory
            .map(
              (item, index) => `
                <div class="history-item">
                  <div class="history-head">
                    <div>
                      <div class="history-type">${htmlText(
                        String(item?.type || "Activity")
                          .replace(/_/g, " ")
                          .toUpperCase()
                      )}</div>
                      <div class="history-user">By ${htmlText(
                        item?.byUserName || item?.byUsername || "-"
                      )}</div>
                    </div>
                    <div class="history-date">${htmlText(
                      formatDateTime(item?.createdAt)
                    )}</div>
                  </div>
                  ${
                    item?.dutyManagerName
                      ? `<div class="history-line"><strong>Duty Manager:</strong> ${htmlText(
                          item.dutyManagerName
                        )}</div>`
                      : ""
                  }
                  ${
                    item?.note
                      ? `<div class="history-line"><strong>Note:</strong> ${htmlText(
                          item.note
                        )}</div>`
                      : ""
                  }
                  ${
                    item?.actionTaken
                      ? `<div class="history-line"><strong>Action:</strong> ${htmlText(
                          item.actionTaken
                        )}</div>`
                      : ""
                  }
                  ${
                    item?.details
                      ? `<div class="history-line"><strong>Details:</strong> ${htmlText(
                          item.details
                        )}</div>`
                      : ""
                  }
                </div>
              `
            )
            .join("")
        : `<div class="empty-box">No follow-up history.</div>`;

    const managerStatus = getStatusLabel(report.managerStatus || "submitted");
    const dutyManagerName =
      report.followUpDutyManagerName || report.assignedDutyManagerName || "-";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(APP_NAME)} - Employee Performance Report</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 24px;
              color: #111827;
              background: #ffffff;
            }
            .brand-header {
              display:flex; align-items:center; justify-content:space-between;
              gap:18px; padding-bottom:16px; margin-bottom:18px;
              border-bottom:2px solid #e5eef7;
            }
            .brand-left { display:flex; align-items:center; gap:12px; }
            .brand-logo {
              width:52px; height:52px; border-radius:14px;
              border:1px solid #dbeafe; background:#fff; object-fit:contain;
            }
            .brand-name {
              font-size:12px; font-weight:800; letter-spacing:.12em;
              text-transform:uppercase; color:#1769aa;
            }
            .brand-subtitle { margin-top:3px; font-size:11px; color:#64748b; font-weight:700; }
            .document-label {
              font-size:11px; color:#64748b; font-weight:700;
              text-transform:uppercase; letter-spacing:.08em; text-align:right;
            }
            .header {
              display:flex; justify-content:space-between; align-items:flex-start;
              gap:16px; margin-bottom:18px;
            }
            .title { font-size:27px; font-weight:800; margin:0; letter-spacing:-.03em; }
            .subtitle { margin-top:6px; font-size:14px; color:#475569; font-weight:700; }
            .status {
              display:inline-block; padding:7px 11px; border-radius:999px;
              font-size:11px; font-weight:800; border:1px solid #bfdbfe;
              background:#eff6ff; color:#1d4ed8;
            }
            .grid {
              display:grid; grid-template-columns:repeat(4,minmax(0,1fr));
              gap:10px; margin-bottom:16px;
            }
            .card {
              background:#f8fbff; border:1px solid #dbeafe;
              border-radius:12px; padding:11px 12px; min-width:0;
              break-inside:avoid; page-break-inside:avoid;
            }
            .card-label, .section-label, .mini-label {
              font-size:10px; font-weight:800; color:#64748b;
              text-transform:uppercase; letter-spacing:.08em;
            }
            .card-value { margin-top:5px; font-size:14px; font-weight:800; color:#0f172a; word-break:break-word; }
            .section { margin-top:20px; }
            .section-title {
              font-size:17px; font-weight:800; color:#0f172a;
              margin:0 0 10px; padding-bottom:7px; border-bottom:1px solid #dbeafe;
            }
            .text-box {
              border:1px solid #dbeafe; border-radius:12px; padding:12px;
              background:#f8fbff; line-height:1.55; font-size:12px;
              break-inside:avoid; page-break-inside:avoid;
            }
            .comments-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
            .question-block {
              border:1px solid #dbeafe; border-radius:12px; padding:12px;
              margin-bottom:10px; break-inside:avoid; page-break-inside:avoid;
            }
            .question-title { font-size:13px; font-weight:800; color:#0f172a; line-height:1.45; }
            .question-es { margin-top:4px; font-size:11px; color:#64748b; font-style:italic; }
            .answer-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:10px; }
            .answer-value { display:block; margin-top:3px; font-size:12px; font-weight:800; color:#0f172a; }
            .note-box { margin-top:10px; background:#f8fbff; border-radius:9px; padding:9px 10px; font-size:12px; line-height:1.5; }
            .followup-item {
              display:grid; grid-template-columns:28px 1fr; gap:10px;
              border:1px solid #dbeafe; border-radius:12px; padding:11px;
              margin-bottom:9px; break-inside:avoid; page-break-inside:avoid;
            }
            .followup-number {
              width:26px; height:26px; border-radius:999px; background:#1769aa;
              color:#fff; display:flex; align-items:center; justify-content:center;
              font-size:11px; font-weight:800;
            }
            .followup-title { font-size:12px; font-weight:800; color:#0f172a; }
            .followup-es { margin-top:3px; font-size:11px; color:#64748b; font-style:italic; }
            .followup-note { margin-top:6px; font-size:12px; color:#334155; line-height:1.5; }
            .history-item {
              border:1px solid #dbeafe; border-radius:12px; padding:11px 12px;
              margin-bottom:9px; background:#fbfdff;
              break-inside:avoid; page-break-inside:avoid;
            }
            .history-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
            .history-type { font-size:11px; font-weight:900; color:#0f172a; letter-spacing:.03em; }
            .history-user, .history-date { margin-top:3px; font-size:10.5px; color:#64748b; font-weight:700; }
            .history-date { text-align:right; white-space:nowrap; }
            .history-line { margin-top:7px; font-size:12px; color:#334155; line-height:1.5; }
            .audit-box {
              border:1px solid #e2e8f0; border-radius:12px; padding:12px;
              background:#f8fafc; font-size:11px; color:#475569; line-height:1.65;
            }
            .empty-box { border:1px dashed #cbd5e1; border-radius:12px; padding:12px; color:#64748b; font-size:12px; }
            .print-footer {
              margin-top:28px; padding-top:12px; border-top:1px solid #e2e8f0;
              color:#94a3b8; font-size:9px; text-align:center;
            }
            @media print {
              body { margin:14px; }
              .section { break-inside:auto; }
              .brand-header, .header, .card, .question-block, .followup-item, .history-item { page-break-inside:avoid; }
            }
            @page { margin: 0.45in; }
          </style>
        </head>
        <body>
          <div class="brand-header">
            <div class="brand-left">
              <img class="brand-logo" src="${logoUrl}" alt="${escapeHtml(APP_NAME)}" />
              <div>
                <div class="brand-name">${escapeHtml(APP_NAME)}</div>
                <div class="brand-subtitle">${escapeHtml(APP_SUBTITLE)}</div>
              </div>
            </div>
            <div class="document-label">Employee Performance Management Report</div>
          </div>

          <div class="header">
            <div>
              <h1 class="title">Employee Performance Report</h1>
              <div class="subtitle">
                ${htmlText(report.employeeName)} &middot; ${htmlText(
      formatMonthValue(report.month)
    )} &middot; ${htmlText(report.templateLabel)}
              </div>
            </div>
            <div class="status">${htmlText(managerStatus)}</div>
          </div>

          <div class="grid">
            ${infoCard("Employee", report.employeeName)}
            ${infoCard("Department", report.department)}
            ${infoCard("Role / Position", report.roleTitle)}
            ${infoCard("Month", formatMonthValue(report.month))}
            ${infoCard("Template", report.templateLabel)}
            ${infoCard("Supervisor", report.supervisorName)}
            ${infoCard("Supervisor Username", report.supervisorUsername)}
            ${infoCard("Supervisor User ID", report.supervisorUserId)}
            ${infoCard("Score", `${formatScore(report.score)} / 100`)}
            ${infoCard("Manager Status", managerStatus)}
            ${infoCard("Needs Follow Up", report.needsFollowUp ? "Yes" : "No")}
            ${infoCard("Duty Manager", dutyManagerName)}
            ${infoCard("Submitted Date & Time", formatDateTime(report.createdAt))}
            ${infoCard("Updated Date & Time", formatDateTime(report.updatedAt))}
            ${infoCard("Manager Reviewed By", report.managerReviewedBy)}
            ${infoCard("Manager Reviewed At", formatDateTime(report.managerReviewedAt))}
          </div>

          <div class="section">
            <h2 class="section-title">Comments & Management Notes</h2>
            <div class="comments-grid">
              <div class="text-box"><div class="section-label">Company Comments</div><div style="margin-top:7px;">${htmlText(
                report.commentsCompany
              )}</div></div>
              <div class="text-box"><div class="section-label">Employee Comments</div><div style="margin-top:7px;">${htmlText(
                report.commentsEmployee
              )}</div></div>
              <div class="text-box"><div class="section-label">Manager Note</div><div style="margin-top:7px;">${htmlText(
                report.managerNote
              )}</div></div>
              <div class="text-box"><div class="section-label">Return Reason</div><div style="margin-top:7px;">${htmlText(
                report.returnReason
              )}</div></div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Follow Up Questions</h2>
            ${followUpHtml}
          </div>

          <div class="section">
            <h2 class="section-title">Performance Questions & Answers</h2>
            ${questionsHtml}
          </div>

          <div class="section">
            <h2 class="section-title">Follow Up History</h2>
            ${historyHtml}
          </div>

          <div class="section">
            <h2 class="section-title">Administrative / Audit Information</h2>
            <div class="audit-box">
              <strong>Official Submit Date & Time:</strong> ${htmlText(
                formatDateTime(
                  report.officialSubmittedAt ||
                  report.administrativeSubmitDate ||
                  report.createdAt
                )
              )}<br/>
              <strong>Administrative Date Entered By:</strong> ${htmlText(
                report.submissionDateEditedBy
              )}<br/>
              <strong>Administrative Correction Recorded At:</strong> ${htmlText(
                formatDateTime(report.submissionDateEditedAt)
              )}<br/>
              <strong>History Date Edited By:</strong> ${htmlText(
                report.historyDateEditedBy
              )}<br/>
              <strong>History Date Edited At:</strong> ${htmlText(
                formatDateTime(report.historyDateEditedAt)
              )}<br/>
              <strong>Manager Edited By:</strong> ${htmlText(
                report.managerEditedBy
              )}<br/>
              <strong>Manager Edited At:</strong> ${htmlText(
                formatDateTime(report.managerEditedAt)
              )}<br/>
              <strong>Follow Up Duty Manager ID:</strong> ${htmlText(
                report.followUpDutyManagerId || report.assignedDutyManagerId
              )}
            </div>
          </div>

          <div class="print-footer">
            ${escapeHtml(APP_NAME)} &middot; ${escapeHtml(APP_SUBTITLE)}
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=1200,height=900");

    if (!printWindow) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to export/print.");
      setStatusTone("red");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    setTimeout(triggerPrint, 400);
  }

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 22 }}>
        Only Duty Managers and Station Managers can access this page.
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
          TPA OPS Â· Management of Reports
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
          Employee Performance Management
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 960,
            fontSize: 14,
            color: "rgba(255,255,255,0.88)",
          }}
        >
          Review reports by supervisor, open employee details, return reports to
          supervisors, assign follow up to a duty manager with notification,
          correct supervisor submission and follow-up history timestamps, edit
          received EPRs, and export them as PDF for printing.
        </p>
      </div>

      {statusMessage && <CenterToast message={statusMessage} tone={statusTone} />}

      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Month</FieldLabel>
            <SelectInput
              value={filters.month}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, month: e.target.value }))
              }
            >
              <option value="all">All</option>
              {monthOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <SelectInput
              value={filters.department}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, department: e.target.value }))
              }
            >
              <option value="all">All</option>
              {departmentOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Supervisor</FieldLabel>
            <SelectInput
              value={filters.supervisor}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, supervisor: e.target.value }))
              }
            >
              <option value="all">All</option>
              {supervisorOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Employee</FieldLabel>
            <SelectInput
              value={filters.employee}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, employee: e.target.value }))
              }
            >
              <option value="all">All</option>
              {employeeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={filters.managerStatus}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  managerStatus: e.target.value,
                }))
              }
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="follow_up">Follow Up</option>
              <option value="follow_up_assigned">Follow Up Assigned</option>
              <option value="follow_up_in_progress">Follow Up In Progress</option>
              <option value="follow_up_resubmitted">Resubmitted to Manager</option>
              <option value="returned_to_supervisor">Returned to Supervisor</option>
              <option value="recognized">Recognized</option>
              <option value="closed">Closed</option>
              <option value="draft">Draft</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Follow Up</FieldLabel>
            <SelectInput
              value={filters.followUp}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, followUp: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="yes">Needs Follow Up</option>
              <option value="no">No Follow Up</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Score Band</FieldLabel>
            <SelectInput
              value={filters.scoreBand}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, scoreBand: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="low">Low (&lt; 70)</option>
              <option value="mid">Meets (70 - 84.99)</option>
              <option value="high">High (85+)</option>
            </SelectInput>
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
        <InfoCard label="Reports" value={String(totals.total)} />
        <InfoCard label="Follow Up" value={String(totals.followUps)} tone="amber" />
        <InfoCard label="Approved / Closed" value={String(totals.approved)} tone="green" />
        <InfoCard
          label="Average Score"
          value={formatScore(totals.avgScore)}
          tone={getPerformanceTone(totals.avgScore)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            selectedReport ? "minmax(360px, 0.9fr) minmax(460px, 1.1fr)" : "1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Received Reports
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Organized by supervisor. Click a supervisor, then an employee, then a report.
            </p>
          </div>

          {loading ? (
            <div style={{ color: "#64748b" }}>Loading...</div>
          ) : groupedBySupervisor.length === 0 ? (
            <div style={{ color: "#64748b" }}>No reports found.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {groupedBySupervisor.map((group) => {
                const supervisorExpanded = !!expandedSupervisors[group.supervisorName];

                return (
                  <div
                    key={group.supervisorName}
                    style={{
                      border: "1px solid #dbeafe",
                      borderRadius: 18,
                      padding: 14,
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: supervisorExpanded ? 10 : 0,
                      }}
                    >
                      <div
                        onClick={() => toggleSupervisor(group.supervisorName)}
                        style={{ cursor: "pointer" }}
                      >
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 900,
                            color: "#0f172a",
                          }}
                        >
                          {group.supervisorName}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: "#64748b",
                          }}
                        >
                          {group.employees.length} employee(s) Â· {group.totalReports} report(s)
                        </div>
                      </div>

                      <ActionButton
                        variant="secondary"
                        onClick={() => toggleSupervisor(group.supervisorName)}
                      >
                        {supervisorExpanded ? "Hide" : "View Employees"}
                      </ActionButton>
                    </div>

                    {supervisorExpanded && (
                      <div style={{ display: "grid", gap: 10 }}>
                        {group.employees.map((emp) => {
                          const employeeKey = `${group.supervisorName}__${emp.employeeName}`;
                          const employeeExpanded = !!expandedEmployees[employeeKey];

                          return (
                            <div
                              key={employeeKey}
                              style={{
                                border: "1px solid #e2e8f0",
                                borderRadius: 14,
                                padding: 12,
                                background: "#f8fbff",
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
                                <div
                                  onClick={() =>
                                    toggleEmployee(group.supervisorName, emp.employeeName)
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  <div
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 800,
                                      color: "#0f172a",
                                    }}
                                  >
                                    {emp.employeeName}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 4,
                                      fontSize: 12,
                                      color: "#64748b",
                                    }}
                                  >
                                    {emp.reports.length} report(s)
                                  </div>
                                </div>

                                <ActionButton
                                  variant="secondary"
                                  onClick={() =>
                                    toggleEmployee(group.supervisorName, emp.employeeName)
                                  }
                                >
                                  {employeeExpanded ? "Hide Reports" : "View Reports"}
                                </ActionButton>
                              </div>

                              {employeeExpanded && (
                                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                                  {emp.reports.map((report) => (
                                    <div
                                      key={report.id}
                                      onClick={() => setSelectedReportId(report.id)}
                                      style={{
                                        cursor: "pointer",
                                        border:
                                          selectedReportId === report.id
                                            ? "1px solid #bfe0fb"
                                            : "1px solid #e2e8f0",
                                        background:
                                          selectedReportId === report.id
                                            ? "#edf7ff"
                                            : "#ffffff",
                                        borderRadius: 12,
                                        padding: 12,
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
                                              fontSize: 14,
                                              fontWeight: 800,
                                              color: "#0f172a",
                                            }}
                                          >
                                            {report.templateLabel || "-"} Â·{" "}
                                            {formatMonthValue(report.month)}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: 4,
                                              fontSize: 12,
                                              color: "#64748b",
                                            }}
                                          >
                                            {safeText(report.department) || "-"} Â· Status:{" "}
                                            {getStatusLabel(report.managerStatus || "submitted")}
                                          </div>
                                        </div>

                                        <div
                                          style={{
                                            display: "flex",
                                            gap: 8,
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: "inline-flex",
                                              padding: "5px 10px",
                                              borderRadius: 999,
                                              fontSize: 12,
                                              fontWeight: 800,
                                              background: "#f8fbff",
                                              border: "1px solid #dbeafe",
                                              color: "#1769aa",
                                            }}
                                          >
                                            {formatScore(report.score)}
                                          </span>

                                          <span
                                            style={{
                                              display: "inline-flex",
                                              padding: "5px 10px",
                                              borderRadius: 999,
                                              fontSize: 12,
                                              fontWeight: 800,
                                              background:
                                                report.needsFollowUp === true
                                                  ? "#fff7ed"
                                                  : "#ecfdf5",
                                              border:
                                                report.needsFollowUp === true
                                                  ? "1px solid #fdba74"
                                                  : "1px solid #a7f3d0",
                                              color:
                                                report.needsFollowUp === true
                                                  ? "#9a3412"
                                                  : "#166534",
                                            }}
                                          >
                                            {report.needsFollowUp ? "Follow Up" : "OK"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            <div style={{ display: "grid", gap: 16 }}>
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
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {(isEditingReport ? editForm?.employeeName : selectedReport.employeeName) || "-"}
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    {selectedReport.templateLabel || "-"} Â·{" "}
                    {formatMonthValue(selectedReport.month)} Â· Supervisor:{" "}
                    {selectedReport.supervisorName || "-"}
                  </p>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!isEditingReport ? (
                    <ActionButton variant="secondary" onClick={startEditingReport}>
                      Edit Received EPR
                    </ActionButton>
                  ) : (
                    <>
                      <ActionButton
                        variant="success"
                        onClick={saveEditedReport}
                        disabled={savingId === selectedReport.id}
                      >
                        {savingId === selectedReport.id ? "Saving..." : "Save EPR Changes"}
                      </ActionButton>

                      <ActionButton variant="secondary" onClick={cancelEditingReport}>
                        Cancel Edit
                      </ActionButton>
                    </>
                  )}

                  <ActionButton
                    variant="dark"
                    onClick={exportSelectedReportToPdf}
                  >
                    Export as PDF / Print
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/monthly-employee-performance-report?reportId=${selectedReport.id}&action=edit`
                      )
                    }
                  >
                    Open in Monthly EPR
                  </ActionButton>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                <InfoCard
                  label="Score"
                  value={`${formatScore(selectedReport.score)} / 100`}
                  tone={getPerformanceTone(selectedReport.score)}
                />
                <InfoCard
                  label="Status"
                  value={getStatusLabel(selectedReport.managerStatus || "submitted")}
                  tone={getStatusTone(selectedReport.managerStatus)}
                />
                <InfoCard
                  label="Follow Up"
                  value={
                    isEditingReport
                      ? editForm?.needsFollowUp
                        ? "Yes"
                        : "No"
                      : selectedReport.needsFollowUp
                      ? "Yes"
                      : "No"
                  }
                  tone={
                    isEditingReport
                      ? editForm?.needsFollowUp
                        ? "amber"
                        : "green"
                      : selectedReport.needsFollowUp
                      ? "amber"
                      : "green"
                  }
                />
                <InfoCard
                  label="Department"
                  value={isEditingReport ? editForm?.department || "-" : selectedReport.department || "-"}
                  tone="default"
                />
                <InfoCard
                  label="Role"
                  value={isEditingReport ? editForm?.roleTitle || "-" : selectedReport.roleTitle || "-"}
                  tone="default"
                />
                <InfoCard
                  label="Sent"
                  value={formatDateTime(selectedReport.createdAt)}
                  tone="default"
                />
                <InfoCard
                  label="Duty Manager"
                  value={
                    selectedReport.followUpDutyManagerName ||
                    selectedReport.assignedDutyManagerName ||
                    "-"
                  }
                  tone="default"
                />
                <InfoCard
                  label="Return Reason"
                  value={isEditingReport ? editForm?.returnReason || "-" : selectedReport.returnReason || "-"}
                  tone={
                    (isEditingReport ? editForm?.returnReason : selectedReport.returnReason)
                      ? "amber"
                      : "default"
                  }
                />
              </div>

              {isEditingReport && editForm && (
                <div
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
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: 12,
                    }}
                  >
                    Edit Main EPR Information
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div>
                      <FieldLabel>Employee Name</FieldLabel>
                      <TextInput
                        value={editForm.employeeName}
                        onChange={(e) => updateEditField("employeeName", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Department</FieldLabel>
                      <TextInput
                        value={editForm.department}
                        onChange={(e) => updateEditField("department", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Role Title</FieldLabel>
                      <TextInput
                        value={editForm.roleTitle}
                        onChange={(e) => updateEditField("roleTitle", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Needs Follow Up</FieldLabel>
                      <SelectInput
                        value={editForm.needsFollowUp ? "yes" : "no"}
                        onChange={(e) => updateEditField("needsFollowUp", e.target.value === "yes")}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </SelectInput>
                    </div>

                    <div>
                      <FieldLabel>Supervisor Submit Date & Time</FieldLabel>
                      <TextInput
                        type="datetime-local"
                        value={editForm.submittedAtLocal || ""}
                        onChange={(e) =>
                          updateEditField("submittedAtLocal", e.target.value)
                        }
                      />
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: "#64748b",
                          lineHeight: 1.5,
                        }}
                      >
                        Administrative correction. The original timestamp is preserved
                        the first time this value is changed.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div
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
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 10,
                  }}
                >
                  Follow Up Questions
                </div>

                {(isEditingReport ? editForm?.followUpItems : selectedReport?.followUpItems)?.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {(isEditingReport ? editForm.followUpItems : selectedReport.followUpItems).map((item, index) => (
                      <div
                        key={item.id || index}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: 12,
                          background: "#f8fbff",
                        }}
                      >
                        {isEditingReport ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <TextInput
                              value={item.en || ""}
                              onChange={(e) => updateFollowUpItem(index, "en", e.target.value)}
                              placeholder="Question"
                            />
                            <TextArea
                              value={item.note || ""}
                              onChange={(e) => updateFollowUpItem(index, "note", e.target.value)}
                              placeholder="Note"
                              style={{ minHeight: 70 }}
                            />
                            <div>
                              <ActionButton
                                variant="danger"
                                onClick={() => removeFollowUpItem(index)}
                              >
                                Remove
                              </ActionButton>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, color: "#7c2d12" }}>
                            â¢ {item.en || item.es}
                            {item.note ? ` â ${item.note}` : ""}
                          </div>
                        )}
                      </div>
                    ))}

                    {isEditingReport && (
                      <div>
                        <ActionButton variant="secondary" onClick={addFollowUpItem}>
                          Add Follow Up Item
                        </ActionButton>
                      </div>
                    )}
                  </div>
                ) : isEditingReport ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 14, color: "#64748b" }}>
                      No follow-up questions on this report.
                    </div>
                    <div>
                      <ActionButton variant="secondary" onClick={addFollowUpItem}>
                        Add Follow Up Item
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: "#64748b" }}>
                    No follow-up questions on this report.
                  </div>
                )}
              </div>

              <div
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
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 10,
                  }}
                >
                  Comments
                </div>

                {isEditingReport ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div>
                      <FieldLabel>Company Comments</FieldLabel>
                      <TextArea
                        value={editForm.commentsCompany}
                        onChange={(e) => updateEditField("commentsCompany", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Employee Comments</FieldLabel>
                      <TextArea
                        value={editForm.commentsEmployee}
                        onChange={(e) => updateEditField("commentsEmployee", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Manager Note</FieldLabel>
                      <TextArea
                        value={editForm.managerNote}
                        onChange={(e) => updateEditField("managerNote", e.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel>Return Reason</FieldLabel>
                      <TextArea
                        value={editForm.returnReason}
                        onChange={(e) => updateEditField("returnReason", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10, color: "#334155", fontSize: 14 }}>
                    <div>
                      <strong>Company:</strong> {selectedReport.commentsCompany || "-"}
                    </div>
                    <div>
                      <strong>Employee:</strong> {selectedReport.commentsEmployee || "-"}
                    </div>
                    <div>
                      <strong>Manager Note Saved:</strong> {selectedReport.managerNote || "-"}
                    </div>
                    <div>
                      <strong>Return Reason Saved:</strong> {selectedReport.returnReason || "-"}
                    </div>
                    <div>
                      <strong>Latest Follow Up Action:</strong>{" "}
                      {selectedReport.followUpLastAction || "-"}
                    </div>
                    <div>
                      <strong>Latest Follow Up Details:</strong>{" "}
                      {selectedReport.followUpLastDetails || "-"}
                    </div>
                  </div>
                )}
              </div>

              <div
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
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 12,
                  }}
                >
                  Questions and Answers
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {getQuestionsForReport(selectedReport).length > 0 ? (
                    getQuestionsForReport(selectedReport).map((question, index) => {
                      const answer = isEditingReport
                        ? editForm?.answers?.[question.id] || {}
                        : selectedReport?.answers?.[question.id] || {};

                      const isBelow =
                        String(answer?.rating || "").toLowerCase() === "below";

                      return (
                        <div
                          key={question.id}
                          style={{
                            border: `1px solid ${isBelow ? "#fdba74" : "#e2e8f0"}`,
                            background: isBelow ? "#fff7ed" : "#ffffff",
                            borderRadius: 14,
                            padding: 14,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: "#0f172a",
                              lineHeight: 1.6,
                            }}
                          >
                            {index + 1}. {question.en || question.es || question.id}
                          </div>

                          {isEditingReport ? (
                            <div
                              style={{
                                marginTop: 10,
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: 10,
                              }}
                            >
                              <div>
                                <FieldLabel>Answer</FieldLabel>
                                <SelectInput
                                  value={answer?.rating || ""}
                                  onChange={(e) =>
                                    updateAnswerField(question.id, "rating", e.target.value)
                                  }
                                >
                                  <option value="">Select</option>
                                  <option value="exceeds">Exceeds</option>
                                  <option value="meets">Meets</option>
                                  <option value="below">Does Not Meet</option>
                                </SelectInput>
                              </div>

                              <div>
                                <FieldLabel>Note</FieldLabel>
                                <TextArea
                                  value={answer?.note || ""}
                                  onChange={(e) =>
                                    updateAnswerField(question.id, "note", e.target.value)
                                  }
                                  style={{ minHeight: 80 }}
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div
                                style={{
                                  marginTop: 10,
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(160px, 1fr))",
                                  gap: 10,
                                  fontSize: 14,
                                  color: "#334155",
                                }}
                              >
                                <div>
                                  <strong>Answer:</strong> {getRatingLabel(answer.rating)}
                                </div>
                                <div>
                                  <strong>Weight:</strong> {question.weight ?? "-"}
                                </div>
                              </div>

                              {safeText(answer.note) && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    fontSize: 14,
                                    color: "#7c2d12",
                                  }}
                                >
                                  <strong>Note:</strong> {answer.note}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 14, color: "#64748b" }}>
                      No answer details available for this report.
                    </div>
                  )}
                </div>
              </div>

              <div
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
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: 12,
                  }}
                >
                  Follow Up History
                </div>

                {Array.isArray(
                  isEditingReport
                    ? editForm?.followUpHistory
                    : selectedReport.followUpHistory
                ) &&
                (isEditingReport
                  ? editForm?.followUpHistory
                  : selectedReport.followUpHistory
                ).length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {(isEditingReport
                      ? editForm.followUpHistory
                      : selectedReport.followUpHistory
                    ).map((item, index) => (
                      <div
                        key={`${selectedReport.id}-hist-${index}`}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: 12,
                          background: "#f8fbff",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                          }}
                        >
                          <div>
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

                            {!isEditingReport && (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 12,
                                  color: "#64748b",
                                }}
                              >
                                {item.byUserName || "-"} Â·{" "}
                                {item.createdAt
                                  ? formatDateTime(item.createdAt)
                                  : "-"}
                              </div>
                            )}
                          </div>

                          {isEditingReport && (
                            <div
                              style={{
                                width: "min(100%, 270px)",
                              }}
                            >
                              <FieldLabel>History Date & Time</FieldLabel>
                              <TextInput
                                type="datetime-local"
                                value={item.createdAtLocal || ""}
                                onChange={(e) =>
                                  updateFollowUpHistoryDate(
                                    index,
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          )}
                        </div>

                        {isEditingReport && (
                          <div
                            style={{
                              marginTop: 7,
                              fontSize: 12,
                              color: "#64748b",
                            }}
                          >
                            Recorded by: {item.byUserName || "-"}
                          </div>
                        )}

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

                        {item.dutyManagerName ? (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 14,
                              color: "#334155",
                            }}
                          >
                            <strong>Duty Manager:</strong>{" "}
                            {item.dutyManagerName}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: "#64748b" }}>
                    No follow up history.
                  </div>
                )}
              </div>

              {!isEditingReport && (
                <>
                  <div>
                    <FieldLabel>Manager Note</FieldLabel>
                    <TextArea
                      value={managerNote}
                      onChange={(e) => setManagerNote(e.target.value)}
                      placeholder="Add recognition, follow-up instruction, coaching note, etc."
                    />
                  </div>

                  <div>
                    <FieldLabel>Reason to Return to Supervisor</FieldLabel>
                    <TextArea
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="Write clearly what the supervisor must correct."
                    />
                  </div>

                  <div>
                    <FieldLabel>Assign Duty Manager for Follow Up</FieldLabel>
                    <SelectInput
                      value={selectedDutyManagerId}
                      onChange={(e) => setSelectedDutyManagerId(e.target.value)}
                    >
                      <option value="">Select duty manager</option>
                      {dutyManagers.map((dm) => (
                        <option key={dm.id} value={dm.id}>
                          {dm.name}
                        </option>
                      ))}
                    </SelectInput>
                    {selectedDutyManagerId && (
                      <div
                        style={{
                          marginTop: 7,
                          fontSize: 11,
                          color: "#64748b",
                          lineHeight: 1.5,
                        }}
                      >
                        {dutyManagers.find(
                          (dm) => dm.id === selectedDutyManagerId
                        )?.notificationUserId
                          ? "A platform notification will be sent when this case is assigned."
                          : "This employee is not linked to a platform user ID. Assignment will still save, but notification cannot be created."}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      variant="success"
                      onClick={() => updateManagerStatus(selectedReport.id, "approved")}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Approve"}
                    </ActionButton>

                    <ActionButton
                      variant="warning"
                      onClick={() => updateManagerStatus(selectedReport.id, "follow_up")}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Mark Follow Up"}
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={() => assignDutyManagerForFollowUp(selectedReport)}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Assign Duty Manager"}
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={() => returnToSupervisor(selectedReport)}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Return to Supervisor"}
                    </ActionButton>

                    <ActionButton
                      variant="dark"
                      onClick={() => updateManagerStatus(selectedReport.id, "recognized")}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id
                        ? "Saving..."
                        : "Recognize / Congratulate"}
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={() => updateManagerStatus(selectedReport.id, "closed")}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id ? "Saving..." : "Close Case"}
                    </ActionButton>
                  </div>
                </>
              )}
            </div>
          </PageCard>
        )}
      </div>
    </div>
  );
}
