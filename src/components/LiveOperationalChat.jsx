import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../UserContext.jsx";
import { operationalChatRequest as request } from "../utils/operationalChatApi.js";

const button = { padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#f8fafc", cursor: "pointer" };
const input = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, width: "100%" };
export default function LiveOperationalChat() {
  const { user } = useUser();
  const [chats, setChats] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [invitees, setInvitees] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [audience, setAudience] = useState("invited");
  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([request("list"), request("invitations")]);
      setChats(a.chats || []); setInvitations(b.invitations || []); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  const refreshMessages = useCallback(async () => {
    if (!active) return;
    try { const r = await request("messages", { chatId: active.id }); setMessages(r.messages || []); }
    catch (e) { setError(e.message); }
  }, [active]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshMessages(); }, [refreshMessages]);
  async function run(action, payload = {}, after) {
    setBusy(true);
    try { const result = await request(action, payload); setError(""); if (after) await after(result); return result; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  }
  const canCreate = ["station_manager", "duty_manager", "supervisor"].includes(user?.role);
  return <section style={{ padding: 16, border: "1px solid #dbe5f0", borderRadius: 16, background: "#fff" }}>
    <h2 style={{ marginTop: 0 }}>💬 Operational Chat</h2>
    {error && <p role="alert" style={{ background: "#fef2f2", color: "#991b1b", padding: 10, borderRadius: 8 }}>{error}</p>}
    {active ? <>
      <button style={button} onClick={() => { setActive(null); setSelected(null); }}>← Channels</button>
      <h3>{active.name}</h3>
      <div style={{ minHeight: 180, maxHeight: 460, overflowY: "auto", background: "#f8fafc", padding: 12, borderRadius: 10 }}>
        {messages.map(m => <div key={m.id} style={{ marginBottom: 10, padding: 10, borderRadius: 10, background: "#e0f2fe", overflowWrap: "anywhere" }}>
          <div onClick={() => setSelected(selected === m.id ? null : m.id)} style={{ cursor: "pointer" }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setSelected(selected === m.id ? null : m.id); }}>
            <strong>{m.senderName || "Employee"}</strong>
            <p style={{ margin: "5px 0" }}>{m.deleted ? <em>Message deleted</em> : m.text}</p>
            {m.editedAt && <small>Edited</small>}
            {!m.deleted && Object.entries(m.reactions || {}).map(([emoji, ids]) => Array.isArray(ids) && ids.length ? <span key={emoji} style={{ marginRight: 7 }}>{emoji} {ids.length}</span> : null)}
          </div>
          {!m.deleted && selected === m.id && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
            {["👍", "❤️", "✅", "⚠️"].map(emoji => <button key={emoji} style={button} disabled={busy} onClick={() => run("react", { chatId: active.id, messageId: m.id, emoji }, refreshMessages)}>{emoji}</button>)}
            {m.senderId === user?.id && <button style={button} onClick={() => setEditing({ id: m.id, text: m.text })}>Edit</button>}
            {(m.senderId === user?.id || user?.role === "station_manager") && <button style={button} disabled={busy} onClick={() => run("delete", { chatId: active.id, messageId: m.id }, refreshMessages)}>Delete</button>}
          </div>}
          {editing?.id === m.id && <form onSubmit={e => { e.preventDefault(); run("edit", { chatId: active.id, messageId: m.id, text: editing.text }, async () => { setEditing(null); await refreshMessages(); }); }}><input style={input} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}/><button style={button} disabled={busy}>Save</button></form>}
        </div>)}
      </div>
      <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (draft.trim()) run("send", { chatId: active.id, text: draft }, async () => { setDraft(""); await refreshMessages(); }); }}>
        <input style={input} placeholder="Write a message" value={draft} maxLength={3000} onChange={e => setDraft(e.target.value)}/>
        <button style={button} disabled={busy || !draft.trim()}>Send</button>
      </form>
      <small>📷 Photo uploads will be enabled after private media authorization is configured.</small>
      <button style={{ ...button, marginTop: 10 }} onClick={refreshMessages}>Refresh messages</button>
    </> : <>
      {invitations.length > 0 && <div style={{ padding: 10, background: "#eff6ff", borderRadius: 10 }}>
        <strong>Invitations</strong>
        {invitations.map(i => <div key={i.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <span>{i.name}</span>
          <button style={button} disabled={busy} onClick={() => run("accept", { chatId: i.id }, refresh)}>Accept</button>
          <button style={button} disabled={busy} onClick={() => run("decline", { chatId: i.id }, refresh)}>Decline</button>
        </div>)}
      </div>}
      {canCreate && <button style={{ ...button, margin: "12px 0" }} onClick={() => setCreating(!creating)}>＋ Create private chat</button>}
      {creating && <form onSubmit={e => { e.preventDefault(); run("create", { name, audience, inviteeIds: invitees.split(",").map(x => x.trim()).filter(Boolean) }, async () => { setName(""); setInvitees(""); setCreating(false); await refresh(); }); }} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <input style={input} placeholder="Chat name" value={name} maxLength={80} onChange={e => setName(e.target.value)} required/>
        <select style={input} value={audience} onChange={e => setAudience(e.target.value)}><option value="invited">Invited employees only</option><option value="supervisors">Supervisors & management</option>{["station_manager", "duty_manager"].includes(user?.role) && <option value="dutys">Duty Managers only</option>}</select>
        <input style={input} placeholder="Employee IDs separated by commas" value={invitees} onChange={e => setInvitees(e.target.value)}/>
        <button style={button} disabled={busy}>Create & invite</button>
      </form>}
      <div style={{ display: "grid", gap: 8 }}>{chats.map(c => <button key={c.id} style={{ ...button, textAlign: "left" }} onClick={() => setActive(c)}>🔒 {c.name} ›</button>)}</div>
      {!chats.length && <p style={{ color: "#64748b" }}>No conversations yet.</p>}
      <button style={{ ...button, marginTop: 12 }} onClick={refresh}>Refresh channels</button>
    </>}
  </section>;
}
