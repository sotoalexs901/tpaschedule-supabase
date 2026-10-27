import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  ensureDailySmartAssignments,
  selectResponsibleSupervisor,
  SMART_ASSIGNMENTS_COLLECTION,
  tampaDateKey,
  SMART_AUDIT_COLLECTION,
} from "../services/smartIntelligenceAssignmentEngine.js";
import {
  SMART_ALERTS_COLLECTION,
  SMART_REPORT_LABELS,
  acknowledgeSmartAlert,
  completeSmartReportPackage,
  refreshSmartReportPackages,
  markSmartReportReviewed,
} from "../services/smartIntelligenceReportMonitor.js";

function clean(value) {
  return String(value ?? "").trim();
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 12px 30px rgba(15,23,42,.05)", padding: 18, ...style }}>
      {children}
    </div>
  );
}

function statusStyle(status) {
  if (status === "APPROVED") return { bg: "#dcfce7", color: "#166534", label: "Approved" };
  if (status === "RECEIVED") return { bg: "#dbeafe", color: "#1d4ed8", label: "Received" };
  if (status === "FOLLOW_UP") return { bg: "#fee2e2", color: "#b91c1c", label: "Follow-up" };
  if (status === "MISSING") return { bg: "#ffedd5", color: "#c2410c", label: "Missing" };
  if (status === "NOT_DUE") return { bg: "#f1f5f9", color: "#475569", label: "Not due" };
  return { bg: "#f8fafc", color: "#64748b", label: "Not connected" };
}

function packageStyle(status) {
  if (status === "APPROVED") return { bg: "#dcfce7", color: "#166534", label: "Approved" };
  if (status === "READY_FOR_REVIEW") return { bg: "#dbeafe", color: "#1d4ed8", label: "Ready for review" };
  if (status === "FOLLOW_UP_REQUIRED") return { bg: "#fee2e2", color: "#b91c1c", label: "Follow-up required" };
  if (status === "INCOMPLETE") return { bg: "#ffedd5", color: "#c2410c", label: "Incomplete" };
  return { bg: "#f1f5f9", color: "#475569", label: "Waiting" };
}

const REPORT_MANAGEMENT_ROUTES = {
  gate_checklist: "/gate-checklist-management",
  operational_report: "/operational-report/reports",
  supervisor_daily_report: "/operational-report/reports",
  timesheet: "/timesheets/reports",
  operations_request: "/operations-requests/reports",
  cleaning_security: "/cleaning-security/reports",
  regulated_garbage: "/regulated-garbage/reports",
  wchr_flight_report: "/wchr/admin/flights",
  wchr_poi: "/wchr-poi/reports",
  employee_performance: "/employee-performance-management",
  bso_daily: "/bso-daily-management",
  fuel_entry: "/fuel-management",
  cierre_vuelo: "/cierre-vuelo-management",
};

export default function SmartIntelligenceTodayPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = useMemo(() => tampaDateKey(), []);
  const [dateKey, setDateKey] = useState(() => searchParams.get("date") || todayKey);
  const changeDate = (next) => { setDateKey(next); setSearchParams(next === todayKey ? {} : { date: next }); };
  const isToday = dateKey === todayKey;
  const isStationManager = user?.role === "station_manager";
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(null);
  const [selectingSupervisorFor, setSelectingSupervisorFor] = useState("");
  const [closingPackageId, setClosingPackageId] = useState("");
  const [dutyUsers, setDutyUsers] = useState([]);
  const [supervisorUsers, setSupervisorUsers] = useState([]);
  const [supervisorChoice, setSupervisorChoice] = useState({});
  const [auditRows, setAuditRows] = useState([]);
  const [dutyFilter, setDutyFilter] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  const runEngine = async () => {
    if (!isToday) return;
    try {
      setRunning(true);
      setMessage("");
      const result = await ensureDailySmartAssignments({ actor: user });
      await refreshSmartReportPackages({ actor: user });
      setSummary(result);
      setMessage(`Smart Intelligence checked ${result.rulesCount} department rule${result.rulesCount === 1 ? "" : "s"} and refreshed today's report packages.`);
    } catch (error) {
      console.error("Smart Intelligence refresh failed:", error);
      setMessage(error?.message || "Could not refresh Smart Intelligence.");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (user?.id) runEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, SMART_ASSIGNMENTS_COLLECTION), (snap) => {
      const next = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.dateKey === dateKey)
        .sort((a, b) => clean(a.department).localeCompare(clean(b.department)));
      setRows(next);
    });
    return () => unsub();
  }, [dateKey]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const unsub = onSnapshot(collection(db, SMART_ALERTS_COLLECTION), (snap) => {
      const next = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.active !== false)
        .filter((item) => item.dateKey === dateKey)
        .filter((item) => {
          if (user.role === "station_manager") return item.targetRole === "station_manager";
          if (user.role === "duty_manager") return item.targetUserId === user.id;
          return false;
        });
      setAlerts(next);
    });
    return () => unsub();
  }, [user?.id, user?.role, dateKey]);



  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setSupervisorUsers(snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => clean(item.role).toLowerCase() === "supervisor")
        .sort((a, b) => clean(a.displayName || a.fullName || a.name || a.username).localeCompare(clean(b.displayName || b.fullName || b.name || b.username))));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isStationManager) return undefined;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const next = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => String(item.role || "").trim().toLowerCase() === "duty_manager")
        .sort((a, b) => clean(a.displayName || a.fullName || a.name || a.username).localeCompare(clean(b.displayName || b.fullName || b.name || b.username)));
      setDutyUsers(next);
    });
    return () => unsub();
  }, [isStationManager]);

  const dutyDiagnostics = useMemo(() => {
    const now = Date.now();
    return dutyUsers.map((item) => {
      const rawSeen =
        item.smartDutyLastSeen ||
        item.lastActivityAt ||
        item.lastActiveAt ||
        item.lastSeenAt ||
        item.lastSeen ||
        item.lastActivity ||
        item.presenceUpdatedAt ||
        item.updatedAt;
      const seenDate = rawSeen?.toDate ? rawSeen.toDate() : rawSeen?.seconds ? new Date(rawSeen.seconds * 1000) : rawSeen ? new Date(rawSeen) : null;
      const ageMinutes = seenDate && !Number.isNaN(seenDate.getTime()) ? Math.max(0, Math.round((now - seenDate.getTime()) / 60000)) : null;

      const smartStatus = String(item.smartDutyStatus || "").trim().toUpperCase();
      const presenceStatus = String(
        item.status || item.presenceStatus || item.onlineStatus || item.activityStatus || item.presence || ""
      ).trim().toUpperCase();

      const smartAvailable = item.smartDutyAvailable === true || smartStatus === "AVAILABLE";
      const presenceOnline =
        item.online === true ||
        item.isOnline === true ||
        presenceStatus === "ONLINE" ||
        presenceStatus === "ACTIVE" ||
        presenceStatus === "AVAILABLE";

      const explicitlyOffline =
        smartStatus === "OFFLINE" ||
        smartStatus === "UNAVAILABLE" ||
        presenceStatus === "OFFLINE" ||
        presenceStatus === "LOGGED_OUT" ||
        item.online === false ||
        item.isOnline === false;

      const fresh = ageMinutes !== null && ageMinutes <= 75;
      const eligible = !explicitlyOffline && fresh && (presenceOnline || smartAvailable);

      let reason = "Eligible for assignments";
      if (explicitlyOffline) reason = "AeroStation presence is OFFLINE";
      else if (ageMinutes === null) reason = "No recent AeroStation activity timestamp";
      else if (!fresh) reason = `Last activity is ${ageMinutes} min old`;
      else if (!presenceOnline && !smartAvailable) reason = "No ONLINE presence signal";

      return {
        ...item,
        visibleName: item.displayName || item.fullName || item.name || item.username || "Duty Manager",
        ageMinutes,
        seenDate,
        eligible,
        reason,
        diagnosticStatus: presenceOnline ? "ONLINE" : smartStatus || presenceStatus || "No status",
      };
    });
  }, [dutyUsers]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, SMART_AUDIT_COLLECTION), (snap) => {
      const entries = snap.docs.map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.dateKey === dateKey)
        .sort((a, b) => {
          const at = (v) => v?.createdAt?.toMillis?.() || (v?.createdAt?.seconds || 0) * 1000 || 0;
          return at(b) - at(a);
        });
      setAuditRows(entries);
    });
    return () => unsub();
  }, [dateKey]);

  const handleOpenReport = (row, report) => {
    const path = REPORT_MANAGEMENT_ROUTES[report.key];
    if (!path || !report.bestReportId) return;
    // Carry a precise report reference to the management screen. Existing management pages
    // may need to implement the query-param selection to open the individual record.
    navigate(`${path}?reportId=${encodeURIComponent(report.bestReportId)}&sourceCollection=${encodeURIComponent(report.sourceCollection || "")}`, {
      state: { smartIntelligenceReturnDate: dateKey, smartIntelligenceAssignmentId: row.id, reportId: report.bestReportId },
    });
  };

  const handleReviewReport = async (row, report) => {
    try {
      setReviewingId(`${row.id}:${report.key}`);
      await markSmartReportReviewed({ assignment: row, report, actor: user });
      setMessage(`${report.label}: review recorded for ${row.department}.`);
    } catch (error) {
      setMessage(error?.message || "Could not record report review.");
    } finally {
      setReviewingId("");
    }
  };

  const handleSelectSupervisor = async (row, supervisor, overrideReason = "") => {
    if (!row?.id || !supervisor?.userId) return;
    try {
      setSelectingSupervisorFor(row.id);
      setMessage("");
      await selectResponsibleSupervisor({ assignmentId: row.id, supervisorUserId: supervisor.userId, actor: user, overrideReason });
      await refreshSmartReportPackages({ actor: user });
      setMessage(`${supervisor.name} selected as responsible supervisor for ${row.department}.`);
    } catch (error) {
      console.error("Responsible supervisor selection failed:", error);
      setMessage(error?.message || "Could not select responsible supervisor.");
    } finally {
      setSelectingSupervisorFor("");
    }
  };

  const handleClosePackage = async (row) => {
    try {
      setClosingPackageId(row.id);
      setMessage("");
      await completeSmartReportPackage({ assignment: row, actor: user });
      setMessage(`${row.department} reporting package closed and audit record created.`);
    } catch (error) {
      console.error("Package close failed:", error);
      setMessage(error?.message || "Could not close the reporting package.");
    } finally {
      setClosingPackageId("");
    }
  };

  const handleAcknowledge = async (alert) => {
    try {
      await acknowledgeSmartAlert({ alertId: alert.id, actor: user });
    } catch (error) {
      console.error("Alert acknowledgment failed:", error);
      setMessage(error?.message || "Could not acknowledge alert.");
    }
  };

  const assigned = rows.filter((row) => clean(row.assignedDutyManagerId));
  const waiting = rows.filter((row) => !clean(row.assignedDutyManagerId));
  const myRows = rows.filter((row) => isStationManager || row.assignedDutyManagerId === user?.id)
    .filter((row) => !dutyFilter || row.assignedDutyManagerId === dutyFilter);
  const visibleAudit = auditRows.filter((row) => isStationManager || row.actorId === user?.id || row.assignedDutyManagerId === user?.id)
    .filter((row) => !dutyFilter || row.actorId === dutyFilter || row.assignedDutyManagerId === dutyFilter);
  const dutyActivity = Object.values(visibleAudit.reduce((acc, row) => {
    const id = row.actorId || row.assignedDutyManagerId || "system";
    if (!acc[id]) acc[id] = { id, name: row.actorName || row.assignedDutyManagerName || "System", events: 0, reviews: 0, completed: 0 };
    acc[id].events += 1;
    if (row.eventType === "INDIVIDUAL_REPORT_REVIEWED") acc[id].reviews += 1;
    if (row.eventType === "REPORT_PACKAGE_COMPLETED") acc[id].completed += 1;
    return acc;
  }, {}));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Intelligence</div>
            <h1 style={{ margin: "4px 0 5px", fontSize: 26, color: "#0f172a" }}>{isToday ? "Today" : "History"} · {dateKey}</h1>
            <p style={{ margin: 0, color: "#64748b", maxWidth: 820, lineHeight: 1.55 }}>
              Daily ownership, report-package monitoring, follow-up alerts and review audit for TPA operations.
            </p>
          </div>
          <button type="button" onClick={runEngine} disabled={running || !isToday} style={{ border: 0, borderRadius: 12, padding: "10px 14px", background: "#0f4c81", color: "#fff", fontWeight: 850, cursor: running ? "wait" : "pointer" }}>
            {running ? "Checking..." : "Refresh Smart Intelligence"}
          </button>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>Review date
            <input type="date" max={todayKey} value={dateKey} onChange={(e) => changeDate(e.target.value || todayKey)} style={{ border: "1px solid #cbd5e1", padding: 9, borderRadius: 9 }}/>
          </label>
          <button type="button" onClick={() => changeDate(todayKey)} style={{ padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff" }}>Today</button>
          {isStationManager && <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800 }}>Duty Manager
            <select value={dutyFilter} onChange={(e) => setDutyFilter(e.target.value)} style={{ border: "1px solid #cbd5e1", padding: 9, borderRadius: 9 }}><option value="">All Duty Managers</option>{dutyUsers.map((dm) => <option key={dm.id} value={dm.id}>{dm.displayName || dm.fullName || dm.name || dm.username || dm.id}</option>)}</select>
          </label>}
          {!isToday && <span style={{ color: "#64748b", fontSize: 12 }}>Historical records are read-only; no reassignment or approval changes.</span>}
        </div>
      </Card>

      {message && <div style={{ padding: "11px 14px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", fontWeight: 700 }}>{message}</div>}

      {alerts.length > 0 && (
        <Card style={{ borderColor: "#fecaca" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Smart Alerts</h2>
            <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 999, padding: "5px 9px", fontWeight: 900, fontSize: 12 }}>{alerts.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.map((alert) => (
              <div key={alert.id} style={{ border: "1px solid #fecaca", background: "#fff7f7", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900, color: "#991b1b" }}>{alert.title}</div>
                <div style={{ marginTop: 4, color: "#475569", fontSize: 12.5, lineHeight: 1.45 }}>{alert.message}</div>
                {(user?.role === "station_manager" || user?.role === "duty_manager") && (
                  <button type="button" onClick={() => handleAcknowledge(alert)} style={{ marginTop: 8, border: "1px solid #cbd5e1", background: "#fff", borderRadius: 9, padding: "6px 9px", fontWeight: 800, cursor: "pointer" }}>
                    Mark as seen
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Departments</div><div style={{ fontSize: 28, fontWeight: 950 }}>{rows.length}</div></Card>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Assigned</div><div style={{ fontSize: 28, fontWeight: 950, color: "#15803d" }}>{assigned.length}</div></Card>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Waiting Reviewer</div><div style={{ fontSize: 28, fontWeight: 950, color: waiting.length ? "#b45309" : "#15803d" }}>{waiting.length}</div></Card>
        {isStationManager && summary && <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Active Duty Managers</div><div style={{ fontSize: 28, fontWeight: 950 }}>{summary.activeDutyManagers?.length || 0}</div></Card>}
      </div>

      {isStationManager && <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Active Duty Managers</h2>
            <div style={{ marginTop: 4, fontSize: 12.5, color: "#64748b" }}>Presence diagnostic only · assignments follow the weekly schedule</div>
          </div>
          <span style={{ borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 900, background: dutyDiagnostics.some((item) => item.eligible) ? "#dcfce7" : "#fee2e2", color: dutyDiagnostics.some((item) => item.eligible) ? "#166534" : "#b91c1c" }}>
            {dutyDiagnostics.filter((item) => item.eligible).length} eligible
          </span>
        </div>
        {dutyDiagnostics.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>No Duty Manager users found.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {dutyDiagnostics.map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: item.eligible ? "1px solid #bbf7d0" : "1px solid #fed7aa", background: item.eligible ? "#f0fdf4" : "#fff7ed" }}>
                <div>
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>{item.visibleName}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>
                    {item.diagnosticStatus} · {item.ageMinutes === null ? "No activity timestamp" : `Last activity ${item.ageMinutes} min ago`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 900, color: item.eligible ? "#15803d" : "#b45309" }}>{item.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</div>
                  <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{item.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>}

      <Card>
        <h2 style={{ margin: "0 0 12px", fontSize: 19 }}>Daily Review Assignments</h2>
        {myRows.length === 0 ? (
          <div style={{ color: "#64748b", padding: "14px 0" }}>{user?.role === "duty_manager" ? "No departments are assigned to you today." : "No Smart Intelligence assignments have been created yet."}</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {myRows.map((row) => {
              const isWaiting = !clean(row.assignedDutyManagerId);
              const reports = Array.isArray(row.requiredReports) ? row.requiredReports : [];
              const reportPackage = Array.isArray(row.reportPackage) ? row.reportPackage : [];
              const pkg = packageStyle(row.reportPackageStatus);
              const canSelectSupervisor = isToday && (user?.role === "station_manager" || (user?.role === "duty_manager" && row.assignedDutyManagerId === user?.id));
              const canClose =
                canSelectSupervisor &&
                clean(row.responsibleSupervisorName) &&
                Number(row.reportPackageSummary?.missingCount || 0) === 0 &&
                Number(row.reportPackageSummary?.followUpCount || 0) === 0 &&
                row.packageReviewStatus !== "COMPLETED" &&
                reportPackage.filter((item) => item.count > 0 && item.connected && item.status !== "NOT_DUE")
                  .every((item) => row.reportReviews?.[item.key]?.reportId === item.bestReportId);

              return (
                <div key={row.id} style={{ border: isWaiting ? "1px solid #fed7aa" : "1px solid #dbeafe", background: isWaiting ? "#fff7ed" : "#f8fbff", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{row.department || "Department"}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>{row.reviewMode === "DEDICATED" ? "Dedicated Duty Manager pool" : "General Duty Manager pool"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900, background: isWaiting ? "#ffedd5" : "#dcfce7", color: isWaiting ? "#9a3412" : "#166534" }}>{isWaiting ? "WAITING" : "ASSIGNED"}</span>
                      <span style={{ borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900, background: pkg.bg, color: pkg.color }}>{row.packageReviewStatus === "COMPLETED" ? "REVIEW COMPLETE" : pkg.label.toUpperCase()}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 7, fontSize: 13 }}>
                    <div><strong>Duty Manager:</strong> {row.assignedDutyManagerName || "No Duty Manager scheduled for this department"}</div>
                    <div><strong>Responsible Supervisor:</strong> {row.responsibleSupervisorName || "Select one of the Supervisors on Duty below"}</div>

                    {canSelectSupervisor && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 800 }} htmlFor={`supervisor-${row.id}`}>Change Supervisor:</label>
                        <select id={`supervisor-${row.id}`} value={supervisorChoice[row.id] || ""}
                          onChange={(event) => setSupervisorChoice((current) => ({ ...current, [row.id]: event.target.value }))}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 210 }}>
                          <option value="">Select supervisor</option>
                          {supervisorUsers.map((sup) => <option key={sup.id} value={sup.id}>{sup.displayName || sup.fullName || sup.name || sup.username || sup.id} · {sup.department || sup.airline || "Supervisor"}</option>)}
                        </select>
                        <button type="button" disabled={!supervisorChoice[row.id] || selectingSupervisorFor === row.id}
                          onClick={async () => {
                            const selectedId = supervisorChoice[row.id];
                            const scheduled = (row.responsibleSupervisors || []).find((item) => item.userId === selectedId);
                            const sup = supervisorUsers.find((item) => item.id === selectedId);
                            if (!sup) return;
                            const reason = scheduled ? "" : window.prompt("Reason for supervisor coverage change (required):", "Coverage change");
                            if (!scheduled && !clean(reason)) return;
                            if (!window.confirm(`Assign ${sup.displayName || sup.fullName || sup.name || sup.username} as responsible supervisor for ${row.department} on ${row.dateKey}?`)) return;
                            await handleSelectSupervisor(row, { userId: selectedId, name: sup.displayName || sup.fullName || sup.name || sup.username }, reason || "");
                          }}
                          style={{ padding: "8px 12px", border: 0, borderRadius: 8, background: "#0f4c81", color: "white", fontWeight: 800, cursor: "pointer" }}>Save Supervisor</button>
                      </div>
                    )}

                    {Array.isArray(row.responsibleSupervisors) && row.responsibleSupervisors.length > 0 && (
                      <div style={{ display: "grid", gap: 7 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" }}>Supervisors on Duty · tap to select</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {row.responsibleSupervisors.map((supervisor) => {
                            const selected = clean(row.responsibleSupervisorUserId) === clean(supervisor.userId);
                            return (
                              <button
                                key={supervisor.userId || supervisor.employeeId || supervisor.name}
                                type="button"
                                disabled={!canSelectSupervisor || selectingSupervisorFor === row.id}
                                onClick={() => handleSelectSupervisor(row, supervisor)}
                                style={{ border: selected ? "2px solid #16a34a" : "1px solid #cbd5e1", background: selected ? "#dcfce7" : "#fff", color: selected ? "#166534" : "#334155", borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 850, cursor: canSelectSupervisor ? "pointer" : "default", opacity: canSelectSupervisor ? 1 : 0.75 }}
                              >
                                {selected ? "✓ " : ""}{supervisor.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Report package</div>
                    {reportPackage.length ? (
                      <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                        {reportPackage.map((item) => {
                          const st = statusStyle(item.status);
                          return (
                            <div key={item.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", background: "#fff", borderRadius: 10, padding: "9px 10px", flexWrap: "wrap" }}>
                              <div>
                                <div style={{ fontWeight: 850, color: "#334155", fontSize: 12.5 }}>{item.label || SMART_REPORT_LABELS[item.key] || item.key}</div>
                                <div style={{ marginTop: 2, fontSize: 11.5, color: "#64748b" }}>
                                  {item.count > 0 ? `${item.count} found${item.submittedBy ? ` · Submitted by ${item.submittedBy}` : ""}` : item.status === "NOT_DUE" ? "Monthly requirement · not due yet" : item.status === "NOT_CONNECTED" ? "Source not connected yet" : "No report found for today"}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                                <span style={{ borderRadius: 999, padding: "5px 8px", background: st.bg, color: st.color, fontSize: 11, fontWeight: 900 }}>{st.label}</span>
                                {item.bestReportId && REPORT_MANAGEMENT_ROUTES[item.key] && <button type="button" onClick={() => handleOpenReport(row, item)} style={{ padding: "5px 8px", border: "1px solid #93c5fd", borderRadius: 8, color: "#1d4ed8", background: "#eff6ff", fontWeight: 800, cursor: "pointer" }}>Open report</button>}
                                {item.bestReportId && <span style={{ color: row.reportReviews?.[item.key]?.reportId === item.bestReportId ? "#15803d" : "#64748b", fontSize: 11, fontWeight: 800 }}>{row.reportReviews?.[item.key]?.reportId === item.bestReportId ? `Reviewed by ${row.reportReviews[item.key].reviewedByName}` : "Not reviewed"}</span>}
                                {item.bestReportId && canSelectSupervisor && row.packageReviewStatus !== "COMPLETED" && row.reportReviews?.[item.key]?.reportId !== item.bestReportId && <button type="button" disabled={reviewingId === `${row.id}:${item.key}`} onClick={() => handleReviewReport(row, item)} style={{ padding: "5px 8px", border: "1px solid #86efac", borderRadius: 8, color: "#166534", background: "#f0fdf4", fontWeight: 800, cursor: "pointer" }}>Confirm reviewed</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                        {reports.length ? reports.map((key) => <span key={key} style={{ border: "1px solid #dbeafe", background: "#fff", borderRadius: 999, padding: "5px 8px", fontSize: 11.5, fontWeight: 750, color: "#334155" }}>{SMART_REPORT_LABELS[key] || key}</span>) : <span style={{ color: "#94a3b8", fontSize: 12 }}>No required reports configured.</span>}
                      </div>
                    )}
                  </div>

                  {row.packageReviewStatus === "COMPLETED" ? (
                    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#dcfce7", color: "#166534", fontSize: 12.5, fontWeight: 800 }}>
                      Review completed by {row.packageReviewedByName || "Management"}.
                    </div>
                  ) : (
                    canSelectSupervisor && (
                      <button
                        type="button"
                        disabled={!canClose || closingPackageId === row.id}
                        onClick={() => handleClosePackage(row)}
                        style={{ marginTop: 12, border: 0, borderRadius: 10, padding: "9px 12px", background: canClose ? "#15803d" : "#cbd5e1", color: "#fff", fontWeight: 850, cursor: canClose ? "pointer" : "not-allowed" }}
                      >
                        {closingPackageId === row.id ? "Closing..." : "Confirm Review & Close Package"}
                      </button>
                    )
                  )}

                  {row.ruleNotes && <div style={{ marginTop: 10, fontSize: 12, color: "#475569", lineHeight: 1.5 }}><strong>Rule note:</strong> {row.ruleNotes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 style={{ margin: "0 0 12px", fontSize: 19 }}>Duty Manager Activity · {dateKey}</h2>
        {dutyActivity.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 9 }}>{dutyActivity.map((dm) => <div key={dm.id} style={{ padding: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}><strong>{dm.name}</strong><div style={{ fontSize: 12, marginTop: 6 }}>{dm.events} actions · {dm.reviews} reports reviewed · {dm.completed} packages closed</div></div>)}</div> : <div style={{ color: "#64748b" }}>No recorded activity for this date.</div>}
        <h3 style={{ fontSize: 15, marginTop: 16 }}>Audit timeline</h3>
        <div style={{ display: "grid", gap: 6, maxHeight: 380, overflowY: "auto" }}>{visibleAudit.slice(0, 150).map((event) => <div key={event.id} style={{ padding: 9, borderBottom: "1px solid #e2e8f0", fontSize: 12 }}><strong>{event.eventType?.replaceAll("_", " ") || "Activity"}</strong> · {event.department || ""} · {event.actorName || event.assignedDutyManagerName || "System"}<div style={{ color: "#64748b", marginTop: 3 }}>{event.createdAt?.toDate?.()?.toLocaleString("en-US", { timeZone: "America/New_York" }) || "Timestamp pending"}{event.reportKey ? ` · ${SMART_REPORT_LABELS[event.reportKey] || event.reportKey}` : ""}</div></div>)}</div>
      </Card>

      {user?.role === "station_manager" && (
        <Card>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>
            Station Manager receives only completed-package notifications and exceptions. Daily assignments, supervisor selections, report changes and package closures remain in the Smart Intelligence audit trail.
          </div>
        </Card>
      )}
    </div>
  );
}
