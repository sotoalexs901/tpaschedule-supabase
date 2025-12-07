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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // 👈 NUEVO

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  // 🔔 Escuchar en tiempo real cuántos time-off pendientes hay
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
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={sidebarStyle}
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200
          md:static md:translate-x-0
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
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
          {/* Común para todos los usuarios logueados */}
          <NavItem to="/dashboard" label="Dashboard" />
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
              <NavItem to="/dashboard-editor" label="Dashboard Editor" />
              <NavItem to="/budgets" label="Budgets" />
              <NavItem to="/create-user" label="Create User" />
              <NavItem to="/edit-users" label="Manage Users" />
            </>
          )}

          {/* STATION + DUTY */}
          {(user?.role === "station_manager" ||
            user?.role === "duty_manager") && (
            <>
              <NavItem to="/employees" label="Employees" />
              <NavItem to="/blocked" label="Blocked Employees" />
              <NavItem to="/drafts" label="Draft Schedules" />
              <NavItem to="/approved" label="Approved Schedules" />
              <NavItem to="/returned" label="Returned Schedules" />
              <NavItem to="/weekly-summary" label="Weekly Summary" />
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
        {/* HEADER solo en móvil: botón de menú */}
        <header className="flex items-center justify-between px-4 py-3 border-b bg-white shadow-sm md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-2 py-1 text-sm font-medium text-slate-800 bg-slate-50"
          >
            <span className="mr-2">
              <span className="block w-4 h-0.5 bg-slate-800 mb-1" />
              <span className="block w-4 h-0.5 bg-slate-800 mb-1" />
              <span className="block w-4 h-0.5 bg-slate-800" />
            </span>
            Menu
          </button>
          <div className="text-right">
            <p className="text-xs text-slate-500 leading-tight">TPA OPS SYSTEM</p>
            <p className="text-[11px] text-slate-700 leading-tight">
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
      onClick={() => {
        // En móvil, al hacer clic en un item normalmente el sidebar se cerrará
        // gracias al overlay + navegación; no necesitamos nada extra aquí.
      }}
    >
      <span style={labelStyle}>{label}</span>
      {dot}
    </NavLink>
  );
}
