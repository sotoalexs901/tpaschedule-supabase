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

  if (!user) return null; // seguridad por si acaso

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* SIDEBAR IZQUIERDO */}
      <aside className="w-64 bg-[#0A2342] text-white flex flex-col">
        {/* Header del sidebar */}
        <div className="p-5 border-b border-blue-900">
          <h1 className="text-lg font-bold tracking-wide">TPA OPS SYSTEM</h1>
          <p className="text-xs opacity-80 mt-1">
            Logged as: <b>{user.username}</b>
          </p>
        </div>

        {/* Menú */}
        <nav className="flex-1 p-3 space-y-1 text-sm">
          {/* Dashboard */}
          <NavItem to="/dashboard" label="Dashboard" />

          {/* Crear horario */}
          <NavItem to="/schedule" label="Create Schedule" />

          {/* Opciones SOLO Station Manager */}
          {user.role === "station_manager" && (
            <>
              <NavItem to="/approvals" label="Approvals" />
              <NavItem to="/employees" label="Employees" />
              <NavItem to="/blocked" label="Blocked Employees" />
              <NavItem to="/dashboard-editor" label="Dashboard Editor" />
              <NavItem to="/budgets" label="Budgets" />
              <NavItem to="/create-user" label="Create User" />
              <NavItem to="/edit-users" label="Manage Users" />
            </>
          )}

          {/* Approved schedules – Station + Duty managers */}
          {(user.role === "station_manager" ||
            user.role === "duty_manager") && (
            <NavItem to="/approved" label="Approved Schedules" />
          )}
        </nav>

        {/* Botón Logout */}
        <button
          onClick={logout}
          className="px-5 py-3 border-t border-blue-900 hover:bg-blue-950 text-sm text-left"
        >
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

/**
 * Item de navegación reutilizable
 * Usa las clases .sidebar-link y .sidebar-link-active definidas en styles.css
 */
function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
      }
    >
      {label}
    </NavLink>
  );
}
