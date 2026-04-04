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

const FIXED_AUTHOR = "TPA Eulen Ops";

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

function formatCreatedAtLabel(value) {
  if (!value) return "—";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function getInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "U";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function StatCard({ title, value, subtitle, accent, icon, isMobile }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: isMobile ? 18 : 22,
        padding: isMobile ? 16 : 18,
        boxShadow: "0 16px 36px rgba(23,105,170,0.08)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${accent}16 0%, transparent 58%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          position: "relative",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
            }}
          >
            {title}
          </p>
          <h3
            style={{
              margin: "8px 0 4px",
              fontSize: isMobile ? 24 : 28,
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

        <div
          style={{
            width: isMobile ? 40 : 44,
            height: isMobile ? 40 : 44,
            borderRadius: 14,
            background: `${accent}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isMobile ? 18 : 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function GlassCard({
  title,
  icon,
  action,
  children,
  accent = "#1769aa",
  isMobile,
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: isMobile ? 20 : 24,
        padding: isMobile ? 16 : 20,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            gap: 12,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: `${accent}16`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 17 : 19,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              wordBreak: "break-word",
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

function EmployeeOfMonthCard({ data, isMobile, onMessage }) {
  const initials = getInitials(data?.employeeName || "E");
  const profileImage = data?.photoURL || data?.profilePhotoURL || "";
  const canMessage = Boolean(data?.userId || data?.username);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
        border: "1px solid #fed7aa",
        borderRadius: isMobile ? 20 : 24,
        padding: isMobile ? 16 : 20,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            background: "#f59e0b22",
            color: "#b45309",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          🏆
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: isMobile ? 17 : 19,
            fontWeight: 800,
            color: "#0f172a",
            letterSpacing: "-0.02em",
          }}
        >
          Employee of the Month
        </h2>
      </div>

      {!data ? (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          No employee selected.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 20,
                overflow: "hidden",
                background: "#ffedd5",
                border: "1px solid #fdba74",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9a3412",
                fontWeight: 800,
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {profileImage ? (
                <img
                  src={profileImage}
                  alt={data.employeeName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.2,
                  wordBreak: "break-word",
                }}
              >
                {data.employeeName || "No employee selected"}
              </div>

              {data.position && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "#9a3412",
                    fontWeight: 700,
                  }}
                >
                  {data.position}
                </div>
              )}

              {data.username && (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  @{data.username}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 10,
            }}
          >
            <div
              style={{
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #fde68a",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Position
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {data.position || "—"}
              </div>
            </div>

            <div
              style={{
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #fde68a",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Department
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {data.department || "—"}
              </div>
            </div>

            <div
              style={{
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #fde68a",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Airline
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {data.airline || "—"}
              </div>
            </div>

            <div
              style={{
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #fde68a",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Month
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {data.monthLabel || "—"}
              </div>
            </div>
          </div>

          {data.note && (
            <div
              style={{
                borderRadius: 14,
                background: "#ffffff",
                border: "1px solid #fde68a",
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#475569",
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                }}
              >
                {data.note}
              </div>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={onMessage}
              disabled={!canMessage}
              style={{
                border: "none",
                background: canMessage
                  ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)"
                  : "#cbd5e1",
                color: "#fff",
                borderRadius: 14,
                padding: "12px 16px",
                fontWeight: 800,
                fontSize: 14,
                cursor: canMessage ? "pointer" : "not-allowed",
                boxShadow: canMessage
                  ? "0 12px 24px rgba(23,105,170,0.18)"
                  : "none",
                opacity: canMessage ? 1 : 0.8,
              }}
            >
              Send message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile(900);

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

  const [pendingTimesheets, setPendingTimesheets] = useState([]);
  const [loadingTimesheets, setLoadingTimesheets] = useState(false);

  const [employeeOfMonth, setEmployeeOfMonth] = useState(null);
  const [loadingEmployeeOfMonth, setLoadingEmployeeOfMonth] = useState(false);

  const canTrackTimesheets =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const fetchMainMessage = async () => {
    try {
      const ref = doc(db, "dashboard", "main");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setMainMessage(data.message || "");
        setMainMeta({
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedByLabel || data.updatedBy || FIXED_AUTHOR,
        });
      } else {
        setMainMessage("");
        setMainMeta(null);
      }
    } catch (err) {
      console.error("Error loading main dashboard message:", err);
    }
  };

  const fetchEmployeeOfMonth = async () => {
    setLoadingEmployeeOfMonth(true);
    try {
      const qEmployee = query(
        collection(db, "employee_of_month"),
        where("active", "==", true)
      );
      const snap = await getDocs(qEmployee);

      if (!snap.empty) {
        const first = snap.docs[0];
        setEmployeeOfMonth({
          id: first.id,
          ...first.data(),
        });
      } else {
        setEmployeeOfMonth(null);
      }
    } catch (err) {
      console.error("Error loading employee of the month:", err);
      setEmployeeOfMonth(null);
    } finally {
      setLoadingEmployeeOfMonth(false);
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

  const fetchPendingTimesheets = async () => {
    if (!canTrackTimesheets) {
      setPendingTimesheets([]);
      return;
    }

    setLoadingTimesheets(true);
    try {
      const qPending = query(
        collection(db, "timesheet_reports"),
        where("status", "==", "submitted")
      );

      const snap = await getDocs(qPending);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

      setPendingTimesheets(items);
    } catch (err) {
      console.error("Error loading pending timesheets:", err);
    } finally {
      setLoadingTimesheets(false);
    }
  };

  const reloadAll = () => {
    fetchMainMessage();
    fetchEmployeeOfMonth();
    fetchEvents();
    fetchNotices();
    fetchBlockedEmployees();
    fetchPendingSchedules();
    fetchPhotos();
    fetchPendingTimesheets();
  };

  useEffect(() => {
    reloadAll();
  }, [user?.role]);

  const handleMessageEmployeeOfMonth = () => {
    if (!employeeOfMonth?.userId && !employeeOfMonth?.username) return;

    const personName = employeeOfMonth.employeeName || "team member";
    const messageText = `Congratulations ${personName}! You were selected as Employee of the Month. Great job and thank you for your hard work!`;

    navigate("/messages", {
      state: {
        recipientUserId: employeeOfMonth.userId || "",
        recipientUsername: employeeOfMonth.username || "",
        recipientName: employeeOfMonth.employeeName || "",
        prefilledMessage: messageText,
      },
    });
  };

  const stats = useMemo(() => {
    const base = [
      {
        title: "Upcoming Events",
        value: events.length,
        subtitle: "Scheduled items ahead",
        accent: "#1f7cc1",
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
        subtitle: "Restrictions active",
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
    ];

    if (canTrackTimesheets) {
      base.push({
        title: "Pending Timesheets",
        value: pendingTimesheets.length,
        subtitle: "Waiting for manager review",
        accent: "#c2410c",
        icon: "🕒",
      });
    }

    return base;
  }, [
    events.length,
    notices.length,
    blockedEmployees.length,
    pendingSchedules.length,
    pendingTimesheets.length,
    canTrackTimesheets,
  ]);

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
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 22 : 28,
          padding: isMobile ? 18 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: isMobile ? 180 : 240,
            height: isMobile ? 180 : 240,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: isMobile ? -80 : -90,
            right: isMobile ? -60 : -50,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: isMobile ? 120 : 160,
            height: isMobile ? 120 : 160,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.06)",
            bottom: -50,
            right: isMobile ? 60 : 160,
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
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.76)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Executive Dashboard
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: isMobile ? 26 : 34,
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
                maxWidth: 720,
                fontSize: isMobile ? 13 : 14,
                color: "rgba(255,255,255,0.86)",
              }}
            >
              Quick overview of station updates, highlights, notices,
              restrictions, pending schedules and timesheet follow up.
            </p>
          </div>

          <button
            type="button"
            onClick={reloadAll}
            style={{
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.16)",
              color: "#fff",
              borderRadius: 16,
              padding: "13px 16px",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              width: isMobile ? "100%" : "auto",
            }}
          >
            Refresh dashboard
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {stats.map((item) => (
          <StatCard key={item.title} {...item} isMobile={isMobile} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "minmax(0, 1.8fr) minmax(320px, 1fr)",
          gap: 18,
        }}
      >
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <GlassCard
            title="Station Manager Message"
            icon="📢"
            accent="#1f7cc1"
            isMobile={isMobile}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #edf7ff 0%, #f8fcff 100%)",
                border: "1px solid #d6ebff",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-line",
                  color: "#1e293b",
                  fontSize: isMobile ? 13 : 14,
                  lineHeight: 1.7,
                  wordBreak: "break-word",
                }}
              >
                {mainMessage || "No message posted yet."}
              </p>

              <p
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                By {mainMeta?.updatedBy || FIXED_AUTHOR}
              </p>
            </div>
          </GlassCard>

          <GlassCard
            title="Employee Recognition"
            icon="🏆"
            accent="#f59e0b"
            isMobile={isMobile}
          >
            {loadingEmployeeOfMonth ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>
                Loading employee of the month...
              </p>
            ) : (
              <EmployeeOfMonthCard
                data={employeeOfMonth}
                isMobile={isMobile}
                onMessage={handleMessageEmployeeOfMonth}
              />
            )}
          </GlassCard>

          <GlassCard
            title="Station Highlights"
            icon="✈️"
            accent="#5aa9e6"
            isMobile={isMobile}
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
                No station highlights yet.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 12,
                }}
              >
                {photos.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #e0f2fe",
                      borderRadius: 18,
                      overflow: "hidden",
                      boxShadow: "0 12px 24px rgba(15,23,42,0.05)",
                      minWidth: 0,
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
                        alt="Station highlight"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
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
            isMobile={isMobile}
            action={
              user?.role === "station_manager" ? (
                <button
                  type="button"
                  onClick={() => navigate("/approvals")}
                  style={{
                    border: "1px solid #cfe7fb",
                    background: "#edf7ff",
                    color: "#1769aa",
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
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
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 12,
                }}
              >
                {pendingSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background:
                        "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
                      border: "1px solid #d1fae5",
                      minWidth: 0,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
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
                        wordBreak: "break-word",
                      }}
                    >
                      Sent by: {sch.createdBy || "unknown"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {canTrackTimesheets && (
            <GlassCard
              title="Pending Timesheets Follow Up"
              icon="🕒"
              accent="#c2410c"
              isMobile={isMobile}
              action={
                <button
                  type="button"
                  onClick={() => navigate("/timesheets/reports")}
                  style={{
                    border: "1px solid #fdba74",
                    background: "#fff7ed",
                    color: "#c2410c",
                    borderRadius: 14,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Open Reports
                </button>
              }
            >
              {loadingTimesheets ? (
                <p style={{ margin: 0, color: "#94a3b8" }}>
                  Loading timesheets...
                </p>
              ) : pendingTimesheets.length === 0 ? (
                <p style={{ margin: 0, color: "#64748b" }}>
                  No pending supervisor timesheets right now.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {pendingTimesheets.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        borderRadius: 16,
                        padding: 14,
                        background:
                          "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
                        border: "1px solid #fdba74",
                        minWidth: 0,
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
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 800,
                              color: "#0f172a",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.airline || "—"} · {item.reportDate || "—"}
                          </p>

                          <p
                            style={{
                              margin: "7px 0 0",
                              fontSize: 13,
                              color: "#475569",
                              wordBreak: "break-word",
                            }}
                          >
                            Submitted by{" "}
                            <b>
                              {item.submittedByName ||
                                item.submittedByUsername ||
                                item.supervisorReporting ||
                                "Unknown"}
                            </b>
                          </p>

                          <p
                            style={{
                              margin: "6px 0 0",
                              fontSize: 12,
                              color: "#64748b",
                              wordBreak: "break-word",
                            }}
                          >
                            Created: {formatCreatedAtLabel(item.createdAt)}
                          </p>
                        </div>

                        <div
                          style={{
                            alignSelf: "center",
                            padding: "7px 10px",
                            borderRadius: 999,
                            background: "#fff1f2",
                            border: "1px solid #fecdd3",
                            color: "#be123c",
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          Pending
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <GlassCard
            title="Upcoming Events"
            icon="📅"
            accent="#3b82f6"
            isMobile={isMobile}
          >
            {loadingEvents ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading events...</p>
            ) : events.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No events scheduled.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background:
                        "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
                      border: "1px solid #dbeafe",
                      minWidth: 0,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
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
                          wordBreak: "break-word",
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

          <GlassCard
            title="Notices / Invitations"
            icon="📌"
            accent="#f59e0b"
            isMobile={isMobile}
          >
            {loadingNotices ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading notices...</p>
            ) : notices.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No notices posted.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {notices.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background:
                        "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                      border: "1px solid #fde68a",
                      minWidth: 0,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 800,
                        color: "#0f172a",
                        wordBreak: "break-word",
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
                          wordBreak: "break-word",
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
            isMobile={isMobile}
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
                    width: isMobile ? "100%" : "auto",
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
                    marginBottom: showBlockedList ? 14 : 0,
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
                        wordBreak: "break-word",
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
                  <div style={{ display: "grid", gap: 10 }}>
                    {blockedEmployees.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          borderRadius: 16,
                          padding: 14,
                          background:
                            "linear-gradient(135deg, #fff1f2 0%, #ffffff 100%)",
                          border: "1px solid #fecdd3",
                          minWidth: 0,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 800,
                            color: "#881337",
                            wordBreak: "break-word",
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
                              wordBreak: "break-word",
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
                            wordBreak: "break-word",
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
