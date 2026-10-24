import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  ensureDailySmartAssignments,
  SMART_ASSIGNMENTS_COLLECTION,
  tampaDateKey,
} from "../services/smartIntelligenceAssignmentEngine.js";

const REPORT_LABELS = {
  gate_checklist: "Gate Checklist",
  operational_report: "Supervisor Operational Report",
  supervisor_daily_report: "Supervisor Daily Report",
  timesheet: "Timesheet",
  operations_request: "Supplies / Uniform / OT Request",
  cleaning_security: "Cleaning & Security Report",
  regulated_garbage: "Regulated Garbage Report",
  wchr_flight_report: "WCHR Flight Report",
  wchr_poi: "WCHR POI Report",
  employee_performance: "Employee Performance Report",
  bso_daily: "BSO Daily Report",
  fuel_entry: "Fuel Entry",
  cierre_vuelo: "Cierre de Vuelo",
};

function clean(value) {
  return String(value ?? "").trim();
}

function visibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "User";
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 12px 30px rgba(15,23,42,.05)", padding: 18, ...style }}>
      {children}
    </div>
  );
}

export default function SmartIntelligenceTodayPage() {
  const { user } = useUser();
  const dateKey = useMemo(() => tampaDateKey(), []);
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(null);

  const runEngine = async () => {
    try {
      setRunning(true);
      setMessage("");
      const result = await ensureDailySmartAssignments({ actor: user });
      setSummary(result);
      setMessage(`Smart Intelligence checked ${result.rulesCount} department rule${result.rulesCount === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Smart Intelligence assignment engine failed:", error);
      setMessage(error?.message || "Could not run Smart Intelligence assignments.");
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
            <p style={{ margin: 0, color: "#64748b", maxWidth: 780, lineHeight: 1.55 }}>
              Daily department review assignments. Dedicated review pools stay isolated from the general Duty Manager pool, and an assigned department remains with the same reviewer for the day.
            </p>
          </div>
          <button type="button" onClick={runEngine} disabled={running} style={{ border: 0, borderRadius: 12, padding: "10px 14px", background: "#0f4c81", color: "#fff", fontWeight: 850, cursor: running ? "wait" : "pointer" }}>
            {running ? "Checking..." : "Refresh Assignments"}
          </button>
        </div>
      </Card>

      {message && <div style={{ padding: "11px 14px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", fontWeight: 700 }}>{message}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Departments</div><div style={{ fontSize: 28, fontWeight: 950 }}>{rows.length}</div></Card>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Assigned</div><div style={{ fontSize: 28, fontWeight: 950, color: "#15803d" }}>{assigned.length}</div></Card>
        <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Waiting Reviewer</div><div style={{ fontSize: 28, fontWeight: 950, color: waiting.length ? "#b45309" : "#15803d" }}>{waiting.length}</div></Card>
        {summary && <Card><div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>Active Duty Managers</div><div style={{ fontSize: 28, fontWeight: 950 }}>{summary.activeDutyManagers?.length || 0}</div></Card>}
      </div>

      <Card>
        <h2 style={{ margin: "0 0 12px", fontSize: 19 }}>Daily Review Assignments</h2>
        {myRows.length === 0 ? (
          <div style={{ color: "#64748b", padding: "14px 0" }}>
            {user?.role === "duty_manager" ? "No departments are assigned to you today." : "No Smart Intelligence assignments have been created yet."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {myRows.map((row) => {
              const isWaiting = !clean(row.assignedDutyManagerId);
              const reports = Array.isArray(row.requiredReports) ? row.requiredReports : [];
              return (
                <div key={row.id} style={{ border: isWaiting ? "1px solid #fed7aa" : "1px solid #dbeafe", background: isWaiting ? "#fff7ed" : "#f8fbff", borderRadius: 14, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{row.department || "Department"}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                        {row.reviewMode === "DEDICATED" ? "Dedicated Duty Manager pool" : "General Duty Manager pool"}
                      </div>
                    </div>
                    <span style={{ borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900, background: isWaiting ? "#ffedd5" : "#dcfce7", color: isWaiting ? "#9a3412" : "#166534" }}>
                      {isWaiting ? "WAITING" : "ASSIGNED"}
                    </span>
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
                    <div><strong>Duty Manager:</strong> {row.assignedDutyManagerName || "Waiting for an eligible Duty Manager to enter AeroStation"}</div>
                    <div>
                      <strong>{Number(row.responsibleSupervisorCount || 0) > 1 ? "Supervisors on Duty:" : "Responsible Supervisor:"}</strong>{" "}
                      {Array.isArray(row.responsibleSupervisorNames) && row.responsibleSupervisorNames.length
                        ? row.responsibleSupervisorNames.join(", ")
                        : row.responsibleSupervisorName || "Not identified from Approved Schedule yet"}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#64748b" }}>
                      Source: {row.responsibleSupervisorSource === "approved_schedule_plus_users"
                        ? "Approved Schedule + Manage Users"
                        : "Waiting for Approved Schedule / linked Supervisor user"}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" }}>Required reports</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                      {reports.length ? reports.map((key) => (
                        <span key={key} style={{ border: "1px solid #dbeafe", background: "#fff", borderRadius: 999, padding: "5px 8px", fontSize: 11.5, fontWeight: 750, color: "#334155" }}>
                          {REPORT_LABELS[key] || key}
                        </span>
                      )) : <span style={{ color: "#94a3b8", fontSize: 12 }}>No required reports configured.</span>}
                    </div>
                  </div>

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
            Assignments are stored by date and department for future audit. Responsible supervisors are resolved from the Approved Schedule and validated against linked Manage Users roles. The next phase will compare received reports against each department's configured list.
          </div>
        </Card>
      )}
    </div>
  );
}
