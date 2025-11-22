import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserX,
  ClipboardList,
  FileCheck,
  Settings,
  LogOut,
} from "lucide-react";

export default function ModernLayoutLight() {
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

      {/* ░░░ SIDEBAR LIGHT MODE ░░░ */}
      <aside
        className={`bg-white border-r border-gray-200 text-gray-800 transition-all duration-300 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Header + collapse */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          {!collapsed && (
            <h1 className="text-lg font-semibold tracking-wide text-gray-800">
              TPA Schedules
            </h1>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-500 hover:text-gray-700"
          >
            {collapsed ? "➡️" : "⬅️"}
          </button>
        </div>

        {/* User info */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-gray-200 text-sm">
            <p className="text-gray-500">Logged in as:</p>
            <p className="font-semibold">{user.username}</p>
            <p className="text-xs text-gray-400 mt-1">{user.role}</p>
          </div>
        )}

        {/* Menu items */}
        <nav className="mt-2">
          {menuItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2 text-sm transition rounded-md mx-2 my-1 ${
                    isActive
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.icon}
                {!collapsed && item.label}
              </NavLink>
            ))}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-4 left-0 w-full px-2">
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-500 hover:bg-red-100 rounded-md"
          >
            <LogOut size={18} />
            {!collapsed && "Logout"}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
