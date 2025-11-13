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
      {/*           TOP NAVBAR            */}
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
      {/*             MENU BAR            */}
      {/* ─────────────────────────────── */}
      <nav className="bg-gray-800 text-white px-4 py-2 flex space-x-4 text-sm">

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

        {user.role === "station_manager" && (
          <>
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

            {/* NEW: BUDGET CONFIG PAGE */}
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
      {/*             CONTENT             */}
      {/* ─────────────────────────────── */}
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
