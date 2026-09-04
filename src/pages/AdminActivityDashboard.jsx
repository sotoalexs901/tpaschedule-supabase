import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { db } from "../firebase";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// IMPORTANT:
// Special punctuation and symbols use Unicode escape sequences to reduce
// encoding issues when editing through GitHub/Safari/iPad.
//
// FORCE LOGOUT NOTE:
// This page writes forceLogoutAt + sessionVersion to /users/{userId} and
// marks the presence record offline. For immediate forced logout, AppLayout
// or UserContext must listen to those fields and clear the local session when
// sessionVersion changes. The management control is implemented here.

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  if (!d) return "\u2014";
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
  return value || "\u2014";
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

function getVisibleUserName(user) {
  return (
    normalizeText(user?.displayName) ||
    normalizeText(user?.fullName) ||
    normalizeText(user?.name) ||
    normalizeText(user?.username) ||
    "User"
  );
}

function getUserPhoto(user) {
  return (
    user?.profilePhotoURL ||
    user?.photoURL ||
    user?.photoUrl ||
    ""
  );
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
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
        user: matchedUser,
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

function getInactiveMs(user) {
  const lastSeen = toDateSafe(user?.lastActivityAt || user?.lastSeen);
  if (!lastSeen) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - lastSeen.getTime());
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "Never connected";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function daysSince(value) {
  const d = toDateSafe(value);
  if (!d) return null;
  return Math.floor(Math.max(0, Date.now() - d.getTime()) / DAY_MS);
}

function getLoginCount(user) {
  const values = [
    user?.loginCount,
    user?.sessionCount,
    user?.totalLogins,
    user?.sessions,
  ];

  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return 0;
}

function getActivityCount(user) {
  const values = [
    user?.activityCount,
    user?.navigationCount,
    user?.totalActions,
  ];

  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return 0;
}

function getPageViews(user) {
  const n = Number(user?.pageViews || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function getActiveMinutes(user) {
  const n = Number(user?.activeMinutesApprox || 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function getEngagementScore(user) {
  const logins = getLoginCount(user);
  const actions = getActivityCount(user);
  const pageViews = getPageViews(user);
  const activeMinutes = getActiveMinutes(user);

  // Weighted operational-use score.
  // Sessions matter, but active minutes and actual interaction are weighted
  // more heavily so simply logging in repeatedly does not dominate the ranking.
  return (
    logins * 10 +
    pageViews * 2 +
    actions * 3 +
    activeMinutes * 4
  );
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value || 0));

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours < 24) {
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
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

function medalLabel(index) {
  if (index === 0) return "\u{1F947}";
  if (index === 1) return "\u{1F948}";
  if (index === 2) return "\u{1F949}";
  return `#${index + 1}`;
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

  const [showTopPerformers, setShowTopPerformers] = useState(false);
  const [workingUserId, setWorkingUserId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const flyerRef = useRef(null);

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
          ...user,
          id: user.id,
          username: user.username || "\u2014",
          displayName: user.displayName || "",
          fullName: user.fullName || "",
          name: user.name || "",
          email: user.email || "",
          role: user.role || "\u2014",
          online: Boolean(p?.online),
          currentPage: p?.currentPage || "\u2014",
          lastSeen: p?.lastSeen || user.lastSeen || null,
          lastActivityAt:
            p?.lastActivityAt ||
            user.lastActivityAt ||
            p?.lastSeen ||
            user.lastSeen ||
            null,
          firstLoginAt: p?.firstLoginAt || user.firstLoginAt || null,
          lastLoginAt: p?.lastLoginAt || user.lastLoginAt || null,
          employeeId: user.employeeId || "",
          presenceId: p?.id || user.id,
          loginCount:
            p?.loginCount ??
            p?.sessionCount ??
            user.loginCount ??
            user.sessionCount ??
            0,
          sessionCount:
            p?.sessionCount ??
            p?.loginCount ??
            user.sessionCount ??
            user.loginCount ??
            0,
          pageViews:
            p?.pageViews ??
            user.pageViews ??
            0,
          activityCount:
            p?.activityCount ??
            user.activityCount ??
            0,
          activeMinutesApprox:
            p?.activeMinutesApprox ??
            user.activeMinutesApprox ??
            0,
        };
      })
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
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
  const activeUsers = filteredUsers.filter((u) => u.lastActivityAt || u.lastSeen).length;
  const totalWchr = filteredReports.length;

  const staleOnlineUsers = useMemo(
    () =>
      mergedUsers
        .filter((u) => u.online && getInactiveMs(u) >= TWO_HOURS_MS)
        .sort((a, b) => getInactiveMs(b) - getInactiveMs(a)),
    [mergedUsers]
  );

  const neverConnectedUsers = useMemo(
    () => mergedUsers.filter((u) => !u.lastSeen && !u.lastLoginAt),
    [mergedUsers]
  );

  const inactiveAccountRows = useMemo(() => {
    return [...mergedUsers]
      .map((u) => ({
        ...u,
        inactivityDays: daysSince(u.lastActivityAt || u.lastSeen || u.lastLoginAt),
      }))
      .filter((u) => u.inactivityDays == null || u.inactivityDays >= 7)
      .sort((a, b) => {
        if (a.inactivityDays == null && b.inactivityDays != null) return -1;
        if (a.inactivityDays != null && b.inactivityDays == null) return 1;
        return (b.inactivityDays || 0) - (a.inactivityDays || 0);
      });
  }, [mergedUsers]);

  const engagementRows = useMemo(() => {
    return [...mergedUsers]
      .map((u) => ({
        ...u,
        loginMetric: getLoginCount(u),
        activityMetric: getActivityCount(u),
        pageViewMetric: getPageViews(u),
        activeMinutesMetric: getActiveMinutes(u),
        engagementScore: getEngagementScore(u),
      }))
      .sort(
        (a, b) =>
          b.engagementScore - a.engagementScore ||
          b.activeMinutesMetric - a.activeMinutesMetric ||
          b.activityMetric - a.activityMetric ||
          String(a.username).localeCompare(String(b.username))
      );
  }, [mergedUsers]);

  const topUsageUser = engagementRows[0] || null;

  const topLoginUser = useMemo(() => {
    return [...engagementRows].sort(
      (a, b) =>
        b.loginMetric - a.loginMetric ||
        b.engagementScore - a.engagementScore
    )[0] || null;
  }, [engagementRows]);

  const topActiveMinutesUser = useMemo(() => {
    return [...engagementRows].sort(
      (a, b) =>
        b.activeMinutesMetric - a.activeMinutesMetric ||
        b.engagementScore - a.engagementScore
    )[0] || null;
  }, [engagementRows]);

  const topWchrLogins = useMemo(
    () => buildCountByLogin(filteredReports).slice(0, 10),
    [filteredReports]
  );

  const topThreeWchr = useMemo(
    () => buildCountByLogin(filteredReports).slice(0, 3),
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
        const A = toDateSafe(a.lastActivityAt || a.lastSeen)?.getTime() || 0;
        const B = toDateSafe(b.lastActivityAt || b.lastSeen)?.getTime() || 0;
        return B - A;
      })
      .slice(0, 20);
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

  const handleForceLogout = async (target) => {
    if (!target?.id) return;

    const label = getVisibleUserName(target);
    if (
      !window.confirm(
        `Force "${label}" to sign in again? This will mark the current session for logout.`
      )
    ) {
      return;
    }

    try {
      setWorkingUserId(target.id);
      setActionMessage("");

      const nextVersion = Number(target.sessionVersion || 0) + 1;

      await updateDoc(doc(db, "users", target.id), {
        forceLogoutAt: serverTimestamp(),
        sessionVersion: nextVersion,
        forceLogoutReason: "Administrative inactivity reset",
      });

      if (target.presenceId) {
        try {
          await updateDoc(doc(db, "user_presence", target.presenceId), {
            online: false,
            currentPage: "Forced logout",
            lastSeen: serverTimestamp(),
          });
        } catch (presenceErr) {
          console.warn("Could not update presence during force logout:", presenceErr);
        }
      }

      setActionMessage(
        `${label} was marked for forced logout. The session listener must be enabled in AppLayout/UserContext for immediate logout.`
      );
    } catch (err) {
      console.error("Error forcing logout:", err);
      setActionMessage("Could not force logout this user.");
    } finally {
      setWorkingUserId("");
    }
  };

  const handleDeleteAccount = async (target) => {
    if (!target?.id) return;

    const label = getVisibleUserName(target);
    if (
      !window.confirm(
        `Permanently delete the platform account for "${label}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setWorkingUserId(target.id);
      setActionMessage("");

      await deleteDoc(doc(db, "users", target.id));

      if (target.presenceId) {
        try {
          await deleteDoc(doc(db, "user_presence", target.presenceId));
        } catch (presenceErr) {
          console.warn("Could not delete presence record:", presenceErr);
        }
      }

      setActionMessage(`Account "${label}" was deleted.`);
    } catch (err) {
      console.error("Error deleting user account:", err);
      setActionMessage("Could not delete the user account.");
    } finally {
      setWorkingUserId("");
    }
  };

  const handleExportTopPerformersPdf = async () => {
    if (!flyerRef.current || topThreeWchr.length === 0) return;

    try {
      const canvas = await html2canvas(flyerRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "letter",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const usableWidth = pageWidth - margin * 2;
      const ratio = canvas.height / canvas.width;
      const renderedHeight = usableWidth * ratio;
      const finalHeight = Math.min(renderedHeight, pageHeight - margin * 2);
      const finalWidth = finalHeight / ratio;

      pdf.addImage(
        imgData,
        "PNG",
        (pageWidth - finalWidth) / 2,
        margin,
        finalWidth,
        finalHeight
      );

      pdf.save(`AeroStation-WCHR-Top-Performers-${safeRangeLabel(range)}.pdf`);
    } catch (err) {
      console.error("Error exporting WCHR flyer:", err);
      setActionMessage("Could not export the WCHR recognition flyer.");
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [APP_NAME.toUpperCase(), "USER ACTIVITY DASHBOARD"],
      ["Range", safeRangeLabel(range)],
      ["From", fromDate || "\u2014"],
      ["To", toDate || "\u2014"],
      ["Agent/Login Filter", selectedLogin],
      ["Role Filter", selectedRole],
      [],
      ["SUMMARY"],
      ["Filtered Users", totalUsers],
      ["Online Now", onlineUsers],
      ["Users With Activity", activeUsers],
      ["WCHR Reports", totalWchr],
      ["Stale Online > 2 Hours", staleOnlineUsers.length],
      ["Never Connected", neverConnectedUsers.length],
      [],
      ["APP USAGE RANKING"],
      [
        "Rank",
        "User",
        "Username",
        "Role",
        "Sessions",
        "Page Views",
        "Activity",
        "Active Minutes Approx",
        "Last Activity",
        "Last Login",
      ],
      ...engagementRows.map((u, index) => [
        index + 1,
        getVisibleUserName(u),
        u.username || "",
        normalizeRole(u.role),
        u.loginMetric,
        u.pageViewMetric,
        u.activityMetric,
        u.activeMinutesMetric,
        formatDate(u.lastActivityAt || u.lastSeen),
        formatDate(u.lastLoginAt),
      ]),
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

    downloadCSV(`aerostation-user-activity-${safeRangeLabel(range)}.csv`, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="admin-activity-dashboard"
      style={{
        maxWidth: 1450,
        margin: "0 auto",
        display: "grid",
        gap: 16,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius: 28,
          padding: 22,
          color: "#ffffff",
          boxShadow: "0 24px 60px rgba(15,76,129,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.09)",
            top: -120,
            right: -45,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                overflow: "hidden",
                background: "rgba(255,255,255,0.96)",
                flexShrink: 0,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {APP_NAME} {"\u00B7"} Operations Intelligence
              </div>

              <h1
                style={{
                  margin: "6px 0 4px",
                  fontSize: 30,
                  fontWeight: 850,
                  letterSpacing: "-0.04em",
                }}
              >
                User Activity Dashboard
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.84)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Live presence, usage analytics, inactivity control, account health and WCHR performance.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            <button onClick={handleExportCsv} style={heroBtnStyle}>
              Export CSV
            </button>
            <button onClick={handlePrint} style={heroBtnStyle}>
              Print / Save PDF
            </button>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          style={{
            borderRadius: 16,
            padding: "13px 15px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#0f4c81",
            fontSize: 12.5,
            fontWeight: 750,
          }}
        >
          {actionMessage}
        </div>
      )}

      <Panel title="Filters">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          Account Health
        </TabButton>
      </div>

      {activeTab === "overview" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard label="Registered Users" value={totalUsers} icon={"\u{1F465}"} />
            <StatCard label="Online Now" value={onlineUsers} icon={"\u{1F7E2}"} />
            <StatCard label="Idle Online >2h" value={staleOnlineUsers.length} icon={"\u{23F3}"} danger={staleOnlineUsers.length > 0} />
            <StatCard label="Never Connected" value={neverConnectedUsers.length} icon={"\u{1F6AB}"} danger={neverConnectedUsers.length > 0} />
            <StatCard label="WCHR Reports" value={totalWchr} icon={"\u{1F9BD}"} />
          </div>

          {staleOnlineUsers.length > 0 && (
            <Panel title="Session Attention \u00B7 Online but inactive over 2 hours">
              <div style={{ display: "grid", gap: 10 }}>
                {staleOnlineUsers.map((u) => (
                  <UserAttentionRow
                    key={u.id}
                    user={u}
                    working={workingUserId === u.id}
                    onForceLogout={() => handleForceLogout(u)}
                  />
                ))}
              </div>
            </Panel>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            <Panel title="Top WCHR Agents">
              <BarChartList rows={topWchrLogins} emptyText="No WCHR activity for this filter." />
              {topThreeWchr.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowTopPerformers(true)}
                    style={primaryBtnStyle}
                  >
                    View Top Performers
                  </button>
                </div>
              )}
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
                    : "\u2014"
                }
              />
              <StatCard
                label="This Week"
                value={
                  mostUsedWheelchairWeek.chair
                    ? `${mostUsedWheelchairWeek.chair} (${mostUsedWheelchairWeek.count})`
                    : "\u2014"
                }
              />
              <StatCard
                label="This Month"
                value={
                  mostUsedWheelchairMonth.chair
                    ? `${mostUsedWheelchairMonth.chair} (${mostUsedWheelchairMonth.count})`
                    : "\u2014"
                }
              />
            </div>
          </Panel>
        </>
      )}

      {activeTab === "wchr" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
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

              <Panel
                title="Top WCHR Logins / Agents"
                action={
                  topThreeWchr.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowTopPerformers(true)}
                      style={smallBtnStyle}
                    >
                      Recognition Flyer
                    </button>
                  ) : null
                }
              >
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
                  <table style={{ ...tableStyle, minWidth: 760 }}>
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
                  <table style={{ ...tableStyle, minWidth: 900 }}>
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
                              {r.employee_login || r.employee_name || "\u2014"}
                            </div>
                          </td>
                          <td style={td}>{r.passenger_name || "\u2014"}</td>
                          <td style={td}>{r.airline || "\u2014"}</td>
                          <td style={td}>{r.flight_number || "\u2014"}</td>
                          <td style={td}>{r.wch_type || "\u2014"}</td>
                          <td style={td}>{r.wheelchair_number || "\u2014"}</td>
                          <td style={td}>{r.status || "\u2014"}</td>
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
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard label="Online Now" value={onlineUsers} icon={"\u{1F7E2}"} />
            <StatCard
              label="Idle >2 Hours"
              value={staleOnlineUsers.length}
              icon={"\u{23F3}"}
              danger={staleOnlineUsers.length > 0}
            />
            <StatCard
              label="Most Active User"
              value={topUsageUser ? getVisibleUserName(topUsageUser) : "\u2014"}
              subvalue={
                topUsageUser
                  ? `${formatMinutes(topUsageUser.activeMinutesMetric)} active`
                  : ""
              }
              icon={"\u{1F680}"}
            />
            <StatCard
              label="Most Logins"
              value={topLoginUser ? getVisibleUserName(topLoginUser) : "\u2014"}
              subvalue={topLoginUser ? `${topLoginUser.loginMetric} sessions` : ""}
              icon={"\u{1F511}"}
            />
            <StatCard
              label="Most Active Time"
              value={topActiveMinutesUser ? getVisibleUserName(topActiveMinutesUser) : "\u2014"}
              subvalue={
                topActiveMinutesUser
                  ? formatMinutes(topActiveMinutesUser.activeMinutesMetric)
                  : ""
              }
              icon={"\u{23F1}"}
            />
            <StatCard
              label="Never Connected"
              value={neverConnectedUsers.length}
              icon={"\u{1F6AB}"}
              danger={neverConnectedUsers.length > 0}
            />
          </div>

          <Panel title="App Usage Ranking">
            <div
              style={{
                marginBottom: 12,
                padding: "11px 13px",
                borderRadius: 14,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontSize: 11.5,
                lineHeight: 1.55,
              }}
            >
              Ranking uses sessions, page views, interaction heartbeats and
              approximate active minutes. Metrics begin accumulating after the
              new presence analytics deployment.
            </div>

            {engagementRows.length === 0 ? (
              <InfoBox text="No user usage metrics are available yet." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={{ ...tableStyle, minWidth: 980 }}>
                  <thead style={{ background: "#f8fbff" }}>
                    <tr>
                      <th style={th}>Rank</th>
                      <th style={th}>User</th>
                      <th style={th}>Role</th>
                      <th style={th}>Sessions</th>
                      <th style={th}>Page Views</th>
                      <th style={th}>Activity</th>
                      <th style={th}>Active Time</th>
                      <th style={th}>Last Activity</th>
                      <th style={th}>Last Login</th>
                    </tr>
                  </thead>

                  <tbody>
                    {engagementRows.map((u, i) => (
                      <tr
                        key={u.id}
                        style={{
                          background:
                            i === 0
                              ? "#eff6ff"
                              : i % 2 === 0
                              ? "#fff"
                              : "#f9fbff",
                        }}
                      >
                        <td style={{ ...td, fontWeight: 900 }}>
                          {i < 3 ? medalLabel(i) : i + 1}
                        </td>

                        <td style={td}>
                          <UserIdentity user={u} />
                        </td>

                        <td style={td}>{normalizeRole(u.role)}</td>

                        <td style={{ ...td, fontWeight: 800 }}>
                          {u.loginMetric}
                        </td>

                        <td style={td}>{u.pageViewMetric}</td>

                        <td style={td}>{u.activityMetric}</td>

                        <td style={{ ...td, fontWeight: 800, color: "#0f4c81" }}>
                          {formatMinutes(u.activeMinutesMetric)}
                        </td>

                        <td style={td}>
                          {formatDate(u.lastActivityAt || u.lastSeen)}
                        </td>

                        <td style={td}>{formatDate(u.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Recent User Activity">
            {recentUsers.length === 0 ? (
              <InfoBox text="No recent activity for this filter." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={{ ...tableStyle, minWidth: 900 }}>
                  <thead style={{ background: "#f8fbff" }}>
                    <tr>
                      <th style={th}>User</th>
                      <th style={th}>Role</th>
                      <th style={th}>Status</th>
                      <th style={th}>Current Page</th>
                      <th style={th}>Last Seen</th>
                      <th style={th}>Idle Time</th>
                      <th style={th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentUsers.map((u, i) => {
                      const idleMs = getInactiveMs(u);
                      const stale = u.online && idleMs >= TWO_HOURS_MS;

                      return (
                        <tr
                          key={u.id}
                          style={{
                            background: stale
                              ? "#fff7ed"
                              : i % 2 === 0
                              ? "#fff"
                              : "#f9fbff",
                          }}
                        >
                          <td style={td}>
                            <UserIdentity user={u} />
                          </td>
                          <td style={td}>{normalizeRole(u.role)}</td>
                          <td style={td}>
                            {u.online ? (
                              <span style={badge(stale ? "orange" : "green")}>
                                {stale ? "IDLE ONLINE" : "ONLINE"}
                              </span>
                            ) : (
                              <span style={badge("gray")}>OFFLINE</span>
                            )}
                          </td>
                          <td style={td}>{u.currentPage || "\u2014"}</td>
                          <td style={td}>{formatDate(u.lastSeen)}</td>
                          <td style={{ ...td, fontWeight: stale ? 800 : 500 }}>
                            {formatDuration(idleMs)}
                          </td>
                          <td style={td}>
                            {stale ? (
                              <button
                                type="button"
                                disabled={workingUserId === u.id}
                                onClick={() => handleForceLogout(u)}
                                style={dangerBtnStyle}
                              >
                                {workingUserId === u.id ? "Working..." : "Force Logout"}
                              </button>
                            ) : (
                              "\u2014"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {activeTab === "users" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard label="All Accounts" value={mergedUsers.length} />
            <StatCard label="Inactive 7+ Days" value={inactiveAccountRows.filter((u) => u.inactivityDays != null && u.inactivityDays >= 7).length} />
            <StatCard label="Inactive 30+ Days" value={inactiveAccountRows.filter((u) => u.inactivityDays != null && u.inactivityDays >= 30).length} danger />
            <StatCard label="Never Connected" value={neverConnectedUsers.length} danger={neverConnectedUsers.length > 0} />
          </div>

          <Panel title="Account Health / Inactive Users">
            {inactiveAccountRows.length === 0 ? (
              <InfoBox text="No inactive accounts currently require review." />
            ) : (
              <div style={tableWrapStyle}>
                <table style={{ ...tableStyle, minWidth: 920 }}>
                  <thead style={{ background: "#f8fbff" }}>
                    <tr>
                      <th style={th}>User</th>
                      <th style={th}>Role</th>
                      <th style={th}>Last Seen</th>
                      <th style={th}>Time Inactive</th>
                      <th style={th}>Current Status</th>
                      <th style={th}>Account Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveAccountRows.map((u, i) => {
                      const critical = u.inactivityDays == null || u.inactivityDays >= 30;

                      return (
                        <tr
                          key={u.id}
                          style={{
                            background: critical
                              ? "#fff1f2"
                              : i % 2 === 0
                              ? "#ffffff"
                              : "#f9fbff",
                          }}
                        >
                          <td style={td}>
                            <UserIdentity user={u} />
                          </td>
                          <td style={td}>{normalizeRole(u.role)}</td>
                          <td style={td}>{formatDate(u.lastSeen || u.lastLoginAt)}</td>
                          <td style={{ ...td, fontWeight: critical ? 850 : 650 }}>
                            {u.inactivityDays == null
                              ? "Never connected"
                              : `${u.inactivityDays} day${u.inactivityDays === 1 ? "" : "s"}`}
                          </td>
                          <td style={td}>
                            {u.online ? (
                              <span style={badge("green")}>ONLINE</span>
                            ) : (
                              <span style={badge("gray")}>OFFLINE</span>
                            )}
                          </td>
                          <td style={td}>
                            <button
                              type="button"
                              disabled={workingUserId === u.id}
                              onClick={() => handleDeleteAccount(u)}
                              style={dangerBtnStyle}
                            >
                              {workingUserId === u.id ? "Working..." : "Delete Account"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
                <table style={{ ...tableStyle, minWidth: 920 }}>
                  <thead style={{ background: "#f8fbff" }}>
                    <tr>
                      <th style={th}>User</th>
                      <th style={th}>Role</th>
                      <th style={th}>Status</th>
                      <th style={th}>Current Page</th>
                      <th style={th}>Last Activity</th>
                      <th style={th}>Last Login</th>
                      <th style={th}>First Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedUsers.map((u, i) => (
                      <tr
                        key={u.id}
                        style={{ background: i % 2 === 0 ? "#fff" : "#f9fbff" }}
                      >
                        <td style={td}>
                          <UserIdentity user={u} />
                        </td>
                        <td style={td}>{normalizeRole(u.role)}</td>
                        <td style={td}>
                          {u.online ? (
                            <span style={badge("green")}>ONLINE</span>
                          ) : (
                            <span style={badge("gray")}>OFFLINE</span>
                          )}
                        </td>
                        <td style={td}>{u.currentPage || "\u2014"}</td>
                        <td style={td}>
                          {formatDate(u.lastActivityAt || u.lastSeen)}
                        </td>
                        <td style={td}>{formatDate(u.lastLoginAt)}</td>
                        <td style={td}>{formatDate(u.firstLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {showTopPerformers && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowTopPerformers(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15,23,42,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "92vh",
              overflowY: "auto",
              borderRadius: 24,
              background: "#ffffff",
              boxShadow: "0 30px 80px rgba(15,23,42,0.32)",
            }}
          >
            <div ref={flyerRef}>
              <WchrRecognitionFlyer
                rows={topThreeWchr}
                users={mergedUsers}
                range={range}
                fromDate={fromDate}
                toDate={toDate}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: 16,
                borderTop: "1px solid #e2e8f0",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setShowTopPerformers(false)}
                style={smallBtnStyle}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExportTopPerformersPdf}
                style={primaryBtnStyle}
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          textAlign: "center",
          padding: "2px 10px 10px",
          color: "#94a3b8",
          fontSize: 10.5,
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

function WchrRecognitionFlyer({ rows, users, range, fromDate, toDate }) {
  return (
    <div
      style={{
        padding: 28,
        background:
          "linear-gradient(180deg, #061f3d 0%, #0f4c81 36%, #f8fbff 36%, #ffffff 100%)",
        minHeight: 720,
      }}
    >
      <div style={{ textAlign: "center", color: "#ffffff" }}>
        <img
          src="/icons/aerostation-icon.png"
          alt={APP_NAME}
          style={{
            width: 70,
            height: 70,
            objectFit: "contain",
            borderRadius: 20,
            background: "#ffffff",
          }}
        />

        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 850,
            opacity: 0.8,
          }}
        >
          {APP_NAME} {"\u00B7"} WCHR Recognition
        </div>

        <h2
          style={{
            margin: "8px 0 4px",
            fontSize: 30,
            fontWeight: 900,
          }}
        >
          Top WCHR Performers
        </h2>

        <p style={{ margin: 0, fontSize: 12, opacity: 0.82 }}>
          Congratulations to our top three team members for outstanding WCHR service.
        </p>

        <p style={{ margin: "5px 0 0", fontSize: 10.5, opacity: 0.68 }}>
          {range === "custom"
            ? `${fromDate || "\u2014"} to ${toDate || "\u2014"}`
            : safeRangeLabel(range).replace(/-/g, " ")}
        </p>
      </div>

      <div
        style={{
          marginTop: 28,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {rows.map((row, index) => {
          const matched = findMatchedUser(users, row.label);
          const name = matched ? getVisibleUserName(matched) : row.label;
          const photo = getUserPhoto(matched || {});

          return (
            <div
              key={row.label}
              style={{
                borderRadius: 20,
                background: "#ffffff",
                border:
                  index === 0
                    ? "2px solid #f59e0b"
                    : index === 1
                    ? "2px solid #94a3b8"
                    : "2px solid #c2410c",
                padding: 16,
                textAlign: "center",
                boxShadow: "0 14px 30px rgba(15,23,42,0.10)",
              }}
            >
              <div style={{ fontSize: 34 }}>{medalLabel(index)}</div>

              <div
                style={{
                  width: 82,
                  height: 82,
                  margin: "10px auto 12px",
                  borderRadius: "999px",
                  overflow: "hidden",
                  background: "#e0f2fe",
                  border: "3px solid #ffffff",
                  outline: "2px solid #bfdbfe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f4c81",
                  fontSize: 24,
                  fontWeight: 900,
                }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt={name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  getInitials(name)
                )}
              </div>

              <div
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                {name}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 11,
                  color: "#64748b",
                  fontWeight: 750,
                }}
              >
                {matched?.position || normalizeRole(matched?.role) || "Team Member"}
              </div>

              <div
                style={{
                  marginTop: 13,
                  display: "inline-flex",
                  borderRadius: 999,
                  padding: "7px 12px",
                  background: "#eff6ff",
                  color: "#1769aa",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {row.count} WCHR Services
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 26,
          borderRadius: 20,
          padding: 18,
          background: "#f8fbff",
          border: "1px solid #dbeafe",
          textAlign: "center",
          color: "#334155",
          lineHeight: 1.65,
          fontSize: 13,
        }}
      >
        Thank you for your dedication, professionalism, and commitment to
        providing excellent assistance to our passengers. Your performance
        represents the service standards of {APP_NAME}.
      </div>

      <div
        style={{
          marginTop: 18,
          textAlign: "center",
          color: "#64748b",
          fontSize: 10.5,
          fontWeight: 750,
        }}
      >
        {APP_NAME} {"\u00B7"} {APP_SUBTITLE}
      </div>
    </div>
  );
}

function UserIdentity({ user }) {
  const name = getVisibleUserName(user);
  const photo = getUserPhoto(user);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          overflow: "hidden",
          background: "#e0f2fe",
          border: "1px solid #bae6fd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0f4c81",
          fontWeight: 850,
          flexShrink: 0,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          getInitials(name)
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: "#0f172a" }}>{name}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>
          @{user?.username || "\u2014"}
          {user?.employeeId ? ` \u00B7 ${user.employeeId}` : ""}
        </div>
      </div>
    </div>
  );
}

function UserAttentionRow({ user, onForceLogout, working }) {
  const idle = getInactiveMs(user);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) auto auto",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        padding: 12,
        background: "#fff7ed",
        border: "1px solid #fdba74",
      }}
    >
      <UserIdentity user={user} />

      <div>
        <div style={{ fontSize: 10, color: "#9a3412", fontWeight: 800 }}>
          NO MOVEMENT
        </div>
        <div style={{ marginTop: 2, fontSize: 13, color: "#7c2d12", fontWeight: 850 }}>
          {formatDuration(idle)}
        </div>
      </div>

      <button
        type="button"
        disabled={working}
        onClick={onForceLogout}
        style={dangerBtnStyle}
      >
        {working ? "Working..." : "Force Logout"}
      </button>
    </div>
  );
}

function Panel({ title, children, action }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 10px 28px rgba(15,23,42,0.045)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 850,
            color: "#0f172a",
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, subvalue = "", icon, danger = false }) {
  return (
    <div
      style={{
        background: danger
          ? "linear-gradient(135deg, #fff1f2 0%, #ffffff 100%)"
          : "linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)",
        border: danger ? "1px solid #fecdd3" : "1px solid #dbeafe",
        borderRadius: 16,
        padding: 15,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {icon && (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 10,
            fontSize: 20,
            opacity: 0.85,
          }}
        >
          {icon}
        </div>
      )}

      <p
        style={{
          margin: 0,
          fontSize: 10.5,
          color: danger ? "#9f1239" : "#64748b",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          paddingRight: icon ? 30 : 0,
        }}
      >
        {label}
      </p>

      <p
        style={{
          margin: "7px 0 0",
          fontSize: 23,
          fontWeight: 900,
          color: danger ? "#be123c" : "#0f172a",
          lineHeight: 1.12,
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>

      {subvalue && (
        <div
          style={{
            marginTop: 5,
            fontSize: 10.5,
            color: danger ? "#be123c" : "#64748b",
            fontWeight: 750,
          }}
        >
          {subvalue}
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <div
        style={{
          marginBottom: 6,
          fontSize: 11,
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
        background: active
          ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)"
          : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12.5,
        fontWeight: 850,
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
              height: 11,
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
                background: "linear-gradient(135deg, #0f4c81 0%, #4fb6e9 100%)",
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
        gap: compact ? 5 : 8,
        alignItems: "end",
        minHeight: 220,
        overflowX: "auto",
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
            minWidth: compact ? 22 : 34,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#334155" }}>
            {row.count}
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: compact ? 20 : 32,
              height: `${Math.max((row.count / max) * 150, row.count > 0 ? 10 : 2)}px`,
              borderRadius: 10,
              background: "linear-gradient(180deg, #5aa9e6 0%, #1769aa 100%)",
            }}
          />

          <div
            style={{
              fontSize: compact ? 8 : 10,
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
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.55,
      }}
    >
      {text}
    </div>
  );
}

const selectStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #dbeafe",
  background: "#ffffff",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 16,
  color: "#0f172a",
  outline: "none",
};

const heroBtnStyle = {
  border: "1px solid rgba(255,255,255,0.24)",
  background: "rgba(255,255,255,0.12)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "9px 13px",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};

const primaryBtnStyle = {
  border: "none",
  background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 850,
  cursor: "pointer",
};

const smallBtnStyle = {
  border: "1px solid #bfdbfe",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 11,
  padding: "8px 11px",
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
};

const dangerBtnStyle = {
  border: "none",
  background: "#dc2626",
  color: "#ffffff",
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 11,
  fontWeight: 850,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const tableWrapStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  overflowX: "auto",
  background: "#fff",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  padding: 12,
  textAlign: "left",
  fontSize: 11,
  fontWeight: 850,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const td = {
  padding: 12,
  fontSize: 13,
  borderTop: "1px solid #eef2f7",
  verticalAlign: "middle",
  color: "#0f172a",
};

function badge(color) {
  const config =
    color === "green"
      ? { bg: "#dcfce7", text: "#166534", border: "#86efac" }
      : color === "orange"
      ? { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" }
      : { bg: "#f1f5f9", text: "#334155", border: "#cbd5e1" };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 850,
    background: config.bg,
    color: config.text,
    border: `1px solid ${config.border}`,
    whiteSpace: "nowrap",
  };
}

// END AdminActivityDashboard
