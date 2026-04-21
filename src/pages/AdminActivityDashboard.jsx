import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function pad2(n) {
  return String(n).padStart(2, "0");
}

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

function formatInputDate(value) {
  const d = toDateSafe(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function endOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
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

function endOfWeek() {
  const start = startOfWeek();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfLastWeek() {
  const start = startOfWeek();
  const last = new Date(start);
  last.setDate(start.getDate() - 7);
  last.setHours(0, 0, 0, 0);
  return last;
}

function endOfLastWeek() {
  const start = startOfLastWeek();
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfDay(dateLike) {
  const d = toDateSafe(dateLike) || new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getRangeDates(range) {
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  if (range === "last_week") return { start: startOfLastWeek(), end: endOfLastWeek() };
  if (range === "month") return { start: startOfMonth(), end: endOfMonth() };
  return { start: null, end: null };
}

function normalizeWheelchairNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLookup(value) {
  return normalizeText(value).toLowerCase();
}

function getReportAgentName(report) {
  return (
    normalizeText(report?.wchr_agent_name) ||
    normalizeText(report?.assigned_wchr_agent) ||
    normalizeText(report?.activity_agent_name) ||
    normalizeText(report?.employee_login) ||
    normalizeText(report?.employee_name) ||
    "Unknown"
  );
}

function userMatchesActivityName(user, activityName) {
  const target = normalizeLookup(activityName);
  if (!target) return false;

  const candidates = [
    user?.username,
    user?.displayName,
    user?.fullName,
    user?.name,
    user?.email,
  ]
    .map((v) => normalizeLookup(v))
    .filter(Boolean);

  return candidates.includes(target);
}

function findMatchedUser(users, activityName) {
  return users.find((u) => userMatchesActivityName(u, activityName)) || null;
}

function buildCountByLogin(reports) {
  const counts = {};
  for (const r of reports) {
    const login = getReportAgentName(r);
    counts[login] = (counts[login] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([login, count]) => ({ label: login, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildCountByAirline(reports) {
  const counts = {};
  for (const r of reports) {
    const airline = String(r.airline || "Unknown").trim().toUpperCase() || "Unknown";
    counts[airline] = (counts[airline] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([airline, count]) => ({ label: airline, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildDailyCounts(reports) {
  const counts = {};

  for (const r of reports) {
    const submitted = toDateSafe(r.submitted_at);
    if (!submitted) continue;

    const key = `${submitted.getFullYear()}-${pad2(submitted.getMonth() + 1)}-${pad2(
      submitted.getDate()
    )}`;

    if (!counts[key]) {
      counts[key] = {
        label: submitted.toLocaleDateString(undefined, {
          month: "2-digit",
          day: "2-digit",
        }),
        count: 0,
      };
    }

    counts[key].count += 1;
  }

  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
}

function buildHourlyCounts(reports) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    label: `${String(i).padStart(2, "0")}:00`,
    count: 0,
  }));

  for (const r of reports) {
    const submitted = toDateSafe(r.submitted_at);
    if (!submitted) continue;
    const hour = submitted.getHours();
    if (hours[hour]) hours[hour].count += 1;
  }

  return hours;
}

function buildProductivityTable(reports, users) {
  const byLogin = {};

  for (const r of reports || []) {
    const login = getReportAgentName(r);

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
      const matchedUser = findMatchedUser(users, row.login);
      return {
        ...row,
        role: matchedUser?.role || "",
        online: Boolean(matchedUser?.online),
      };
    })
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));
}

function buildMostUsedWheelchair(reports) {
  const counts = {};

  for (const r of reports || []) {
    const chair = normalizeWheelchairNumber(r.wheelchair_number);
    if (!chair) continue;
    counts[chair] = (counts[chair] || 0) + 1;
  }

  let topChair = "";
  let topCount = 0;

  for (const chair of Object.keys(counts)) {
    if (
      counts[chair] > topCount ||
      (counts[chair] === topCount && chair.localeCompare(topChair) < 0)
    ) {
      topChair = chair;
      topCount = counts[chair];
    }
  }

  return { chair: topChair, count: topCount };
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeRangeLabel(range) {
  if (range === "today") return "today";
  if (range === "week") return "this-week";
  if (range === "last_week") return "last-week";
  if (range === "month") return "this-month";
  return "custom";
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);
  const [presence, setPresence] = useState([]);
  const [reports, setReports] = useState([]);

  const [activeTab, setActiveTab] = useState("overview");
  const [activeWchrTab, setActiveWchrTab] = useState("summary");

  const [range, setRange] = useState("week");
  const [selectedLogin, setSelectedLogin] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Error loading users:", err)
    );

    const unsubPresence = onSnapshot(
      collection(db, "user_presence"),
      (snap) => setPresence(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Error loading presence:", err)
    );

    const unsubReports = onSnapshot(
      collection(db, "wch_reports"),
      (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("Error loading WCHR reports:", err)
    );

    return () => {
      unsubUsers();
      unsubPresence();
      unsubReports();
    };
  }, []);

  useEffect(() => {
    if (range === "custom") return;
    const { start, end } = getRangeDates(range);
    setFromDate(formatInputDate(start));
    setToDate(formatInputDate(end));
  }, [range]);

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
          displayName: user.displayName || "",
          fullName: user.fullName || "",
          name: user.name || "",
          email: user.email || "",
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
      const login = getReportAgentName(r);
      if (login) set.add(login);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const roleOptions = useMemo(() => {
    const set = new Set(mergedUsers.map((u) => u.role).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mergedUsers]);

  const activeStartDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const activeEndDate = toDate ? endOfDay(`${toDate}T00:00:00`) : null;

  const filteredUsers = useMemo(() => {
    return mergedUsers.filter((u) => {
      if (selectedRole !== "all" && u.role !== selectedRole) return false;
      if (selectedLogin !== "all" && !userMatchesActivityName(u, selectedLogin)) {
        return false;
      }
      return true;
    });
  }, [mergedUsers, selectedLogin, selectedRole]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const submitted = toDateSafe(r.submitted_at);
      if (!submitted) return false;
      if (activeStartDate && submitted < activeStartDate) return false;
      if (activeEndDate && submitted > activeEndDate) return false;

      const login = getReportAgentName(r);

      if (selectedLogin !== "all" && login !== selectedLogin) return false;

      if (selectedRole !== "all") {
        const matchedUser = findMatchedUser(mergedUsers, login);
        if (!matchedUser || matchedUser.role !== selectedRole) return false;
      }

      return true;
    });
  }, [reports, activeStartDate, activeEndDate, selectedLogin, selectedRole, mergedUsers]);

  const totalUsers = filteredUsers.length;
  const onlineUsers = filteredUsers.filter((u) => u.online).length;
  const activeUsers = filteredUsers.filter((u) => u.lastSeen).length;
  const totalWchr = filteredReports.length;

  const topWchrLogins = useMemo(
    () => buildCountByLogin(filteredReports).slice(0, 10),
    [filteredReports]
  );

  const topAirlines = useMemo(
    () => buildCountByAirline(filteredReports).slice(0, 10),
    [filteredReports]
  );

  const dailyWchr = useMemo(() => buildDailyCounts(filteredReports), [filteredReports]);
  const hourlyWchr = useMemo(() => buildHourlyCounts(filteredReports), [filteredReports]);

  const mostUsedWheelchairToday = useMemo(() => {
    const start = startOfToday();
    const end = endOfToday();
    return buildMostUsedWheelchair(
      reports.filter((r) => {
        const submitted = toDateSafe(r.submitted_at);
        return submitted && submitted >= start && submitted <= end;
      })
    );
  }, [reports]);

  const mostUsedWheelchairWeek = useMemo(() => {
    const start = startOfWeek();
    const end = endOfWeek();
    return buildMostUsedWheelchair(
      reports.filter((r) => {
        const submitted = toDateSafe(r.submitted_at);
        return submitted && submitted >= start && submitted <= end;
      })
    );
  }, [reports]);

  const mostUsedWheelchairMonth = useMemo(() => {
    const start = startOfMonth();
    const end = endOfMonth();
    return buildMostUsedWheelchair(
      reports.filter((r) => {
        const submitted = toDateSafe(r.submitted_at);
        return submitted && submitted >= start && submitted <= end;
      })
    );
  }, [reports]);

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

  const recentWchrReports = useMemo(() => {
    return [...filteredReports]
      .sort((a, b) => {
        const A = toDateSafe(a.submitted_at)?.getTime() || 0;
        const B = toDateSafe(b.submitted_at)?.getTime() || 0;
        return B - A;
      })
      .slice(0, 25);
  }, [filteredReports]);

  const handleExportCsv = () => {
    const rows = [
      ["ADMIN ACTIVITY DASHBOARD"],
      ["Range", safeRangeLabel(range)],
      ["From", fromDate || "—"],
      ["To", toDate || "—"],
      ["Agent/Login Filter", selectedLogin],
      ["Role Filter", selectedRole],
      [],
      ["SUMMARY"],
      ["Filtered Users", totalUsers],
      ["Online Now", onlineUsers],
      ["Users With Activity", activeUsers],
      ["WCHR Reports", totalWchr],
      [],
      ["TOP WCHR LOGINS / AGENTS"],
      ["Agent / Login", "Count"],
      ...topWchrLogins.map((r) => [r.label, r.count]),
      [],
      ["TOP AIRLINES"],
      ["Airline", "Count"],
      ...topAirlines.map((r) => [r.label, r.count]),
      [],
      ["RECENT WCHR REPORTS"],
      [
        "Submitted At",
        "WCHR Agent",
        "Employee Login",
        "Employee Name",
        "Passenger",
        "Airline",
        "Flight",
        "WCHR Type",
        "Wheelchair Number",
        "Status",
      ],
      ...recentWchrReports.map((r) => [
        formatDate(r.submitted_at),
        getReportAgentName(r),
        r.employee_login || "",
        r.employee_name || "",
        r.passenger_name || "",
        r.airline || "",
        r.flight_number || "",
        r.wch_type || "",
        r.wheelchair_number || "",
        r.status || "",
      ]),
    ];

    downloadCSV(`admin-activity-dashboard-${safeRangeLabel(range)}.csv`, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="admin-activity-dashboard"
      style={{
        maxWidth: 1380,
        margin: "0 auto",
        display: "grid",
        gap: 16,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
            User Activity Dashboard
          </h1>
          <p style={{ marginTop: 6, color: "#64748b", fontSize: 14 }}>
            Monitor user access, presence, scan hours, airlines and WCHR productivity.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleExportCsv} style={actionBtnStyle}>
            Export CSV
          </button>
          <button onClick={handlePrint} style={actionBtnStyle}>
            Print / Save PDF
          </button>
        </div>
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
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              style={selectStyle}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Dates</option>
            </select>
          </FilterField>

          <FilterField label="From">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setRange("custom");
                setFromDate(e.target.value);
              }}
              style={selectStyle}
            />
          </FilterField>

          <FilterField label="To">
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setRange("custom");
                setToDate(e.target.value);
              }}
              style={selectStyle}
            />
          </FilterField>

          <FilterField label="Agent / Login">
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={activeTab === "wchr"} onClick={() => setActiveTab("wchr")}>
          WCHR Activity
        </TabButton>
        <TabButton
          active={activeTab === "user_activity"}
          onClick={() => setActiveTab("user_activity")}
        >
          User Activity
        </TabButton>
        <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")}>
          Users
        </TabButton>
      </div>

      {activeTab === "overview" && (
        <>
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
            <Panel title="Top WCHR Logins / Agents">
              <BarChartList rows={topWchrLogins} emptyText="No WCHR activity for this filter." />
            </Panel>

            <Panel title="Top Airlines">
              <BarChartList rows={topAirlines} emptyText="No airline data for this filter." />
            </Panel>
          </div>

          <Panel title="Most Used WCHR in Station">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <StatCard
                label="Today"
                value={
                  mostUsedWheelchairToday.chair
                    ? `${mostUsedWheelchairToday.chair} (${mostUsedWheelchairToday.count})`
                    : "—"
                }
              />
              <StatCard
                label="This Week"
                value={
                  mostUsedWheelchairWeek.chair
                    ? `${mostUsedWheelchairWeek.chair} (${mostUsedWheelchairWeek.count})`
                    : "—"
                }
              />
              <StatCard
                label="This Month"
                value={
                  mostUsedWheelchairMonth.chair
                    ? `${mostUsedWheelchairMonth.chair} (${mostUsedWheelchairMonth.count})`
                    : "—"
                }
              />
            </div>
          </Panel>
        </>
      )}

      {activeTab === "wchr" && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SubTabButton
              active={activeWchrTab === "summary"}
              onClick={() => setActiveWchrTab("summary")}
            >
              Summary
            </SubTabButton>
            <SubTabButton
              active={activeWchrTab === "productivity"}
              onClick={() => setActiveWchrTab("productivity")}
            >
              Productivity
            </SubTabButton>
            <SubTabButton
              active={activeWchrTab === "recent_reports"}
              onClick={() => setActiveWchrTab("recent_reports")}
            >
              Recent Reports
            </SubTabButton>
          </div>

          {activeWchrTab === "summary" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <Panel title="WCHR by Day">
                  <VerticalBars rows={dailyWchr} />
                </Panel>

                <Panel title="WCHR by Hour">
                  <VerticalBars rows={hourlyWchr} compact />
                </Panel>
              </div>

              <Panel title="Top WCHR Logins / Agents">
                <BarChartList rows={topWchrLogins} emptyText="No WCHR activity for this filter." />
              </Panel>
            </>
          )}

          {activeWchrTab === "productivity" && (
            <Panel title="WCHR Productivity by Agent / Login">
              {productivityRows.length === 0 ? (
                <InfoBox text="No productivity data for this filter." />
              ) : (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead style={{ background: "#f8fbff" }}>
                      <tr>
                        <th style={th}>Agent / Login</th>
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
                          style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}
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
          )}

          {activeWchrTab === "recent_reports" && (
            <Panel title="Recent WCHR Reports">
              {recentWchrReports.length === 0 ? (
                <InfoBox text="No WCHR reports for this filter." />
              ) : (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead style={{ background: "#f8fbff" }}>
                      <tr>
                        <th style={th}>Submitted At</th>
                        <th style={th}>WCHR Agent</th>
                        <th style={th}>Passenger</th>
                        <th style={th}>Airline</th>
                        <th style={th}>Flight</th>
                        <th style={th}>Type</th>
                        <th style={th}>Wheelchair</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentWchrReports.map((r, i) => (
                        <tr
                          key={r.id}
                          style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}
                        >
                          <td style={td}>{formatDate(r.submitted_at)}</td>
                          <td style={td}>
                            <div style={{ fontWeight: 700 }}>{getReportAgentName(r)}</div>
                            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                              {r.employee_login || r.employee_name || "—"}
                            </div>
                          </td>
                          <td style={td}>{r.passenger_name || "—"}</td>
                          <td style={td}>{r.airline || "—"}</td>
                          <td style={td}>{r.flight_number || "—"}</td>
                          <td style={td}>{r.wch_type || "—"}</td>
                          <td style={td}>{r.wheelchair_number || "—"}</td>
                          <td style={td}>{r.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}

      {activeTab === "user_activity" && (
        <Panel title="Recent User Activity">
          {recentUsers.length === 0 ? (
            <InfoBox text="No recent activity for this filter." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
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
      )}

      {activeTab === "users" && (
        <Panel title="All Registered Users">
          {mergedUsers.length === 0 ? (
            <InfoBox text="No registered users found." />
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
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
                  {mergedUsers.map((u, i) => (
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
      )}
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

function TabButton({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? "1px solid #1769aa" : "1px solid #cfe7fb",
        background: active ? "#1769aa" : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SubTabButton({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? "1px solid #0f4c81" : "1px solid #dbeafe",
        background: active ? "#edf7ff" : "#ffffff",
        color: active ? "#0f4c81" : "#475569",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function BarChartList({ rows, emptyText }) {
  if (!rows.length) return <InfoBox text={emptyText} />;

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
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
            <span>{row.label}</span>
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

function VerticalBars({ rows, compact = false }) {
  if (!rows.length) return <InfoBox text="No data available." />;

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        gap: compact ? 6 : 8,
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
              maxWidth: compact ? 22 : 34,
              height: `${Math.max((row.count / max) * 150, row.count > 0 ? 10 : 2)}px`,
              borderRadius: 10,
              background: "linear-gradient(180deg, #5aa9e6 0%, #1769aa 100%)",
            }}
          />

          <div
            style={{
              fontSize: compact ? 9 : 11,
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

const actionBtnStyle = {
  border: "1px solid #cfe7fb",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const tableWrapStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fff",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
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
