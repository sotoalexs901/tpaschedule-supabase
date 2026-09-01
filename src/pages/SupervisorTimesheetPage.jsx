import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const AIRLINE_OPTIONS = [
  { value: "SY", label: "SY" },
  { value: "WestJet", label: "WestJet" },
  { value: "WL Invicta", label: "WL Invicta" },
  { value: "AV", label: "AV" },
  { value: "EA", label: "EA" },
  { value: "WCHR", label: "WCHR" },
  { value: "CABIN", label: "Cabin Service" },
  { value: "AA-BSO", label: "AA-BSO" },
  { value: "OTHER", label: "Other" },
];

const STATUS_OPTIONS = [
  "Present",
  "Late",
  "Call Out",
  "No Show",
  "Sent Home",
  "Training",
  "Modified Duty",
  "Other",
];

const BREAK_OPTIONS = ["No", "Yes", "30 min", "45 min", "60 min"];

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();
  const upper = airline.toUpperCase();

  if (
    upper === "WL HAVANA AIR" ||
    upper === "WAL HAVANA AIR" ||
    upper === "WAL HAVANA" ||
    upper === "WESTJET"
  ) {
    return "WestJet";
  }

  if (upper === "CABIN SERVICE" || upper === "DL CABIN SERVICE") {
    return "CABIN";
  }

  return airline;
}

function normalizeCabinServiceValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "cabin_service";
  }

  return raw;
}

function isCabinServiceDepartment(value) {
  return normalizeCabinServiceValue(value) === "cabin_service";
}

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function getBreakMinutes(value) {
  const v = String(value || "").trim().toLowerCase();

  if (!v || v === "no") return 0;
  if (v === "yes") return 30;
  if (v.includes("30")) return 30;
  if (v.includes("45")) return 45;
  if (v.includes("60")) return 60;

  return 0;
}

function calculateRowHours(row) {
  const start = toMinutes(row?.punchIn);
  const endRaw = toMinutes(row?.punchOut);

  if (start == null || endRaw == null) return 0;

  let end = endRaw;
  if (end <= start) end += 24 * 60;

  let minutes = end - start;
  minutes -= getBreakMinutes(row?.breakTaken);

  if (minutes < 0) minutes = 0;

  return minutes / 60;
}

function formatDateTime(value) {
  if (!value) return "\u2014";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    return new Date(value).toLocaleString();
  } catch {
    return "\u2014";
  }
}

const TIMESHEET_SUBMISSION_LIMIT_HOURS = 24;

function getTimesheetSubmissionTiming(reportDate) {
  const cleanDate = String(reportDate || "").trim();

  if (!cleanDate) {
    return {
      isLate: false,
      lateHours: 0,
      reportStart: null,
      deadline: null,
    };
  }

  const reportStart = new Date(`${cleanDate}T00:00:00`);

  if (Number.isNaN(reportStart.getTime())) {
    return {
      isLate: false,
      lateHours: 0,
      reportStart: null,
      deadline: null,
    };
  }

  const deadline = new Date(
    reportStart.getTime() +
      TIMESHEET_SUBMISSION_LIMIT_HOURS * 60 * 60 * 1000
  );

  const now = new Date();
  const lateMs = now.getTime() - deadline.getTime();

  return {
    isLate: lateMs > 0,
    lateHours: lateMs > 0 ? lateMs / (60 * 60 * 1000) : 0,
    reportStart,
    deadline,
  };
}

function formatLateDuration(hours) {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${wholeHours} hr${wholeHours === 1 ? "" : "s"}`;

  return `${wholeHours} hr${wholeHours === 1 ? "" : "s"} ${minutes} min`;
}

function emptyRow() {
  return {
    employeeId: "",
    employeeName: "",
    punchIn: "",
    punchOut: "",
    employeeStatus: "",
    breakTaken: "No",
    reason: "",
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
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
        fontSize: 11,
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 13,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 92,
        fontFamily: "inherit",
        ...props.style,
      }}
    />
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
      boxShadow: "0 10px 20px rgba(23,105,170,0.16)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 9px 18px rgba(220,38,38,0.16)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
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

function tableHeaderStyle(extra = {}) {
  return {
    padding: "12px 13px",
    fontSize: 11,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
    ...extra,
  };
}

const tableCellStyle = {
  padding: "12px 13px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
};

function MetricCard({ label, value, tone = "blue" }) {
  const map = {
    blue: {
      bg: "#f8fbff",
      border: "#dbeafe",
      label: "#64748b",
      value: "#0f172a",
    },
    red: {
      bg: "#fff1f2",
      border: "#fecdd3",
      label: "#9f1239",
      value: "#9f1239",
    },
  };

  const c = map[tone] || map.blue;

  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 15,
        padding: "13px 15px",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          color: c.label,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 20,
          lineHeight: 1.1,
          fontWeight: 900,
          color: c.value,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function SupervisorTimesheetPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState([]);
  const [dailyBudgetDocs, setDailyBudgetDocs] = useState([]);
  const [returnedReports, setReturnedReports] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [editingReportId, setEditingReportId] = useState("");
  const [lateSubmitPrompt, setLateSubmitPrompt] = useState(null);

  const normalizedDepartment = normalizeCabinServiceValue(user?.department);
  const isCabinServiceUser = normalizedDepartment === "cabin_service";

  const [form, setForm] = useState({
    airline: isCabinServiceUser ? "CABIN" : "",
    reportDate: "",
    shift: "",
    supervisorReporting: getVisibleName(user),
    supervisorPosition: user?.position || getDefaultPosition(user?.role),
    notes: "",
    overBudgetReason: "",
    department: isCabinServiceUser ? "Cabin Service" : user?.department || "",
  });

  const [rows, setRows] = useState([emptyRow()]);

  useEffect(() => {
    async function loadData() {
      try {
        const requests = [
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "airlineDailyBudgets")),
        ];

        if (user?.id) {
          requests.push(
            getDocs(
              query(
                collection(db, "timesheet_reports"),
                where("submittedByUserId", "==", user.id),
                where("status", "==", "returned")
              )
            )
          );
        }

        const results = await Promise.all(requests);
        const employeesSnap = results[0];
        const dailyBudgetsSnap = results[1];
        const returnedSnap = results[2];

        let employeeList = employeesSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .map((item) => ({
            id: item.id,
            name:
              item.name ||
              item.employeeName ||
              item.fullName ||
              item.displayName ||
              item.username ||
              "Unnamed employee",
            department: item.department || "",
          }));

        if (isCabinServiceUser) {
          employeeList = employeeList.filter((item) =>
            isCabinServiceDepartment(item.department)
          );
        }

        employeeList = employeeList.sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        const dailyBudgets = dailyBudgetsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          airline: normalizeAirlineName(d.data().airline),
          date: String(d.data().date || ""),
          dailyBudgetHours:
            d.data().dailyBudgetHours === null ||
            d.data().dailyBudgetHours === undefined ||
            d.data().dailyBudgetHours === ""
              ? 0
              : Number(d.data().dailyBudgetHours),
        }));

        const returned = returnedSnap
          ? returnedSnap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const A = a.returnedAt?.seconds || 0;
                const B = b.returnedAt?.seconds || 0;
                return B - A;
              })
          : [];

        setEmployees(employeeList);
        setDailyBudgetDocs(dailyBudgets);
        setReturnedReports(returned);
      } catch (err) {
        console.error("Error loading supervisor page data:", err);
        setStatusMessage(
          "Could not load employees, daily budgets or returned timesheets."
        );
      } finally {
        setLoadingEmployees(false);
      }
    }

    loadData();
  }, [user?.id, isCabinServiceUser]);

  const employeeMap = useMemo(() => {
    const map = {};

    employees.forEach((emp) => {
      map[emp.id] = emp;
    });

    return map;
  }, [employees]);

  const dailyBudgetMap = useMemo(() => {
    const map = {};

    dailyBudgetDocs.forEach((item) => {
      const airline = normalizeAirlineName(item.airline);
      const date = String(item.date || "").trim();

      if (!airline || !date) return;

      map[`${airline}__${date}`] = Number(item.dailyBudgetHours || 0);
    });

    return map;
  }, [dailyBudgetDocs]);

  const currentBudget = useMemo(() => {
    const airline = normalizeAirlineName(form.airline);
    const date = String(form.reportDate || "").trim();

    if (!airline || !date) return 0;

    return Number(dailyBudgetMap[`${airline}__${date}`] || 0);
  }, [dailyBudgetMap, form.airline, form.reportDate]);

  const totalReportedHours = useMemo(
    () => rows.reduce((sum, row) => sum + calculateRowHours(row), 0),
    [rows]
  );

  const overBudget =
    currentBudget > 0 && totalReportedHours > currentBudget;

  const overBudgetBy = overBudget
    ? totalReportedHours - currentBudget
    : 0;

  const isErrorStatus =
    overBudget ||
    statusMessage.toLowerCase().includes("error") ||
    statusMessage.toLowerCase().includes("cannot") ||
    statusMessage.toLowerCase().includes("please") ||
    statusMessage.toLowerCase().includes("required");

  const handleFormChange = (field, value) => {
    if (isCabinServiceUser && field === "airline") {
      setForm((prev) => ({ ...prev, airline: "CABIN" }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRowChange = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        if (field === "employeeId") {
          const selected = employeeMap[value];

          return {
            ...row,
            employeeId: value,
            employeeName: selected?.name || "",
          };
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const removeRow = (index) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const loadReturnedReport = (report) => {
    setEditingReportId(report.id);

    setForm({
      airline: report.airline || (isCabinServiceUser ? "CABIN" : ""),
      reportDate: report.reportDate || "",
      shift: report.shift || "",
      supervisorReporting:
        report.supervisorReporting || getVisibleName(user),
      supervisorPosition:
        report.supervisorPosition ||
        user?.position ||
        getDefaultPosition(user?.role),
      notes: report.notes || "",
      overBudgetReason: report.overBudgetReason || "",
      department:
        report.department ||
        (isCabinServiceUser
          ? "Cabin Service"
          : user?.department || ""),
    });

    setRows(
      (report.rows || []).length
        ? report.rows.map((row) => ({
            employeeId: row.employeeId || "",
            employeeName: row.employeeName || "",
            punchIn: row.punchIn || "",
            punchOut: row.punchOut || "",
            employeeStatus: row.employeeStatus || "",
            breakTaken: row.breakTaken || "No",
            reason: row.reason || "",
          }))
        : [emptyRow()]
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setEditingReportId("");

    setForm({
      airline: isCabinServiceUser ? "CABIN" : "",
      reportDate: "",
      shift: "",
      supervisorReporting: getVisibleName(user),
      supervisorPosition:
        user?.position || getDefaultPosition(user?.role),
      notes: "",
      overBudgetReason: "",
      department:
        isCabinServiceUser
          ? "Cabin Service"
          : user?.department || "",
    });

    setRows([emptyRow()]);
  };

  const createManagementLateAlert = async ({
    timesheetReportId,
    lateInfo,
    airline,
  }) => {
    try {
      await addDoc(collection(db, "operational_alerts"), {
        alertType: "TIMESHEET_LATE_SUBMISSION",
        category: "TIMESHEET",
        severity: "HIGH",
        priority: "URGENT",
        status: "OPEN",
        title: "Late Timesheet Submission",
        message: `${getVisibleName(user)} submitted a late timesheet for ${
          airline || "Unknown Airline"
        } dated ${form.reportDate}. Submission was ${formatLateDuration(
          lateInfo.lateHours
        )} past the 24-hour submission limit.`,
        timesheetReportId,
        reportDate: form.reportDate,
        airline: airline || "",
        department: isCabinServiceUser
          ? "Cabin Service"
          : String(form.department || user?.department || "").trim(),
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        thresholdHours: TIMESHEET_SUBMISSION_LIMIT_HOURS,
        lateHours: Number(lateInfo.lateHours || 0),
        submissionDeadline: lateInfo.deadline || null,
        targetRoles: ["station_manager", "duty_manager"],
        requiresManagementAttention: true,
        source: "SupervisorTimesheetPage",
        createdAt: serverTimestamp(),
      });

      return true;
    } catch (alertErr) {
      // Never block the operational timesheet submission because an alert write
      // failed. The report itself is also flagged for management follow-up.
      console.error("Late timesheet management alert error:", alertErr);
      return false;
    }
  };

  const saveTimesheet = async ({
    cleanRows,
    lateInfo,
    confirmedLateSubmission = false,
  }) => {
    try {
      setSaving(true);

      const normalizedAirline = isCabinServiceUser
        ? "CABIN"
        : normalizeAirlineName(form.airline);

      const isLateInitialSubmission =
        !editingReportId &&
        Boolean(lateInfo?.isLate) &&
        confirmedLateSubmission;

      const payload = {
        airline: normalizedAirline,
        reportDate: form.reportDate,
        shift: form.shift || "",
        supervisorReporting:
          form.supervisorReporting || getVisibleName(user),
        supervisorPosition:
          form.supervisorPosition ||
          user?.position ||
          getDefaultPosition(user?.role),
        notes: form.notes || "",
        department: isCabinServiceUser
          ? "Cabin Service"
          : String(form.department || user?.department || "").trim(),
        rows: cleanRows,
        totalHours: totalReportedHours,
        budgetHoursDaily: currentBudget,
        overBudget,
        overBudgetBy: overBudget ? overBudgetBy : 0,
        overBudgetReason: overBudget ? form.overBudgetReason : "",
        submittedByUserId: user?.id || "",
        submittedByUsername: user?.username || "",
        submittedByName: getVisibleName(user),
        submittedByRole: user?.role || "",
        status: "submitted",

        // Late-submission tracking. These fields are intentionally stored
        // directly on the timesheet so the future Alert Center can surface
        // the issue even if a separate alert document cannot be written.
        lateSubmission: isLateInitialSubmission,
        lateSubmissionHours: isLateInitialSubmission
          ? Number(lateInfo?.lateHours || 0)
          : 0,
        submissionLimitHours: TIMESHEET_SUBMISSION_LIMIT_HOURS,
        submissionDeadline:
          isLateInitialSubmission && lateInfo?.deadline
            ? lateInfo.deadline
            : null,
        managementAlertRequired: isLateInitialSubmission,
        managementAlertSeverity: isLateInitialSubmission ? "HIGH" : "",
      };

      if (editingReportId) {
        await updateDoc(
          doc(db, "timesheet_reports", editingReportId),
          {
            ...payload,
            // A correction/resubmission is not treated as a new "late initial
            // submission"; it keeps the original workflow intact.
            lateSubmission: false,
            lateSubmissionHours: 0,
            managementAlertRequired: false,
            managementAlertSeverity: "",
            resubmittedAt: serverTimestamp(),
            returnedAt: null,
            returnedByName: "",
            returnedByRole: "",
            returnedReason: "",
          }
        );

        setReturnedReports((prev) =>
          prev.filter((item) => item.id !== editingReportId)
        );

        setStatusMessage(
          "Timesheet corrected and resubmitted for approval successfully."
        );
      } else {
        const reportRef = await addDoc(collection(db, "timesheet_reports"), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        if (isLateInitialSubmission) {
          const alertCreated = await createManagementLateAlert({
            timesheetReportId: reportRef.id,
            lateInfo,
            airline: normalizedAirline,
          });

          // Record whether the separate alert was created. If it was not,
          // managementAlertRequired remains true so the upcoming Alert Center
          // can still discover the report directly.
          try {
            await updateDoc(reportRef, {
              managementAlertCreated: alertCreated,
              managementAlertCreatedAt: alertCreated
                ? serverTimestamp()
                : null,
            });
          } catch (flagErr) {
            console.error("Late timesheet alert flag update error:", flagErr);
          }

          setStatusMessage(
            alertCreated
              ? "Late timesheet submitted. An URGENT management alert was created."
              : "Late timesheet submitted. It is flagged URGENT for management review."
          );
        } else {
          setStatusMessage(
            "Timesheet submitted for approval successfully."
          );
        }
      }

      setLateSubmitPrompt(null);
      resetForm();
    } catch (err) {
      console.error("Error saving timesheet:", err);
      setStatusMessage("Could not submit timesheet.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setStatusMessage("");

    if (!form.airline) {
      setStatusMessage("Please select the reporting airline.");
      return;
    }

    if (!form.reportDate) {
      setStatusMessage("Please select the report date.");
      return;
    }

    const cleanRows = rows
      .map((row) => ({
        employeeId: row.employeeId,
        employeeName: String(row.employeeName || "").trim(),
        punchIn: String(row.punchIn || "").trim(),
        punchOut: String(row.punchOut || "").trim(),
        employeeStatus: String(row.employeeStatus || "").trim(),
        breakTaken: String(row.breakTaken || "").trim(),
        reason: String(row.reason || "").trim(),
        rowHours: calculateRowHours(row),
      }))
      .filter(
        (row) =>
          row.employeeId ||
          row.employeeName ||
          row.punchIn ||
          row.punchOut ||
          row.employeeStatus ||
          row.reason
      );

    if (!cleanRows.length) {
      setStatusMessage(
        "Please add at least one employee row before submitting the timesheet."
      );
      return;
    }

    if (
      cleanRows.some(
        (row) =>
          !row.employeeId ||
          !row.employeeName ||
          !row.punchIn ||
          !row.punchOut ||
          !row.employeeStatus ||
          !row.breakTaken
      )
    ) {
      setStatusMessage(
        "Timesheet cannot be sent. Every row must have Employee, Punch In, Punch Out, Employee Status and Break Taken completed."
      );
      return;
    }

    if (
      cleanRows.some(
        (row) =>
          String(row.breakTaken || "").trim().toLowerCase() === "no" &&
          !String(row.reason || "").trim()
      )
    ) {
      setStatusMessage(
        'Timesheet cannot be sent. If "Break Taken" is set to "No", the "Reason" field is required.'
      );
      return;
    }

    if (overBudget && !String(form.overBudgetReason || "").trim()) {
      setStatusMessage(
        "Please explain the overbudget reason with more details in order to submit your timesheet."
      );
      return;
    }

    const lateInfo = getTimesheetSubmissionTiming(form.reportDate);

    // Returned reports already entered the approval workflow, so the late
    // initial-submission warning applies only to brand-new submissions.
    if (!editingReportId && lateInfo.isLate) {
      setLateSubmitPrompt({
        cleanRows,
        lateInfo,
      });
      return;
    }

    await saveTimesheet({
      cleanRows,
      lateInfo,
      confirmedLateSubmission: false,
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      {/* ============================================================
          AEROSTATION HUB - TIMESHEET HEADER
      ============================================================ */}

      <div
        style={{
          background:
            "linear-gradient(135deg, #073b66 0%, #0f5c91 50%, #2e9fd6 100%)",
          borderRadius: 18,
          padding: "14px 16px",
          color: "#ffffff",
          boxShadow: "0 14px 30px rgba(15,76,129,0.16)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 155,
            height: 155,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            top: -92,
            right: -28,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                flex: "0 0 42px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.9)",
                overflow: "hidden",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  marginBottom: 2,
                  fontSize: 8.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.7)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Timesheets
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                {editingReportId
                  ? "Fix Returned Timesheet"
                  : "Submit Timesheet Report"}
              </h1>

              <p
                style={{
                  margin: "4px 0 0",
                  maxWidth: 620,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                {APP_SUBTITLE} {"\u00B7"} Create, review and resubmit
                supervisor timesheets.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {editingReportId && (
              <ActionButton
                type="button"
                variant="secondary"
                onClick={resetForm}
              >
                Cancel Edit
              </ActionButton>
            )}

            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => navigate("/dashboard")}
            >
              {"\u2190"} Back to Dashboard
            </ActionButton>
          </div>
        </div>
      </div>

      {lateSubmitPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: 20,
          }}
          onClick={() => {
            if (!saving) setLateSubmitPrompt(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#ffffff",
              borderRadius: 22,
              boxShadow: "0 28px 70px rgba(15,23,42,0.28)",
              border: "1px solid #fecaca",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background:
                  "linear-gradient(135deg, #991b1b 0%, #dc2626 100%)",
                color: "#ffffff",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.78)",
                }}
              >
                Urgent {"\u00B7"} Late Timesheet
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                }}
              >
                Submission is past the 24-hour limit
              </div>
            </div>

            <div style={{ padding: "20px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: "#334155",
                  fontWeight: 700,
                }}
              >
                This timesheet for{" "}
                <strong>{form.reportDate || "\u2014"}</strong> is late by{" "}
                <strong style={{ color: "#b91c1c" }}>
                  {formatLateDuration(
                    lateSubmitPrompt.lateInfo?.lateHours
                  )}
                </strong>
                .
              </p>

              <div
                style={{
                  marginTop: 14,
                  padding: "13px 14px",
                  borderRadius: 14,
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  color: "#9f1239",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  fontWeight: 700,
                }}
              >
                Do you want to submit it anyway? If you continue, the
                timesheet will be marked as a <strong>late submission</strong>
                and an <strong>URGENT alert</strong> will be created for the
                Management Team.
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: "11px 12px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Report Date
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {form.reportDate || "\u2014"}
                  </div>
                </div>

                <div
                  style={{
                    padding: "11px 12px",
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Submission Deadline
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {lateSubmitPrompt.lateInfo?.deadline
                      ? lateSubmitPrompt.lateInfo.deadline.toLocaleString()
                      : "\u2014"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setLateSubmitPrompt(null)}
                >
                  No, Go Back
                </ActionButton>

                <ActionButton
                  type="button"
                  variant="danger"
                  disabled={saving}
                  onClick={() =>
                    saveTimesheet({
                      cleanRows: lateSubmitPrompt.cleanRows,
                      lateInfo: lateSubmitPrompt.lateInfo,
                      confirmedLateSubmission: true,
                    })
                  }
                >
                  {saving
                    ? "Submitting..."
                    : "Yes, Submit & Alert Management"}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
          onClick={() => setStatusMessage("")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 22,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "17px 19px",
                background: isErrorStatus
                  ? "#fff1f2"
                  : "#ecfdf5",
                borderBottom: isErrorStatus
                  ? "1px solid #fecdd3"
                  : "1px solid #a7f3d0",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: isErrorStatus
                    ? "#9f1239"
                    : "#065f46",
                  letterSpacing: "-0.02em",
                }}
              >
                {isErrorStatus ? "Action Required" : "Success"}
              </div>
            </div>

            <div
              style={{
                padding: "20px 19px 17px",
                fontSize: 14,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {statusMessage}
            </div>

            <div
              style={{
                padding: "0 19px 19px",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => setStatusMessage("")}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "10px 20px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow:
                    "0 10px 20px rgba(23,105,170,0.16)",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {returnedReports.length > 0 && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Returned / Rejected Timesheets
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              Review the manager's comments, correct the report and resubmit.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {returnedReports.map((report) => (
              <div
                key={report.id}
                style={{
                  borderRadius: 16,
                  padding: 15,
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#881337",
                      }}
                    >
                      {report.airline || "\u2014"}{" "}
                      {"\u00B7"}{" "}
                      {report.reportDate || "\u2014"}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 12.5,
                        color: "#9f1239",
                        fontWeight: 700,
                      }}
                    >
                      Returned by{" "}
                      {report.returnedByName || "Manager"}{" "}
                      {report.returnedByRole
                        ? `(${report.returnedByRole})`
                        : ""}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 11.5,
                        color: "#64748b",
                      }}
                    >
                      {formatDateTime(report.returnedAt)}
                    </div>
                  </div>

                  <ActionButton
                    variant="secondary"
                    onClick={() =>
                      loadReturnedReport(report)
                    }
                  >
                    Load to Fix
                  </ActionButton>
                </div>

                <div
                  style={{
                    marginTop: 11,
                    background: "#ffffff",
                    border: "1px solid #fecdd3",
                    borderRadius: 13,
                    padding: "11px 13px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#9f1239",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 5,
                    }}
                  >
                    Return Reason
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#0f172a",
                      whiteSpace: "pre-line",
                      lineHeight: 1.55,
                    }}
                  >
                    {report.returnedReason ||
                      "No reason provided."}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Report Header
            </h2>
          </div>

          <div
            style={{
              padding: "7px 10px",
              borderRadius: 999,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              fontSize: 10.5,
              fontWeight: 800,
            }}
          >
            Submit within 24 hrs of report date
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 13,
          }}
        >
          <div>
            <FieldLabel>Reporting Airline</FieldLabel>

            <SelectInput
              value={form.airline}
              onChange={(e) =>
                handleFormChange(
                  "airline",
                  e.target.value
                )
              }
              disabled={isCabinServiceUser}
            >
              <option value="">Select airline</option>

              {AIRLINE_OPTIONS.map((airline) => (
                <option
                  key={airline.value}
                  value={airline.value}
                >
                  {airline.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Report Date</FieldLabel>

            <TextInput
              type="date"
              value={form.reportDate}
              onChange={(e) =>
                handleFormChange(
                  "reportDate",
                  e.target.value
                )
              }
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>

            <TextInput
              value={form.shift}
              onChange={(e) =>
                handleFormChange(
                  "shift",
                  e.target.value
                )
              }
              placeholder="AM / PM / MID / 05:00-13:30"
            />
          </div>

          <div>
            <FieldLabel>Supervisor Reporting</FieldLabel>

            <TextInput
              value={form.supervisorReporting}
              onChange={(e) =>
                handleFormChange(
                  "supervisorReporting",
                  e.target.value
                )
              }
            />
          </div>
        </div>

        {form.airline && (
          <div
            style={{
              marginTop: 15,
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 11,
            }}
          >
            <MetricCard
              label="Daily Budget"
              value={`${currentBudget.toFixed(2)} hrs`}
            />

            <MetricCard
              label="Total Reported"
              value={`${totalReportedHours.toFixed(2)} hrs`}
              tone={overBudget ? "red" : "blue"}
            />
          </div>
        )}

        {overBudget && (
          <div
            style={{
              marginTop: 15,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "15px 17px",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "#9f1239",
                marginBottom: 9,
              }}
            >
              Budget Alert
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#9f1239",
                fontWeight: 700,
                marginBottom: 11,
              }}
            >
              This timesheet is over budget by{" "}
              {overBudgetBy.toFixed(2)} hours.
            </div>

            <FieldLabel>
              Why are you over budget?
            </FieldLabel>

            <TextArea
              value={form.overBudgetReason}
              onChange={(e) =>
                handleFormChange(
                  "overBudgetReason",
                  e.target.value
                )
              }
              placeholder="Explain why this operation exceeded the airline daily budget."
            />
          </div>
        )}

        <div style={{ marginTop: 13 }}>
          <FieldLabel>Notes</FieldLabel>

          <TextArea
            value={form.notes}
            onChange={(e) =>
              handleFormChange(
                "notes",
                e.target.value
              )
            }
            placeholder="Optional station notes"
          />
        </div>
      </PageCard>

      <PageCard
        style={{
          padding: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            marginBottom: 13,
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
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Employee Entries
            </h2>

            <div
              style={{
                marginTop: 3,
                fontSize: 11.5,
                color: "#64748b",
              }}
            >
              {rows.length}{" "}
              {rows.length === 1 ? "entry" : "entries"}{" "}
              {"\u00B7"} {totalReportedHours.toFixed(2)} hrs
            </div>
          </div>

          <ActionButton
            onClick={addRow}
            variant="secondary"
          >
            + Add Row
          </ActionButton>
        </div>

        {loadingEmployees ? (
          <div
            style={{
              padding: 15,
              borderRadius: 14,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Loading employees...
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1450,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={tableHeaderStyle()}>
                    Employee
                  </th>

                  <th style={tableHeaderStyle()}>
                    Punch In
                  </th>

                  <th style={tableHeaderStyle()}>
                    Punch Out
                  </th>

                  <th style={tableHeaderStyle()}>
                    Employee Status
                  </th>

                  <th style={tableHeaderStyle()}>
                    Break Taken
                  </th>

                  <th style={tableHeaderStyle()}>
                    Reason
                  </th>

                  <th style={tableHeaderStyle()}>
                    Hours
                  </th>

                  <th
                    style={tableHeaderStyle({
                      textAlign: "center",
                    })}
                  >
                    Remove
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      background:
                        index % 2 === 0
                          ? "#ffffff"
                          : "#fbfdff",
                    }}
                  >
                    <td style={tableCellStyle}>
                      <SelectInput
                        value={row.employeeId}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "employeeId",
                            e.target.value
                          )
                        }
                      >
                        <option value="">
                          Select employee
                        </option>

                        {employees.map((emp) => (
                          <option
                            key={emp.id}
                            value={emp.id}
                          >
                            {emp.name}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tableCellStyle}>
                      <TextInput
                        type="time"
                        value={row.punchIn}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "punchIn",
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td style={tableCellStyle}>
                      <TextInput
                        type="time"
                        value={row.punchOut}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "punchOut",
                            e.target.value
                          )
                        }
                      />
                    </td>

                    <td style={tableCellStyle}>
                      <SelectInput
                        value={row.employeeStatus}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "employeeStatus",
                            e.target.value
                          )
                        }
                      >
                        <option value="">
                          Select status
                        </option>

                        {STATUS_OPTIONS.map((status) => (
                          <option
                            key={status}
                            value={status}
                          >
                            {status}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tableCellStyle}>
                      <SelectInput
                        value={row.breakTaken}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "breakTaken",
                            e.target.value
                          )
                        }
                      >
                        {BREAK_OPTIONS.map((option) => (
                          <option
                            key={option}
                            value={option}
                          >
                            {option}
                          </option>
                        ))}
                      </SelectInput>
                    </td>

                    <td style={tableCellStyle}>
                      <TextInput
                        value={row.reason}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            "reason",
                            e.target.value
                          )
                        }
                        placeholder="Reason / note"
                      />
                    </td>

                    <td style={tableCellStyle}>
                      <span
                        style={{
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {calculateRowHours(row).toFixed(2)} hrs
                      </span>
                    </td>

                    <td
                      style={{
                        ...tableCellStyle,
                        textAlign: "center",
                      }}
                    >
                      <ActionButton
                        onClick={() =>
                          removeRow(index)
                        }
                        variant="danger"
                        disabled={rows.length === 1}
                      >
                        Remove
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            Submitted by{" "}
            <strong style={{ color: "#334155" }}>
              {getVisibleName(user)}
            </strong>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <ActionButton
              onClick={resetForm}
              variant="secondary"
            >
              Clear
            </ActionButton>

            <ActionButton
              onClick={handleSubmit}
              variant="primary"
              disabled={saving}
            >
              {saving
                ? "Submitting..."
                : editingReportId
                ? "Resubmit Fixed Timesheet"
                : "Submit Timesheet"}
            </ActionButton>
          </div>
        </div>
      </PageCard>
    </div>
  );
}
