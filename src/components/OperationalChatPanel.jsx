import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";

const CHANNELS = [
  { id: "station", name: "All Station", icon: "📣", management: false },
  { id: "ramp", name: "Ramp Operations", icon: "🚜" },
  { id: "wchr", name: "WCHR Operations", icon: "♿" },
  { id: "bso", name: "AA BSO", icon: "🧳" },
  { id: "cabin", name: "DL Cabin Service", icon: "🧹" },
  { id: "wal", name: "World Atlantic", icon: "✈️" },
  { id: "sy", name: "Sun Country", icon: "🛫" },
  { id: "av", name: "Avianca", icon: "🛬" },
  { id: "management", name: "Supervisors & Management", icon: "🔒", management: true },
];
const styles = {
  card: { background: "#fff", border: "1px solid #dbe5f0", borderRadius: 18, padding: 16, minWidth: 0 },
  button: { border: "1px solid #dbe5f0", borderRadius: 12, background: "#f8fafc", padding: "12px", textAlign: "left", cursor: "pointer", color: "#0f172a", fontWeight: 650 },
};
export default function OperationalChatPanel({ compact = false }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const role = user?.role || "agent";
  const canManage = ["supervisor", "duty_manager", "station_manager"].includes(role);
  const channels = CHANNELS.filter(c => !c.management || canManage);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [samples, setSamples] = useState({});
  const active = channels.find(c => c.id === selected);
  const activeIndex = channels.findIndex(c => c.id === selected);
  const switchChannel = (step) => setSelected(channels[(activeIndex + step + channels.length) % channels.length].id);
  const [touchY, setTouchY] = useState(null);
  function addPreviewMessage(e) {
    e.preventDefault();
    if (!draft.trim() || !active) return;
    setSamples(old => ({ ...old, [active.id]: [...(old[active.id] || []), draft.trim()] }));
    setDraft("");
  }
  return <section aria-label="Operational Chat" style={styles.card}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div><h2 style={{ margin: "0 0 4px", fontSize: 19 }}>💬 Operational Chat</h2><p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Department & Station Communications</p></div>
      {compact && <button style={styles.button} onClick={() => navigate("/operational-chat")}>Open full chat →</button>}
    </div>
    <p role="status" style={{ background: "#fff7ed", color: "#92400e", borderRadius: 9, padding: 10, fontSize: 12, margin: "12px 0" }}>
      Preview mode: channel navigation and sample messages only. Messages are not sent to other employees. Live chat and alerts require secure Firebase rules and backend integration.
    </p>
    {!active ? <div style={{ display: "grid", gap: 8 }}>
      {channels.map(c => <button key={c.id} style={{ ...styles.button, display: "flex", justifyContent: "space-between", alignItems: "center" }} onClick={() => setSelected(c.id)}><span>{c.icon} {c.name}</span><span aria-hidden="true">›</span></button>)}
    </div> : <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button style={styles.button} onClick={() => setSelected(null)}>← Channels</button><strong>{active.icon} {active.name}</strong>
      </div>
      <div onTouchStart={e => setTouchY(e.touches[0]?.clientY ?? null)} onTouchEnd={e => { if (touchY === null) return; const delta = e.changedTouches[0]?.clientY - touchY; if (Math.abs(delta) > 90) switchChannel(delta < 0 ? 1 : -1); setTouchY(null); }} style={{ background: "#f8fafc", borderRadius: 12, padding: 12, minHeight: 155, display: "grid", gap: 8, alignContent: "start" }}>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>Sample conversation · {active.name}</p>
        {(samples[active.id] || []).map((msg, i) => <div key={i} style={{ justifySelf: "end", background: "#dbeafe", borderRadius: 12, padding: 10, maxWidth: "90%", overflowWrap: "anywhere" }}>{msg}</div>)}
      </div>
      <form onSubmit={addPreviewMessage} style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input aria-label="Sample chat message" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a sample message..." style={{ flex: 1, minWidth: 0, border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, fontSize: 14 }} />
        <button type="submit" disabled={!draft.trim()} style={styles.button}>Send</button>
      </form>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <button style={styles.button} onClick={() => switchChannel(-1)}>↑ Previous</button>
        <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center" }}>Swipe to switch</span>
        <button style={styles.button} onClick={() => switchChannel(1)}>↓ Next</button>
      </div>
    </>}
  </section>;
}
