import React, { useEffect, useMemo, useState } from "react";
import {
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
        const [reportsSnap, employeesSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "employeePerformanceReports"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(collection(db, "employees")),
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

        setReports(rows);
        setEmployees(employeeRows);
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
      .filter((emp) => {
        const role = String(emp.role || "").toLowerCase().trim();
        return role === "duty_manager" || role === "duty manager";
      })
      .map((emp) => ({
        id: emp.id,
        name:
          emp.name ||
          emp.fullName ||
          emp.employeeName ||
          emp.displayName ||
          emp.username ||
          "Unnamed Duty Manager",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

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
      setSelectedDutyManagerId(selectedReport.followUpDutyManagerId || "");
    } else {
      setManagerNote("");
      setReturnReason("");
      setSelectedDutyManagerId("");
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

      const duty = dutyManagers.find((item) => item.id === selectedDutyManagerId);
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
        followUpHistory: history,
        updatedAt: serverTimestamp(),
      });

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
                followUpHistory: history,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Duty manager assigned correctly for follow up.");
      setStatusTone("green");
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
          TPA OPS · Management of Reports
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
          supervisors, assign follow up to a duty manager, and review the full
          follow up history.
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
                          {group.employees.length} employee(s) · {group.totalReports} report(s)
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
                                            {report.templateLabel || "-"} ·{" "}
                                            {formatMonthValue(report.month)}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: 4,
                                              fontSize: 12,
                                              color: "#64748b",
                                            }}
                                          >
                                            {safeText(report.department) || "-"} · Status:{" "}
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
                    {selectedReport.employeeName || "-"}
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    {selectedReport.templateLabel || "-"} ·{" "}
                    {formatMonthValue(selectedReport.month)} · Supervisor:{" "}
                    {selectedReport.supervisorName || "-"}
                  </p>
                </div>

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
                  value={selectedReport.needsFollowUp ? "Yes" : "No"}
                  tone={selectedReport.needsFollowUp ? "amber" : "green"}
                />
                <InfoCard
                  label="Department"
                  value={selectedReport.department || "-"}
                  tone="default"
                />
                <InfoCard
                  label="Role"
                  value={selectedReport.roleTitle || "-"}
                  tone="default"
                />
                <InfoCard
                  label="Sent"
                  value={formatDateTime(selectedReport.createdAt)}
                  tone="default"
                />
                <InfoCard
                  label="Duty Manager"
                  value={selectedReport.followUpDutyManagerName || "-"}
                  tone="default"
                />
                <InfoCard
                  label="Return Reason"
                  value={selectedReport.returnReason || "-"}
                  tone={
                    selectedReport.returnReason ? "amber" : "default"
                  }
                />
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
                  Follow Up Questions
                </div>

                {Array.isArray(selectedReport.followUpItems) &&
                selectedReport.followUpItems.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {selectedReport.followUpItems.map((item) => (
                      <div key={item.id} style={{ fontSize: 14, color: "#7c2d12" }}>
                        • {item.en || item.es}
                        {item.note ? ` — ${item.note}` : ""}
                      </div>
                    ))}
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
                      const answer = selectedReport?.answers?.[question.id] || {};
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

                {Array.isArray(selectedReport.followUpHistory) &&
                selectedReport.followUpHistory.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedReport.followUpHistory.map((item, index) => (
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
                            fontSize: 13,
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          {String(item.type || "").replace(/_/g, " ").toUpperCase()}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          {item.byUserName || "-"} ·{" "}
                          {item.createdAt ? formatDateTime(item.createdAt) : "-"}
                        </div>
                        {item.note ? (
                          <div style={{ marginTop: 6, fontSize: 14, color: "#334155" }}>
                            <strong>Note:</strong> {item.note}
                          </div>
                        ) : null}
                        {item.actionTaken ? (
                          <div style={{ marginTop: 6, fontSize: 14, color: "#334155" }}>
                            <strong>Action:</strong> {item.actionTaken}
                          </div>
                        ) : null}
                        {item.details ? (
                          <div style={{ marginTop: 6, fontSize: 14, color: "#334155" }}>
                            <strong>Details:</strong> {item.details}
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
            </div>
          </PageCard>
        )}
      </div>
    </div>
  );
}
