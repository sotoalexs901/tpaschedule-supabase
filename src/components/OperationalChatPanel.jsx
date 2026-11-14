import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";

// Preview-only UX. No operational data is persisted, uploaded or transmitted.
// Live launch requires server-verified membership, protected media and push categories.
const STARTER = [
  ["station", "All Station", "📣"],
  ["ramp", "Ramp Operations", "🚜"],
  ["wchr", "WCHR Operations", "♿"],
  ["bso", "AA BSO", "🧳"],
  ["cabin", "DL Cabin Service", "🧹"],
  ["wal", "World Atlantic", "✈️"],
  ["sy", "Sun Country", "🛫"],
  ["av", "Avianca", "🛬"],
  ["supervisors", "Supervisors Only", "🔒"],
  ["dutys", "Duty Managers Only", "🔒"],
];
const btn = { border: "1px solid #dbe5f0", borderRadius: 10, background: "#f8fafc", padding: "9px 12px", cursor: "pointer", color: "#0f172a" };
const field = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, minWidth: 0, width: "100%" };
const managementRoles = ["station_manager", "duty_manager", "supervisor"];
export default function OperationalChatPanel({ compact = false }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const role = user?.role || "agent";
  const isManager = role === "station_manager";
  const canCreate = managementRoles.includes(role);
  const [channels, setChannels] = useState(() => STARTER.map(([id, name, icon]) => ({
    id, name, icon, members: id === "supervisors" || id === "dutys" ? [] : null,
    restricted: id === "supervisors" || id === "dutys",
    accepted: !["supervisors", "dutys"].includes(id),
  })));
  const [activeId, setActiveId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [chatName, setChatName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [invites, setInvites] = useState([]);
  const [pending, setPending] = useState([]);
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState({});
  const [editing, setEditing] = useState(null);
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);
  const [touchStart, setTouchStart] = useState(null);
  const [alertType, setAlertType] = useState("operational");
  const [alerts, setAlerts] = useState([]);
  const available = useMemo(() => channels.filter(c => {
    if (c.id === "supervisors") return managementRoles.includes(role);
    if (c.id === "dutys") return ["duty_manager", "station_manager"].includes(role);
    return !c.restricted || c.accepted;
  }), [channels, role]);
  const active = available.find(c => c.id === activeId);
  const position = available.findIndex(c => c.id === activeId);
  const move = (step) => { if (available.length) setActiveId(available[(position + step + available.length) % available.length].id); };
  const messages = items[activeId] || [];
  function addInvite() {
    const name = inviteInput.trim().slice(0, 80);
    if (name && !invites.includes(name)) setInvites(old => [...old, name]);
    setInviteInput("");
  }
  function createChat(e) {
    e.preventDefault();
    if (!chatName.trim() || !invites.length) return;
    const id = "preview-" + Date.now();
    const channel = { id, name: chatName.trim().slice(0, 80), icon: "🔒", restricted: true, accepted: true, members: [...invites] };
    setChannels(old => [...old, channel]);
    setPending(old => [...old, { id, name: channel.name, members: [...invites] }]);
    setActiveId(id); setCreating(false); setChatName(""); setInvites([]);
  }
  function send(e) {
    e.preventDefault();
    if (!active || (!draft.trim() && !file)) return;
    const photo = file ? { name: file.name, url: URL.createObjectURL(file) } : null;
    setItems(old => ({ ...old, [activeId]: [...(old[activeId] || []), {
      id: Date.now() + Math.random(), text: draft.trim().slice(0, 3000), photo, reactions: [], edited: false,
    }] }));
    setDraft(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
  }
  function modify(id, fn) { setItems(old => ({ ...old, [activeId]: (old[activeId] || []).map(m => m.id === id ? fn(m) : m) })); }
  function deleteMessage(id) { modify(id, m => ({ ...m, text: "", photo: null, deleted: true })); }
  const card = { background: "#fff", border: "1px solid #dbe5f0", borderRadius: 18, padding: 16, minWidth: 0 };
  return <section aria-label="Operational Chat" style={card}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div><h2 style={{ margin: "0 0 4px", fontSize: 19 }}>💬 Operational Chat</h2><small style={{ color: "#64748b" }}>Station & Department Communications</small></div>
      {compact && <button style={btn} onClick={() => navigate("/operational-chat")}>Open full chat →</button>}
    </div>
    <p role="status" style={{ background: "#fff7ed", color: "#92400e", padding: 10, borderRadius: 10, fontSize: 12 }}>
      INTERACTIVE PREVIEW ONLY — no messages, invitations, images or alerts are sent to employees. Permissions shown here are visual only, not server security.
    </p>
    {!active && !creating && <>
      {canCreate && <button style={{ ...btn, marginBottom: 12, background: "#dbeafe" }} onClick={() => setCreating(true)}>＋ Create private chat</button>}
      {pending.length > 0 && <div style={{ marginBottom: 12, background: "#eff6ff", borderRadius: 10, padding: 10 }}>
        <strong>Sample invitations prepared</strong>
        {pending.map(p => <p key={p.id} style={{ margin: "7px 0", fontSize: 12 }}>{p.name}: {p.members.join(", ")} · Not sent</p>)}
      </div>}
      <div style={{ display: "grid", gap: 7 }}>
        {available.map(c => <button key={c.id} style={{ ...btn, textAlign: "left", display: "flex", justifyContent: "space-between" }} onClick={() => setActiveId(c.id)}><span>{c.icon} {c.name}</span><span>›</span></button>)}
      </div>
    </>}
    {creating && <form onSubmit={createChat} style={{ display: "grid", gap: 10 }}>
      <label>Private chat name<input style={field} value={chatName} maxLength={80} onChange={e => setChatName(e.target.value)} placeholder="Example: Ramp Leadership" required /></label>
      <label>Invite specific employees (preview names only)
        <div style={{ display: "flex", gap: 8 }}><input style={field} value={inviteInput} onChange={e => setInviteInput(e.target.value)} placeholder="Employee name" /><button type="button" style={btn} onClick={addInvite}>Add</button></div>
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{invites.map(name => <button type="button" key={name} style={btn} onClick={() => setInvites(old => old.filter(n => n !== name))}>{name} ×</button>)}</div>
      <div style={{ display: "flex", gap: 8 }}><button type="button" style={btn} onClick={() => setCreating(false)}>Cancel</button><button type="submit" style={btn} disabled={!chatName.trim() || !invites.length}>Create preview chat</button></div>
    </form>}
    {active && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button style={btn} onClick={() => setActiveId(null)}>← Channels</button><strong>{active.icon} {active.name}</strong>
      </div>
      {active.members?.length > 0 && <p style={{ fontSize: 12, color: "#64748b" }}>Invited: {active.members.join(", ")} · invitations not sent</p>}
      <div onTouchStart={e => setTouchStart(e.touches[0]?.clientY ?? null)}
        onTouchEnd={e => { if (touchStart === null) return; const dy = e.changedTouches[0]?.clientY - touchStart; if (Math.abs(dy) > 110) move(dy < 0 ? 1 : -1); setTouchStart(null); }}
        style={{ background: "#f8fafc", borderRadius: 12, padding: 12, minHeight: 155, display: "grid", alignContent: "start", gap: 10 }}>
        {messages.length === 0 && <p style={{ fontSize: 12, color: "#64748b" }}>No preview messages. Write below to test this chat.</p>}
        {messages.map(m => <div key={m.id} style={{ background: "#dbeafe", padding: 10, borderRadius: 12, maxWidth: "95%", overflowWrap: "anywhere" }}>
          {m.deleted ? <em>Message deleted (audit placeholder)</em> : <>
            {editing?.id === m.id ? <form onSubmit={e => { e.preventDefault(); modify(m.id, old => ({ ...old, text: editing.text.slice(0, 3000), edited: true })); setEditing(null); }}><input style={field} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}/><button style={btn}>Save</button><button type="button" style={btn} onClick={() => setEditing(null)}>Cancel</button></form> : <div>{m.text}{m.edited && <small> (edited)</small>}</div>}
            {m.photo && <div><img src={m.photo.url} alt={m.photo.name} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}/><small>{m.photo.name}</small></div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {["👍", "❤️", "✅", "⚠️"].map(emoji => <button key={emoji} style={btn} onClick={() => modify(m.id, old => ({ ...old, reactions: old.reactions.includes(emoji) ? old.reactions.filter(x => x !== emoji) : [...old.reactions, emoji] }))}>{emoji}{m.reactions.includes(emoji) ? " 1" : ""}</button>)}
              <button style={btn} onClick={() => setEditing({ id: m.id, text: m.text })}>Edit</button><button style={btn} onClick={() => deleteMessage(m.id)}>Delete</button>
            </div>
          </>}
        </div>)}
      </div>
      <form onSubmit={send} style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8 }}><input style={field} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a sample message..." /><button style={btn} disabled={!draft.trim() && !file}>Send</button></div>
        <label style={{ fontSize: 12 }}>📷 Attach photo (local preview only, max 5 MB)
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 5 * 1024 * 1024) { e.target.value = ""; setFile(null); return; } setFile(f || null); }}/></label>
        {file && <small>{file.name}</small>}
      </form>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}><button style={btn} onClick={() => move(-1)}>↑ Previous chat</button><button style={btn} onClick={() => move(1)}>↓ Next chat</button></div>
    </>}
    <details style={{ marginTop: 14, borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>🔔 Notification categories (preview)</summary>
      <p style={{ fontSize: 12, color: "#64748b" }}>Operational alerts remain distinct from routine timesheet and report reminders.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{[["operational","🚨 Operational"],["chat","💬 Chat"],["administrative","📋 Administrative"]].map(([id,label]) => <button key={id} style={{ ...btn, background: alertType === id ? "#dbeafe" : "#f8fafc" }} onClick={() => setAlertType(id)}>{label}</button>)}</div>
      {canCreate && <button style={{ ...btn, marginTop: 8 }} onClick={() => setAlerts(old => [{ id: Date.now(), type: alertType, label: alertType === "operational" ? "Operational alert sample" : alertType === "chat" ? "New chat message sample" : "Timesheet reminder sample" }, ...old])}>Generate sample alert</button>}
      {alerts.map(a => <p key={a.id} style={{ background: a.type === "operational" ? "#fee2e2" : "#f1f5f9", padding: 8, borderRadius: 8, fontSize: 12 }}>{a.label} · Not delivered</p>)}
    </details>
  </section>;
}
