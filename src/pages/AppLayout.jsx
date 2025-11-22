import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";

/* ICONOS SVG LIGEROS (SIN librerías externas) */
const Icon = {
  smallArrow: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24">
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),
  logout: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">

      {/* TOP BAR */}
      <header className="bg-white shadow px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">TPA Schedule System</h1>

        <div className="flex items-center space-x-4 text-sm">
          <span className="font-medium">
            Logged in as: <strong>{user.username}</strong>
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1 rounded border bg-white hover:bg-gray-100"
          >
            {Icon.logout}
            Logout
          </button>
        </div>
      </header>

      {/* NAV BAR */}
      <nav className="bg-gray-800 text-white px-4 py-2 flex space-x-4 text-sm">

        <NavItem label="Dashboard" to="/dashboard" />
        <NavItem label="Schedule" to="/schedule" />

        {user.role === "station_manager" && (
          <>
            <NavItem label="Approvals" to="/approvals" />
            <NavItem label="Employees" to="/employees" />
            <NavItem label="Blocked Employees" to="/blocked" />
            <NavItem label="Dashboard Editor" to="/dashboard-editor" />
            <NavItem label="Budgets" to="/budgets" />
            <NavItem label="Create User" to="/create-user" />
            <NavItem label="Manage Users" to="/edit-users" />
          </>
        )}

        {(user.role === "station_manager" || user.role === "duty_manager") && (
          <NavItem label="Approved Schedules" to="/approved" />
        )}
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}

/* COMPONENTE PARA LOS BOTONES DEL NAV */
function NavItem({ label, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-2 py-1 rounded flex items-center gap-2 ${
          isActive ? "bg-gray-600" : "hover:bg-gray-700"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
