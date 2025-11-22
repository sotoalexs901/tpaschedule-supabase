import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import {
  Home,
  Calendar,
  Users,
  UserMinus,
  ClipboardCheck,
  Settings,
  FileText,
  LogOut,
  UserPlus,
  Edit
} from "lucide-react"; // Íconos limpios estilo aviation

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-100">

      {/* ─────────────────────────────── */}
      {/*         SIDEBAR IZQUIERDA      */}
      {/* ─────────────────────────────── */}
      <aside className="w-64 bg-[#0A2342] text-white flex flex-col">
        
        {/* HEADER DEL SIDEBAR */}
        <div className="p-5 border-b border-blue-900">
          <h1 className="text-lg font-bold tracking-wide">
            ✈️ TPA OPS SYSTEM
          </h1>
          <p className="text-xs opacity-70 mt-1">
            Logged as: <b>{user.username}</b>
          </p>
        </div>

        {/* MENÚ PRINCIPAL */}
        <nav className="flex-1 p-3 space-y-1">

          {/* Dashboard */}
          <NavItem to="/dashboard" icon={<Home size={18} />} label="Dashboard" />

          {/* Create Schedule */}
          <NavItem to="/schedule" icon={<Calendar size={18} />} label="Create Schedule" />

          {/* Station Manager exclusive */}
          {user.role === "station_manager" && (
            <>
              <NavItem
                to="/approvals"
                icon={<ClipboardCheck size={18} />}
                label="Approvals"
              />

              <NavItem
                to="/employees"
                icon={<Users size={18} />}
                label="Employees"
              />

              <NavItem
                to="/blocked"
                icon={<UserMinus size={18} />}
                label="Blocked Employees"
              />

              <NavItem
                to="/dashboard-editor"
                icon={<Settings size={18} />}
                label="Dashboard Editor"
              />

              <NavItem
                to="/budgets"
                icon={<FileText size={18} />}
                label="Budgets"
              />

              {/* NEW - CREATE USER */}
              <NavItem
                to="/create-user"
                icon={<UserPlus size={18} />}
                label="Create User"
              />

              {/* NEW - EDIT USERS */}
              <NavItem
                to="/edit-users"
                icon={<Edit size={18} />}
                label="Manage Users"
              />
            </>
          )}

          {/* Approved schedules (Station + Duty) */}
          {(user.role === "station_manager" || user.role === "duty_manager") && (
            <NavItem
              to="/approved"
              icon={<FileText size={18} />}
              label="Approved Schedules"
            />
          )}
        </nav>

        {/* LOGOUT */}
        <button
          onClick={logout}
          className="flex items-center gap-2 text-white px-5 py-3 border-t border-blue-900 hover:bg-blue-950"
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      {/* ─────────────────────────────── */}
      {/*          MAIN CONTENT           */}
      {/* ─────────────────────────────── */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

/* COMPONENTE NAV ITEM */
function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded text-sm transition ${
          isActive
            ? "bg-blue-700 text-white"
            : "text-gray-200 hover:bg-blue-800 hover:text-white"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
