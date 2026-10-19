// src/components/LiveServiceBoard.jsx
// Read-only presentation component. Does not write to Firebase.
// Props: wchrReports (array), umnrAssignments (array), onOpenWchr(report), onOpenUmnr(item)
import React, { useEffect, useMemo, useState } from "react";

const ACTIVE_END_STATES = new Set(["COMPLETED", "CANCELLED", "STORED", "CLOSED", "DELIVERED", "REJECTED"]);
const UMNR_LIVE_STATES = new Set(["ASSIGNED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT", "AT_GATE"]);
const text = (v) => String(v ?? "").trim();
const upper = (v) => text(v).toUpperCase();
const formatStatus = (v) => text(v || "ASSIGNED").replace(/_/g, " ");
const elapsed=(start,end)=>{if(!start)return "Not started";const a=new Date(start).getTime(),b=new Date(end).getTime();if(!Number.isFinite(a)||!Number.isFinite(b))return "Not available";const s=Math.max(0,Math.floor((b-a)/1000));return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s/60)%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;};

export function buildLiveServiceCards(wchrReports = [], umnrAssignments = []) {
  const wchr = (Array.isArray(wchrReports) ? wchrReports : [])
    .filter((r) => r && !ACTIVE_END_STATES.has(upper(r.tracking_status || r.service_status)))
    .filter((r) => text(r.wchr_agent_id || r.assigned_agent_id || r.wchr_agent_name))
    .map((r) => ({
      id: `WCHR:${text(r.id)}`,
      kind: "WCHR",
      code: `WCHR ${text(r.wheelchair_number) || "—"}`,
      agent: text(r.wchr_agent_name || r.assigned_wchr_agent || r.assigned_agent_name) || "Assigned agent",
      status: upper((r.assignment_status === "PENDING_ACCEPTANCE" ? "PENDING_ACCEPTANCE" : r.assignment_acceptance_status === "REJECTED" ? "REJECTED" : null) || r.tracking_status || r.service_status || "ASSIGNED"),
      location: text(r.current_location || r.last_known_location) || "Not reported",
      flight: text(r.flight_number || r.flightNumber) || "—",
      updated: r.last_location_update_at || r.last_updated_at || null,
      source: r,
    }));
  const umnr = (Array.isArray(umnrAssignments) ? umnrAssignments : [])
    .filter((r) => r && UMNR_LIVE_STATES.has(upper(r.status || r.service_status)) && text(r.agentId || r.agent_id))
    .map((r) => ({
      id: `UMNR:${text(r.id)}`,
      kind: "UMNR",
      code: text(r.display_code || r.umnr_code || r.code || `UMNR ${r.airline || ""} ${r.flightNumber || ""}`) || "UMNR",
      agent: text(r.agentName || r.agent_name || r.assigned_agent_name) || "Assigned agent",
      status: upper(r.assignment_acceptance_status || r.status || "ASSIGNED"),
      location: text(r.currentLocation || r.current_location || r.handoffLocation || r.gate) || "Not reported",
      flight: text(r.flightNumber || r.flight_number) || "—",
      updated: r.lastCustodyAt || r.updatedAt || r.last_location_update_at || r.updated_at || null,
      pickupLocation: text(r.pickupLocation) || "Not recorded",
      destination: upper(r.direction)==="OB" ? (text(r.gate) ? `Gate ${text(r.gate)}` : "Gate not recorded") : (text(r.handoffLocation)||"Authorized pickup point not recorded"),
      pickedUpAt: r.pickedUpAt || null,
      handoffAt: r.handoffAt || null,
      source: r,
    }));
  return [...wchr, ...umnr];
}

export default function LiveServiceBoard({
  wchrReports = [],
  umnrAssignments = [],
  pendingWchrReports = [],
  umnrError = "",
  onOpenWchr,
  onOpenUmnr,
}) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{const id=window.setInterval(()=>setClock(Date.now()),1000);return ()=>window.clearInterval(id);},[]);
  const cards = useMemo(() => buildLiveServiceCards(wchrReports, umnrAssignments), [wchrReports, umnrAssignments]);
  const pendingCards = (Array.isArray(pendingWchrReports) ? pendingWchrReports : []).map((r) => ({
    id: `PENDING:${text(r.id)}`, kind: "WCHR", code: `WCHR ${text(r.wheelchair_number) || "—"}`,
    agent: "No active agent", status: upper(r.tracking_status || r.service_status || "PENDING"),
    location: text(r.current_location || r.gate || r.gate_number) || "Not reported",
    flight: text(r.flight_number || r.flightNumber) || "—", source: r,
  }));
  const visiblePending = pendingCards.filter((card) => filter === "ALL" || filter === "WCHR");
  const visible = cards.filter((card) => filter === "ALL" || card.kind === filter);
  const chosen = [...cards, ...pendingCards].find((card) => card.id === selected);
  const counts = { ALL: cards.length, WCHR: cards.filter((c) => c.kind === "WCHR").length, UMNR: cards.filter((c) => c.kind === "UMNR").length };
  const open = (card) => {
    setSelected(card.id);
    if (card.kind === "WCHR" && typeof onOpenWchr === "function") onOpenWchr(card.source);
    if (card.kind === "UMNR" && typeof onOpenUmnr === "function") onOpenUmnr(card.source);
  };
  return (
    <section aria-label="Live Service Board" style={{ padding: 16, background: "#f5f9ff", border: "1px solid #d8e5f5", borderRadius: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>✈️ Live Service Board <span style={{ color: "#166534" }}>({cards.length})</span></h2>
        <div style={{ display: "flex", gap: 8 }} role="group" aria-label="Service filter">
          {["ALL", "WCHR", "UMNR"].map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #bcd0e9", background: filter === item ? "#1d4ed8" : "white", color: filter === item ? "white" : "#183153", cursor: "pointer" }}>
              {item === "ALL" ? "All" : item} {counts[item]}
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: "8px 0 14px", color: "#475569" }}>Select an assignment to view status, location and details.</p>
      {umnrError && <p role="status" style={{ color: "#9a3412", fontSize: 13 }}>{umnrError}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 215px), 1fr))", gap: 12 }}>
        {visible.map((card) => (
          <button key={card.id} type="button" onClick={() => open(card)} style={{ textAlign: "left", minHeight: 160, background: "white", border: `2px solid ${card.kind === "UMNR" ? "#bbf7d0" : "#bfdbfe"}`, borderRadius: 14, padding: 14, cursor: "pointer", boxShadow: "0 2px 7px #1e293b0c" }}>
            <div aria-hidden="true" style={{ fontSize: 40, lineHeight: 1.2 }}>{card.kind === "WCHR" ? "🧑‍🦽" : "🧑‍🤝‍🧑"}</div>
            <div style={{ fontWeight: 800, color: "#0f172a", marginTop: 6 }}>{card.code}</div>
            <div style={{ fontWeight: 600, color: "#334155" }}>{card.agent}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>{formatStatus(card.status)} · {card.flight}</div>
            {card.kind==="UMNR" && <div style={{fontSize:12,marginTop:7,color:"#334155"}}><strong>Service Route:</strong> {card.pickupLocation} → {card.destination}</div>}
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>📍 Current location: {card.location}</div>
            {card.kind==="UMNR" && <div style={{fontSize:13,marginTop:6,fontWeight:700}}>⏱ Service Timer: {elapsed(card.pickedUpAt,card.handoffAt||clock)}</div>}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p style={{ color: "#64748b" }}>No active assignments in this category.</p>}
      <div style={{ marginTop: 20, borderTop: "1px solid #d8e5f5", paddingTop: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 6px" }}>Pending / Unassigned ({visiblePending.length})</h3>
        <p style={{ color: "#64748b", margin: "0 0 12px", fontSize: 13 }}>Services without an active agent assignment. Boarded services are excluded; review them in the existing Dispatch list.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 215px), 1fr))", gap: 12 }}>
          {visiblePending.map((card) => <button key={card.id} type="button" onClick={() => open(card)} style={{ textAlign: "left", padding: 14, background: "#fff", border: "1px solid #fbbf24", borderRadius: 12, cursor: "pointer" }}>
            <strong>{card.code}</strong><div>{card.status.replace(/_/g, " ")} · {card.flight}</div><div>📍 {card.location}</div><div style={{ color: "#92400e", fontSize: 12 }}>Unassigned — review in Dispatch</div>
          </button>)}
        </div>
        {visiblePending.length === 0 && <p style={{ color: "#64748b" }}>No pending unassigned services in this category.</p>}
      </div>
      {chosen && (
        <div role="region" aria-label="Selected service details" style={{ marginTop: 14, borderRadius: 12, background: "white", border: "1px solid #cbd5e1", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{chosen.kind}: {chosen.code}</strong>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close details">✕</button>
          </div>
          <p><strong>Employee:</strong> {chosen.agent}</p>
          <p><strong>Status:</strong> {formatStatus(chosen.status)}</p>
          <p><strong>Flight:</strong> {chosen.flight}</p>
          <p><strong>Last location:</strong> {chosen.location}</p>
          {chosen.kind==="UMNR"&&<><p><strong>Service Route:</strong> {chosen.pickupLocation} → {chosen.destination}</p><p><strong>Service Timer:</strong> {elapsed(chosen.pickedUpAt,chosen.handoffAt||clock)}</p></>}
          <p style={{ color: "#64748b", fontSize: 12 }}>Full passenger/minor records and timelines should open through the authorized Dispatch details view. Sensitive data is intentionally excluded from this board.</p>
        </div>
      )}
    </section>
  );
}
