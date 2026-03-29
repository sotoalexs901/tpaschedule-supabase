import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "user_presence"),
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setUsers(data);
      },
      (err) => console.error(err)
    );

    return () => unsub();
  }, []);

  const onlineUsers = users.filter((u) => u.online);
  const totalUsers = users.length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>
        User Activity Dashboard
      </h1>

      {/* SUMMARY */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="Online Now" value={onlineUsers.length} />
      </div>

      {/* TABLE */}
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          overflow: "hidden",
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
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#f9fbff",
                }}
              >
                <td style={td}>{u.username}</td>
                <td style={td}>{u.role}</td>
                <td style={td}>
                  {u.online ? (
                    <span style={badge("green")}>ONLINE</span>
                  ) : (
                    <span style={badge("gray")}>OFFLINE</span>
                  )}
                </td>
                <td style={td}>{u.currentPage || "—"}</td>
                <td style={td}>{formatDate(u.lastSeen)}</td>
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
        minWidth: 150,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{label}</p>
      <p style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800 }}>
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
};

const td = {
  padding: 12,
  fontSize: 14,
  borderTop: "1px solid #eef2f7",
};

function badge(color) {
  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: color === "green" ? "#dcfce7" : "#f1f5f9",
    color: color === "green" ? "#166534" : "#334155",
  };
}
