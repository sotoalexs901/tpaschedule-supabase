// src/pages/MessagesPage.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useLocation, useNavigate } from "react-router-dom";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";
import { triggerDirectMessagePush } from "../utils/messagePush.js";

// ============================================================
// AEROSTATION HUB - MESSAGES V2
// ============================================================
//
// Firestore structure:
//
// conversations/{conversationId}
//   participants: [userA, userB]
//   lastMessage
//   lastMessageAt
//   lastSenderId
//   unreadUserIds: [userId]
//   typingUserIds: [userId]
//   createdAt
//   updatedAt
//
// conversations/{conversationId}/messages/{messageId}
//   senderId
//   receiverId
//   text
//   createdAt
//   read
//   readAt
//
// conversationId is deterministic:
// [userA, userB].sort().join("__")
//
// The legacy /messages collection is intentionally NOT deleted.

const TYPING_TIMEOUT_MS = 1800;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function getConversationId(a, b) {
  return [String(a || ""), String(b || "")]
    .sort()
    .join("__");
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

function getUserPhoto(u) {
  return (
    u?.profilePhotoURL ||
    u?.photoURL ||
    u?.photoUrl ||
    ""
  );
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMessageTime(value) {
  const d = toDateSafe(value);
  if (!d) return "";

  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) {
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatLastSeen(value) {
  const d = toDateSafe(value);
  if (!d) return "Offline";

  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "Active just now";
  if (mins < 60) return `Active ${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Active ${days}d ago`;
}

function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}

function Avatar({ user, size = 44 }) {
  const name = getUserLabel(user);
  const photo = getUserPhoto(user);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(12, Math.round(size * 0.3)),
        overflow: "hidden",
        background: "#e0f2fe",
        border: "1px solid #bae6fd",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0f4c81",
        fontWeight: 850,
        fontSize: Math.max(12, Math.round(size * 0.34)),
      }}
    >
      {photo ? (
        <img
          src={photo}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(760);

  const myId = user?.id || "";

  const [allUsers, setAllUsers] = useState([]);
  const [presence, setPresence] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState([]);

  const [userSearch, setUserSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const prefillAppliedRef = useRef(false);

  const isManager =
    user?.role === "station_manager" ||
    user?.role === "duty_manager";

  // ============================================================
  // USERS
  // ============================================================

  useEffect(() => {
    if (!myId) return undefined;

    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.id !== myId)
          .sort((a, b) =>
            getUserLabel(a).localeCompare(getUserLabel(b))
          );

        setAllUsers(rows);
        setLoadingUsers(false);
      },
      (err) => {
        console.error("Error loading users for chat:", err);
        setStatusMessage("Could not load users.");
        setLoadingUsers(false);
      }
    );

    return () => unsub();
  }, [myId]);

  // ============================================================
  // PRESENCE
  // ============================================================

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "user_presence"),
      (snap) => {
        setPresence(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
      },
      (err) => console.error("Error loading presence for chat:", err)
    );

    return () => unsub();
  }, []);

  const presenceByUserId = useMemo(() => {
    const map = new Map();

    presence.forEach((p) => {
      map.set(String(p.userId || p.id), p);
    });

    return map;
  }, [presence]);

  // ============================================================
  // LIVE CONVERSATIONS
  // ============================================================

  useEffect(() => {
    if (!myId) return undefined;

    const qConversations = query(
      collection(db, "conversations"),
      where("participants", "array-contains", myId)
    );

    const unsub = onSnapshot(
      qConversations,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .sort((a, b) => {
            const A = toDateSafe(a.lastMessageAt)?.getTime() || 0;
            const B = toDateSafe(b.lastMessageAt)?.getTime() || 0;
            return B - A;
          });

        setConversations(rows);
      },
      (err) => {
        console.error("Error loading conversations:", err);
        setStatusMessage("Could not load conversations.");
      }
    );

    return () => unsub();
  }, [myId]);

  // ============================================================
  // SELECTED USER / CONVERSATION
  // ============================================================

  const selectedUser = useMemo(
    () => allUsers.find((u) => u.id === selectedUserId) || null,
    [allUsers, selectedUserId]
  );

  const selectedPresence = useMemo(
    () => presenceByUserId.get(String(selectedUserId)) || null,
    [presenceByUserId, selectedUserId]
  );

  const selectedConversation = useMemo(
    () =>
      conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const openConversationWithUser = useCallback(
    (targetUserId) => {
      if (!myId || !targetUserId) return;

      const conversationId = getConversationId(myId, targetUserId);

      setSelectedUserId(targetUserId);
      setSelectedConversationId(conversationId);
      setShowNewChat(false);
      setStatusMessage("");

      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
    },
    [myId]
  );

  // ============================================================
  // ROUTE PREFILL
  // ============================================================

  useEffect(() => {
    if (loadingUsers) return;
    if (prefillAppliedRef.current) return;
    if (!allUsers.length) return;

    const incoming = location.state || {};

    const recipientUserId = normalizeText(incoming.recipientUserId);
    const recipientUsername = normalizeLower(incoming.recipientUsername);
    const recipientName = normalizeLower(incoming.recipientName);
    const prefilledMessage = normalizeText(incoming.prefilledMessage);

    if (
      !recipientUserId &&
      !recipientUsername &&
      !recipientName &&
      !prefilledMessage
    ) {
      return;
    }

    let found = null;

    if (recipientUserId) {
      found = allUsers.find((u) => u.id === recipientUserId) || null;
    }

    if (!found && recipientUsername) {
      found =
        allUsers.find((u) => {
          return (
            normalizeLower(u.username) === recipientUsername ||
            normalizeLower(u.loginUsername) === recipientUsername
          );
        }) || null;
    }

    if (!found && recipientName) {
      found =
        allUsers.find(
          (u) => normalizeLower(getUserLabel(u)) === recipientName
        ) || null;
    }

    if (found) {
      openConversationWithUser(found.id);
    }

    if (prefilledMessage) {
      setText(prefilledMessage);
    }

    prefillAppliedRef.current = true;

    window.history.replaceState({}, document.title);
  }, [
    loadingUsers,
    allUsers,
    location.state,
    openConversationWithUser,
  ]);

  // ============================================================
  // LIVE MESSAGES FOR SELECTED CONVERSATION
  // ============================================================

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return undefined;
    }

    setLoadingMessages(true);

    const qMessages = query(
      collection(
        db,
        "conversations",
        selectedConversationId,
        "messages"
      ),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      qMessages,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoadingMessages(false);
      },
      (err) => {
        console.error("Error listening to messages:", err);
        setLoadingMessages(false);
        setStatusMessage("Could not load this conversation.");
      }
    );

    return () => unsub();
  }, [selectedConversationId]);

  // ============================================================
  // MARK AS READ
  // ============================================================

  useEffect(() => {
    if (!myId || !selectedConversationId || !messages.length) return;

    const unread = messages.filter(
      (m) => m.receiverId === myId && m.read !== true
    );

    if (!unread.length) {
      // Still clear conversation unread marker in case old state remains.
      updateDoc(
        doc(db, "conversations", selectedConversationId),
        {
          unreadUserIds: arrayRemove(myId),
        }
      ).catch(() => {});
      return;
    }

    async function markRead() {
      try {
        const batch = writeBatch(db);

        unread.forEach((m) => {
          batch.update(
            doc(
              db,
              "conversations",
              selectedConversationId,
              "messages",
              m.id
            ),
            {
              read: true,
              readAt: serverTimestamp(),
            }
          );
        });

        batch.update(
          doc(db, "conversations", selectedConversationId),
          {
            unreadUserIds: arrayRemove(myId),
          }
        );

        await batch.commit();
      } catch (err) {
        console.error("Error marking chat read:", err);
      }
    }

    markRead();
  }, [myId, selectedConversationId, messages]);

  // ============================================================
  // AUTO SCROLL
  // ============================================================

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, selectedConversationId]);

  // ============================================================
  // TYPING INDICATOR
  // ============================================================

  const setTypingState = useCallback(
    async (isTyping) => {
      if (!myId || !selectedConversationId) return;

      try {
        await updateDoc(
          doc(db, "conversations", selectedConversationId),
          {
            typingUserIds: isTyping
              ? arrayUnion(myId)
              : arrayRemove(myId),
          }
        );
      } catch {
        // Conversation may not exist yet. Typing starts after first message.
      }
    },
    [myId, selectedConversationId]
  );

  const handleTextChange = (value) => {
    setText(value);

    if (!selectedConversationId) return;

    setTypingState(true);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      setTypingState(false);
    }, TYPING_TIMEOUT_MS);
  };

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      if (selectedConversationId && myId) {
        updateDoc(
          doc(db, "conversations", selectedConversationId),
          {
            typingUserIds: arrayRemove(myId),
          }
        ).catch(() => {});
      }
    };
  }, [selectedConversationId, myId]);

  const otherUserTyping =
    Array.isArray(selectedConversation?.typingUserIds) &&
    selectedConversation.typingUserIds.includes(selectedUserId);

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  const handleSend = async (e) => {
    e?.preventDefault?.();

    if (!myId || !selectedUserId) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    const conversationId = getConversationId(myId, selectedUserId);
    const conversationRef = doc(
      db,
      "conversations",
      conversationId
    );

    try {
      setSending(true);
      setStatusMessage("");

      await setDoc(
        conversationRef,
        {
          participants: [myId, selectedUserId],
          participantNames: {
            [myId]: getUserLabel(user),
            [selectedUserId]: getUserLabel(selectedUser),
          },
          lastMessage: trimmed,
          lastMessageAt: serverTimestamp(),
          lastSenderId: myId,
          unreadUserIds: arrayUnion(selectedUserId),
          typingUserIds: arrayRemove(myId),
          updatedAt: serverTimestamp(),
          createdAt:
            selectedConversation?.createdAt || serverTimestamp(),
        },
        { merge: true }
      );

      const messageRef = await addDoc(
        collection(
          db,
          "conversations",
          conversationId,
          "messages"
        ),
        {
          senderId: myId,
          receiverId: selectedUserId,
          senderUsername:
            user?.username || user?.loginUsername || "",
          receiverUsername:
            selectedUser?.username ||
            selectedUser?.loginUsername ||
            "",
          text: trimmed,
          createdAt: serverTimestamp(),
          read: false,
          readAt: null,
          pushStatus: "PENDING",
        }
      );

      // Fire-and-forget. The direct message is already stored
      // before the Push request is made.
      triggerDirectMessagePush(
        conversationId,
        messageRef.id
      );

      setSelectedConversationId(conversationId);
      setText("");

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setStatusMessage("Error sending message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  // ============================================================
  // DELETE CONVERSATION
  // ============================================================

  const handleDeleteConversation = async () => {
    if (!isManager || !selectedConversationId) return;

    const name = getUserLabel(selectedUser);

    if (
      !window.confirm(
        `Delete the entire conversation with ${name}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setStatusMessage("");

      const messagesSnap = await getDocs(
        collection(
          db,
          "conversations",
          selectedConversationId,
          "messages"
        )
      );

      const batch = writeBatch(db);

      messagesSnap.docs.forEach((m) => {
        batch.delete(m.ref);
      });

      batch.delete(
        doc(db, "conversations", selectedConversationId)
      );

      await batch.commit();

      setMessages([]);
      setSelectedUserId("");
      setSelectedConversationId("");
      setStatusMessage("Conversation deleted.");
    } catch (err) {
      console.error("Error deleting conversation:", err);
      setStatusMessage("Error deleting conversation.");
    }
  };

  // ============================================================
  // DERIVED CONVERSATION LIST
  // ============================================================

  const conversationRows = useMemo(() => {
    return conversations
      .map((c) => {
        const otherId =
          (c.participants || []).find((id) => id !== myId) || "";

        const otherUser =
          allUsers.find((u) => u.id === otherId) || {
            id: otherId,
            displayName:
              c.participantNames?.[otherId] ||
              "Unknown User",
          };

        const presenceRow =
          presenceByUserId.get(String(otherId)) || null;

        const unread =
          Array.isArray(c.unreadUserIds) &&
          c.unreadUserIds.includes(myId);

        return {
          ...c,
          otherId,
          otherUser,
          presence: presenceRow,
          unread,
        };
      })
      .filter((row) => {
        const q = normalizeLower(conversationSearch);
        if (!q) return true;

        return (
          normalizeLower(getUserLabel(row.otherUser)).includes(q) ||
          normalizeLower(row.lastMessage).includes(q)
        );
      });
  }, [
    conversations,
    allUsers,
    myId,
    presenceByUserId,
    conversationSearch,
  ]);

  const newChatUsers = useMemo(() => {
    const q = normalizeLower(userSearch);

    return allUsers.filter((u) => {
      if (!q) return true;

      return [
        getUserLabel(u),
        u.username,
        u.loginUsername,
        u.role,
        u.department,
      ]
        .map(normalizeLower)
        .join(" ")
        .includes(q);
    });
  }, [allUsers, userSearch]);

  // ============================================================
  // MOBILE SCREEN MODE
  // ============================================================

  const mobileShowingChat =
    isMobile && Boolean(selectedUserId);

  if (!user) {
    return (
      <PageCard style={{ padding: 18 }}>
        You must be logged in to see messages.
      </PageCard>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
        display: "grid",
        gap: 14,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 75%, #4fb6e9 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 18 : 22,
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
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.1)",
            top: -100,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                fontWeight: 850,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {APP_NAME} {"\u00B7"} Live Communications
            </div>

            <h1
              style={{
                margin: "6px 0 4px",
                fontSize: isMobile ? 24 : 30,
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              Messages
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "rgba(255,255,255,0.84)",
              }}
            >
              Live direct messaging for the station team.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            style={heroButtonStyle}
          >
            Back
          </button>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 13 }}>
          <div
            style={{
              borderRadius: 13,
              padding: "10px 12px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1769aa",
              fontSize: 12.5,
              fontWeight: 750,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: 14,
          minHeight: isMobile ? "auto" : "68vh",
          minWidth: 0,
        }}
      >
        {(!isMobile || !mobileShowingChat) && (
          <PageCard
            style={{
              padding: 0,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: isMobile ? 560 : "68vh",
            }}
          >
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid #e2e8f0",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: "#0f172a",
                    }}
                  >
                    Conversations
                  </div>

                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: "#64748b",
                    }}
                  >
                    {conversationRows.length} active thread
                    {conversationRows.length === 1 ? "" : "s"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewChat((v) => !v)}
                  style={primarySmallButtonStyle}
                >
                  + New Chat
                </button>
              </div>

              <input
                value={conversationSearch}
                onChange={(e) =>
                  setConversationSearch(e.target.value)
                }
                placeholder="Search conversations..."
                style={searchInputStyle}
              />

              {showNewChat && (
                <div
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 14,
                    background: "#f8fbff",
                    padding: 10,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Find employee..."
                    style={searchInputStyle}
                  />

                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: "auto",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {loadingUsers ? (
                      <div style={mutedTextStyle}>
                        Loading users...
                      </div>
                    ) : newChatUsers.length === 0 ? (
                      <div style={mutedTextStyle}>
                        No users found.
                      </div>
                    ) : (
                      newChatUsers.map((u) => {
                        const p =
                          presenceByUserId.get(String(u.id)) || null;

                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() =>
                              openConversationWithUser(u.id)
                            }
                            style={newChatUserButtonStyle}
                          >
                            <Avatar user={u} size={36} />

                            <div
                              style={{
                                minWidth: 0,
                                textAlign: "left",
                                flex: 1,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 800,
                                  fontSize: 12.5,
                                  color: "#0f172a",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {getUserLabel(u)}
                              </div>

                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 10.5,
                                  color: p?.online
                                    ? "#047857"
                                    : "#94a3b8",
                                }}
                              >
                                {p?.online
                                  ? "Online"
                                  : formatLastSeen(
                                      p?.lastActivityAt ||
                                        p?.lastSeen
                                    )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
              }}
            >
              {conversationRows.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                  }}
                >
                  No conversations yet.
                  <br />
                  Tap <b>+ New Chat</b> to start one.
                </div>
              ) : (
                conversationRows.map((row) => {
                  const active =
                    selectedConversationId === row.id;

                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        openConversationWithUser(row.otherId)
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "none",
                        borderBottom: "1px solid #eef2f7",
                        background: active
                          ? "#edf7ff"
                          : "#ffffff",
                        padding: 12,
                        cursor: "pointer",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <Avatar user={row.otherUser} size={44} />

                        {row.presence?.online && (
                          <span
                            style={{
                              position: "absolute",
                              right: -2,
                              bottom: -2,
                              width: 11,
                              height: 11,
                              borderRadius: 999,
                              background: "#22c55e",
                              border: "2px solid #ffffff",
                            }}
                          />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: row.unread ? 900 : 800,
                              color: "#0f172a",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {getUserLabel(row.otherUser)}
                          </div>

                          <div
                            style={{
                              fontSize: 9.5,
                              color: "#94a3b8",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatMessageTime(row.lastMessageAt)}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
                              flex: 1,
                              fontSize: 11,
                              color: row.unread
                                ? "#334155"
                                : "#64748b",
                              fontWeight: row.unread ? 750 : 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {row.lastSenderId === myId
                              ? "You: "
                              : ""}
                            {row.lastMessage || "No messages yet"}
                          </div>

                          {row.unread && (
                            <span
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: 999,
                                background: "#1769aa",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </PageCard>
        )}

        {(!isMobile || mobileShowingChat) && (
          <PageCard
            style={{
              padding: 0,
              overflow: "hidden",
              minWidth: 0,
              minHeight: isMobile ? 620 : "68vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {!selectedUserId ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Select a conversation or start a new chat.
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#ffffff",
                  }}
                >
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId("");
                        setSelectedConversationId("");
                      }}
                      style={backButtonStyle}
                    >
                      {"\u2190"}
                    </button>
                  )}

                  <div style={{ position: "relative" }}>
                    <Avatar user={selectedUser} size={44} />

                    {selectedPresence?.online && (
                      <span
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 11,
                          height: 11,
                          borderRadius: 999,
                          background: "#22c55e",
                          border: "2px solid #ffffff",
                        }}
                      />
                    )}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 900,
                        color: "#0f172a",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getUserLabel(selectedUser)}
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10.5,
                        color: selectedPresence?.online
                          ? "#047857"
                          : "#94a3b8",
                        fontWeight: selectedPresence?.online
                          ? 750
                          : 500,
                      }}
                    >
                      {otherUserTyping
                        ? "Typing..."
                        : selectedPresence?.online
                        ? "Online"
                        : formatLastSeen(
                            selectedPresence?.lastActivityAt ||
                              selectedPresence?.lastSeen
                          )}
                    </div>
                  </div>

                  {isManager && (
                    <button
                      type="button"
                      onClick={handleDeleteConversation}
                      style={deleteIconButtonStyle}
                      title="Delete conversation"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    padding: isMobile ? 12 : 16,
                    background:
                      "linear-gradient(180deg, #f8fbff 0%, #f5f9fd 100%)",
                  }}
                >
                  {loadingMessages ? (
                    <div style={mutedTextStyle}>
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div
                      style={{
                        height: "100%",
                        minHeight: 300,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: 12.5,
                        lineHeight: 1.6,
                      }}
                    >
                      Start the conversation with{" "}
                      {getUserLabel(selectedUser)}.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {messages.map((m) => {
                        const isMine = m.senderId === myId;

                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              justifyContent: isMine
                                ? "flex-end"
                                : "flex-start",
                            }}
                          >
                            <div
                              style={{
                                maxWidth: isMobile ? "86%" : "72%",
                                minWidth: 70,
                                borderRadius: isMine
                                  ? "18px 18px 4px 18px"
                                  : "18px 18px 18px 4px",
                                padding: "10px 12px 7px",
                                background: isMine
                                  ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)"
                                  : "#ffffff",
                                color: isMine
                                  ? "#ffffff"
                                  : "#0f172a",
                                border: isMine
                                  ? "1px solid #1769aa"
                                  : "1px solid #e2e8f0",
                                boxShadow:
                                  "0 6px 16px rgba(15,23,42,0.05)",
                              }}
                            >
                              <div
                                style={{
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: 13,
                                  lineHeight: 1.5,
                                }}
                              >
                                {m.text}
                              </div>

                              <div
                                style={{
                                  marginTop: 5,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: 5,
                                  fontSize: 9.5,
                                  color: isMine
                                    ? "rgba(255,255,255,0.72)"
                                    : "#94a3b8",
                                }}
                              >
                                <span>
                                  {formatMessageTime(m.createdAt)}
                                </span>

                                {isMine && (
                                  <span
                                    title={
                                      m.read
                                        ? "Read"
                                        : "Delivered"
                                    }
                                  >
                                    {m.read ? "\u2713\u2713" : "\u2713"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {otherUserTyping && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              borderRadius:
                                "18px 18px 18px 4px",
                              padding: "8px 12px",
                              background: "#ffffff",
                              border: "1px solid #e2e8f0",
                              color: "#64748b",
                              fontSize: 11,
                              fontWeight: 750,
                            }}
                          >
                            Typing...
                          </div>
                        </div>
                      )}

                      <div ref={bottomRef} />
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleSend}
                  style={{
                    borderTop: "1px solid #e2e8f0",
                    background: "#ffffff",
                    padding: 10,
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0, 1fr) auto",
                    gap: 8,
                    alignItems: "end",
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={text}
                    rows={1}
                    onChange={(e) =>
                      handleTextChange(e.target.value)
                    }
                    onKeyDown={handleComposerKeyDown}
                    placeholder={`Message ${getUserLabel(
                      selectedUser
                    )}...`}
                    style={{
                      width: "100%",
                      minHeight: 44,
                      maxHeight: 120,
                      boxSizing: "border-box",
                      resize: "none",
                      border: "1px solid #dbeafe",
                      borderRadius: 16,
                      padding: "11px 13px",
                      fontSize: 16,
                      lineHeight: 1.4,
                      color: "#0f172a",
                      outline: "none",
                      background: "#f8fbff",
                    }}
                  />

                  <button
                    type="submit"
                    disabled={sending || !text.trim()}
                    style={{
                      minWidth: isMobile ? 58 : 74,
                      height: 44,
                      border: "none",
                      borderRadius: 14,
                      background:
                        sending || !text.trim()
                          ? "#cbd5e1"
                          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                      color: "#ffffff",
                      fontWeight: 850,
                      cursor:
                        sending || !text.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {sending ? "..." : "Send"}
                  </button>
                </form>
              </>
            )}
          </PageCard>
        )}
      </div>

      <div
        style={{
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 10,
          paddingBottom: 4,
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 22,
        boxShadow: "0 16px 38px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const searchInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dbeafe",
  background: "#ffffff",
  borderRadius: 12,
  padding: "10px 11px",
  fontSize: 16,
  color: "#0f172a",
  outline: "none",
};

const heroButtonStyle = {
  border: "1px solid rgba(255,255,255,0.24)",
  background: "rgba(255,255,255,0.12)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "9px 13px",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};

const primarySmallButtonStyle = {
  border: "none",
  background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
  color: "#ffffff",
  borderRadius: 11,
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const backButtonStyle = {
  width: 36,
  height: 36,
  border: "1px solid #dbeafe",
  borderRadius: 11,
  background: "#ffffff",
  color: "#1769aa",
  fontSize: 18,
  fontWeight: 850,
  cursor: "pointer",
  flexShrink: 0,
};

const deleteIconButtonStyle = {
  border: "1px solid #fecdd3",
  background: "#fff1f2",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "7px 9px",
  fontSize: 10.5,
  fontWeight: 850,
  cursor: "pointer",
};

const newChatUserButtonStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  borderRadius: 12,
  padding: 8,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 9,
};

const mutedTextStyle = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 650,
  padding: 8,
};

// END MessagesPage
