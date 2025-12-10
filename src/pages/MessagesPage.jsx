// src/pages/MessagesPage.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

export default function MessagesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [allUsers, setAllUsers] = useState([]);
  const [conversations, setConversations] = useState([]); // lista de chats
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  const [messages, setMessages] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef(null);

  const myId = user?.id; // usamos el id del documento del usuario

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  // ──────────────────────────────
  // 1) Cargar lista de usuarios
  // ──────────────────────────────
  useEffect(() => {
    async function loadUsers() {
      if (!user) return;
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.id !== user.id); // no nos incluimos

        list.sort((a, b) =>
          (a.username || a.loginUsername || "")
            .toLowerCase()
            .localeCompare((b.username || b.loginUsername || "").toLowerCase())
        );
        setAllUsers(list);
      } catch (err) {
        console.error("Error loading users for messages:", err);
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, [user]);

  // ──────────────────────────────
  // 2) Cargar RESUMEN de conversaciones
  //    (último mensaje con cada usuario)
  // ──────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!myId) return;

    try {
      const baseRef = collection(db, "messages");
      const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(query(baseRef, where("fromUserId", "==", myId))),
        getDocs(query(baseRef, where("toUserId", "==", myId))),
      ]);

      const map = {};

      const handleDoc = (d) => {
        const m = d.data();
        const otherId = m.fromUserId === myId ? m.toUserId : m.fromUserId;
        if (!otherId) return;
        const createdAtMs = m.createdAt?.toMillis?.() || 0;

        const existing = map[otherId];
        if (!existing || createdAtMs > existing.lastTime) {
          map[otherId] = {
            otherUserId: otherId,
            lastText: m.text || "",
            lastFromMe: m.fromUserId === myId,
            lastTime: createdAtMs,
          };
        }
      };

      sentSnap.forEach(handleDoc);
      receivedSnap.forEach(handleDoc);

      const list = Object.values(map).sort(
        (a, b) => b.lastTime - a.lastTime
      );
      setConversations(list);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, [myId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ──────────────────────────────
  // 3) Listener de mensajes de la conversación actual
  //    (dos queries: enviados y recibidos)
  // ──────────────────────────────
  useEffect(() => {
    if (!myId || !selectedUserId) {
      setMessages([]);
      return;
    }

    const baseRef = collection(db, "messages");

    const qSent = query(
      baseRef,
      where("fromUserId", "==", myId),
      where("toUserId", "==", selectedUserId),
      orderBy("createdAt", "asc")
    );

    const qReceived = query(
      baseRef,
      where("fromUserId", "==", selectedUserId),
      where("toUserId", "==", myId),
      orderBy("createdAt", "asc")
    );

    setLoadingMessages(true);

    // guardamos los snapshots por separado y luego los combinamos
    let sentMsgs = [];
    let receivedMsgs = [];

    const mergeAndSet = () => {
      const all = [...sentMsgs, ...receivedMsgs].sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return ta - tb;
      });
      setMessages(all);
      setLoadingMessages(false);
    };

    const unsubSent = onSnapshot(
      qSent,
      (snap) => {
        sentMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      },
      (err) => {
        console.error("Error listening sent messages:", err);
        setLoadingMessages(false);
      }
    );

    const unsubReceived = onSnapshot(
      qReceived,
      (snap) => {
        receivedMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      },
      (err) => {
        console.error("Error listening received messages:", err);
        setLoadingMessages(false);
      }
    );

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [myId, selectedUserId]);

  // ──────────────────────────────
  // 4) Scroll al último mensaje
  // ──────────────────────────────
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ──────────────────────────────
  // 5) Marcar recibidos como leídos
  // ──────────────────────────────
  useEffect(() => {
    if (!myId || !selectedUserId || messages.length === 0) return;

    const unread = messages.filter(
      (m) => m.toUserId === myId && m.read === false
    );
    if (unread.length === 0) return;

    // se marcan en segundo plano, sin bloquear la UI
    unread.forEach(async (m) => {
      try {
        await addDoc(
          collection(db, "messages_read_logs"),
          {
            messageId: m.id,
            toUserId: myId,
            readAt: serverTimestamp(),
          }
        );
      } catch (e) {
        console.error("Error logging read event:", e);
      }
    });
  }, [myId, selectedUserId, messages]);

  // ──────────────────────────────
  // Handlers
  // ──────────────────────────────
  const handleChangeUser = (id) => {
    setSelectedUserId(id || "");
    const found = allUsers.find((u) => u.id === id) || null;
    setSelectedUser(found);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!user || !myId || !selectedUserId || !text.trim()) return;

    const trimmed = text.trim();

    try:
      setSending(true);

      await addDoc(collection(db, "messages"), {
        fromUserId: myId,
        toUserId: selectedUserId,
        fromUsername: user.username || user.loginUsername || "",
        toUsername:
          selectedUser?.username || selectedUser?.loginUsername || "",
        text: trimmed,
        createdAt: serverTimestamp(),
        read: false,
      });

      setText("");
      // refrescamos lista de conversaciones
      loadConversations();
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Error sending message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleOpenConversation = (otherUserId) => {
    handleChangeUser(otherUserId);
  };

  // Borrar conversación (solo Station / Duty)
  const handleDeleteConversation = async () => {
    if (!myId || !selectedUserId) return;
    if (!isManager) return;

    const other = selectedUser;
    const name = other?.username || other?.loginUsername || "this user";

    const ok = window.confirm(
      `Delete entire conversation with ${name}? This cannot be undone.`
    );
    if (!ok) return;

    try {
      const baseRef = collection(db, "messages");
      const [snap1, snap2] = await Promise.all([
        getDocs(
          query(
            baseRef,
            where("fromUserId", "==", myId),
            where("toUserId", "==", selectedUserId)
          )
        ),
        getDocs(
          query(
            baseRef,
            where("fromUserId", "==", selectedUserId),
            where("toUserId", "==", myId)
          )
        ),
      ]);

      const allDocs = [...snap1.docs, ...snap2.docs];
      for (const d of allDocs) {
        await deleteDoc(doc(db, "messages", d.id));
      }

      setMessages([]);
      setSelectedUserId("");
      setSelectedUser(null);
      await loadConversations();
    } catch (err) {
      console.error("Error deleting conversation:", err);
      alert("Error deleting conversation. Please try again.");
    }
  };

  if (!user) {
    return (
      <div className="p-4">
        <p>You must be logged in to see messages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con botón Back */}
      <div className="flex items-center gap-3 mb-1">
        <button
          type="button"
          className="btn btn-soft text-xs"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold mb-0">Messages</h1>
      </div>

      {/* Lista de conversaciones activas */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold mb-1">Conversations</h2>
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-600">
            No conversations yet. Start by sending a message.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {conversations.map((c) => {
              const other =
                allUsers.find((u) => u.id === c.otherUserId) || {};
              const name =
                other.username ||
                other.loginUsername ||
                "(unknown user)";
              const preview = c.lastFromMe
                ? `You: ${c.lastText}`
                : c.lastText;

              const isActive = selectedUserId === c.otherUserId;

              return (
                <button
                  key={c.otherUserId}
                  type="button"
                  onClick={() => handleOpenConversation(c.otherUserId)}
                  className={`px-3 py-2 rounded-lg text-xs border shadow-sm text-left ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-100 text-gray-900 border-gray-200"
                  }`}
                >
                  <div className="font-semibold text-[12px] truncate">
                    {name}
                  </div>
                  <div className="text-[11px] truncate">{preview}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selector de usuario */}
      <div className="card space-y-2">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1">
              Send message to:
            </label>
            {loadingUsers ? (
              <p className="text-xs text-gray-600">Loading users…</p>
            ) : (
              <select
                className="border rounded w-full px-2 py-1 text-sm"
                value={selectedUserId}
                onChange={(e) => handleChangeUser(e.target.value)}
              >
                <option value="">Select a user</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username || u.loginUsername || "(no username)"} ·{" "}
                    {u.role}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedUser && (
            <div className="text-xs text-gray-600 md:text-right">
              <div>
                Chatting with{" "}
                <span className="font-semibold">
                  {selectedUser.username || selectedUser.loginUsername}
                </span>
              </div>
              <div className="text-[11px]">
                Role: {selectedUser.role || "N/A"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Área de conversación */}
      {selectedUserId ? (
        <div className="card flex flex-col h-[60vh] max-h-[500px]">
          {/* Botón borrar conversación (solo Station / Duty) */}
          {isManager && (
            <div className="flex justify-end mb-2">
              <button
                type="button"
                className="btn btn-danger text-[11px]"
                onClick={handleDeleteConversation}
              >
                Delete conversation
              </button>
            </div>
          )}

          {/* mensajes */}
          <div className="flex-1 overflow-auto pr-1 mb-2">
            {loadingMessages ? (
              <p className="text-xs text-gray-600">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-gray-600">
                No messages yet. Start the conversation.
              </p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => {
                  const isMine = m.fromUserId === myId;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-xs shadow-sm ${
                          isMine
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        {!isMine && (
                          <div className="font-semibold mb-0.5 text-[11px]">
                            {m.fromUsername || "User"}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* caja de texto / reply */}
          <form onSubmit={handleSend} className="border-t pt-2 mt-1">
            <label className="text-[11px] text-gray-600 block mb-1">
              Write a message
            </label>
            <div className="flex gap-2">
              <textarea
                className="flex-1 border rounded px-2 py-1 text-xs resize-none"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your message…"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="btn btn-primary text-xs h-fit self-end"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card text-xs text-gray-600">
          Select a user to start a conversation.
        </div>
      )}
    </div>
  );
}
