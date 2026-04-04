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
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate, useLocation } from "react-router-dom";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "none",
        ...props.style,
      }}
    />
  );
}

function getUserLabel(u) {
  return (
    u?.displayName ||
    u?.fullName ||
    u?.name ||
    u?.username ||
    u?.loginUsername ||
    "(unknown user)"
  );
}

export default function MessagesPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [allUsers, setAllUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  const [messages, setMessages] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const bottomRef = useRef(null);
  const prefillAppliedRef = useRef(false);

  const myId = user?.id;

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  useEffect(() => {
    async function loadUsers() {
      if (!user) return;
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.id !== user.id);

        list.sort((a, b) =>
          getUserLabel(a).toLowerCase().localeCompare(getUserLabel(b).toLowerCase())
        );

        setAllUsers(list);
      } catch (err) {
        console.error("Error loading users for messages:", err);
        setStatusMessage("Could not load users.");
      } finally {
        setLoadingUsers(false);
      }
    }

    loadUsers();
  }, [user]);

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

      const list = Object.values(map).sort((a, b) => b.lastTime - a.lastTime);
      setConversations(list);
    } catch (err) {
      console.error("Error loading conversations:", err);
      setStatusMessage("Could not load conversations.");
    }
  }, [myId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!myId || !selectedUserId || messages.length === 0) return;

    const unread = messages.filter(
      (m) => m.toUserId === myId && m.read === false
    );
    if (unread.length === 0) return;

    unread.forEach(async (m) => {
      try {
        await updateDoc(doc(db, "messages", m.id), { read: true });
      } catch (e) {
        console.error("Error marking message as read:", e);
      }
    });
  }, [myId, selectedUserId, messages]);

  useEffect(() => {
    if (loadingUsers) return;
    if (prefillAppliedRef.current) return;
    if (!allUsers.length) return;

    const incomingState = location.state || {};
    const recipientUserId = String(incomingState.recipientUserId || "").trim();
    const recipientUsername = String(incomingState.recipientUsername || "")
      .trim()
      .toLowerCase();
    const recipientName = String(incomingState.recipientName || "").trim();
    const prefilledMessage = String(incomingState.prefilledMessage || "").trim();

    if (!recipientUserId && !recipientUsername && !recipientName && !prefilledMessage) {
      return;
    }

    let foundUser = null;

    if (recipientUserId) {
      foundUser = allUsers.find((u) => u.id === recipientUserId) || null;
    }

    if (!foundUser && recipientUsername) {
      foundUser =
        allUsers.find(
          (u) =>
            String(u.username || "").trim().toLowerCase() === recipientUsername ||
            String(u.loginUsername || "").trim().toLowerCase() === recipientUsername
        ) || null;
    }

    if (!foundUser && recipientName) {
      foundUser =
        allUsers.find((u) => {
          const full =
            String(
              u.displayName ||
                u.fullName ||
                u.name ||
                u.username ||
                u.loginUsername ||
                ""
            )
              .trim()
              .toLowerCase();
          return full === recipientName.toLowerCase();
        }) || null;
    }

    if (foundUser) {
      setSelectedUserId(foundUser.id);
      setSelectedUser(foundUser);
    }

    if (prefilledMessage) {
      setText(prefilledMessage);
    }

    prefillAppliedRef.current = true;

    window.history.replaceState({}, document.title);
  }, [loadingUsers, allUsers, location.state]);

  const handleChangeUser = (id) => {
    setSelectedUserId(id || "");
    const found = allUsers.find((u) => u.id === id) || null;
    setSelectedUser(found);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!user || !myId || !selectedUserId || !text.trim()) return;

    const trimmed = text.trim();

    try {
      setSending(true);
      setStatusMessage("");

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
      await loadConversations();
    } catch (err) {
      console.error("Error sending message:", err);
      setStatusMessage("Error sending message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleOpenConversation = (otherUserId) => {
    handleChangeUser(otherUserId);
  };

  const handleDeleteConversation = async () => {
    if (!myId || !selectedUserId) return;
    if (!isManager) return;

    const other = selectedUser;
    const name = getUserLabel(other);

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
      setStatusMessage("Conversation deleted.");
      await loadConversations();
    } catch (err) {
      console.error("Error deleting conversation:", err);
      setStatusMessage("Error deleting conversation. Please try again.");
    }
  };

  if (!user) {
    return (
      <PageCard style={{ padding: 22 }}>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          You must be logged in to see messages.
        </p>
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Communications
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Messages
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Start direct conversations with users, review existing chats and
              manage message threads.
            </p>
          </div>

          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => navigate(-1)}
          >
            ← Back
          </ActionButton>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Conversations
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Open an existing thread or start a new one by selecting a user.
          </p>
        </div>

        {conversations.length === 0 ? (
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No conversations yet. Start by sending a message.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {conversations.map((c) => {
              const other = allUsers.find((u) => u.id === c.otherUserId) || {};
              const name = getUserLabel(other);
              const preview = c.lastFromMe ? `You: ${c.lastText}` : c.lastText;
              const isActive = selectedUserId === c.otherUserId;

              return (
                <button
                  key={c.otherUserId}
                  type="button"
                  onClick={() => handleOpenConversation(c.otherUserId)}
                  style={{
                    minWidth: 180,
                    maxWidth: 260,
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 16,
                    border: isActive
                      ? "1px solid #1769aa"
                      : "1px solid #e2e8f0",
                    background: isActive ? "#1769aa" : "#f8fbff",
                    color: isActive ? "#fff" : "#0f172a",
                    cursor: "pointer",
                    boxShadow: isActive
                      ? "0 12px 24px rgba(23,105,170,0.18)"
                      : "none",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      opacity: isActive ? 0.92 : 0.7,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {preview}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr auto",
            gap: 14,
            alignItems: "end",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "#475569",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
              }}
            >
              Send message to
            </label>

            {loadingUsers ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Loading users...
              </p>
            ) : (
              <SelectInput
                value={selectedUserId}
                onChange={(e) => handleChangeUser(e.target.value)}
              >
                <option value="">Select a user</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {getUserLabel(u)} · {u.role}
                  </option>
                ))}
              </SelectInput>
            )}
          </div>

          {selectedUser && (
            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "12px 14px",
                minWidth: 220,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Active chat
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  color: "#0f172a",
                  fontWeight: 800,
                }}
              >
                {getUserLabel(selectedUser)}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                Role: {selectedUser.role || "N/A"}
              </div>
              {(selectedUser.username || selectedUser.loginUsername) && (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  @{selectedUser.username || selectedUser.loginUsername}
                </div>
              )}
            </div>
          )}
        </div>
      </PageCard>

      {selectedUserId ? (
        <PageCard
          style={{
            padding: 18,
            display: "flex",
            flexDirection: "column",
            minHeight: 520,
          }}
        >
          {isManager && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 10,
              }}
            >
              <ActionButton
                type="button"
                variant="danger"
                onClick={handleDeleteConversation}
              >
                Delete conversation
              </ActionButton>
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflow: "auto",
              paddingRight: 4,
              marginBottom: 12,
              borderRadius: 18,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              padding: 14,
              minHeight: 320,
            }}
          >
            {loadingMessages ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Loading messages...
              </p>
            ) : messages.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                No messages yet. Start the conversation.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
                {messages.map((m) => {
                  const isMine = m.fromUserId === myId;

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "78%",
                          borderRadius: 18,
                          padding: "12px 14px",
                          fontSize: 13,
                          lineHeight: 1.5,
                          boxShadow: "0 8px 18px rgba(15,23,42,0.06)",
                          background: isMine ? "#1769aa" : "#ffffff",
                          color: isMine ? "#ffffff" : "#0f172a",
                          border: isMine
                            ? "1px solid #1769aa"
                            : "1px solid #e2e8f0",
                        }}
                      >
                        {!isMine && (
                          <div
                            style={{
                              fontWeight: 800,
                              marginBottom: 4,
                              fontSize: 11,
                              color: "#1769aa",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            {m.fromUsername || "User"}
                          </div>
                        )}
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
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

          <form onSubmit={handleSend}>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12,
                fontWeight: 700,
                color: "#475569",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
              }}
            >
              Write a message
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "end",
              }}
            >
              <TextArea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your message..."
              />
              <ActionButton
                type="submit"
                variant="primary"
                disabled={sending || !text.trim()}
              >
                {sending ? "Sending..." : "Send"}
              </ActionButton>
            </div>
          </form>
        </PageCard>
      ) : (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Select a user to start a conversation.
          </p>
        </PageCard>
      )}
    </div>
  );
}
