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
    <div className="min-h-screen flex flex-col bg-slate-100">

      {/* ─────────────────────────────── */}
      {/*           TOP BAR              */}
      {/* ─────────────────────────────── */}
      <header className="bg-white shadow px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">TPA Schedule System</h1>

        <div className="flex items-center space-x-4 text-sm">
          <span className="font-medium">
            Logged in as: <strong>{user.username}</strong>
          </span>
          <button
            onClick={logout}
            className="px-3 py-1 rounded border bg-white hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ─────────────────────────────── */}
      {/*            NAV BAR             */}
      {/* ─────────────────────────────── */}
      <nav className="bg-gray-800 text-white px-4 py-2 flex space-x-4 text-sm">

        {/* Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `px-2 py-1 rounded ${
              isActive ? "bg-gray-600" : "hover:bg-gray-700"
            }`
          }
        >
          Dashboard
        </NavLink>

        {/* Schedule */}
        <NavLink
          to="/schedule"
          className={({ isActive }) =>
            `px-2 py-1 rounded ${
              isActive ? "bg-gray-600" : "hover:bg-gray-700"
            }`
          }
        >
          Schedule
        </NavLink>

        {/* Only Station Manager */}
        {user.role === "station_manager" && (
          <>
            {/* Approvals */}
            <NavLink
              to="/approvals"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${
                  isActive ? "bg-gray-600" : "hover:bg-gray-700"
                }`
              }
            >
              Approvals
            </NavLink>

            {/* Employees */}
            <NavLink
              to="/employees"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${
                  isActive ? "bg-gray-600" : "hover:bg-gray-700"
                }`
              }
            >
              Employees
            </NavLink>

            {/* Blocked Employees */}
            <NavLink
              to="/blocked"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${
                  isActive ? "bg-gray-600" : "hover:bg-gray-700"
                }`
              }
            >
              Blocked Employees
            </NavLink>

            {/* Dashboard Editor (restored) */}
            <NavLink
              to="/dashboard-editor"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${
                  isActive ? "bg-gray-600" : "hover:bg-gray-700"
                }`
              }
            >
              Dashboard Editor
            </NavLink>

            {/* Budgets (new) */}
            <NavLink
              to="/budgets"
              className={({ isActive }) =>
                `px-2 py-1 rounded ${
                  isActive ? "bg-gray-600" : "hover:bg-gray-700"
                }`
              }
            >
              Budgets
            </NavLink>
          </>
        )}
      </nav>

      {/* ─────────────────────────────── */}
      {/*           MAIN CONTENT         */}
      {/* ─────────────────────────────── */}
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
