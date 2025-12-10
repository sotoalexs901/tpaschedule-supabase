// src/pages/AppLayout.jsx
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

  // 🔔 time off pendientes
  useEffect(() => {
    const q = query(
      collection(db, "timeOffRequests"),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPendingTimeOff(snap.size),
      (err) => console.error("Error listening timeOffRequests:", err)
    );
    return () => unsub();
  }, []);

  // 🔒 cerrar sidebar cuando un NavItem dispara el evento
  useEffect(() => {
    const handler = () => setIsSidebarOpen(false);
    window.addEventListener("close-sidebar", handler);
    return () => window.removeEventListener("close-sidebar", handler);
  }, []);

  // estilos base
  const sidebarStyle = {
    width: 230,
    background: "#020617",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    overflowY: "auto", // 👈 permite hacer scroll y ver el Logout
  };

  const sidebarHeaderStyle = {
    padding: "16px 16px 12px",
    borderBottom: "1px solid rgba(148,163,184,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  };

  const loggedTextStyle = {
    fontSize: 11,
    marginTop: 2,
    color: "#ffffff",
    opacity: 1,
  };

  const navStyle = {
    flex: 1,
    padding: "12px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  };

  const logoutStyle = {
    borderTop: "1px solid rgba(148,163,184,0.35)",
    padding: "10px 14px",
    background: "transparent",
    color: "#ffffff",
    textAlign: "left",
    fontSize: 13,
    cursor: "pointer",
  };

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* overlay negro cuando el menú está abierto en móvil */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={sidebarStyle}
        className={`sidebar-base fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
                    md:static md:translate-x-0
                    ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Header sidebar */}
        <div style={sidebarHeaderStyle}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              TPA OPS SYSTEM
            </h1>
            <p style={loggedTextStyle}>
              Logged as: <b>{user?.username}</b> ({user?.role})
            </p>
          </div>

          {/* Botón X solo en móvil */}
          <button
            type="button"
            className="sidebar-close md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        {/* Menú */}
        <nav style={navStyle}>
          {/* Común a todos los usuarios logueados */}
          <NavItem to="/dashboard" label="Dashboard" />
          {/* 🔵 NUEVO: mensajes entre usuarios */}
          <NavItem to="/messages" label="Messages" />

          {isManager && <NavItem to="/schedule" label="Create Schedule" />}

          {/* SOLO STATION MANAGER */}
          {user?.role === "station_manager" && (
            <>
              <NavItem to="/approvals" label="Approvals" />
              <NavItem
                to="/timeoff-requests"
                label="Day Off Requests"
                showDot={pendingTimeOff > 0}
              />
              <NavItem to="/dashboard-editor" label="Dashboard Editor" />
              <NavItem to="/budgets" label="Budgets" />
              <NavItem to="/create-user" label="Create User" />
              <NavItem to="/edit-users" label="Manage Users" />
              <NavItem to="/employees" label="Employees" />
            </>
          )}

          {/* STATION + DUTY */}
          {isManager && (
            <>
              <NavItem to="/blocked" label="Blocked Employees" />
              <NavItem to="/drafts" label="Draft Schedules" />
              <NavItem to="/approved" label="Approved Schedules" />
              <NavItem to="/returned" label="Returned Schedules" />
              <NavItem to="/weekly-summary" label="Weekly Summary" />
            </>
          )}

          {/* SOLO AGENT / SUPERVISOR */}
          {(user?.role === "agent" || user?.role === "supervisor") && (
            <>
              <NavItem to="/my-schedule" label="My Schedule" />
              <NavItem to="/request-dayoff-internal" label="Request Day Off" />
              <NavItem
                to="/dayoff-status-internal"
                label="My Day Off Status"
              />
            </>
          )}
        </nav>

        {/* Logout en sidebar (desktop + móvil con scroll) */}
        <button style={logoutStyle} onClick={logout}>
          Logout
        </button>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header móvil (botón menú + logout pequeño) */}
        <header className="mobile-header md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="mobile-menu-btn"
          >
            <span className="mobile-menu-icon">
              <span />
              <span />
              <span />
            </span>
            Menu
          </button>

          <div className="mobile-header-right">
            <p className="mobile-header-title">TPA OPS SYSTEM</p>
            <div className="mobile-header-user-row">
              <span className="mobile-header-user">
                {user?.username} · {user?.role}
              </span>
              <button
                type="button"
                className="mobile-logout-btn"
                onClick={logout}
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Link del menú lateral (con posible puntico rojo)
function NavItem({ to, label, showDot }) {
  const baseStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 13,
    textDecoration: "none",
    color: "#ffffff",
    opacity: 1,
    transition: "background 0.15s, color 0.15s",
  };

  const labelStyle = { display: "inline-block" };

  const dot =
    showDot && (
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "999px",
          backgroundColor: "#ef4444",
          boxShadow: "0 0 0 3px rgba(248,113,113,0.35)",
        }}
      />
    );

  return (
    <NavLink
      to={to}
      style={({ isActive }) =>
        isActive
          ? {
              ...baseStyle,
              background: "#1d4ed8",
              color: "#ffffff",
            }
          : {
              ...baseStyle,
              background: "transparent",
            }
      }
      onClick={() => {
        const evt = new Event("close-sidebar");
        window.dispatchEvent(evt);
      }}
    >
      <span style={labelStyle}>{label}</span>
      {dot}
    </NavLink>
  );
}
