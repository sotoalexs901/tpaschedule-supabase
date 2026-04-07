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
  if (s === "approved" || s === "recognized" || s === "closed") return "green";
  if (s === "follow_up") return "amber";
  return "blue";
}

function safeText(value) {
  return String(value || "").trim();
}

function openPrintWindow(title, bodyHtml) {
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) return false;

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 24px;
            color: #0f172a;
          }
          h1, h2, h3 {
            margin-bottom: 8px;
          }
          .section {
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .row {
            margin-bottom: 8px;
            line-height: 1.6;
          }
          ul {
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

export default function EmployeePerformanceManagementPage() {
  const { user } = useUser();

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const isStationManager = user?.role === "station_manager";

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [closingMonth, setClosingMonth] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [assignedFollowUpManagerId, setAssignedFollowUpManagerId] = useState("");
  const [assignedFollowUpManagerName, setAssignedFollowUpManagerName] = useState("");
  const [dutyManagers, setDutyManagers] = useState([]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [filters, setFilters] = useState({
    month: getCurrentMonthValue(),
    employee: "all",
    supervisor: "all",
    managerStatus: "all",
    followUp: "all",
    scoreBand: "all",
    assignedDutyManager: "all",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [reportsSnap, usersSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "employeePerformanceReports"),
              orderBy("createdAt", "desc")
            )
          ),
          getDocs(collection(db, "users")),
        ]);

        const rows = reportsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const managerRows = usersSnap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter(
            (u) =>
              u.role === "duty_manager" || u.role === "station_manager"
          )
          .map((u) => ({
            id: u.id,
            name:
              u.displayName ||
              u.fullName ||
              u.name ||
              u.username ||
              "Manager",
            role: u.role || "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setReports(rows);
        setDutyManagers(managerRows);
      } catch (err) {
        console.error("Error loading EPR management:", err);
        setStatusMessage("Could not load performance reports.");
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

  const employeeOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => r.employeeName && set.add(r.employeeName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const supervisorOptions = useMemo(() => {
    const set = new Set();
    reports.forEach((r) => r.supervisorName && set.add(r.supervisorName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const dutyManagerOptions = useMemo(() => {
    const fromAssigned = new Set();
    reports.forEach((r) => {
      if (r.assignedFollowUpManagerName) {
        fromAssigned.add(r.assignedFollowUpManagerName);
      }
    });

    dutyManagers.forEach((m) => fromAssigned.add(m.name));

    return Array.from(fromAssigned).sort((a, b) => a.localeCompare(b));
  }, [reports, dutyManagers]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filters.month !== "all" && report.month !== filters.month) return false;
      if (filters.employee !== "all" && report.employeeName !== filters.employee)
        return false;
      if (
        filters.supervisor !== "all" &&
        report.supervisorName !== filters.supervisor
      )
        return false;
      if (
        filters.managerStatus !== "all" &&
        String(report.managerStatus || "submitted").toLowerCase() !==
          filters.managerStatus
      )
        return false;

      if (filters.followUp === "yes" && report.needsFollowUp !== true) return false;
      if (filters.followUp === "no" && report.needsFollowUp === true) return false;

      if (
        filters.assignedDutyManager !== "all" &&
        safeText(report.assignedFollowUpManagerName) !== filters.assignedDutyManager
      ) {
        return false;
      }

      const score = Number(report.score || 0);
      if (filters.scoreBand === "low" && score >= 70) return false;
      if (filters.scoreBand === "mid" && (score < 70 || score >= 85)) return false;
      if (filters.scoreBand === "high" && score < 85) return false;

      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedReportId) || null;
  }, [filteredReports, selectedReportId]);

  useEffect(() => {
    if (selectedReport) {
      setManagerNote(selectedReport.managerNote || "");
      setAssignedFollowUpManagerId(selectedReport.assignedFollowUpManagerId || "");
      setAssignedFollowUpManagerName(selectedReport.assignedFollowUpManagerName || "");
    } else {
      setManagerNote("");
      setAssignedFollowUpManagerId("");
      setAssignedFollowUpManagerName("");
    }
  }, [selectedReport]);

  const totals = useMemo(() => {
    const total = filteredReports.length;
    const followUps = filteredReports.filter((r) => r.needsFollowUp === true).length;
    const approved = filteredReports.filter(
      (r) => String(r.managerStatus || "").toLowerCase() === "approved"
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

  async function sendRecognitionMessage(report, customMessage = "") {
    if (!report?.employeeId) return;

    const text =
      safeText(customMessage) ||
      `Congratulations ${report.employeeName || ""}! Your ${formatMonthValue(
        report.month
      )} performance report was recognized by management. Keep up the great work.`;

    await addDoc(collection(db, "messages"), {
      toUserId: report.employeeId,
      fromUserId: user?.id || "",
      fromUserName: getVisibleUserName(user),
      subject: "Employee Performance Recognition",
      text,
      read: false,
      createdAt: serverTimestamp(),
      type: "employee_performance_recognition",
    });
  }

  async function updateManagerStatus(reportId, nextStatus) {
    try {
      setSavingId(reportId);

      const selectedDutyManager = dutyManagers.find(
        (m) => m.id === assignedFollowUpManagerId
      );

      const nextAssignedManagerName =
        selectedDutyManager?.name || assignedFollowUpManagerName || "";

      const payload = {
        managerStatus: nextStatus,
        managerReviewedBy: getVisibleUserName(user),
        managerReviewedAt: serverTimestamp(),
        managerNote: managerNote || "",
        assignedFollowUpManagerId:
          nextStatus === "follow_up" ? assignedFollowUpManagerId || "" : "",
        assignedFollowUpManagerName:
          nextStatus === "follow_up" ? nextAssignedManagerName : "",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "employeePerformanceReports", reportId), payload);

      const updatedReport = reports.find((r) => r.id === reportId);

      if (nextStatus === "recognized" && isStationManager && updatedReport) {
        await sendRecognitionMessage(updatedReport, managerNote);
      }

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                managerStatus: nextStatus,
                managerReviewedBy: getVisibleUserName(user),
                managerReviewedAt: new Date(),
                managerNote: managerNote || "",
                assignedFollowUpManagerId:
                  nextStatus === "follow_up" ? assignedFollowUpManagerId || "" : "",
                assignedFollowUpManagerName:
                  nextStatus === "follow_up" ? nextAssignedManagerName : "",
              }
            : item
        )
      );

      if (nextStatus === "recognized" && isStationManager) {
        setStatusMessage("Recognition saved and message sent to employee.");
      } else {
        setStatusMessage(`Report updated to ${nextStatus}.`);
      }
    } catch (err) {
      console.error("Error updating EPR manager status:", err);
      setStatusMessage("Could not update report.");
    } finally {
      setSavingId("");
    }
  }

  async function handleCloseMonth() {
    if (!filters.month || filters.month === "all") {
      setStatusMessage("Select a specific month before closing it.");
      return;
    }

    const monthReports = reports.filter((r) => r.month === filters.month);

    if (!monthReports.length) {
      setStatusMessage("No reports found for the selected month.");
      return;
    }

    try {
      setClosingMonth(true);

      await Promise.all(
        monthReports.map((report) =>
          updateDoc(doc(db, "employeePerformanceReports", report.id), {
            monthClosed: true,
            monthClosedAt: serverTimestamp(),
            monthClosedBy: getVisibleUserName(user),
            updatedAt: serverTimestamp(),
          })
        )
      );

      setReports((prev) =>
        prev.map((item) =>
          item.month === filters.month
            ? {
                ...item,
                monthClosed: true,
                monthClosedAt: new Date(),
                monthClosedBy: getVisibleUserName(user),
              }
            : item
        )
      );

      setStatusMessage(
        `Month ${formatMonthValue(filters.month)} closed successfully.`
      );
    } catch (err) {
      console.error("Error closing month:", err);
      setStatusMessage("Could not close selected month.");
    } finally {
      setClosingMonth(false);
    }
  }

  function handlePrintSelectedReport() {
    if (!selectedReport) return;

    const followUpHtml =
      Array.isArray(selectedReport.followUpItems) &&
      selectedReport.followUpItems.length > 0
        ? `<ul>${selectedReport.followUpItems
            .map(
              (item) =>
                `<li>${item.en || item.es || "-"}${
                  item.note ? ` — ${item.note}` : ""
                }</li>`
            )
            .join("")}</ul>`
        : `<div>No follow-up questions on this report.</div>`;

    const bodyHtml = `
      <h1>Employee Performance Report</h1>
      <div class="section">
        <div class="row"><strong>Employee:</strong> ${selectedReport.employeeName || "-"}</div>
        <div class="row"><strong>Month:</strong> ${formatMonthValue(selectedReport.month)}</div>
        <div class="row"><strong>Template:</strong> ${selectedReport.templateLabel || "-"}</div>
        <div class="row"><strong>Supervisor:</strong> ${selectedReport.supervisorName || "-"}</div>
        <div class="row"><strong>Score:</strong> ${formatScore(selectedReport.score)} / 100</div>
        <div class="row"><strong>Status:</strong> ${selectedReport.managerStatus || "submitted"}</div>
        <div class="row"><strong>Needs Follow Up:</strong> ${
          selectedReport.needsFollowUp ? "Yes" : "No"
        }</div>
        <div class="row"><strong>Assigned Duty Manager:</strong> ${
          selectedReport.assignedFollowUpManagerName || "-"
        }</div>
        <div class="row"><strong>Sent:</strong> ${formatDateTime(
          selectedReport.createdAt
        )}</div>
      </div>

      <div class="section">
        <h3>Follow Up Questions</h3>
        ${followUpHtml}
      </div>

      <div class="section">
        <h3>Comments</h3>
        <div class="row"><strong>Company:</strong> ${
          selectedReport.commentsCompany || "-"
        }</div>
        <div class="row"><strong>Employee:</strong> ${
          selectedReport.commentsEmployee || "-"
        }</div>
        <div class="row"><strong>Manager Note:</strong> ${
          managerNote || selectedReport.managerNote || "-"
        }</div>
      </div>
    `;

    openPrintWindow(
      `${selectedReport.employeeName || "employee"}-${selectedReport.month || "report"}`,
      bodyHtml
    );
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
          Review EPR reports sent by supervisors, filter by month/employee/follow
          up/score, assign duty manager follow-up, recognize employees, print reports,
          and close monthly cycles.
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
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={filters.managerStatus}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, managerStatus: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="follow_up">Follow Up</option>
              <option value="closed">Closed</option>
              <option value="recognized">Recognized</option>
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

          <div>
            <FieldLabel>Assigned Duty Manager</FieldLabel>
            <SelectInput
              value={filters.assignedDutyManager}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  assignedDutyManager: e.target.value,
                }))
              }
            >
              <option value="all">All</option>
              {dutyManagerOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div style={{ display: "flex", alignItems: "end" }}>
            <ActionButton
              variant="dark"
              onClick={handleCloseMonth}
              disabled={closingMonth || !filters.month || filters.month === "all"}
            >
              {closingMonth ? "Closing..." : "Close Selected Month"}
            </ActionButton>
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
        <InfoCard label="Approved" value={String(totals.approved)} tone="green" />
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
            selectedReport ? "minmax(360px, 0.95fr) minmax(460px, 1.05fr)" : "1fr",
          gap: 18,
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
              Filtered reports sent by supervisors.
            </p>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : filteredReports.length === 0 ? (
            <div>No reports found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredReports.map((report) => (
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
                      selectedReportId === report.id ? "#edf7ff" : "#ffffff",
                    borderRadius: 18,
                    padding: 14,
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
                        {report.employeeName || "-"}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 13,
                          color: "#64748b",
                        }}
                      >
                        {report.templateLabel || "-"} ·{" "}
                        {formatMonthValue(report.month)} · Supervisor:{" "}
                        {report.supervisorName || "-"}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        Duty Manager: {report.assignedFollowUpManagerName || "-"} · Month Closed:{" "}
                        {report.monthClosed ? "Yes" : "No"}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 6,
                        justifyItems: "end",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#1769aa",
                        }}
                      >
                        Score {formatScore(report.score)}
                      </span>

                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          background:
                            report.needsFollowUp === true ? "#fff7ed" : "#ecfdf5",
                          border:
                            report.needsFollowUp === true
                              ? "1px solid #fdba74"
                              : "1px solid #a7f3d0",
                          color:
                            report.needsFollowUp === true ? "#9a3412" : "#166534",
                        }}
                      >
                        {report.needsFollowUp ? "Follow Up" : "Good Standing"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            <div style={{ display: "grid", gap: 16 }}>
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
                  {formatMonthValue(selectedReport.month)} · Sent by{" "}
                  {selectedReport.supervisorName || "-"}
                </p>
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
                  value={selectedReport.managerStatus || "submitted"}
                  tone={getStatusTone(selectedReport.managerStatus)}
                />
                <InfoCard
                  label="Follow Up"
                  value={selectedReport.needsFollowUp ? "Yes" : "No"}
                  tone={selectedReport.needsFollowUp ? "amber" : "green"}
                />
                <InfoCard
                  label="Sent"
                  value={formatDateTime(selectedReport.createdAt)}
                  tone="default"
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
                </div>
              </div>

              <div>
                <FieldLabel>Assign Duty Manager for Follow Up</FieldLabel>
                <SelectInput
                  value={assignedFollowUpManagerId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const selectedManager = dutyManagers.find(
                      (item) => item.id === selectedId
                    );
                    setAssignedFollowUpManagerId(selectedId);
                    setAssignedFollowUpManagerName(selectedManager?.name || "");
                  }}
                >
                  <option value="">Select duty manager</option>
                  {dutyManagers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name} ({manager.role})
                    </option>
                  ))}
                </SelectInput>
              </div>

              <div>
                <FieldLabel>Manager Note</FieldLabel>
                <TextArea
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  placeholder="Add recognition, follow-up instruction, coaching note, etc."
                />
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

                <ActionButton
                  variant="primary"
                  onClick={handlePrintSelectedReport}
                >
                  Print Report
                </ActionButton>
              </div>
            </div>
          </PageCard>
        )}
      </div>
    </div>
  );
}
