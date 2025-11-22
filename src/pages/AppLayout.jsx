import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import {
  Home,
  Calendar,
  ClipboardCheck,
  Users,
  UserMinus,
  Settings,
  FileSpreadsheet,
  UserPlus,
  FileCheck,
  LogOut,
} from "lucide-react";

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-100">

      {/* ------------------------------------------------------------- */}
      {/*                            SIDEBAR                             */}
      {/* ------------------------------------------------------------- */}
      <aside className="w-64 bg-[#0A2342] text-white flex flex-col shadow-xl">

        {/* LOGO + USER */}
        <div className="p-5 border-b border-blue-900">
          <h1 className="text-xl font-bold tracking-wider">TPA OPS SYSTEM</h1>
          <p className="text-xs opacity-70 mt-1">
            Logged in as <b>{user.username}</b>
          </p>
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 p-4 space-y-2 text-sm">

          <SidebarItem to="/dashboard" icon={<Home size={18} />} label="Dashboard" />

          <SidebarItem to="/schedule" icon={<Calendar size={18} />} label="Create Schedule" />

          {user.role === "station_manager" && (
            <>
              <SidebarItem to="/approvals" icon={<ClipboardCheck size={18} />} label="Approvals" />

              <SidebarItem to="/employees" icon={<Users size={18} />} label="Employees" />

              <SidebarItem to="/blocked" icon={<UserMinus size={18} />} label="Blocked Employees" />

              <SidebarItem to="/dashboard-editor" icon={<Settings size={18} />} label="Dashboard Editor" />

              <SidebarItem to="/budgets" icon={<FileSpreadsheet size={18} />} label="Budgets" />

              <SidebarItem to="/create-user" icon={<UserPlus size={18} />} label="Create User" />

              <SidebarItem to="/edit-users" icon={<Users size={18} />} label="Manage Users" />
            </>
          )}

          {(user.role === "station_manager" || user.role === "duty_manager") && (
            <SidebarItem to="/approved" icon={<FileCheck size={18} />} label="Approved Schedules" />
          )}

        </nav>

        {/* LOGOUT */}
        <button
          onClick={logout}
          className="flex items-center gap-2 px-5 py-3 border-t border-blue-900 text-white hover:bg-blue-950 transition"
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/*                     MAIN CONTENT AREA                          */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------- */
/*                 COMPONENTE: SIDEBAR ITEM                      */
/* ------------------------------------------------------------- */
function SidebarItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded transition-all 
        ${isActive ? "bg-blue-700 text-white shadow-md" : "text-gray-200 hover:bg-blue-800"}`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
