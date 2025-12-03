// src/pages/AppLayout.jsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  // 🔔 Escuchar en tiempo real los schedules "pending"
  useEffect(() => {
    if (!user || user.role !== "station_manager") {
      setPendingCount(0);
      return;
    }

    const q = query(
      collection(db, "schedules"),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(q, (snap) => {
      setPendingCount(snap.size);
    });

    return () => unsub();
  }, [user]);

  const logout = () => {
    setUser(null);
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0A2342] text-white flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-blue-900">
          <h1 className="text-lg font-bold tracking-wide">TPA OPS SYSTEM</h1>
          <p className="text-xs opacity-70 mt-1">
            Logged as: <b>{user.username}</b>
          </p>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-3 space-y-1 text-sm">
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/schedule" label="Create Schedule" />

          {user.role === "station_manager" && (
            <>
              {/* 🔔 Aquí mostramos el badge con el número de pendientes */}
              <NavItem
                to="/approvals"
                label="Approvals"
                badge={pendingCount > 0 ? pendingCount : null}
              />
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
          className="flex items-center gap-2 text-white px-5 py-3 border-t border-blue-900 hover:bg-blue-950"
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

function NavItem({ to, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2 rounded transition ${
          isActive ? "bg-blue-700 text-white" : "text-gray-200 hover:bg-blue-800"
        }`
      }
    >
      {label}
      {badge ? <span className="badge">{badge}</span> : null}
    </NavLink>
  );
}
