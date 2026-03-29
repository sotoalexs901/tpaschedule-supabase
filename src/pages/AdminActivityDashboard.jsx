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
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function getRangeStart(range) {
  if (range === "today") return startOfToday();
  if (range === "week") return startOfWeek();
  if (range === "month") return startOfMonth();
  return null;
}

function buildCountByLogin(reports) {
  const counts = {};

  for (const r of reports) {
    const login = String(
      r.employee_login || r.employee_name || "Unknown"
    ).trim() || "Unknown";

    counts[login] = (counts[login] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
}

function buildDailyCounts(reports, daysBack = 7) {
  const now = new Date();
  const points = [];

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);

    points.push({
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: d.toLocaleDateString(undefined, {
        month: "2-digit",
        day: "2-digit",
      }),
      count: 0,
    });
  }

  const map = new Map(points.map((p) => [p.key, p]));

  for (const r of reports) {
    const submitted = toDateSafe(r.submitted_at);
    if (!submitted) continue;

    const key = `${submitted.getFullYear()}-${submitted.getMonth()}-${submitted.getDate()}`;
    const found = map.get(key);
    if (found) found.count += 1;
  }

  return points;
}

function countReportsSince(reports, startDate) {
  if (!startDate) return reports.length;

  return reports.filter((r) => {
    const submitted = toDateSafe(r.submitted_at);
    return submitted && submitted >= startDate;
  }).length;
}

function buildProductivityTable(reports, users) {
  const byLogin = {};

  for (const r of reports || []) {
    const login = String(
      r.employee_login || r.employee_name || "Unknown"
    ).trim() || "Unknown";

    if (!byLogin[login]) {
      byLogin[login] = {
        login,
        today: 0,
        week: 0,
        month: 0,
        total: 0,
      };
    }

    const submitted = toDateSafe(r.submitted_at);
    if (!submitted) continue;

    byLogin[login].total += 1;

    if (submitted >= startOfToday()) byLogin[login].today += 1;
    if (submitted >= startOfWeek()) byLogin[login].week += 1;
    if (submitted >= startOfMonth()) byLogin[login].month += 1;
  }

  return Object.values(byLogin)
    .map((row) => {
      const matchedUser = users.find((u) => u.username === row.login);
      return {
        ...row,
        role: matchedUser?.role || "",
        online: Boolean(matchedUser?.online),
      };
    })
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);
  const [presence, setPresence] = useState([]);
  const [reports, setReports] = useState([]);

  const [range, setRange] = useState("week");
  const [selectedLogin, setSelectedLogin] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");

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

  const loginOptions = useMemo(() => {
    const set = new Set();

    reports.forEach((r) => {
      const login = String(
        r.employee_login || r.employee_name || "Unknown"
      ).trim();
      if (login) set.add(login);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const roleOptions = useMemo(() => {
    const set = new Set(
      mergedUsers
        .map((u) => u.role)
        .filter(Boolean)
    );

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mergedUsers]);

  const filteredUsers = useMemo(() => {
    return mergedUsers.filter((u) => {
      if (selectedRole !== "all" && u.role !== selectedRole) return false;
      if (selectedLogin !== "all" && u.username !== selectedLogin) return false;
      return true;
    });
  }, [mergedUsers, selectedLogin, selectedRole]);

  const filteredReports = useMemo(() => {
    const rangeStart = getRangeStart(range);

    return reports.filter((r) => {
      const submitted = toDateSafe(r.submitted_at);
      if (!submitted) return false;
      if (rangeStart && submitted < rangeStart) return false;

      const login = String(
        r.employee_login || r.employee_name || "Unknown"
      ).trim();

      if (selectedLogin !== "all" && login !== selectedLogin) return false;

      if (selectedRole !== "all") {
        const matchedUser = mergedUsers.find((u) => u.username === login);
        if (!matchedUser || matchedUser.role !== selectedRole) return false;
      }

      return true;
    });
  }, [reports, range, selectedLogin, selectedRole, mergedUsers]);

  const totalUsers = filteredUsers.length;
  const onlineUsers = filteredUsers.filter((u) => u.online).length;
  const activeUsers = filteredUsers.filter((u) => u.lastSeen).length;
  const totalWchr = filteredReports.length;

  const topWchrLogins = useMemo(
    () => buildCountByLogin(filteredReports).slice(0, 10),
    [filteredReports]
  );

  const dailyWchr = useMemo(() => {
    if (range === "today") return buildDailyCounts(filteredReports, 1);
    if (range === "week") return buildDailyCounts(filteredReports, 7);
    if (range === "month") return buildDailyCounts(filteredReports, 30);
    return buildDailyCounts(filteredReports, 14);
  }, [filteredReports, range]);

  const recentUsers = useMemo(() => {
    return [...filteredUsers]
      .filter((u) => u.lastSeen)
      .sort((a, b) => {
        const A = toDateSafe(a.lastSeen)?.getTime() || 0;
        const B = toDateSafe(b.lastSeen)?.getTime() || 0;
        return B - A;
      })
      .slice(0, 15);
  }, [filteredUsers]);

  const productivityRows = useMemo(() => {
    return buildProductivityTable(filteredReports, mergedUsers).filter((row) => {
      if (selectedRole !== "all" && row.role !== selectedRole) return false;
      if (selectedLogin !== "all" && row.login !== selectedLogin) return false;
      return true;
    });
  }, [filteredReports, mergedUsers, selectedRole, selectedLogin]);

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
          Monitor user access, presence and WCHR productivity with filters.
        </p>
      </div>

      <Panel title="Filters">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <FilterField label="Range">
            <select value={range} onChange={(e) => setRange(e.target.value)} style={selectStyle}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All</option>
            </select>
          </FilterField>

          <FilterField label="Login">
            <select
              value={selectedLogin}
              onChange={(e) => setSelectedLogin(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All</option>
              {loginOptions.map((login) => (
                <option key={login} value={login}>
                  {login}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Role">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {normalizeRole(role)}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </Panel>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard label="Filtered Users" value={totalUsers} />
        <StatCard label="Online Now" value={onlineUsers} />
        <StatCard label="Users With Activity" value={activeUsers} />
        <StatCard label="WCHR Reports" value={totalWchr} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        <Panel title="Top WCHR Logins">
          <BarChartList rows={topWchrLogins} emptyText="No WCHR activity for this filter." />
        </Panel>

        <Panel title="WCHR by Day">
          <VerticalBars rows={dailyWchr} />
        </Panel>
      </div>

      <Panel title="Recent User Activity">
        {recentUsers.length === 0 ? (
          <InfoBox text="No recent activity for this filter." />
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
                    style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}
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

      <Panel title="WCHR Productivity by Login">
        {productivityRows.length === 0 ? (
          <InfoBox text="No productivity data for this filter." />
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
                  <th style={th}>Login</th>
                  <th style={th}>Role</th>
                  <th style={th}>Status</th>
                  <th style={th}>Today</th>
                  <th style={th}>This Week</th>
                  <th style={th}>This Month</th>
                  <th style={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {productivityRows.map((row, i) => (
                  <tr
                    key={row.login}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f9fbff",
                    }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{row.login}</div>
                    </td>
                    <td style={td}>{normalizeRole(row.role)}</td>
                    <td style={td}>
                      {row.online ? (
                        <span style={badge("green")}>ONLINE</span>
                      ) : (
                        <span style={badge("gray")}>OFFLINE</span>
                      )}
                    </td>
                    <td style={td}>{row.today}</td>
                    <td style={td}>{row.week}</td>
                    <td style={td}>{row.month}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

function FilterField({ label, children }) {
  return (
    <div>
      <div
        style={{
          marginBottom: 6,
          fontSize: 12,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      {children}
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

function VerticalBars({ rows }) {
  if (!rows.length) {
    return <InfoBox text="No data available." />;
  }

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        gap: 8,
        alignItems: "end",
        minHeight: 220,
      }}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "end",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#334155",
            }}
          >
            {row.count}
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 34,
              height: `${Math.max((row.count / max) * 150, row.count > 0 ? 10 : 2)}px`,
              borderRadius: 10,
              background: "linear-gradient(180deg, #5aa9e6 0%, #1769aa 100%)",
            }}
          />

          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {row.label}
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

const selectStyle = {
  width: "100%",
  border: "1px solid #dbeafe",
  background: "#ffffff",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
};

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
