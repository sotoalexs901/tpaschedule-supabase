import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";

/* ████████████████████████████████ */
/*   ICONOS SVG SIN DEPENDENCIAS    */
/* ████████████████████████████████ */

const Icon = {
  home: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 
      2H5a2 2 0 0 1-2-2z"/></svg>
  ),

  calendar: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/></svg>
  ),

  check: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
  ),

  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 
      4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <circle cx="17" cy="11" r="4"/></svg>
  ),

  minusUser: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/>
      <path d="M17 11h6"/><path d="M17 21v-2a4 
      4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/></svg>
  ),

  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 
      0 .33 1.82l.06.06a2 2 0 1 1-2.83 
      2.83l-.06-.06a1.65 1.65 0 0 
      0-1.82-.33 1.65 1.65 0 0 
      0-1 1.51V21a2 2 0 1 
      1-4 0v-.09A1.65 1.65 0 0 
      0 8.6 19.4a1.65 1.65 0 0 
      0-1.82.33l-.06.06a2 2 0 1 
      1-2.83-2.83l.06-.06a1.65 1.65 
      0 0 0 .33-1.82 1.65 1.65 
      0 0 0-1.51-1H3a2 2 0 1 
      1 0-4h.09a1.65 1.65 0 0 
      0 1.51-1 1.65 1.65 0 0 
      0-.33-1.82l-.06-.06a2 2 0 1 
      1 2.83-2.83l.06.06a1.65 1.65 
      0 0 0 1.82.33H9a1.65 1.65 
      0 0 0 1-1.51V3a2 2 0 1 
      1 4 0v.09a1.65 1.65 0 0 
      0 1 1.51 1.65 1.65 0 0 
      0 1.82-.33l.06-.06a2 2 0 1 
      1 2.83 2.83l-.06.06a1.65 
      1.65 0 0 0-.33 1.82V9a1.65 
      1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),

  file: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 
      0-2 2v16a2 2 0 0 0 2 
      2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/></svg>
  ),

  plusUser: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/>
      <path d="M15 14h6m-3-3v6"/>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 
      4 0 0 0-4 4v2"/></svg>
  ),

  edit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M12 20h9"/>
      <path d="M18.5 2.5a2.12 2.12 
      0 0 1 3 3L7 20l-4 
      1 1-4Z"/></svg>
  ),

  logout: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"
      viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 
      0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/></svg>
  ),
};

/* ██████████████████████████████████ */

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-100">

      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0A2342] text-white flex flex-col">

        <div className="p-5 border-b border-blue-900">
          <h1 className="text-lg font-bold">✈️ TPA OPS SYSTEM</h1>
          <p className="text-xs opacity-70 mt-1">
            Logged as: <b>{user.username}</b>
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1">

          <NavItem to="/dashboard" icon={Icon.home} label="Dashboard" />
          <NavItem to="/schedule" icon={Icon.calendar} label="Create Schedule" />

          {user.role === "station_manager" && (
            <>
              <NavItem to="/approvals" icon={Icon.check} label="Approvals" />
              <NavItem to="/employees" icon={Icon.users} label="Employees" />
              <NavItem to="/blocked" icon={Icon.minusUser} label="Blocked Employees" />
              <NavItem to="/dashboard-editor" icon={Icon.settings} label="Dashboard Editor" />
              <NavItem to="/budgets" icon={Icon.file} label="Budgets" />
              <NavItem to="/create-user" icon={Icon.plusUser} label="Create User" />
              <NavItem to="/edit-users" icon={Icon.edit} label="Manage Users" />
            </>
          )}

          {(user.role === "station_manager" || user.role === "duty_manager") && (
            <NavItem to="/approved" icon={Icon.file} label="Approved Schedules" />
          )}

        </nav>

        <button
          onClick={logout}
          className="flex items-center gap-2 text-white px-5 py-3 border-t border-blue-900 hover:bg-blue-950"
        >
          {Icon.logout}
          Logout
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

/* ITEM DEL MENÚ */
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
