// src/pages/AppLayout.jsx
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

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
      {/* SIDEBAR */}
      <aside style={sidebarStyle}>
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
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/schedule" label="Create Schedule" />

          {/* 🔵 SOLO STATION MANAGER */}
          {user?.role === "station_manager" && (
            <>
              <NavItem to="/approvals" label="Approvals" />
              <NavItem to="/dashboard-editor" label="Dashboard Editor" />
              <NavItem to="/budgets" label="Budgets" />
              <NavItem to="/create-user" label="Create User" />
              <NavItem to="/edit-users" label="Manage Users" />
            </>
          )}

          {/* 🔵 STATION + DUTY: Employees, Blocked, Approved, Returned */}
          {(user?.role === "station_manager" ||
            user?.role === "duty_manager") && (
            <>
              <NavItem to="/employees" label="Employees" />
              <NavItem to="/blocked" label="Blocked Employees" />
              <NavItem to="/approved" label="Approved Schedules" />
              <NavItem to="/returned" label="Returned Schedules" />
            </>
          )}


        </nav>

        {/* Logout */}
        <button style={logoutStyle} onClick={logout}>
          Logout
        </button>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

// Componente de link del menú lateral
function NavItem({ to, label }) {
  const baseStyle = {
    display: "block",
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 13,
    textDecoration: "none",
    color: "#ffffff",
    opacity: 1,
    transition: "background 0.15s, color 0.15s",
  };

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
      {label}
    </NavLink>
  );
}
