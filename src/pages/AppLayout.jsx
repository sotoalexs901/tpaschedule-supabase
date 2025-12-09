// src/pages/AppLayout.jsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function AppLayout() {
  const { user, setUser } = useUser();

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  const isEmployee = user?.role === "agent" || user?.role === "supervisor";

  const navigate = useNavigate();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  // 🔔 Escuchar en tiempo real cuántos time-off pendientes hay (para Station Manager)
  useEffect(() => {
    const q = query(
      collection(db, "timeOffRequests"),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingTimeOff(snap.size);
      },
      (err) => {
        console.error("Error listening timeOffRequests:", err);
      }
    );
    return () => unsub();
  }, []);

  // Estilos base del sidebar
  const sidebarStyle = {
    width: 230,
    background: "#020617",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  };

  const sidebarHeaderStyle = {
    padding: "20px 16px",
    borderBottom: "1px solid rgba(148,163,184,0.35)",
  };

  const loggedTextStyle = {
    fontSize: 11,
    marginTop: 4,
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

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* OVERLAY en móvil cuando el sidebar está abierto */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR (off-canvas en móvil) */}
      <aside
        style={sidebarStyle}
        className={`app-sidebar ${isSidebarOpen ? "app-sidebar-open" : ""}`}
      >
        {/* Header */}
        <div style={sidebarHeaderStyle}>
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

        {/* Menú */}
        <nav style={navStyle}>
          {/* Siempre */}
          <NavItem to="/dashboard" label="Dashboard" />

          {/* ========= MENÚ PARA AGENTS / SUPERVISORS ========= */}
          {isEmployee && (
            <>
              <NavItem to="/my-schedule" label="My Schedule" />
              <NavItem
                to="/request-dayoff-internal"
                label="Request Day Off"
              />
              <NavItem
                to="/dayoff-status-internal"
                label="My Day Off Status"
              />
            </>
          )}

          {/* ========= MENÚ PARA STATION / DUTY ========= */}
          {!isEmployee && (
            <>
              <NavItem to="/schedule" label="Create Schedule" />

              {/* SOLO STATION MANAGER */}
              {user?.role === "station_manager" && (
                <>
                  <NavItem to="/approvals" label="Approvals" />
                  <NavItem
                    to="/timeoff-requests"
                    label="Day Off Requests"
                    showDot={pendingTimeOff > 0}
                  />
                  <NavItem
                    to="/dashboard-editor"
                    label="Dashboard Editor"
                  />
                  <NavItem to="/budgets" label="Budgets" />
                  <NavItem to="/create-user" label="Create User" />
                  <NavItem to="/edit-users" label="Manage Users" />
                  <NavItem
                    to="/employee-announcements"
                    label="Crew Announcements"
                  />
                </>
              )}

              {/* STATION + DUTY */}
              {isManager && (
                <>
                  <NavItem to="/employees" label="Employees" />
                  <NavItem to="/blocked" label="Blocked Employees" />
                  <NavItem to="/drafts" label="Draft Schedules" />
                  <NavItem to="/approved" label="Approved Schedules" />
                  <NavItem to="/returned" label="Returned Schedules" />
                  <NavItem
                    to="/weekly-summary"
                    label="Weekly Summary"
                  />
                </>
              )}
            </>
          )}
        </nav>

        {/* Logout */}
        <button style={logoutStyle} onClick={logout}>
          Logout
        </button>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* HEADER móvil: botón de menú */}
        <header className="app-mobile-header">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="app-mobile-menu-btn"
          >
            <span className="app-mobile-menu-icon">
              <span />
              <span />
              <span />
            </span>
            Menu
          </button>
          <div className="app-mobile-header-right">
            <p className="app-mobile-header-title">TPA OPS SYSTEM</p>
            <p className="app-mobile-header-user">
              {user?.username} · {user?.role}
            </p>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Link del menú lateral (con posible puntito rojo)
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
      ></span>
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
    >
      <span style={labelStyle}>{label}</span>
      {dot}
    </NavLink>
  );
}
