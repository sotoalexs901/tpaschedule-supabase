import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
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

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 sun
  const diff = day === 0 ? 6 : day - 1; // monday start
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildWchrCounts(reports, startDate) {
  const counts = {};

  for (const r of reports || []) {
    const submitted = toDateSafe(r.submitted_at);
    if (!submitted) continue;
    if (submitted < startDate) continue;

    const login = String(r.employee_login || r.employee_name || "Unknown").trim() || "Unknown";
    counts[login] = (counts[login] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);
  const [presence, setPresence] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error loading users:", err)
    );

    const unsubPresence = onSnapshot(
      collection(db, "user_presence"),
      (snap) => {
        setPresence(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error loading presence:", err)
    );

    const unsubReports = onSnapshot(
      collection(db, "wch_reports"),
      (snap) => {
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error loading WCHR reports:", err)
    );

    return () => {
      unsubUsers();
      unsubPresence();
      unsubReports();
    };
  }, []);

  const mergedUsers = useMemo(() => {
    const presenceMap = new Map(
      presence.map((item) => [String(item.userId || item.id), item])
    );

    return users
      .map((user) => {
        const p = presenceMap.get(String(user.id)) || null;

        return {
          id: user.id,
          username: user.username || "—",
          role: user.role || "—",
          online: Boolean(p?.online),
          currentPage: p?.currentPage || "—",
          lastSeen: p?.lastSeen || null,
          lastLoginAt: p?.lastLoginAt || null,
          employeeId: user.employeeId || "",
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [users, presence]);

  const totalUsers = mergedUsers.length;
  const onlineUsers = mergedUsers.filter((u) => u.online).length;
  const activeUsers = mergedUsers.filter((u) => u.lastSeen).length;

  const todayTopWchr = useMemo(
    () => buildWchrCounts(reports, startOfToday()).slice(0, 8),
    [reports]
  );

  const weekTopWchr = useMemo(
    () => buildWchrCounts(reports, startOfWeek()).slice(0, 8),
    [reports]
  );

  const recentUsers = useMemo(() => {
    return [...mergedUsers]
      .filter((u) => u.lastSeen)
      .sort((a, b) => {
        const A = toDateSafe(a.lastSeen)?.getTime() || 0;
        const B = toDateSafe(b.lastSeen)?.getTime() || 0;
        return B - A;
      })
      .slice(0, 12);
  }, [mergedUsers]);

  return (
    <div
      style={{
        maxWidth: 1320,
        margin: "0 auto",
        display: "grid",
        gap: 16,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
          User Activity Dashboard
        </h1>
        <p style={{ marginTop: 6, color: "#64748b", fontSize: 14 }}>
          Registered users, live presence, last access, and WCHR productivity trends.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard label="Total Registered Users" value={totalUsers} />
        <StatCard label="Online Now" value={onlineUsers} />
        <StatCard label="Users With Activity" value={activeUsers} />
        <StatCard label="WCHR Today" value={buildWchrCounts(reports, startOfToday()).reduce((a, b) => a + b.count, 0)} />
        <StatCard label="WCHR This Week" value={buildWchrCounts(reports, startOfWeek()).reduce((a, b) => a + b.count, 0)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <Panel title="Top WCHR Logins Today">
          <BarChartList rows={todayTopWchr} emptyText="No WCHR scans today." />
        </Panel>

        <Panel title="Top WCHR Logins This Week">
          <BarChartList rows={weekTopWchr} emptyText="No WCHR scans this week." />
        </Panel>
      </div>

      <Panel title="Recent User Activity">
        {recentUsers.length === 0 ? (
          <InfoBox text="No user activity tracked yet." />
        ) : (
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
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f9fbff",
                    }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{u.username}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {u.employeeId || "No linked employee"}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="All Registered Users">
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
                  <td style={td}>{u.username}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 18,
        padding: 16,
        boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: 18,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {title}
      </h2>
      {children}
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
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#64748b",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 24,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function BarChartList({ rows, emptyText }) {
  if (!rows.length) {
    return <InfoBox text={emptyText} />;
  }

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.login}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 700,
              color: "#334155",
            }}
          >
            <span>{row.login}</span>
            <span>{row.count}</span>
          </div>

          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.count / max) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoBox({ text }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        color: "#64748b",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {text}
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
