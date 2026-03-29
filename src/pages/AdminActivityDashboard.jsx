import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function tsToDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(val) {
  const d = tsToDate(val);
  if (!d) return "—";
  return d.toLocaleString();
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 18,
        border: "1px solid #e2e8f0",
        boxShadow: "0 10px 25px rgba(15,23,42,0.05)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function AdminActivityDashboard() {
  const { user } = useUser();
  const [presenceRows, setPresenceRows] = useState([]);
  const [usersRows, setUsersRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isStationManager = user?.role === "station_manager";

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const [presenceSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "user_presence")),
          getDocs(collection(db, "users")),
        ]);

        setPresenceRows(presenceSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setUsersRows(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        setError(err.message || "Error loading activity dashboard.");
      } finally {
        setLoading(false);
      }
    }

    if (isStationManager) {
      load();
    }
  }, [isStationManager]);

  const totalUsers = useMemo(() => usersRows.length, [usersRows]);
  const onlineUsers = useMemo(
    () => presenceRows.filter((u) => u.online === true).length,
    [presenceRows]
  );

  const sortedPresence = useMemo(() => {
    return [...presenceRows].sort((a, b) => {
      const aTime = tsToDate(a.lastSeen)?.getTime() || 0;
      const bTime = tsToDate(b.lastSeen)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [presenceRows]);

  if (!isStationManager) {
    return (
      <div style={{ padding: 20 }}>
        <Card>
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>
            Access denied. Only Station Manager can view this dashboard.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <div
        style={{
          background: "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 24,
          padding: 24,
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", opacity: 0.85 }}>
          TPA OPS · Admin
        </div>
        <h1 style={{ margin: "8px 0 6px", fontSize: 30 }}>User Activity Dashboard</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>
          Online users, last access, and app usage monitoring.
        </p>
      </div>

      {error && (
        <Card>
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <Card>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>TOTAL USERS</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>{totalUsers}</div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>ONLINE NOW</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>{onlineUsers}</div>
        </Card>

        <Card>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>OFFLINE / LAST SEEN</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>
            Tracking enabled
          </div>
        </Card>
      </div>

      <Card>
        <h2 style={{ marginTop: 0 }}>Users Presence</h2>

        {loading ? (
          <div>Loading...</div>
        ) : sortedPresence.length === 0 ? (
          <div>No presence data yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                  <th style={th}>Username</th>
                  <th style={th}>Role</th>
                  <th style={th}>Online</th>
                  <th style={th}>Current Page</th>
                  <th style={th}>Last Seen</th>
                  <th style={th}>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {sortedPresence.map((row) => (
                  <tr key={row.id}>
                    <td style={td}>{row.username || "—"}</td>
                    <td style={td}>{row.role || "—"}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 800,
                          background: row.online ? "#ecfdf5" : "#f8fafc",
                          color: row.online ? "#065f46" : "#475569",
                          border: row.online ? "1px solid #a7f3d0" : "1px solid #e2e8f0",
                        }}
                      >
                        {row.online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </td>
                    <td style={td}>{row.currentPage || "—"}</td>
                    <td style={td}>{formatDateTime(row.lastSeen)}</td>
                    <td style={td}>{formatDateTime(row.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const th = {
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
};

const td = {
  padding: "12px 10px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
};
