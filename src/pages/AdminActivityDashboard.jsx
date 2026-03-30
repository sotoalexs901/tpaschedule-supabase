// src/pages/AdminActivityDashboard.jsx
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

function toStatsDateSafe(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T00:00:00`);
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

function normalizeLoginKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[./#[\]$]/g, "_");
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

function endOfDay(dateLike) {
  const d = toDateSafe(dateLike) || new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getPresetRange(range) {
  if (range === "today") {
    return { start: startOfToday(), end: new Date() };
  }
  if (range === "week") {
    return { start: startOfWeek(), end: new Date() };
  }
  if (range === "month") {
    return { start: startOfMonth(), end: new Date() };
  }
  return { start: null, end: null };
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
    .map(([login, count]) => ({ label: login, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildCountByAirline(reports) {
  const counts = {};

  for (const r of reports) {
    const airline =
      String(r.airline || "Unknown").trim().toUpperCase() || "Unknown";
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

function buildTopWheelchairUsage(reports) {
  const map = {};

  for (const r of reports) {
    const airline =
      String(r.airline || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const chair = String(r.wheelchair_number || "").trim().toUpperCase();

    if (!chair) continue;

    if (!map[airline]) map[airline] = {};
    map[airline][chair] = (map[airline][chair] || 0) + 1;
  }

  const result = [];

  for (const airline of Object.keys(map)) {
    const chairs = map[airline];
    let topChair = "";
    let max = 0;

    for (const chair of Object.keys(chairs)) {
      if (chairs[chair] > max) {
        max = chairs[chair];
        topChair = chair;
      }
    }

    if (topChair) {
      result.push({
        airline,
        chair: topChair,
        count: max,
      });
    }
  }

  return result.sort(
    (a, b) => b.count - a.count || a.airline.localeCompare(b.airline)
  );
}

function aggregateStatsObject(stats, fieldName) {
  const totals = {};

  for (const item of stats) {
    const source = item[fieldName] || {};
    Object.entries(source).forEach(([key, value]) => {
      totals[key] = (totals[key] || 0) + Number(value || 0);
    });
  }

  return totals;
}

function buildStatsCountRows(stats, fieldName, labelMap = {}) {
  const totals = aggregateStatsObject(stats, fieldName);

  return Object.entries(totals)
    .map(([key, count]) => ({
      label: labelMap[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildStatsDailyCounts(stats) {
  return [...stats]
    .sort((a, b) =>
      String(a.date || a.id || "").localeCompare(String(b.date || b.id || ""))
    )
    .map((item) => {
      const d = toStatsDateSafe(item.date || item.id);
      return {
        label:
          d?.toLocaleDateString(undefined, {
            month: "2-digit",
            day: "2-digit",
          }) || item.date || item.id,
        count: Number(item.total_reports || 0),
      };
    });
}

function buildStatsHourlyCounts(stats) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    label: `${String(i).padStart(2, "0")}:00`,
    count: 0,
  }));

  for (const item of stats) {
    const source = item.by_hour || {};
    for (const [hourKey, count] of Object.entries(source)) {
      const idx = Number(hourKey);
      if (!Number.isNaN(idx) && hours[idx]) {
        hours[idx].count += Number(count || 0);
      }
    }
  }

  return hours;
}

function buildStatsWheelchairUsage(stats) {
  const merged = {};

  for (const item of stats) {
    const byAirline = item.wheelchair_by_airline || {};
    Object.entries(byAirline).forEach(([airline, chairs]) => {
      if (!merged[airline]) merged[airline] = {};
      Object.entries(chairs || {}).forEach(([chair, count]) => {
        merged[airline][chair] =
          (merged[airline][chair] || 0) + Number(count || 0);
      });
    });
  }

  const result = [];

  Object.entries(merged).forEach(([airline, chairs]) => {
    let topChair = "";
    let max = 0;

    Object.entries(chairs).forEach(([chair, count]) => {
      if (Number(count || 0) > max) {
        max = Number(count || 0);
        topChair = chair;
      }
    });

    if (topChair) {
      result.push({
        airline,
        chair: topChair,
        count: max,
      });
    }
  });

  return result.sort(
    (a, b) => b.count - a.count || a.airline.localeCompare(b.airline)
  );
}

function buildStatsProductivityTable(stats, mergedUsers) {
  const totals = aggregateStatsObject(stats, "by_employee");

  return Object.entries(totals)
    .map(([loginKey, total]) => {
      const matchedUser =
        mergedUsers.find(
          (u) => normalizeLoginKey(u.username) === normalizeLoginKey(loginKey)
        ) || null;

      return {
        login: matchedUser?.username || loginKey,
        role: matchedUser?.role || "",
        online: Boolean(matchedUser?.online),
        today: 0,
        week: 0,
        month: 0,
        total: Number(total || 0),
      };
    })
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));
}

function buildStatsPeriodProductivity(stats, mergedUsers, period) {
  const start =
    period === "today"
      ? startOfToday()
      : period === "week"
      ? startOfWeek()
      : startOfMonth();

  const filtered = stats.filter((item) => {
    const d = toStatsDateSafe(item.date || item.id);
    return d && d >= start;
  });

  const totals = aggregateStatsObject(filtered, "by_employee");
  const result = {};

  Object.entries(totals).forEach(([loginKey, count]) => {
    const matchedUser =
      mergedUsers.find(
        (u) => normalizeLoginKey(u.username) === normalizeLoginKey(loginKey)
      ) || null;

    const label = matchedUser?.username || loginKey;
    result[label] = Number(count || 0);
  });

  return result;
}

function downloadCSV(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",")
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
  if (range === "month") return "this-month";
  return "custom";
}

export default function AdminActivityDashboard() {
  const [users, setUsers] = useState([]);
  const [presence, setPresence] = useState([]);
  const [reports, setReports] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);

  const [range, setRange] = useState("week");
  const [selectedLogin, setSelectedLogin] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

    const unsubDailyStats = onSnapshot(
      collection(db, "wch_stats_daily"),
      (snap) => {
        setDailyStats(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Error loading daily WCHR stats:", err)
    );

    return () => {
      unsubUsers();
      unsubPresence();
      unsubReports();
      unsubDailyStats();
    };
  }, []);

  useEffect(() => {
    if (range === "custom") return;
    const preset = getPresetRange(range);
    setFromDate(formatInputDate(preset.start));
    setToDate(formatInputDate(preset.end));
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

  const roleOptions = useMemo(() => {
    const set = new Set(mergedUsers.map((u) => u.role).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mergedUsers]);

  const statsAvailable = useMemo(() => {
    if (!dailyStats.length) return false;

    return dailyStats.some((item) => {
      const totalReports = Number(item.total_reports || 0);
      const byEmployeeCount = Object.keys(item.by_employee || {}).length;
      const byAirlineCount = Object.keys(item.by_airline || {}).length;
      const wheelchairAirlineCount = Object.keys(
        item.wheelchair_by_airline || {}
      ).length;

      return (
        totalReports > 0 ||
        byEmployeeCount > 0 ||
        byAirlineCount > 0 ||
        wheelchairAirlineCount > 0
      );
    });
  }, [dailyStats]);

  const loginLabelMap = useMemo(() => {
    const map = {};

    mergedUsers.forEach((u) => {
      map[normalizeLoginKey(u.username)] = u.username;
    });

    reports.forEach((r) => {
      const login = String(
        r.employee_login || r.employee_name || "Unknown"
      ).trim();
      if (login) {
        map[normalizeLoginKey(login)] = login;
      }
    });

    return map;
  }, [mergedUsers, reports]);

  const loginOptions = useMemo(() => {
    const set = new Set();

    mergedUsers.forEach((u) => {
      if (u.username) set.add(u.username);
    });

    reports.forEach((r) => {
      const login = String(
        r.employee_login || r.employee_name || "Unknown"
      ).trim();
      if (login) set.add(login);
    });

    dailyStats.forEach((item) => {
      Object.keys(item.by_employee || {}).forEach((key) => {
        set.add(loginLabelMap[key] || key);
      });
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [mergedUsers, reports, dailyStats, loginLabelMap]);

  const activeStartDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const activeEndDate = toDate ? endOfDay(`${toDate}T00:00:00`) : null;

  const filteredUsers = useMemo(() => {
    return mergedUsers.filter((u) => {
      if (selectedRole !== "all" && u.role !== selectedRole) return false;
      if (selectedLogin !== "all" && u.username !== selectedLogin) return false;
      return true;
    });
  }, [mergedUsers, selectedLogin, selectedRole]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const submitted = toDateSafe(r.submitted_at);
      if (!submitted) return false;
      if (activeStartDate && submitted < activeStartDate) return false;
      if (activeEndDate && submitted > activeEndDate) return false;

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
  }, [
    reports,
    activeStartDate,
    activeEndDate,
    selectedLogin,
    selectedRole,
    mergedUsers,
  ]);

  const filteredStats = useMemo(() => {
    return dailyStats.filter((item) => {
      const d = toStatsDateSafe(item.date || item.id);
      if (!d) return false;
      if (activeStartDate && d < activeStartDate) return false;
      if (activeEndDate && d > activeEndDate) return false;
      return true;
    });
  }, [dailyStats, activeStartDate, activeEndDate]);

  const roleLoginSet = useMemo(() => {
    const set = new Set();
    if (selectedRole === "all") return set;

    mergedUsers.forEach((u) => {
      if (u.role === selectedRole) {
        set.add(normalizeLoginKey(u.username));
      }
    });

    return set;
  }, [mergedUsers, selectedRole]);

  const filteredStatsForView = useMemo(() => {
    return filteredStats
      .map((item) => {
        const byEmployee = {};
        Object.entries(item.by_employee || {}).forEach(([loginKey, count]) => {
          if (
            selectedLogin !== "all" &&
            normalizeLoginKey(selectedLogin) !== normalizeLoginKey(loginKey)
          ) {
            return;
          }

          if (
            selectedRole !== "all" &&
            !roleLoginSet.has(normalizeLoginKey(loginKey))
          ) {
            return;
          }

          byEmployee[loginKey] = Number(count || 0);
        });

        const totalReports =
          selectedLogin === "all" && selectedRole === "all"
            ? Number(item.total_reports || 0)
            : Object.values(byEmployee).reduce(
                (sum, n) => sum + Number(n || 0),
                0
              );

        if (totalReports <= 0) return null;

        return {
          ...item,
          total_reports: totalReports,
          by_employee: byEmployee,
        };
      })
      .filter(Boolean);
  }, [filteredStats, selectedLogin, selectedRole, roleLoginSet]);

  const hasRenderableStats = statsAvailable && filteredStatsForView.length > 0;

  const totalUsers = filteredUsers.length;
  const onlineUsers = filteredUsers.filter((u) => u.online).length;
  const activeUsers = filteredUsers.filter((u) => u.lastSeen).length;
  const totalWchr = hasRenderableStats
    ? filteredStatsForView.reduce(
        (sum, item) => sum + Number(item.total_reports || 0),
        0
      )
    : filteredReports.length;

  const topWchrLogins = useMemo(() => {
    if (hasRenderableStats) {
      return buildStatsCountRows(
        filteredStatsForView,
        "by_employee",
        loginLabelMap
      ).slice(0, 10);
    }
    return buildCountByLogin(filteredReports).slice(0, 10);
  }, [hasRenderableStats, filteredStatsForView, loginLabelMap, filteredReports]);

  const topAirlines = useMemo(() => {
    if (hasRenderableStats) {
      return buildStatsCountRows(filteredStatsForView, "by_airline").slice(0, 10);
    }
    return buildCountByAirline(filteredReports).slice(0, 10);
  }, [hasRenderableStats, filteredStatsForView, filteredReports]);

  const dailyWchr = useMemo(() => {
    if (hasRenderableStats) return buildStatsDailyCounts(filteredStatsForView);
    return buildDailyCounts(filteredReports);
  }, [hasRenderableStats, filteredStatsForView, filteredReports]);

  const hourlyWchr = useMemo(() => {
    if (hasRenderableStats) return buildStatsHourlyCounts(filteredStatsForView);
    return buildHourlyCounts(filteredReports);
  }, [hasRenderableStats, filteredStatsForView, filteredReports]);

  const wheelchairUsage = useMemo(() => {
    if (hasRenderableStats) {
      return buildStatsWheelchairUsage(filteredStatsForView).slice(0, 10);
    }
    return buildTopWheelchairUsage(filteredReports).slice(0, 10);
  }, [hasRenderableStats, filteredStatsForView, filteredReports]);

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
    if (hasRenderableStats) {
      const base = buildStatsProductivityTable(filteredStatsForView, mergedUsers);
      const todayMap = buildStatsPeriodProductivity(dailyStats, mergedUsers, "today");
      const weekMap = buildStatsPeriodProductivity(dailyStats, mergedUsers, "week");
      const monthMap = buildStatsPeriodProductivity(dailyStats, mergedUsers, "month");

      return base
        .map((row) => ({
          ...row,
          today: todayMap[row.login] || 0,
          week: weekMap[row.login] || 0,
          month: monthMap[row.login] || 0,
        }))
        .filter((row) => {
          if (selectedRole !== "all" && row.role !== selectedRole) return false;
          if (selectedLogin !== "all" && row.login !== selectedLogin) return false;
          return true;
        });
    }

    return buildProductivityTable(filteredReports, mergedUsers).filter((row) => {
      if (selectedRole !== "all" && row.role !== selectedRole) return false;
      if (selectedLogin !== "all" && row.login !== selectedLogin) return false;
      return true;
    });
  }, [
    hasRenderableStats,
    filteredStatsForView,
    dailyStats,
    mergedUsers,
    selectedRole,
    selectedLogin,
    filteredReports,
  ]);

  const handleExportCsv = () => {
    const rows = [
      ["ADMIN ACTIVITY DASHBOARD"],
      ["Range", safeRangeLabel(range)],
      ["From", fromDate || "—"],
      ["To", toDate || "—"],
      ["Login Filter", selectedLogin],
      ["Role Filter", selectedRole],
      ["Stats Source", hasRenderableStats ? "wch_stats_daily" : "wch_reports"],
      [],
      ["SUMMARY"],
      ["Filtered Users", totalUsers],
      ["Online Now", onlineUsers],
      ["Users With Activity", activeUsers],
      ["WCHR Reports", totalWchr],
      [],
      ["TOP WCHR LOGINS"],
      ["Login", "Count"],
      ...topWchrLogins.map((r) => [r.label, r.count]),
      [],
      ["TOP AIRLINES"],
      ["Airline", "Count"],
      ...topAirlines.map((r) => [r.label, r.count]),
      [],
      ["MOST USED WCHR"],
      ["Airline", "WCHR Number", "Count"],
      ...wheelchairUsage.map((r) => [r.airline, r.chair, r.count]),
      [],
      ["WCHR BY DAY"],
      ["Day", "Count"],
      ...dailyWchr.map((r) => [r.label, r.count]),
      [],
      ["WCHR BY HOUR"],
      ["Hour", "Count"],
      ...hourlyWchr.map((r) => [r.label, r.count]),
      [],
      ["PRODUCTIVITY BY LOGIN"],
      ["Login", "Role", "Online", "Today", "This Week", "This Month", "Total"],
      ...productivityRows.map((r) => [
        r.login,
        normalizeRole(r.role),
        r.online ? "ONLINE" : "OFFLINE",
        r.today,
        r.week,
        r.month,
        r.total,
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
              <option value="month">This Month</option>
              <option value="custom">Custom Dates</option>
            </select>
          </FilterField>

          <FilterField label="From Date">
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

          <FilterField label="To Date">
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

      <Panel title="Debug WCHR">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            fontSize: 14,
            color: "#334155",
          }}
        >
          <div>dailyStats docs: <b>{dailyStats.length}</b></div>
          <div>filteredStatsForView: <b>{filteredStatsForView.length}</b></div>
          <div>reports docs: <b>{reports.length}</b></div>
          <div>filteredReports: <b>{filteredReports.length}</b></div>
          <div>statsAvailable: <b>{String(statsAvailable)}</b></div>
          <div>hasRenderableStats: <b>{String(hasRenderableStats)}</b></div>
          <div>From: <b>{fromDate || "—"}</b></div>
          <div>To: <b>{toDate || "—"}</b></div>
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

        <Panel title="Top Airlines">
          <BarChartList rows={topAirlines} emptyText="No airline data for this filter." />
        </Panel>
      </div>

      <Panel title="Most Used WCHR">
        <BarChartList
          rows={wheelchairUsage.map((r) => ({
            label: `${r.airline} · ${r.chair}`,
            count: r.count,
          }))}
          emptyText="No WCHR usage for this filter."
        />
      </Panel>

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
                  <tr key={u.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}>
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
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
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
                  <tr key={row.login} style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}>
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
                  <tr key={u.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}>
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
