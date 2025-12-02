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
    <div className="app-shell">
      {/* ───────── SIDEBAR ───────── */}
      <aside className="app-sidebar">
        {/* Header del sidebar */}
        <div className="sidebar-header">
          <div className="sidebar-logo-circle">✈️</div>
          <div>
            <div className="sidebar-title">TPA OPS SYSTEM</div>
            <div className="sidebar-subtitle">
              Logged as: <strong>{user?.username}</strong>
            </div>
          </div>
        </div>

        {/* Menú */}
        <nav className="sidebar-menu">
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/schedule" label="Create Schedule" />

          {user?.role === "station_manager" && (
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

          {(user?.role === "station_manager" ||
            user?.role === "duty_manager") && (
            <NavItem to="/approved" label="Approved Schedules" />
          )}
        </nav>

        {/* Logout abajo */}
        <button className="sidebar-logout" type="button" onClick={logout}>
          Logout
        </button>
      </aside>

      {/* ───────── CONTENIDO PRINCIPAL ───────── */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

/** Link del menú */
function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "sidebar-link" + (isActive ? " sidebar-link-active" : "")
      }
    >
      {label}
    </NavLink>
  );
}
