import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

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
    const handler = () => setIsSidebarOpen(false);
    window.addEventListener("close-sidebar", handler);
    return () => window.removeEventListener("close-sidebar", handler);
  }, []);

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  const isAgentOrSupervisor =
    user?.role === "agent" || user?.role === "supervisor";

  return (
    <div
      className="min-h-screen flex"
      style={{
        background:
          "linear-gradient(135deg, #eef6ff 0%, #f4faff 45%, #f8fcff 100%)",
      }}
    >
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/35 backdrop-blur-[2px] z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
                    md:static md:translate-x-0
                    ${
                      isSidebarOpen
                        ? "translate-x-0"
                        : "-translate-x-full md:translate-x-0"
                    }`}
        style={{
          width: 270,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          background:
            "linear-gradient(180deg, #0f4c81 0%, #1769aa 35%, #0b2e4f 100%)",
          color: "#fff",
          boxShadow: "18px 0 40px rgba(23, 105, 170, 0.18)",
          borderTopRightRadius: 28,
          borderBottomRightRadius: 28,
        }}
      >
        <div
          style={{
            padding: "22px 18px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "rgba(255,255,255,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                marginBottom: 12,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              ✈️
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 24,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              TPA OPS
            </h1>
            <p
              style={{
                marginTop: 6,
                marginBottom: 0,
                fontSize: 12,
                color: "rgba(255,255,255,0.82)",
                lineHeight: 1.4,
              }}
            >
              Logged as <b>{user?.username}</b>
              <br />
              {user?.role}
            </p>
          </div>

          <button
            type="button"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            style={{
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              width: 34,
              height: 34,
              borderRadius: 10,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <SidebarSection title="Overview" />
          <NavItem to="/dashboard" label="Dashboard" icon="🏠" />
          <NavItem to="/profile" label="My Profile" icon="👤" />
          <NavItem
            to="/messages"
            label="Messages"
            icon="💬"
            showDot={unreadMessages > 0}
          />

          {isManager && (
            <>
              <SidebarSection title="Scheduling" />
              <NavItem to="/schedule" label="Create Schedule" icon="🗓️" />
              <NavItem to="/cabin-service" label="Cabin Service" icon="🧳" />
              <NavItem
                to="/cabin-saved-schedules"
                label="Cabin Saved Schedules"
                icon="📁"
              />
              <NavItem to="/approvals" label="Approvals" icon="✅" />
              <NavItem to="/drafts" label="Draft Schedules" icon="📝" />
              <NavItem
                to="/approved"
                label="Approved Schedules"
                icon="📌"
              />
              <NavItem
                to="/returned"
                label="Returned Schedules"
                icon="↩️"
              />
              <NavItem
                to="/weekly-summary"
                label="Weekly Summary"
                icon="📊"
              />
            </>
          )}

          {isManager && (
            <>
              <SidebarSection title="Operations" />
              <NavItem
                to="/timeoff-requests"
                label="Day Off Requests"
                icon="🌴"
                showDot={pendingTimeOff > 0}
              />
              <NavItem
                to="/blocked"
                label="Blocked Employees"
                icon="🚫"
              />
              <NavItem
                to="/wchr/admin/flights"
                label="WCHR: Close Flight"
                icon="♿"
              />
              <NavItem
                to="/employee-announcements"
                label="Crew Announcements"
                icon="📣"
              />
              <NavItem
                to="/dashboard-editor"
                label="Dashboard Editor"
                icon="🎛️"
              />
              <NavItem to="/budgets" label="Budgets" icon="💰" />
            </>
          )}

          {user?.role === "station_manager" && (
            <>
              <SidebarSection title="Administration" />
              <NavItem to="/create-user" label="Create User" icon="➕" />
              <NavItem to="/edit-users" label="Manage Users" icon="⚙️" />
              <NavItem to="/employees" label="Employees" icon="👥" />
            </>
          )}

          {isAgentOrSupervisor && (
            <>
              <SidebarSection title="My Tools" />
              <NavItem to="/my-schedule" label="My Schedule" icon="📅" />
              <NavItem
                to="/request-dayoff-internal"
                label="Request Day Off"
                icon="🛫"
              />
              <NavItem
                to="/dayoff-status-internal"
                label="My Day Off Status"
                icon="📍"
              />
              <NavItem
                to="/wchr/scan"
                label="WCHR: Scan Boarding Pass"
                icon="🎫"
              />
              <NavItem
                to="/wchr/my-reports"
                label="WCHR: My Reports"
                icon="📄"
              />
            </>
          )}
        </nav>

        <div
          style={{
            padding: 14,
            borderTop: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <button
            onClick={logout}
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.10)",
              color: "#fff",
              borderRadius: 14,
              padding: "12px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header
          className="md:hidden"
          style={{
            padding: "14px 14px 0",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.9)",
              borderRadius: 20,
              padding: "12px 14px",
              boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <button
              onClick={() => setIsSidebarOpen(true)}
              style={{
                border: "none",
                background: "#1769aa",
                color: "#fff",
                borderRadius: 12,
                padding: "10px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Menu
            </button>

            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#0f4c81",
                }}
              >
                TPA OPS SYSTEM
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "#64748b",
                }}
              >
                {user?.username} · {user?.role}
              </p>
            </div>
          </div>
        </header>

        <main
          className="flex-1 overflow-auto"
          style={{
            padding: "18px",
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarSection({ title }) {
  return (
    <div
      style={{
        padding: "14px 10px 6px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.58)",
      }}
    >
      {title}
    </div>
  );
}

function NavItem({ to, label, showDot, icon }) {
  const dot =
    showDot && (
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          backgroundColor: "#fb7185",
          boxShadow: "0 0 0 4px rgba(251,113,133,0.18)",
          flexShrink: 0,
        }}
      />
    );

  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 12px",
        borderRadius: 14,
        fontSize: 14,
        fontWeight: isActive ? 700 : 600,
        textDecoration: "none",
        color: "#ffffff",
        background: isActive
          ? "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.10))"
          : "transparent",
        border: isActive
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid transparent",
        boxShadow: isActive ? "0 10px 24px rgba(15,23,42,0.14)" : "none",
        transition: "all 0.18s ease",
      })}
      onClick={() => {
        const evt = new Event("close-sidebar");
        window.dispatchEvent(evt);
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 15, opacity: 0.95 }}>{icon}</span>
        <span>{label}</span>
      </span>
      {dot}
    </NavLink>
  );
}
