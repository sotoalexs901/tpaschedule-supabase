import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function normalizeRole(role) {
  const value = String(role || "").trim();

  if (value === "station_manager") return "Station Manager";
  if (value === "duty_manager") return "Duty Manager";
  if (value === "supervisor") return "Supervisor";
  if (value === "agent") return "Agent";

  return value || "—";
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);
  const [presence, setPresence] = useState([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setUsers(data);
      },
      (err) => console.error("Error loading users:", err)
    );

    const unsubPresence = onSnapshot(
      collection(db, "user_presence"),
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setPresence(data);
      },
      (err) => console.error("Error loading presence:", err)
    );

    return () => {
      unsubUsers();
      unsubPresence();
    };
  }, []);

  const mergedUsers = useMemo(() => {
    const presenceMap = new Map(
      presence.map((item) => [String(item.userId || item.id), item])
    );

    return users.map((user) => {
      const p = presenceMap.get(String(user.id)) || null;

      return {
        id: user.id,
        username: user.username || "—",
        role: user.role || "—",
        online: Boolean(p?.online),
        currentPage: p?.currentPage || "—",
        lastSeen: p?.lastSeen || null,
        lastLoginAt: p?.lastLoginAt || null,
        createdAt: user.createdAt || null,
        employeeId: user.employeeId || "",
      };
    });
  }, [users, presence]);

  const totalUsers = mergedUsers.length;
  const onlineUsers = mergedUsers.filter((u) => u.online).length;
  const activeUsers = mergedUsers.filter((u) => u.lastSeen).length;

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
          User Activity Dashboard
        </h1>
        <p style={{ marginTop: 6, color: "#64748b", fontSize: 14 }}>
          View registered users, live activity, current page, and latest access.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Total Registered Users" value={totalUsers} />
        <StatCard label="Online Now" value={onlineUsers} />
        <StatCard label="Users With Activity" value={activeUsers} />
      </div>

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fbff" }}>
            <tr>
              <th style={th}>User</th>
              <th style={th}>Role</th>
              <th style={th}>Status</th>
              <th style={th}>Current Page</th>
              <th style={th}>Last Seen</th>
              <th style={th}>First Login Tracked</th>
              <th style={th}>Linked Employee</th>
            </tr>
          </thead>
          <tbody>
            {mergedUsers.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#f9fbff",
                }}
              >
                <td style={td}>
                  <div style={{ fontWeight: 700 }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    User ID: {u.id}
                  </div>
                </td>

                <td style={td}>{normalizeRole(u.role)}</td>

                <td style={td}>
                  {u.online ? (
                    <span style={badge("green")}>ONLINE</span>
                  ) : (
                    <span style={badge("gray")}>OFFLINE</span>
                  )}
                </td>

                <td style={td}>{u.currentPage || "—"}</td>
                <td style={td}>{formatDate(u.lastSeen)}</td>
                <td style={td}>{formatDate(u.lastLoginAt)}</td>
                <td style={td}>{u.employeeId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: 16,
        minWidth: 180,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800 }}>
        {value}
      </p>
    </div>
  );
}

const th = {
  padding: 12,
  textAlign: "left",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const td = {
  padding: 12,
  fontSize: 14,
  borderTop: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
};

function badge(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: color === "green" ? "#dcfce7" : "#f1f5f9",
    color: color === "green" ? "#166534" : "#334155",
    border: `1px solid ${color === "green" ? "#86efac" : "#cbd5e1"}`,
  };
}
