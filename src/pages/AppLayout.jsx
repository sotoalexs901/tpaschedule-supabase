import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  updateUserPresence,
  updateUserPage,
  markUserOffline,
} from "../services/presenceService";

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  const [openSections, setOpenSections] = useState({
    General: true,
    Schedules: true,
    "Time Off": false,
    WCHR: true,
    Admin: false,
  });

  const logout = async () => {
    try {
      if (user?.id) {
        await markUserOffline(user);
      }
    } catch (err) {
      console.error("Error marking user offline on logout:", err);
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const qTimeoff = query(
      collection(db, "timeOffRequests"),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(
      qTimeoff,
      (snap) => setPendingTimeOff(snap.size),
      (err) => console.error("Error listening timeOffRequests:", err)
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const qMsgs = query(
      collection(db, "messages"),
      where("toUserId", "==", user.id),
      where("read", "==", false)
    );

    const unsub = onSnapshot(
      qMsgs,
      (snap) => setUnreadMessages(snap.size),
      (err) => console.error("Error listening unread messages:", err)
    );

    return () => unsub();
  }, [user?.id]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.id) return;

    updateUserPresence(user, { currentPage: location.pathname }).catch(
      console.error
    );

    const handleBeforeUnload = () => {
      markUserOffline(user).catch(() => {});
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      markUserOffline(user).catch(() => {});
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    updateUserPage(user, location.pathname).catch(console.error);
  }, [user?.id, location.pathname]);

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  const isAgentOrSupervisor =
    user?.role === "agent" || user?.role === "supervisor";

  const navSections = useMemo(() => {
    const sections = [];

    const general = [
      { to: "/dashboard", label: "Dashboard", icon: "🏠" },
      { to: "/profile", label: "My Profile", icon: "👤" },
      {
        to: "/messages",
        label: "Messages",
        icon: "💬",
        showDot: unreadMessages > 0,
      },
    ];

    const schedules = [];
    const timeoff = [];
    const wchr = [];
    const admin = [];

    if (isManager) {
      schedules.push(
        { to: "/schedule", label: "Create Schedule", icon: "🗓️" },
        { to: "/cabin-service", label: "Cabin Service", icon: "🧳" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "📁",
        },
        { to: "/approvals", label: "Approvals", icon: "✅" },
        { to: "/drafts", label: "Draft Schedules", icon: "📝" },
        { to: "/approved", label: "Approved Schedules", icon: "📌" },
        { to: "/returned", label: "Returned Schedules", icon: "↩️" },
        { to: "/weekly-summary", label: "Weekly Summary", icon: "📊" }
      );

      timeoff.push(
        {
          to: "/timeoff-requests",
          label: "Day Off Requests",
          icon: "🌴",
          showDot: pendingTimeOff > 0,
        },
        { to: "/blocked", label: "Blocked Employees", icon: "🚫" }
      );

      wchr.push({
        to: "/wchr/admin/flights",
        label: "WCHR Close Flight",
        icon: "♿",
      });

      admin.push(
        {
          to: "/employee-announcements",
          label: "Crew Announcements",
          icon: "📣",
        },
        { to: "/dashboard-editor", label: "Dashboard Editor", icon: "🎛️" },
        { to: "/budgets", label: "Budgets", icon: "💰" }
      );
    }

    if (user?.role === "station_manager") {
      admin.push(
        { to: "/admin/activity-dashboard", label: "User Activity", icon: "📈" },
        { to: "/create-user", label: "Create User", icon: "➕" },
        { to: "/edit-users", label: "Manage Users", icon: "⚙️" },
        { to: "/employees", label: "Employees", icon: "👥" }
      );
    }

    if (isAgentOrSupervisor) {
      schedules.push({ to: "/my-schedule", label: "My Schedule", icon: "📅" });

      timeoff.push(
        {
          to: "/request-dayoff-internal",
          label: "Request Day Off",
          icon: "🛫",
        },
        {
          to: "/dayoff-status-internal",
          label: "My Day Off Status",
          icon: "📍",
        }
      );
    }

    if (user) {
      wchr.push(
        { to: "/wchr/scan", label: "Scan Boarding Pass", icon: "🎫" },
        { to: "/wchr/my-reports", label: "My Reports", icon: "📄" }
      );
    }

    if (general.length) sections.push({ title: "General", items: general });
    if (schedules.length) sections.push({ title: "Schedules", items: schedules });
    if (timeoff.length) sections.push({ title: "Time Off", items: timeoff });
    if (wchr.length) sections.push({ title: "WCHR", items: wchr });
    if (admin.length) sections.push({ title: "Admin", items: admin });

    return sections;
  }, [
    isManager,
    isAgentOrSupervisor,
    unreadMessages,
    pendingTimeOff,
    user,
    user?.role,
  ]);

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #eef6ff 0%, #f4faff 45%, #f8fcff 100%)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "14px 16px 0",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.84)",
            border: "1px solid rgba(255,255,255,0.96)",
            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            borderRadius: 30,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 18,
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 22,
                  boxShadow: "0 10px 24px rgba(23,105,170,0.25)",
                  flexShrink: 0,
                }}
              >
                ✈️
              </div>

              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#1769aa",
                  }}
                >
                  TPA OPS SYSTEM
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "#475569",
                    fontWeight: 600,
                  }}
                >
                  Logged as <b>{user?.username}</b> · {user?.role}
                </p>
              </div>
            </div>

            {isMobile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={{
                    border: "none",
                    background:
                      "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                    color: "#fff",
                    borderRadius: 14,
                    padding: "11px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 10px 24px rgba(23,105,170,0.22)",
                  }}
                >
                  {menuOpen ? "Close" : "Menu"}
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <StatusPill label="Unread Messages" value={unreadMessages} />
                <StatusPill label="Pending Day Off" value={pendingTimeOff} />
                <button
                  onClick={logout}
                  style={{
                    border: "none",
                    background:
                      "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                    color: "#fff",
                    borderRadius: 14,
                    padding: "11px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 10px 24px rgba(23,105,170,0.22)",
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {!isMobile && (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
              }}
            >
              {navSections.map((section) => (
                <div
                  key={section.title}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleSection(section.title)}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "#f8fbff",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#1769aa",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    <span>{section.title}</span>
                    <span>{openSections[section.title] ? "−" : "+"}</span>
                  </button>

                  {openSections[section.title] && (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        padding: 12,
                      }}
                    >
                      {section.items.map((item) => (
                        <TopNavItem key={item.to} {...item} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isMobile && menuOpen && (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
                paddingTop: 12,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <StatusPill label="Unread Messages" value={unreadMessages} />
                <StatusPill label="Pending Day Off" value={pendingTimeOff} />
              </div>

              {navSections.map((section) => (
                <div
                  key={section.title}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleSection(section.title)}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "#f8fbff",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#1769aa",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    <span>{section.title}</span>
                    <span>{openSections[section.title] ? "−" : "+"}</span>
                  </button>

                  {openSections[section.title] && (
                    <div style={{ display: "grid", gap: 8, padding: 12 }}>
                      {section.items.map((item) => (
                        <TopNavItem key={item.to} {...item} mobile />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={logout}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "12px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <main
        style={{
          padding: "16px",
          maxWidth: 1600,
          margin: "0 auto",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

function StatusPill({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #d7e9fb",
        borderRadius: 14,
        padding: "10px 12px",
        minWidth: 130,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 18,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TopNavItem({ to, label, showDot, icon, mobile = false }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: mobile ? "12px 14px" : "10px 14px",
        borderRadius: 14,
        textDecoration: "none",
        fontSize: 14,
        fontWeight: isActive ? 800 : 600,
        color: isActive ? "#0f4c81" : "#334155",
        background: isActive
          ? "linear-gradient(135deg, #dff0ff 0%, #eef8ff 100%)"
          : "#ffffff",
        border: isActive ? "1px solid #bfe0fb" : "1px solid #e2e8f0",
        boxShadow: isActive ? "0 10px 22px rgba(23,105,170,0.10)" : "none",
        minWidth: mobile ? "auto" : "fit-content",
        whiteSpace: "nowrap",
        flexShrink: 0,
      })}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span>{label}</span>
      </span>

      {showDot && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "#ef4444",
            boxShadow: "0 0 0 4px rgba(239,68,68,0.12)",
            flexShrink: 0,
          }}
        />
      )}
    </NavLink>
  );
}
