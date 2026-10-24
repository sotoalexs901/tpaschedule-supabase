import React, { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { subscribeArrivalReadiness } from "../services/arrivalReadinessService.js";

function tampaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function mins(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function statusStyle(status) {
  const key = String(status || "").toUpperCase();
  if (["READY", "STAGING_CONFIRMED"].includes(key)) return { bg: "#ecfdf5", border: "#86efac", text: "#166534", dot: "#22c55e" };
  if (["STAGE_NOW", "PREPARE"].includes(key)) return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#f59e0b" };
  if (["ACTION_REQUIRED", "NO_COVERAGE"].includes(key)) return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", dot: "#ef4444" };
  return { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", dot: "#94a3b8" };
}

function fmtTime(value) {
  if (!value) return "—";
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default function ArrivalReadinessPanel({ compact = false }) {
  const { user } = useUser();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState("");
  const today = tampaDateKey();
  const role = String(user?.role || "").toLowerCase();
  const canConfirm = ["station_manager", "duty_manager", "supervisor"].includes(role);

  useEffect(() => subscribeArrivalReadiness(setRows), []);

  const todayRows = useMemo(() => rows
    .filter((row) => String(row.service_date || row.flight_date || "") === today)
    .filter((row) => row.active !== false)
    .sort((a, b) => (mins(a.minutes_to_arrival) ?? 9999) - (mins(b.minutes_to_arrival) ?? 9999)), [rows, today]);

  if (!todayRows.length) return null;

  async function confirm(row) {
    if (!canConfirm || busyId) return;
    setBusyId(row.id);
    try {
      await updateDoc(doc(db, "arrival_readiness", row.id), {
        staging_confirmed: true,
        staging_confirmed_by: user?.displayName || user?.fullName || user?.name || user?.username || "Supervisor",
        staging_confirmed_by_id: user?.id || user?.uid || "",
        staging_confirmed_at: serverTimestamp(),
        status: "READY",
        updated_at: serverTimestamp(),
      });
    } finally {
      setBusyId("");
    }
  }

  return (
    <section style={{ marginTop: 14, border: "1px solid #dbeafe", borderRadius: 18, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: compact ? "12px 13px" : "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Station Intelligence</div>
          <div style={{ fontSize: compact ? 17 : 19, fontWeight: 900, color: "#0f172a", marginTop: 2 }}>Arrival Readiness</div>
          <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>ETA + gate + punched-in WCHR availability + recorded operational routes. Supervisor confirms final staging/assignment.</div>
        </div>
        <span style={{ borderRadius: 999, padding: "6px 10px", background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, fontSize: 11 }}>{todayRows.length} ACTIVE</span>
      </div>

      <div style={{ padding: compact ? 10 : 12, display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
        {todayRows.map((row) => {
          const style = statusStyle(row.status);
          const etaMins = mins(row.minutes_to_arrival);
          const candidates = Array.isArray(row.recommended_agents) ? row.recommended_agents : [];
          return (
            <div key={row.id} style={{ border: `1px solid ${style.border}`, background: style.bg, borderRadius: 15, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 950, color: "#0f172a" }}>{row.flight_label || row.flight_number || "Flight"}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Gate <b>{row.gate || "—"}</b> · ETA <b>{fmtTime(row.eta)}</b>{etaMins !== null ? ` · ${etaMins} min` : ""}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "5px 9px", background: "#fff", border: `1px solid ${style.border}`, color: style.text, fontSize: 10.5, fontWeight: 900 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: style.dot }} />{String(row.status || "MONITORING").replaceAll("_", " ")}</span>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                <Metric label="WCHR" value={row.expected_wchr_count ?? 0} />
                <Metric label="Available" value={row.eligible_agent_count ?? 0} />
                <Metric label="Near gate" value={row.near_gate_count ?? 0} />
              </div>

              <div style={{ marginTop: 10, fontSize: 11, fontWeight: 900, color: "#334155" }}>Recommended staging</div>
              {candidates.length ? candidates.slice(0, 3).map((agent, index) => (
                <div key={agent.agent_id || `${row.id}-${index}`} style={{ marginTop: 6, padding: "7px 9px", borderRadius: 10, background: "rgba(255,255,255,.82)", border: "1px solid rgba(148,163,184,.25)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 850, color: "#0f172a" }}>{index + 1}. {agent.agent_name || "WCHR Agent"}</span>
                  <span style={{ fontSize: 10.5, color: "#64748b", textAlign: "right" }}>{agent.route_origin_name || agent.location || "Location unknown"}{Number.isFinite(Number(agent.route_eta_minutes)) ? ` → gate · ~${Math.max(1, Math.round(Number(agent.route_eta_minutes)))} min` : Number.isFinite(Number(agent.distance_meters)) ? ` · ~${Math.round(Number(agent.distance_meters))} m` : ""}{agent.route_confidence && agent.route_confidence !== "UNKNOWN" ? ` · ${String(agent.route_confidence).toLowerCase()} confidence` : ""}</span>
                </div>
              )) : <div style={{ marginTop: 6, fontSize: 11.5, color: "#991b1b", fontWeight: 800 }}>No eligible punched-in WCHR agent currently available.</div>}

              {canConfirm && !row.staging_confirmed && ["PREPARE", "STAGE_NOW", "ACTION_REQUIRED", "NO_COVERAGE"].includes(String(row.status || "").toUpperCase()) && (
                <button type="button" onClick={() => confirm(row)} disabled={busyId === row.id} style={{ marginTop: 11, width: "100%", minHeight: 38, border: 0, borderRadius: 10, background: "#0f3b66", color: "#fff", fontWeight: 900, fontSize: 11.5, cursor: "pointer" }}>
                  {busyId === row.id ? "Saving..." : "Confirm WCHR staging"}
                </button>
              )}
              {row.staging_confirmed && <div style={{ marginTop: 9, fontSize: 10.5, color: "#166534", fontWeight: 900 }}>✓ Staging confirmed{row.staging_confirmed_by ? ` by ${row.staging_confirmed_by}` : ""}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div style={{ padding: "7px 8px", borderRadius: 10, background: "rgba(255,255,255,.75)", border: "1px solid rgba(148,163,184,.2)" }}><div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".04em", color: "#64748b", fontWeight: 850 }}>{label}</div><div style={{ fontSize: 16, color: "#0f172a", fontWeight: 950, marginTop: 1 }}>{value}</div></div>;
}
