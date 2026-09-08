// src/pages/TimeOffRequestsAdminPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";
import { triggerTimeOffDecisionPush } from "../utils/timeOffPush.js";

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
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
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function statusBadge(status) {
  const s = String(status || "pending").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (s === "approved") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (s === "rejected") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }

  if (s === "needs_info") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}


const CABIN_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function parseLocalDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDates(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate || startDate);
  if (!start || !end || end < start) return [];

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 62) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function getWeekStartMonday(dateValue) {
  const d = parseLocalDate(dateValue);
  if (!d) return "";
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoDate(d);
}

function formatCoverageDate(value) {
  const d = parseLocalDate(value);
  if (!d) return value || "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getRequestSourceLabel(req) {
  const source = String(req?.requestSource || "").toUpperCase();
  if (source === "DUTY_MANAGER_FOR_EMPLOYEE") return "Duty Manager for Employee";
  if (source === "SUPERVISOR_FOR_AGENT") return "Supervisor for Agent";
  return "Self Request";
}

function getSubmittedByLabel(req) {
  return (
    req?.submittedByManagementName ||
    req?.submittedByDutyManagerName ||
    req?.submittedBySupervisorName ||
    req?.requestedByName ||
    req?.requestedByUsername ||
    req?.employeeName ||
    "Employee"
  );
}

function isCabinRequest(req) {
  const department = normalizeLookup(req?.department);
  return department.includes("cabin") || department.includes("delta") || department === "dl";
}

function getCoverageStyle(level) {
  if (level === "CRITICAL") {
    return { background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239" };
  }
  if (level === "CAUTION") {
    return { background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" };
  }
  if (level === "OK") {
    return { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46" };
  }
  return { background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569" };
}

export default function TimeOffRequestsAdminPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [notesById, setNotesById] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [coverageByRequest, setCoverageByRequest] = useState({});
  const [coverageLoading, setCoverageLoading] = useState(false);

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const loadRequests = async () => {
    setLoading(true);

    try {
      const q = query(collection(db, "timeOffRequests"));
      const snap = await getDocs(q);

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

      setRequests(list);
      loadCabinCoverage(list).catch(console.error);

      setNotesById((prev) => {
        const next = { ...prev };
        for (const req of list) {
          if (next[req.id] === undefined && req.managerNote) {
            next[req.id] = req.managerNote;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Error loading time off requests:", err);
      setStatusMessage("Error loading requests.");
    } finally {
      setLoading(false);
    }
  };

  const loadCabinCoverage = async (requestList) => {
    const cabinRequests = (requestList || []).filter(isCabinRequest);
    if (!cabinRequests.length) {
      setCoverageByRequest({});
      return;
    }

    setCoverageLoading(true);

    try {
      const schedulesSnap = await getDocs(collection(db, "cabinSchedules"));
      const approvedSchedules = schedulesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((item) => normalizeLookup(item.status) === "approved");

      const scheduleByWeek = {};
      approvedSchedules.forEach((schedule) => {
        const weekStart = String(schedule.weekStartDate || schedule.weekStart || "").trim();
        if (!weekStart) return;
        const existing = scheduleByWeek[weekStart];
        const currentSeconds = schedule.updatedAt?.seconds || schedule.createdAt?.seconds || 0;
        const existingSeconds = existing?.updatedAt?.seconds || existing?.createdAt?.seconds || 0;
        if (!existing || currentSeconds >= existingSeconds) {
          scheduleByWeek[weekStart] = schedule;
        }
      });

      const neededScheduleIds = new Set();
      cabinRequests.forEach((req) => {
        enumerateDates(req.startDate, req.endDate).forEach((date) => {
          const schedule = scheduleByWeek[getWeekStartMonday(date)];
          if (schedule?.id) neededScheduleIds.add(schedule.id);
        });
      });

      const slotsBySchedule = {};
      await Promise.all(
        Array.from(neededScheduleIds).map(async (scheduleId) => {
          const snap = await getDocs(
            query(
              collection(db, "cabinScheduleSlots"),
              where("scheduleId", "==", scheduleId)
            )
          );
          slotsBySchedule[scheduleId] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        })
      );

      const next = {};

      cabinRequests.forEach((req) => {
        next[req.id] = enumerateDates(req.startDate, req.endDate).map((date) => {
          const weekStart = getWeekStartMonday(date);
          const schedule = scheduleByWeek[weekStart];
          const d = parseLocalDate(date);
          const dayKey = d ? CABIN_DAY_KEYS[d.getDay()] : "";

          if (!schedule) {
            return { date, weekStart, dayKey, level: "NO_SCHEDULE", scheduled: 0, remaining: 0, employeeScheduled: false };
          }

          const daySlots = (slotsBySchedule[schedule.id] || []).filter(
            (slot) =>
              slot.dayKey === dayKey &&
              !slot.draftDeleteCandidate &&
              (slot.employeeId || slot.employeeName)
          );

          const unique = new Map();
          daySlots.forEach((slot) => {
            const key = normalizeLookup(slot.employeeId || slot.employeeName);
            if (!key) return;
            if (!unique.has(key)) unique.set(key, slot);
          });

          const reqId = normalizeLookup(req.employeeId);
          const reqName = normalizeLookup(req.employeeName);
          const employeeScheduled = Array.from(unique.entries()).some(([key, slot]) => {
            if (reqId && key === reqId) return true;
            const slotName = normalizeLookup(slot.employeeName);
            return !!reqName && slotName === reqName;
          });

          const scheduled = unique.size;
          const remaining = Math.max(0, scheduled - (employeeScheduled ? 1 : 0));
          const roleCounts = { supervisors: 0, lav: 0, agents: 0 };
          unique.forEach((slot) => {
            const role = normalizeLookup(slot.role);
            if (role === "supervisor") roleCounts.supervisors += 1;
            else if (role === "lav") roleCounts.lav += 1;
            else roleCounts.agents += 1;
          });

          let level = "OK";
          if (employeeScheduled && remaining < 5) level = "CRITICAL";
          else if (employeeScheduled && remaining === 5) level = "CAUTION";

          return {
            date,
            weekStart,
            dayKey,
            scheduleId: schedule.id,
            level,
            scheduled,
            remaining,
            employeeScheduled,
            ...roleCounts,
          };
        });
      });

      setCoverageByRequest(next);
    } catch (err) {
      console.error("Error loading Cabin Service coverage:", err);
      setStatusMessage("Requests loaded, but Cabin Service coverage could not be analyzed.");
    } finally {
      setCoverageLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadRequests().catch(console.error);
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  const updateLocalRequest = (id, patch) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const sendLowStatusAlert = async (req, nextStatus, note = "") => {
    try {
      const statusLabel =
        nextStatus === "approved"
          ? "Approved"
          : nextStatus === "rejected"
          ? "Rejected"
          : nextStatus === "needs_info"
          ? "More Info Needed"
          : nextStatus;

      await createOperationalAlert({
        alertType: "TIME_OFF_STATUS_UPDATED",
        category: "TIME_OFF",
        severity: "LOW",
        priority: "LOW",
        title: `Day Off Request ${statusLabel}`,
        message: [
          `${req.employeeName || "Employee"}'s day off request was updated to ${statusLabel}.`,
          `${req.startDate || ""} to ${req.endDate || ""}.`,
          req.reasonType ? `Reason: ${req.reasonType}.` : "",
          note ? `Management note: ${note}` : "",
          `Handled by: ${getVisibleName(user)}.`,
        ]
          .filter(Boolean)
          .join(" "),
        source: "TimeOffRequestsAdminPage",
        sourceId: req.id,
        department: req.department || "",
        reportDate: req.startDate || "",
        targetRoles: ["station_manager", "duty_manager"],
        createdByUserId: user?.id || "",
        createdByUsername: user?.username || "",
        createdByName: getVisibleName(user),
        createdByRole: user?.role || "",
        metadata: {
          timeOffRequestId: req.id,
          employeeId: req.employeeId || "",
          employeeName: req.employeeName || "",
          reasonType: req.reasonType || "",
          startDate: req.startDate || "",
          endDate: req.endDate || "",
          newStatus: nextStatus,
          managerNote: note,
        },
      });
    } catch (alertErr) {
      console.error("Time Off status alert error:", alertErr);
    }
  };

  const handleApprove = async (req) => {
    if (req.status === "approved") {
      setStatusMessage("This request is already approved.");
      return;
    }

    const note = notesById[req.id] || "";
    const coverage = coverageByRequest[req.id] || [];
    const criticalDates = coverage.filter((item) => item.level === "CRITICAL");
    const cautionDates = coverage.filter((item) => item.level === "CAUTION");
    const coverageWarning = criticalDates.length
      ? `\n\nCRITICAL COVERAGE: ${criticalDates.map((item) => `${formatCoverageDate(item.date)} (${item.remaining} remaining)`).join(", ")}. Management coverage/replacement will be required.`
      : cautionDates.length
      ? `\n\nCAUTION: ${cautionDates.map((item) => `${formatCoverageDate(item.date)} (${item.remaining} remaining)`).join(", ")}. This reaches minimum coverage.`
      : "";
    const confirmText = `Approve day-off for ${req.employeeName} (${req.reasonType}) from ${req.startDate} to ${req.endDate}?${coverageWarning}`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await addDoc(collection(db, "restrictions"), {
        employeeId: req.employeeId || null,
        employeeName: req.employeeName || "",
        reason: `TIME OFF: ${req.reasonType}${
          req.notes ? " - " + req.notes : ""
        }`,
        start_date: req.startDate,
        end_date: req.endDate,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
        source: "timeOffRequest",
        sourceRequestId: req.id,
      });

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "approved",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The approval is already saved before Push is requested.
      // The server resolves the employee's linked AeroStation Hub user account.
      triggerTimeOffDecisionPush(req.id, "approved");

      await sendLowStatusAlert(req, "approved", note);

      if (criticalDates.length) {
        createOperationalAlert({
          alertType: "TIME_OFF_CABIN_COVERAGE_CRITICAL",
          category: "STAFFING",
          severity: "HIGH",
          priority: "HIGH",
          title: "Delta Cabin Service Coverage Required",
          message: `${req.employeeName || "Employee"} was approved off. Coverage is below 5 on ${criticalDates.map((item) => `${formatCoverageDate(item.date)} (${item.remaining} remaining)`).join(", ")}. Management coverage or replacement is required.`,
          source: "TimeOffRequestsAdminPage",
          sourceId: req.id,
          department: req.department || "DL Cabin Service",
          reportDate: req.startDate || "",
          targetRoles: ["station_manager", "duty_manager"],
          createdByUserId: user?.id || "",
          createdByUsername: user?.username || "",
          createdByName: getVisibleName(user),
          createdByRole: user?.role || "",
          metadata: {
            timeOffRequestId: req.id,
            employeeId: req.employeeId || "",
            employeeName: req.employeeName || "",
            coverageDates: criticalDates,
          },
        }).catch((alertErr) =>
          console.error("Cabin coverage alert error:", alertErr)
        );
      }

      setStatusMessage(
        criticalDates.length
          ? "Request approved. Critical Delta Cabin Service coverage alert sent to Management."
          : "Request approved."
      );
    } catch (err) {
      console.error("Error approving request:", err);
      setStatusMessage("Error approving request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleReject = async (req) => {
    if (req.status === "rejected") {
      setStatusMessage("This request is already rejected.");
      return;
    }

    const note = notesById[req.id] || "";
    const confirmText = `Reject day-off request from ${req.employeeName}?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "rejected",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The rejection is already saved before Push is requested.
      triggerTimeOffDecisionPush(req.id, "rejected");

      await sendLowStatusAlert(req, "rejected", note);
      setStatusMessage("Request rejected.");
    } catch (err) {
      console.error("Error rejecting request:", err);
      setStatusMessage("Error rejecting request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleNeedsInfo = async (req) => {
    const note = String(notesById[req.id] || "").trim();

    if (!note) {
      setStatusMessage("Please write what additional information is needed.");
      return;
    }

    const confirmText = `Mark request for ${req.employeeName} as 'More info needed'?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "needs_info",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The request update is already saved before Push is requested.
      triggerTimeOffDecisionPush(req.id, "needs_info");

      await sendLowStatusAlert(req, "needs_info", note);
      setStatusMessage("Request marked as needs info.");
    } catch (err) {
      console.error("Error setting needs_info:", err);
      setStatusMessage("Error updating request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleDelete = async (req) => {
    const confirmText = `Delete this request from ${req.employeeName}? This cannot be undone.`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await deleteDoc(doc(db, "timeOffRequests", req.id));

      setRequests((prev) => prev.filter((r) => r.id !== req.id));

      setNotesById((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });

      setStatusMessage("Request deleted.");
    } catch (err) {
      console.error("Error deleting request:", err);
      setStatusMessage("Error deleting request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handlePrint = (req) => {
    const win = window.open("", "_blank", "width=720,height=850");

    if (!win) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Day Off Request - ${req.employeeName || ""}</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              padding: 24px;
              color: #0f172a;
            }
            .brand {
              font-size: 11px;
              font-weight: 800;
              color: #1769aa;
              text-transform: uppercase;
              letter-spacing: .08em;
            }
            h1 {
              margin: 6px 0 4px;
              font-size: 24px;
            }
            .subtitle {
              margin-bottom: 20px;
              font-size: 12px;
              color: #64748b;
            }
            .card {
              border: 1px solid #dbeafe;
              border-radius: 12px;
              padding: 10px 12px;
              margin-bottom: 8px;
              background: #f8fbff;
            }
            .label {
              font-size: 10px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
            }
            .value {
              margin-top: 4px;
              font-size: 13px;
              font-weight: 700;
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <div class="brand">${APP_NAME}</div>
          <h1>Day Off Request</h1>
          <div class="subtitle">${APP_SUBTITLE}</div>

          <div class="card">
            <div class="label">Employee</div>
            <div class="value">${req.employeeName || ""}</div>
          </div>

          <div class="card">
            <div class="label">Reason</div>
            <div class="value">${req.reasonType || ""}</div>
          </div>

          <div class="card">
            <div class="label">Dates</div>
            <div class="value">${req.startDate || ""} to ${
      req.endDate || ""
    }</div>
          </div>

          <div class="card">
            <div class="label">Status</div>
            <div class="value">${String(
              req.status || "pending"
            ).toUpperCase()}</div>
          </div>

          ${
            req.managerNote
              ? `<div class="card"><div class="label">Manager Note</div><div class="value">${req.managerNote}</div></div>`
              : ""
          }

          ${
            req.notes
              ? `<div class="card"><div class="label">Employee Note</div><div class="value">${req.notes}</div></div>`
              : ""
          }

          <div class="card">
            <div class="label">Handled By</div>
            <div class="value">${
              req.handledByName || req.handledBy || ""
            }</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const filteredRequests = useMemo(() => {
    if (filterStatus === "all") return requests;
    return requests.filter((r) => r.status === filterStatus);
  }, [requests, filterStatus]);

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 18 }}>
        Only Duty Managers and Station Managers can view this page.
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 18 : 22,
          padding: isMobile
            ? "14px"
            : isTablet
            ? "16px 18px"
            : "18px 20px",
          color: "#fff",
          boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.07)",
            top: -92,
            right: -28,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            gap: isMobile ? 10 : 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: isMobile ? 5 : 7,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: isMobile ? 34 : 40,
                  height: isMobile ? 34 : 40,
                  borderRadius: 10,
                  objectFit: "contain",
                  background: "#ffffff",
                  flexShrink: 0,
                }}
              />

              <p
                style={{
                  margin: 0,
                  fontSize: isMobile ? 9 : 10,
                  textTransform: "uppercase",
                  letterSpacing: isMobile ? "0.12em" : "0.16em",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Time Off Management
              </p>
            </div>

            <h1
              style={{
                margin: "0 0 4px",
                fontSize: isMobile ? 20 : isTablet ? 23 : 25,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              Day Off Requests
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: isMobile ? 11.5 : 12.5,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review, approve, reject, print and manage employee time off
              requests.
            </p>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: isMobile ? 9.5 : 10.5,
                color: "rgba(255,255,255,0.72)",
                fontWeight: 700,
              }}
            >
              {APP_SUBTITLE}
            </p>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: isMobile ? "9px 11px" : "10px 12px",
              minWidth: isMobile ? 0 : 118,
              width: isMobile ? "fit-content" : "auto",
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 800,
              }}
            >
              Pending
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: isMobile ? 22 : 26,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {pendingCount}
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#1769aa",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 12 : 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "pending", label: "Pending" },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Rejected" },
            { key: "needs_info", label: "Needs Info" },
            { key: "all", label: "All" },
          ].map((f) => (
            <ActionButton
              key={f.key}
              variant={filterStatus === f.key ? "primary" : "secondary"}
              onClick={() => setFilterStatus(f.key)}
            >
              {f.label}
            </ActionButton>
          ))}
        </div>
      </PageCard>

      {loading ? (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Loading requests...
          </p>
        </PageCard>
      ) : filteredRequests.length === 0 ? (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            No requests for this filter.
          </p>
        </PageCard>
      ) : (
        <div style={{ display: "grid", gap: isMobile ? 10 : 12 }}>
          {filteredRequests.map((req) => {
            const currentStatus = String(req.status || "pending").toLowerCase();
            const busy = busyRequestId === req.id;
            const canProcess =
              currentStatus === "pending" || currentStatus === "needs_info";

            return (
              <PageCard
                key={req.id}
                style={{ padding: isMobile ? 14 : 18 }}
              >
                <div style={{ display: "grid", gap: 13 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      alignItems: isMobile ? "stretch" : "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: isMobile ? 16 : 18,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.02em",
                          wordBreak: "break-word",
                        }}
                      >
                        {req.employeeName || "Unknown employee"}
                      </h2>

                      <p
                        style={{
                          margin: "5px 0 0",
                          fontSize: isMobile ? 12 : 13,
                          color: "#64748b",
                          lineHeight: 1.5,
                          wordBreak: "break-word",
                        }}
                      >
                        {req.reasonType || "Reason"} {"\u00B7"}{" "}
                        {req.startDate || "\u2014"} {"\u2192"}{" "}
                        {req.endDate || "\u2014"}
                      </p>

                      <div style={{ marginTop: 8 }}>
                        <span style={statusBadge(req.status)}>
                          {currentStatus.toUpperCase()}
                        </span>
                      </div>


                      <div
                        style={{
                          marginTop: 9,
                          display: "flex",
                          gap: 7,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "5px 9px",
                            borderRadius: 999,
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            color: "#475569",
                            fontSize: 10.5,
                            fontWeight: 800,
                          }}
                        >
                          {getRequestSourceLabel(req)}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>
                          Submitted by: {getSubmittedByLabel(req)}
                        </span>
                      </div>

                      {isCabinRequest(req) && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: "11px",
                            borderRadius: 14,
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10.5,
                              fontWeight: 900,
                              color: "#1769aa",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              marginBottom: 8,
                            }}
                          >
                            Delta Cabin Service - Schedule Coverage Analysis
                          </div>

                          {coverageLoading && !coverageByRequest[req.id] ? (
                            <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>
                              Checking approved Cabin schedule...
                            </div>
                          ) : !(coverageByRequest[req.id] || []).length ? (
                            <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>
                              No coverage data available for this request.
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: 7 }}>
                              {(coverageByRequest[req.id] || []).map((item) => {
                                const label =
                                  item.level === "CRITICAL"
                                    ? "CRITICAL COVERAGE"
                                    : item.level === "CAUTION"
                                    ? "CAUTION - MINIMUM COVERAGE"
                                    : item.level === "NO_SCHEDULE"
                                    ? "NO APPROVED SCHEDULE FOUND"
                                    : item.employeeScheduled
                                    ? "COVERAGE OK"
                                    : "EMPLOYEE NOT SCHEDULED";

                                return (
                                  <div
                                    key={`${req.id}-${item.date}`}
                                    style={{
                                      ...getCoverageStyle(item.level),
                                      borderRadius: 11,
                                      padding: "9px 10px",
                                      fontSize: 11.5,
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    <div style={{ fontWeight: 900 }}>
                                      {formatCoverageDate(item.date)} {"\u00B7"} {label}
                                    </div>
                                    {item.level !== "NO_SCHEDULE" && (
                                      <div style={{ marginTop: 3, fontWeight: 700 }}>
                                        Scheduled: {item.scheduled} {"\u00B7"} Supervisors: {item.supervisors} {"\u00B7"} LAV: {item.lav} {"\u00B7"} Agents: {item.agents}
                                        {item.employeeScheduled
                                          ? ` | Remaining if approved: ${item.remaining}`
                                          : " | Requested employee is not assigned that day."}
                                      </div>
                                    )}
                                    {item.level === "CRITICAL" && (
                                      <div style={{ marginTop: 3, fontWeight: 900 }}>
                                        Management coverage or replacement required if approved.
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {req.notes && (
                        <div
                          style={{
                            marginTop: 10,
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                            borderRadius: 12,
                            padding: "10px 11px",
                            fontSize: 12.5,
                            color: "#334155",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          <strong>Employee note: </strong>
                          {req.notes}
                        </div>
                      )}

                      {req.managerNote && (
                        <div
                          style={{
                            marginTop: 10,
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                            borderRadius: 12,
                            padding: "10px 11px",
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              fontSize: 10.5,
                              fontWeight: 800,
                              color: "#1769aa",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Message from Management
                          </p>

                          <p
                            style={{
                              margin: "5px 0 0",
                              fontSize: 12.5,
                              color: "#334155",
                              lineHeight: 1.55,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {req.managerNote}
                          </p>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                        justifyContent: isMobile ? "flex-start" : "flex-end",
                      }}
                    >
                      {canProcess && (
                        <>
                          <ActionButton
                            variant="success"
                            disabled={busy}
                            onClick={() => handleApprove(req)}
                          >
                            Approve
                          </ActionButton>

                          <ActionButton
                            variant="warning"
                            disabled={busy}
                            onClick={() => handleNeedsInfo(req)}
                          >
                            Needs Info
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            disabled={busy}
                            onClick={() => handleReject(req)}
                          >
                            Reject
                          </ActionButton>
                        </>
                      )}

                      <ActionButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handlePrint(req)}
                      >
                        Print
                      </ActionButton>

                      <ActionButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handleDelete(req)}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        marginBottom: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#475569",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                      }}
                    >
                      Manager Note
                    </label>

                    <textarea
                      rows={3}
                      disabled={busy}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                        border: "1px solid #dbeafe",
                        background: "#ffffff",
                        borderRadius: 12,
                        padding: "11px 13px",
                        fontSize: 14,
                        color: "#0f172a",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      placeholder='e.g. "More documentation needed, please pass by the office."'
                      value={notesById[req.id] || ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [req.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </PageCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
