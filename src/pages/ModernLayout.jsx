import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCheck,
  UserX,
  ClipboardList,
  FileCheck,
  LogOut,
  Settings,
} from "lucide-react";

export default function ModernLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  const menuItems = [
    {
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
      path: "/dashboard",
      roles: ["station_manager", "duty_manager"],
    },
    {
      label: "Create Schedule",
      icon: <Calendar size={18} />,
      path: "/schedule",
      roles: ["station_manager", "duty_manager"],
    },
    {
      label: "Approvals",
      icon: <ClipboardList size={18} />,
      path: "/approvals",
      roles: ["station_manager"],
    },
    {
      label: "Employees",
      icon: <Users size={18} />,
      path: "/employees",
      roles: ["station_manager"],
    },
    {
      label: "Blocked Employees",
      icon: <UserX size={18} />,
      path: "/blocked",
      roles: ["station_manager"],
    },
    {
      label: "Approved Schedules",
      icon: <FileCheck size={18} />,
      path: "/approved",
      roles: ["station_manager", "duty_manager"],
    },
    {
      label: "Budgets",
      icon: <Settings size={18} />,
      path: "/budgets",
      roles: ["station_manager"],
    },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* ────────────────────── */}
      {/*        SIDEBAR        */}
      {/* ────────────────────── */}
      <aside
        className={`bg-gray-900 text-white transition-all duration-300 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {/* Logo + collapse button */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          {!collapsed && (
            <h1 className="text-lg font-semibold tracking-wide">
              TPA Schedules
            </h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-300 hover:text-white"
          >
            {collapsed ? "➡️" : "⬅️"}
          </button>
        </div>

        {/* User info */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-gray-700 text-sm">
            <p className="opacity-60">Logged in as:</p>
            <p className="font-semibold">{user.username}</p>
            <p className="text-xs opacity-50 mt-1">{user.role}</p>
          </div>
        )}

        {/* Menu */}
        <nav className="mt-2">
          {menuItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition ${
                    isActive
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-800"
                  }`
                }
              >
                {item.icon}
                {!collapsed && item.label}
              </NavLink>
            ))}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-4 left-0 w-full">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300"
          >
            <LogOut size={18} />
            {!collapsed && "Logout"}
          </button>
        </div>
      </aside>

      {/* ────────────────────── */}
      {/*      MAIN CONTENT     */}
      {/* ────────────────────── */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
