import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  ensureDailySmartAssignments,
  selectResponsibleSupervisor,
  SMART_ASSIGNMENTS_COLLECTION,
  tampaDateKey,
} from "../services/smartIntelligenceAssignmentEngine.js";
import {
  SMART_ALERTS_COLLECTION,
  SMART_REPORT_LABELS,
  acknowledgeSmartAlert,
  completeSmartReportPackage,
  refreshSmartReportPackages,
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

export default function SmartIntelligenceTodayPage() {
  const { user } = useUser();
  const dateKey = useMemo(() => tampaDateKey(), []);
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(null);
  const [selectingSupervisorFor, setSelectingSupervisorFor] = useState("");
  const [closingPackageId, setClosingPackageId] = useState("");
  const [dutyUsers, setDutyUsers] = useState([]);

  const runEngine = async () => {
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
    runEngine();
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
      const next = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => String(item.role || "").trim().toLowerCase() === "duty_manager")
        .sort((a, b) => clean(a.displayName || a.fullName || a.name || a.username).localeCompare(clean(b.displayName || b.fullName || b.name || b.username)));
      setDutyUsers(next);
    });
    return () => unsub();
  }, []);

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

  const handleSelectSupervisor = async (row, supervisor) => {
    if (!row?.id || !supervisor?.userId) return;
    try {
      setSelectingSupervisorFor(row.id);
      setMessage("");
      await selectResponsibleSupervisor({ assignmentId: row.id, supervisorUserId: supervisor.userId, actor: user });
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
  const myRows = user?.role === "duty_manager"
    ? rows.filter((row) => row.assignedDutyManagerId === user.id)
    : rows;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Smart Intelligence</div>
            <h1 style={{ margin: "4px 0 5px", fontSize: 26, color: "#0f172a" }}>Today · {dateKey}</h1>
            <p style={{ margin: 0, color: "#64748b", maxWidth: 820, lineHeight: 1.55 }}>
              Daily ownership, report-package monitoring, follow-up alerts and review audit for TPA operations.
            </p>
          </div>
          <button type="button" onClick={runEngine} disabled={running} style={{ border: 0, borderRadius: 12, padding: "10px 14px", background: "#0f4c81", color: "#fff", fontWeight: 850, cursor: running ? "wait" : "pointer" }}>
            {running ? "Checking..." : "Refresh Smart Intelligence"}
          </button>
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
        {summary && <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Active Duty Managers</div><div style={{ fontSize: 28, fontWeight: 950 }}>{summary.activeDutyManagers?.length || 0}</div></Card>}
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>Active Duty Managers</h2>
            <div style={{ marginTop: 4, fontSize: 12.5, color: "#64748b" }}>Smart Intelligence eligibility diagnostic · 75 minute activity window</div>
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
      </Card>

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
              const canSelectSupervisor = user?.role === "station_manager" || (user?.role === "duty_manager" && row.assignedDutyManagerId === user?.id);
              const canClose =
                canSelectSupervisor &&
                clean(row.responsibleSupervisorName) &&
                Number(row.reportPackageSummary?.missingCount || 0) === 0 &&
                Number(row.reportPackageSummary?.followUpCount || 0) === 0 &&
                row.packageReviewStatus !== "COMPLETED";

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
                    <div><strong>Duty Manager:</strong> {row.assignedDutyManagerName || "Waiting for an eligible Duty Manager to enter AeroStation"}</div>
                    <div><strong>Responsible Supervisor:</strong> {row.responsibleSupervisorName || "Select one of the Supervisors on Duty below"}</div>

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
                              <span style={{ borderRadius: 999, padding: "5px 8px", background: st.bg, color: st.color, fontSize: 11, fontWeight: 900 }}>{st.label}</span>
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
