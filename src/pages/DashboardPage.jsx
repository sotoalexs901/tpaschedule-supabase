import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function formatDateLabel(value) {
  if (!value) return "Not scheduled";
  try {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function StatCard({ title, value, subtitle, accent, icon }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.95)",
        borderRadius: 24,
        padding: 20,
        boxShadow: "0 18px 40px rgba(79,70,229,0.08)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${accent}18 0%, transparent 55%)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: `${accent}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        {title}
      </p>
      <h3
        style={{
          margin: "6px 0 4px",
          fontSize: 30,
          lineHeight: 1.05,
          fontWeight: 800,
          color: "#0f172a",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </h3>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#475569",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function GlassCard({ title, icon, action, children, accent = "#6366f1" }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.95)",
        borderRadius: 26,
        padding: 22,
        boxShadow: "0 18px 45px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: `${accent}16`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {icon}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [mainMessage, setMainMessage] = useState("");
  const [mainMeta, setMainMeta] = useState(null);

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [notices, setNotices] = useState([]);
  const [loadingNotices, setLoadingNotices] = useState(false);

  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [showBlockedList, setShowBlockedList] = useState(false);

  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const fetchMainMessage = async () => {
    try {
      const ref = doc(db, "dashboard", "main");
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setMainMessage(data.message || "");
        setMainMeta({
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedBy || null,
        });
      } else {
        setMainMessage("");
        setMainMeta(null);
      }
    } catch (err) {
      console.error("Error loading main dashboard message:", err);
    }
  };

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const colRef = collection(db, "dashboard_events");
      const snap = await getDocs(colRef);

      const today = new Date().toISOString().slice(0, 10);
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => !e.date || e.date >= today)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 5);

      setEvents(items);
    } catch (err) {
      console.error("Error loading events:", err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchNotices = async () => {
    setLoadingNotices(true);
    try {
      const colRef = collection(db, "dashboard_notices");
      const snap = await getDocs(colRef);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 5);

      setNotices(items);
    } catch (err) {
      console.error("Error loading notices:", err);
    } finally {
      setLoadingNotices(false);
    }
  };

  const fetchBlockedEmployees = async () => {
    setLoadingBlocked(true);
    try {
      const colRef = collection(db, "restrictions");
      const snap = await getDocs(colRef);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBlockedEmployees(items);
    } catch (err) {
      console.error("Error loading blocked employees:", err);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const fetchPendingSchedules = async () => {
    setLoadingPending(true);
    try {
      const qPending = query(
        collection(db, "schedules"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(qPending);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

      setPendingSchedules(items);
    } catch (err) {
      console.error("Error loading pending schedules:", err);
    } finally {
      setLoadingPending(false);
    }
  };

  const fetchPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const colRef = collection(db, "dashboard_photos");
      const snap = await getDocs(colRef);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

      setPhotos(items);
    } catch (err) {
      console.error("Error loading dashboard photos:", err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const reloadAll = () => {
    fetchMainMessage();
    fetchEvents();
    fetchNotices();
    fetchBlockedEmployees();
    fetchPendingSchedules();
    fetchPhotos();
  };

  useEffect(() => {
    reloadAll();
  }, [user?.role]);

  const stats = useMemo(
    () => [
      {
        title: "Upcoming Events",
        value: events.length,
        subtitle: "Scheduled items ahead",
        accent: "#6366f1",
        icon: "📅",
      },
      {
        title: "Open Notices",
        value: notices.length,
        subtitle: "Latest crew updates",
        accent: "#f59e0b",
        icon: "📌",
      },
      {
        title: "Blocked Employees",
        value: blockedEmployees.length,
        subtitle: "Restrictions currently active",
        accent: "#ef4444",
        icon: "🚫",
      },
      {
        title: "Pending Schedules",
        value: pendingSchedules.length,
        subtitle: "Waiting for approval",
        accent: "#10b981",
        icon: "📥",
      },
    ],
    [events.length, notices.length, blockedEmployees.length, pendingSchedules.length]
  );

  return (
    <div
      style={{
        minHeight: "100%",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #4338ca 0%, #6366f1 38%, #7c3aed 100%)",
          borderRadius: 30,
          padding: 28,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(79,70,229,0.22)",
          position: "relative",
          overflow: "hidden",
          marginBottom: 22,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -70,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.06)",
            bottom: -60,
            right: 170,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.24em",
                color: "rgba(255,255,255,0.76)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Executive Dashboard
            </p>

            <h1
              style={{
                margin: "10px 0 8px",
                fontSize: 38,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Welcome back, {user?.username || "Team"} 👋
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 15,
                color: "rgba(255,255,255,0.84)",
              }}
            >
              Quick overview of station updates, photo highlights, crew notices,
              restrictions and schedules pending decision.
            </p>
          </div>

          <button
            type="button"
            onClick={reloadAll}
            style={{
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.16)",
              color: "#fff",
              borderRadius: 18,
              padding: "14px 18px",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              boxShadow: "0 12px 24px rgba(15,23,42,0.10)",
            }}
          >
            Refresh dashboard
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
          marginBottom: 22,
        }}
      >
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.1fr",
          gap: 22,
        }}
      >
        <div style={{ display: "grid", gap: 22 }}>
          <GlassCard
            title="Station Manager Message"
            icon="📢"
            accent="#6366f1"
          >
            <div
              style={{
                background: "linear-gradient(135deg, #eef2ff 0%, #f8faff 100%)",
                border: "1px solid #e0e7ff",
                borderRadius: 20,
                padding: 18,
              }}
            >
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-line",
                  color: "#1e293b",
                  fontSize: 15,
                  lineHeight: 1.7,
                }}
              >
                {mainMessage || "No message posted yet."}
              </p>

              {mainMeta?.updatedAt && (
                <p
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  Last update: {mainMeta.updatedAt}
                  {mainMeta.updatedBy ? ` • by ${mainMeta.updatedBy}` : ""}
                </p>
              )}
            </div>
          </GlassCard>

          <GlassCard
            title="Station Highlights"
            icon="✈️"
            accent="#8b5cf6"
            action={
              photos.length > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#64748b",
                  }}
                >
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}
                </span>
              ) : null
            }
          >
            {loadingPhotos ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading photos...</p>
            ) : photos.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No station highlights yet. Upload photos from Dashboard Editor.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 14,
                }}
              >
                {photos.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #eef2ff",
                      borderRadius: 20,
                      overflow: "hidden",
                      boxShadow: "0 12px 26px rgba(15,23,42,0.05)",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "4 / 3",
                        background: "#e2e8f0",
                      }}
                    >
                      <img
                        src={p.url}
                        alt={p.caption || "Station highlight"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>
                    <div style={{ padding: 12 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#475569",
                        }}
                      >
                        {p.caption || "Station highlight"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title="Pending Schedules for Approval"
            icon="📥"
            accent="#10b981"
            action={
              user?.role === "station_manager" ? (
                <button
                  type="button"
                  onClick={() => navigate("/approvals")}
                  style={{
                    border: "1px solid #dbeafe",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Go to Approvals
                </button>
              ) : null
            }
          >
            {loadingPending ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>
                Loading schedules...
              </p>
            ) : pendingSchedules.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No schedules waiting for approval.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14,
                }}
              >
                {pendingSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    style={{
                      borderRadius: 20,
                      padding: 18,
                      background:
                        "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
                      border: "1px solid #d1fae5",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {sch.airline} — {sch.department}
                    </p>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#475569",
                      }}
                    >
                      Total Hours:{" "}
                      {sch.airlineWeeklyHours
                        ? sch.airlineWeeklyHours.toFixed(2)
                        : "0.00"}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Sent by: {sch.createdBy || "unknown"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        <div style={{ display: "grid", gap: 22 }}>
          <GlassCard title="Upcoming Events" icon="📅" accent="#3b82f6">
            {loadingEvents ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading events...</p>
            ) : events.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No events scheduled.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background:
                        "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
                      border: "1px solid #dbeafe",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {ev.title}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        color: "#2563eb",
                        fontWeight: 700,
                      }}
                    >
                      {formatDateLabel(ev.date)}
                      {ev.time ? ` • ${ev.time}` : ""}
                    </p>
                    {ev.details && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 13,
                          color: "#475569",
                        }}
                      >
                        {ev.details}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Notices / Invitations" icon="📌" accent="#f59e0b">
            {loadingNotices ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading notices...</p>
            ) : notices.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No notices posted.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {notices.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background:
                        "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                      border: "1px solid #fde68a",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      {n.title}
                    </p>
                    {n.body && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          fontSize: 13,
                          color: "#475569",
                          lineHeight: 1.55,
                        }}
                      >
                        {n.body}
                      </p>
                    )}
                    {n.link && (
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 10,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#b45309",
                          textDecoration: "none",
                        }}
                      >
                        View more →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title="Employees Not Available"
            icon="🚫"
            accent="#ef4444"
            action={
              blockedEmployees.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowBlockedList((v) => !v)}
                  style={{
                    border: "1px solid #fecdd3",
                    background: "#fff1f2",
                    color: "#be123c",
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {showBlockedList ? "Hide list" : "View list"}
                </button>
              ) : null
            }
          >
            {loadingBlocked ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>
                Loading employees...
              </p>
            ) : blockedEmployees.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No employees blocked.
              </p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: showBlockedList ? 16 : 0,
                  }}
                >
                  {blockedEmployees.slice(0, 8).map((b) => (
                    <span
                      key={b.id}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#9f1239",
                      }}
                    >
                      {b.employeeName || b.name || b.employeeId}
                    </span>
                  ))}
                  {blockedEmployees.length > 8 && (
                    <span
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#64748b",
                      }}
                    >
                      +{blockedEmployees.length - 8} more
                    </span>
                  )}
                </div>

                {showBlockedList && (
                  <div style={{ display: "grid", gap: 12 }}>
                    {blockedEmployees.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          borderRadius: 18,
                          padding: 16,
                          background:
                            "linear-gradient(135deg, #fff1f2 0%, #ffffff 100%)",
                          border: "1px solid #fecdd3",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 800,
                            color: "#881337",
                          }}
                        >
                          {b.employeeName || b.name || b.employeeId}
                        </p>
                        {b.reason && (
                          <p
                            style={{
                              margin: "7px 0 0",
                              fontSize: 13,
                              color: "#475569",
                            }}
                          >
                            {b.reason}
                          </p>
                        )}
                        <p
                          style={{
                            margin: "7px 0 0",
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          {b.start_date || "N/A"} → {b.end_date || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
