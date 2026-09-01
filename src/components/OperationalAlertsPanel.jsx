// src/components/OperationalAlertsPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { consumeOperationalAlert } from "../utils/operationalAlerts.js";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatAge(value) {
  const created = toDate(value);
  if (!created) return "Just now";

  const diffMs = Math.max(0, Date.now() - created.getTime());
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function getTone(alert) {
  const priority = String(alert?.priority || "").toUpperCase();
  const severity = String(alert?.severity || "").toUpperCase();

  if (
    priority === "URGENT" ||
    priority === "HIGH" ||
    severity === "HIGH"
  ) {
    return {
      bg: "#fff1f2",
      border: "#fecdd3",
      text: "#9f1239",
      badge: "#dc2626",
      label: priority === "URGENT" ? "URGENT" : "HIGH",
    };
  }

  if (priority === "MEDIUM" || severity === "MEDIUM") {
    return {
      bg: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
      badge: "#d97706",
      label: "MEDIUM",
    };
  }

  return {
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
    badge: "#2563eb",
    label: severity || priority || "INFO",
  };
}

export default function OperationalAlertsPanel({
  compact = false,
  maxItems = 6,
  onOpenSource,
}) {
  const { user } = useUser();
  const [alerts, setAlerts] = useState([]);
  const [readingId, setReadingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const role = normalizeRole(user?.role);

  const canSeeAlerts =
    role === "station_manager" || role === "duty_manager";

  useEffect(() => {
    if (!canSeeAlerts) {
      setAlerts([]);
      return undefined;
    }

    const alertsQuery = query(
      collection(db, "operational_alerts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      alertsQuery,
      (snap) => {
        const rows = snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .filter((alert) => {
            const targets = Array.isArray(alert.targetRoles)
              ? alert.targetRoles.map(normalizeRole)
              : [];

            return !targets.length || targets.includes(role);
          });

        setAlerts(rows);
      },
      (err) => {
        console.error("Operational alerts listener error:", err);
        setErrorMessage("Could not load operational alerts.");
      }
    );

    return unsubscribe;
  }, [canSeeAlerts, role]);

  const visibleAlerts = useMemo(
    () =>
      alerts.slice(
        0,
        Math.max(1, Number(maxItems || 6))
      ),
    [alerts, maxItems]
  );

  if (!canSeeAlerts) return null;

  const handleRead = async (alert) => {
    const ok = window.confirm(
      "Mark this alert as read? It will be removed from active alerts."
    );

    if (!ok) return;

    try {
      setReadingId(alert.id);
      setErrorMessage("");
      await consumeOperationalAlert(alert, user);
    } catch (err) {
      console.error("Error consuming operational alert:", err);
      setErrorMessage("Could not remove this alert.");
    } finally {
      setReadingId("");
    }
  };

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: compact ? 16 : 20,
        padding: compact ? 14 : 18,
        boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: alerts.length ? 12 : 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: compact ? 15 : 17,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Operational Alerts
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: 11.5,
              color: "#64748b",
            }}
          >
            Active alerts for Duty and Station Management
          </div>
        </div>

        <div
          style={{
            minWidth: 32,
            height: 32,
            padding: "0 10px",
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: alerts.length ? "#fff1f2" : "#ecfdf5",
            border: alerts.length
              ? "1px solid #fecdd3"
              : "1px solid #a7f3d0",
            color: alerts.length ? "#be123c" : "#047857",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {alerts.length}
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: 10,
            padding: "9px 11px",
            borderRadius: 11,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {errorMessage}
        </div>
      )}

      {!alerts.length ? (
        <div
          style={{
            marginTop: 10,
            padding: "13px 14px",
            borderRadius: 13,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#64748b",
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          No active operational alerts.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 9 }}>
          {visibleAlerts.map((alert) => {
            const tone = getTone(alert);

            return (
              <div
                key={alert.id}
                style={{
                  borderRadius: 14,
                  padding: "12px 13px",
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 22,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: tone.badge,
                          color: "#ffffff",
                          fontSize: 9.5,
                          fontWeight: 900,
                          letterSpacing: "0.05em",
                        }}
                      >
                        {tone.label}
                      </span>

                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: "#0f172a",
                        }}
                      >
                        {alert.title || "Operational Alert"}
                      </span>
                    </div>

                    {alert.message && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          lineHeight: 1.55,
                          color: tone.text,
                          fontWeight: 700,
                        }}
                      >
                        {alert.message}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 7,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        fontSize: 10.5,
                        color: "#64748b",
                        fontWeight: 700,
                      }}
                    >
                      {alert.airline && <span>{alert.airline}</span>}
                      {alert.department && (
                        <span>{alert.department}</span>
                      )}
                      <span>{formatAge(alert.createdAt)}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    {typeof onOpenSource === "function" &&
                      alert.sourcePath && (
                        <button
                          type="button"
                          onClick={() => onOpenSource(alert)}
                          style={{
                            borderRadius: 9,
                            padding: "7px 10px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#334155",
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          View
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() => handleRead(alert)}
                      disabled={readingId === alert.id}
                      style={{
                        borderRadius: 9,
                        padding: "7px 10px",
                        border: "none",
                        background: "#0f172a",
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor:
                          readingId === alert.id
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          readingId === alert.id ? 0.65 : 1,
                      }}
                    >
                      {readingId === alert.id
                        ? "Removing..."
                        : "Read"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
