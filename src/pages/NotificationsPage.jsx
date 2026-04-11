import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../services/notificationsService.js";

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
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
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

function formatDateTime(value) {
  if (!value) return "-";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function NotificationBadge({ read }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid",
        background: read ? "#f8fafc" : "#fff7ed",
        color: read ? "#475569" : "#9a3412",
        borderColor: read ? "#e2e8f0" : "#fed7aa",
      }}
    >
      {read ? "Read" : "Unread"}
    </span>
  );
}

export default function NotificationsPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setNotifications(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading notifications:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user?.id]);

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((item) => !item.read);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !item.read).length;
  }, [notifications]);

  async function handleOpenNotification(item) {
    try {
      if (!item.read) {
        await markNotificationAsRead(item.id);
      }

      if (item.link) {
        navigate(item.link);
      }
    } catch (err) {
      console.error("Error opening notification:", err);
    }
  }

  async function handleMarkRead(notificationId) {
    try {
      await markNotificationAsRead(notificationId);
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  }

  async function handleMarkAllRead() {
    try {
      setWorking(true);
      await markAllNotificationsAsRead(user?.id);
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    } finally {
      setWorking(false);
    }
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

        <div style={{ position: "relative" }}>
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
            TPA OPS
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
            Notifications
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 780,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            View your notifications in real time and open the related module.
          </p>
        </div>
      </div>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton
              variant={filter === "all" ? "primary" : "secondary"}
              onClick={() => setFilter("all")}
            >
              All
            </ActionButton>

            <ActionButton
              variant={filter === "unread" ? "primary" : "secondary"}
              onClick={() => setFilter("unread")}
            >
              Unread ({unreadCount})
            </ActionButton>
          </div>

          <ActionButton
            variant="success"
            onClick={handleMarkAllRead}
            disabled={working || unreadCount === 0}
          >
            {working ? "Updating..." : "Mark all as read"}
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        {loading ? (
          <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>
            Loading notifications...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>
            No notifications found.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredNotifications.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 16,
                  background: item.read ? "#ffffff" : "#fffdf8",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {item.title || "Notification"}
                      </div>
                      <NotificationBadge read={!!item.read} />
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 14,
                        color: "#475569",
                        lineHeight: 1.6,
                      }}
                    >
                      <div>{item.message || "-"}</div>
                      <div style={{ marginTop: 6 }}>
                        <b>Type:</b> {item.type || "-"}
                      </div>
                      <div>
                        <b>Date:</b> {formatDateTime(item.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {!!item.link && (
                      <ActionButton
                        variant="primary"
                        onClick={() => handleOpenNotification(item)}
                      >
                        Open
                      </ActionButton>
                    )}

                    {!item.read && (
                      <ActionButton
                        variant="secondary"
                        onClick={() => handleMarkRead(item.id)}
                      >
                        Mark read
                      </ActionButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>
    </div>
  );
}
