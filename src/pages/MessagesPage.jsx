// src/pages/MessagesPage.jsx
import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function buildConversationKey(a, b) {
  return [a, b].sort().join("_");
}

export default function MessagesPage() {
  const { user } = useUser();
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Cargar lista de usuarios
  useEffect(() => {
    async function loadUsers() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.id !== user?.id);

        list.sort((a, b) =>
          (a.username || "").localeCompare(b.username || "")
        );
        setAllUsers(list);
      } catch (err) {
        console.error("Error loading users for messages:", err);
      } finally {
        setLoadingUsers(false);
      }
    }
    if (user) loadUsers();
  }, [user]);

  // Escuchar mensajes de la conversación seleccionada
  useEffect(() => {
    if (!user || !selectedUserId) {
      setMessages([]);
      return;
    }

    const convKey = buildConversationKey(user.id, selectedUserId);
    setLoadingMessages(true);

    const q = query(
      collection(db, "messages"),
      where("conversationKey", "==", convKey),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(list);
        setLoadingMessages(false);
      },
      (err) => {
        console.error("Error loading messages:", err);
        setLoadingMessages(false);
      }
    );

    return () => unsub();
  }, [user, selectedUserId]);

  // Scroll al último mensaje
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleChangeUser = (id) => {
    setSelectedUserId(id);
    const found = allUsers.find((u) => u.id === id) || null;
    setSelectedUser(found);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!user || !selectedUserId || !text.trim()) return;

    try {
      setSending(true);
      const convKey = buildConversationKey(user.id, selectedUserId);

      await addDoc(collection(db, "messages"), {
        conversationKey: convKey,
        fromUserId: user.id,
        toUserId: selectedUserId,
        fromUsername: user.username || user.loginUsername || "",
        toUsername:
          selectedUser?.username || selectedUser?.loginUsername || "",
        text: text.trim(),
        createdAt: serverTimestamp(),
        read: false,
      });

      setText("");
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Error sending message. Please try again.");
    } finally {
      setSending(false);
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
      <h1 className="text-lg font-semibold">Messages</h1>

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
                  const isMine = m.fromUserId === user.id;
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
