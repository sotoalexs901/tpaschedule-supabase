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

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0A2342] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-blue-900">
          <h1 className="text-lg font-bold tracking-wide text-white">
            TPA OPS SYSTEM
          </h1>
          {/* ❗️Quitamos opacity-70 y dejamos texto blanco normal */}
          <p className="text-xs mt-1 text-white">
            Logged as: <b>{user.username}</b>
          </p>
        </div>

        {/* Menú */}
        <nav className="flex-1 p-3 space-y-1 text-sm">
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/schedule" label="Create Schedule" />

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

          {(user.role === "station_manager" ||
            user.role === "duty_manager") && (
            <NavItem to="/approved" label="Approved Schedules" />
          )}
        </nav>

        {/* Logout */}
        <button
          onClick={logout}
          className="px-5 py-3 border-t border-blue-900 text-white hover:bg-blue-950 text-sm text-left"
        >
          Logout
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * NavItem usa las clases .sidebar-link y .sidebar-link-active
 * que ya tienes definidas en styles.css
 */
function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
      }
    >
      {label}
    </NavLink>
  );
}
