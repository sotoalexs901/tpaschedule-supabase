import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME } from "../config/appConfig.js";
import OperationalAlertsPanel from "../components/OperationalAlertsPanel.jsx";

const FIXED_AUTHOR = "AeroStation Hub";

function getMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateLabel(value) {
  if (!value) return "Not scheduled";
  try {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function formatCreatedAtLabel(value) {
  if (!value) return "\u2014";
  try {
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "\u2014";
    return parsed.toLocaleString();
  } catch {
    return "\u2014";
  }
}

function getInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "U";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getEmployeeName(item) {
  return (
    item?.employeeName ||
    item?.displayName ||
    item?.fullName ||
    item?.name ||
    item?.username ||
    item?.employeeId ||
    "Employee"
  );
}

function isValidBirthdayParts(month, day) {
  const monthNum = Number(month);
  const dayNum = Number(day);

  if (!Number.isInteger(monthNum) || !Number.isInteger(dayNum)) return false;
  if (monthNum < 1 || monthNum > 12) return false;

  const maxDay = new Date(2024, monthNum, 0).getDate();
  return dayNum >= 1 && dayNum <= maxDay;
}

function parseBirthday(value, explicitMonth, explicitDay) {
  // New privacy-friendly format: month + day only.
  // Always prioritize these fields so the Dashboard never depends on a birth year.
  if (isValidBirthdayParts(Number(explicitMonth), Number(explicitDay))) {
    return {
      month: Number(explicitMonth),
      day: Number(explicitDay),
      source: "month-day",
    };
  }

  // Legacy compatibility only. Existing profiles may still have birthDate until
  // the employee saves the new Month/Day-only profile form. The year is ignored.
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return isValidBirthdayParts(month, day)
      ? { month, day, source: "legacy" }
      : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (iso) {
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      return isValidBirthdayParts(month, day)
        ? { month, day, source: "legacy" }
        : null;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const month = parsed.getMonth() + 1;
      const day = parsed.getDate();
      return isValidBirthdayParts(month, day)
        ? { month, day, source: "legacy" }
        : null;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = value.getMonth() + 1;
    const day = value.getDate();
    return isValidBirthdayParts(month, day)
      ? { month, day, source: "legacy" }
      : null;
  }

  return null;
}

function formatBirthdayDay(day) {
  return new Date(2026, 0, Number(day || 1)).toLocaleDateString("en-US", {
    day: "numeric",
  });
}

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

function StatCard({ title, value, subtitle, accent, icon, isMobile }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.94)",
      border: "1px solid #e2e8f0",
      borderRadius: isMobile ? 16 : 20,
      padding: isMobile ? 14 : 16,
      boxShadow: "0 12px 28px rgba(15,23,42,0.05)",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${accent}12 0%, transparent 60%)`, pointerEvents: "none" }} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, position: "relative" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: "#0f172a" }}>{value}</div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>{subtitle}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${accent}16`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
      </div>
    </div>
  );
}

function GlassCard({ title, icon, action, children, accent = "#1769aa", isMobile }) {
  return (
    <section style={{
      background: "rgba(255,255,255,0.94)",
      border: "1px solid #e2e8f0",
      borderRadius: isMobile ? 18 : 22,
      padding: isMobile ? 15 : 18,
      boxShadow: "0 14px 32px rgba(15,23,42,0.05)",
      minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 13, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: `${accent}16`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{icon}</div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.56)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 22, boxShadow: "0 30px 80px rgba(15,23,42,0.28)", border: "1px solid #e2e8f0" }}>
        {children}
      </div>
    </div>
  );
}

function EmployeeCompactCard({ item, onOpen }) {
  const name = item?.employeeName || "Employee";
  const photo = item?.photoURL || item?.profilePhotoURL || "";
  return (
    <button type="button" onClick={onOpen} style={{ width: "100%", border: "1px solid #fde68a", background: "linear-gradient(135deg,#fff7ed 0%,#fff 100%)", borderRadius: 16, padding: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, overflow: "hidden", background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9a3412", flexShrink: 0 }}>
        {photo ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(name)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", wordBreak: "break-word" }}>{name}</div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: "#9a3412", fontWeight: 700 }}>{item?.department || item?.position || "Team Member"}</div>
      </div>
      <div style={{ fontSize: 18, color: "#f59e0b" }}>{"\u2192"}</div>
    </button>
  );
}

function BirthdayCard({ person, isToday }) {
  const photo = person.profilePhotoURL || "";
  const name = person.displayName || person.fullName || person.name || person.username || "Team Member";
  return (
    <div style={{ borderRadius: 15, padding: 12, background: isToday ? "linear-gradient(135deg,#fef3c7 0%,#fff 100%)" : "#f8fbff", border: isToday ? "1px solid #fbbf24" : "1px solid #dbeafe", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 13, overflow: "hidden", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#0369a1", fontWeight: 800, flexShrink: 0 }}>
        {photo ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(name)}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a", wordBreak: "break-word" }}>{name}</div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: "#64748b" }}>{person.position || "Team Member"}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: isToday ? "#b45309" : "#1769aa" }}>{person.monthLabel} {formatBirthdayDay(person.birthdayDay)}</div>
        {isToday && <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: "#b45309" }}>TODAY {"\u{1F389}"}</div>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile(900);

  const [mainMessage, setMainMessage] = useState("");
  const [mainMeta, setMainMeta] = useState(null);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [showBlockedList, setShowBlockedList] = useState(false);
  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [pendingTimesheets, setPendingTimesheets] = useState([]);
  const [employeesOfMonth, setEmployeesOfMonth] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [selectedRecognition, setSelectedRecognition] = useState(null);

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingNotices, setLoadingNotices] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [loadingTimesheets, setLoadingTimesheets] = useState(false);
  const [loadingEmployeeOfMonth, setLoadingEmployeeOfMonth] = useState(false);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);

  const canTrackTimesheets = user?.role === "duty_manager" || user?.role === "station_manager";

  const fetchMainMessage = async () => {
    try {
      const snap = await getDoc(doc(db, "dashboard", "main"));
      if (snap.exists()) {
        const data = snap.data();
        setMainMessage(data.message || "");
        setMainMeta({ updatedAt: data.updatedAt || null, updatedBy: data.updatedByLabel || data.updatedBy || FIXED_AUTHOR });
      } else {
        setMainMessage("");
        setMainMeta(null);
      }
    } catch (err) {
      console.error("Error loading main dashboard message:", err);
    }
  };

  const fetchBirthdays = async () => {
    setLoadingBirthdays(true);
    try {
      const current = new Date();
      const month = current.getMonth() + 1;

      // Birthday source: users collection / My Profile.
      // New profiles store only birthdayMonth + birthdayDay.
      // birthDate is read only as a temporary legacy fallback and its year is never used.
      const userSnap = await getDocs(collection(db, "users"));
      const items = userSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .map((item) => {
          const parsed = parseBirthday(
            item.birthDate,
            item.birthdayMonth,
            item.birthdayDay
          );

          if (!parsed) return null;

          const monthLabel = new Date(2024, parsed.month - 1, 1).toLocaleDateString(
            "en-US",
            { month: "short" }
          );

          return {
            ...item,
            birthdayMonth: parsed.month,
            birthdayDay: parsed.day,
            birthdaySource: parsed.source,
            monthLabel,
          };
        })
        .filter(Boolean)
        .filter((item) => Number(item.birthdayMonth) === month)
        .sort((a, b) => {
          const dayCompare = Number(a.birthdayDay) - Number(b.birthdayDay);
          if (dayCompare !== 0) return dayCompare;
          return getEmployeeName(a).localeCompare(getEmployeeName(b));
        });

      setBirthdays(items);
    } catch (err) {
      console.error("Error loading birthdays:", err);
      setBirthdays([]);
    } finally {
      setLoadingBirthdays(false);
    }
  };

  const fetchEmployeeOfMonth = async () => {
    setLoadingEmployeeOfMonth(true);
    try {
      const snap = await getDocs(query(collection(db, "employee_of_month"), where("active", "==", true)));
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
      setEmployeesOfMonth(items);
    } catch (err) {
      console.error("Error loading employee of month:", err);
      setEmployeesOfMonth([]);
    } finally {
      setLoadingEmployeeOfMonth(false);
    }
  };

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const snap = await getDocs(collection(db, "dashboard_events"));
      const today = new Date().toISOString().slice(0, 10);
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.date || e.date >= today).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || ""))).slice(0, 5));
    } catch (err) {
      console.error("Error loading events:", err);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchNotices = async () => {
    setLoadingNotices(true);
    try {
      const snap = await getDocs(collection(db, "dashboard_notices"));
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 5));
    } catch (err) {
      console.error("Error loading notices:", err);
      setNotices([]);
    } finally {
      setLoadingNotices(false);
    }
  };

  const fetchBlockedEmployees = async () => {
    setLoadingBlocked(true);
    try {
      const snap = await getDocs(collection(db, "restrictions"));
      setBlockedEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getEmployeeName(a).localeCompare(getEmployeeName(b))));
    } catch (err) {
      console.error("Error loading blocked employees:", err);
      setBlockedEmployees([]);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const fetchPendingSchedules = async () => {
    setLoadingPending(true);
    try {
      const snap = await getDocs(query(collection(db, "schedules"), where("status", "==", "pending")));
      setPendingSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    } catch (err) {
      console.error("Error loading pending schedules:", err);
      setPendingSchedules([]);
    } finally {
      setLoadingPending(false);
    }
  };

  const fetchPhotos = async () => {
    setLoadingPhotos(true);
    try {
      const snap = await getDocs(collection(db, "dashboard_photos"));
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.url).sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    } catch (err) {
      console.error("Error loading dashboard photos:", err);
      setPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const fetchPendingTimesheets = async () => {
    if (!canTrackTimesheets) {
      setPendingTimesheets([]);
      return;
    }
    setLoadingTimesheets(true);
    try {
      const snap = await getDocs(query(collection(db, "timesheet_reports"), where("status", "==", "submitted")));
      setPendingTimesheets(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    } catch (err) {
      console.error("Error loading pending timesheets:", err);
      setPendingTimesheets([]);
    } finally {
      setLoadingTimesheets(false);
    }
  };

  const handleMessageEmployeeOfMonth = (employee) => {
    if (!employee?.userId && !employee?.username) return;
    const personName = employee.employeeName || "team member";
    navigate("/messages", {
      state: {
        recipientUserId: employee.userId || "",
        recipientUsername: employee.username || "",
        recipientName: employee.employeeName || "",
        prefilledMessage: `Congratulations ${personName}! You were selected as Employee of the Month. Great job and thank you for your hard work!`,
      },
    });
  };

  const reloadAll = () => {
    fetchMainMessage();
    fetchBirthdays();
    fetchEmployeeOfMonth();
    fetchEvents();
    fetchNotices();
    fetchBlockedEmployees();
    fetchPendingSchedules();
    fetchPhotos();
    fetchPendingTimesheets();
  };

  useEffect(() => {
    reloadAll();
  }, [user?.role]);

  const stats = useMemo(() => {
    const base = [
      { title: "Birthdays", value: birthdays.length, subtitle: "This month", accent: "#ec4899", icon: "\u{1F382}" },
      { title: "Upcoming Events", value: events.length, subtitle: "Scheduled ahead", accent: "#1f7cc1", icon: "\u{1F4C5}" },
      { title: "Open Notices", value: notices.length, subtitle: "Latest crew updates", accent: "#f59e0b", icon: "\u{1F4CC}" },
      { title: "Pending Schedules", value: pendingSchedules.length, subtitle: "Waiting approval", accent: "#10b981", icon: "\u{1F4E5}" },
    ];
    if (canTrackTimesheets) base.push({ title: "Pending Timesheets", value: pendingTimesheets.length, subtitle: "Manager review", accent: "#c2410c", icon: "\u{1F552}" });
    return base;
  }, [birthdays.length, events.length, notices.length, pendingSchedules.length, pendingTimesheets.length, canTrackTimesheets]);

  const today = new Date();
  const currentDay = today.getDate();

  return (
    <div style={{ minHeight: "100%", fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#073b66 0%,#0f5c91 48%,#2e9fd6 100%)", borderRadius: isMobile ? 16 : 18, padding: isMobile ? "12px 14px" : "12px 16px", color: "#fff", boxShadow: "0 12px 28px rgba(15,76,129,0.16)", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fff", overflow: "hidden", flexShrink: 0 }}>
              <img src="/icons/aerostation-icon.png" alt={APP_NAME} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.72)" }}>{APP_NAME} {"\u00B7"} Dashboard</div>
              <div style={{ marginTop: 2, fontSize: isMobile ? 16 : 18, fontWeight: 800 }}>Welcome back, {user?.username || "Team"} {"\u{1F44B}"}</div>
            </div>
          </div>
          <button type="button" onClick={reloadAll} style={{ border: "1px solid rgba(255,255,255,0.20)", background: "rgba(255,255,255,0.10)", color: "#fff", borderRadius: 11, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", width: isMobile ? "100%" : "auto" }}>Refresh</button>
        </div>
      </div>

      {canTrackTimesheets && <div style={{ marginBottom: 16 }}><OperationalAlertsPanel compact={isMobile} maxItems={6} onOpenSource={(alert) => { const target = String(alert?.sourcePath || "").trim(); if (target) navigate(target, { state: { operationalAlertId: alert?.id || "", operationalAlertSourceId: alert?.sourceId || "" } }); }} /></div>}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        {stats.map((item) => <StatCard key={item.title} {...item} isMobile={isMobile} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.7fr) minmax(320px,1fr)", gap: 16 }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <GlassCard title="Station Manager Message" icon={"\u{1F4E2}"} accent="#1f7cc1" isMobile={isMobile}>
            <div style={{ background: "linear-gradient(135deg,#edf7ff 0%,#f8fcff 100%)", border: "1px solid #d6ebff", borderRadius: 16, padding: 14 }}>
              <p style={{ margin: 0, whiteSpace: "pre-line", color: "#1e293b", fontSize: 13, lineHeight: 1.65 }}>{mainMessage || "No message posted yet."}</p>
              <p style={{ margin: "9px 0 0", fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>By {mainMeta?.updatedBy || FIXED_AUTHOR}</p>
            </div>
          </GlassCard>

          <GlassCard title="Employees of the Month" icon={"\u{1F3C6}"} accent="#f59e0b" isMobile={isMobile}>
            {loadingEmployeeOfMonth ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading recognitions...</p> : employeesOfMonth.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No employee recognition published.</p> : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                {employeesOfMonth.map((employee) => <EmployeeCompactCard key={employee.id} item={employee} onOpen={() => setSelectedRecognition(employee)} />)}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Station Highlights" icon={"\u2708"} accent="#5aa9e6" isMobile={isMobile} action={photos.length ? <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</span> : null}>
            {loadingPhotos ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading photos...</p> : photos.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No station highlights yet.</p> : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                {photos.slice(0, 6).map((p) => <div key={p.id} style={{ background: "#fff", border: "1px solid #e0f2fe", borderRadius: 15, overflow: "hidden" }}><div style={{ aspectRatio: "4 / 3", background: "#e2e8f0" }}><img src={p.url} alt={p.caption || "Station highlight"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>{p.caption && <div style={{ padding: 9, fontSize: 11.5, color: "#475569", fontWeight: 700 }}>{p.caption}</div>}</div>)}
              </div>
            )}
          </GlassCard>

          {canTrackTimesheets && <GlassCard title="Pending Timesheets Follow Up" icon={"\u{1F552}"} accent="#c2410c" isMobile={isMobile} action={<button type="button" onClick={() => navigate("/timesheets/reports")} style={{ border: "1px solid #fdba74", background: "#fff7ed", color: "#c2410c", borderRadius: 12, padding: "8px 11px", fontWeight: 700, cursor: "pointer" }}>Open Reports</button>}>
            {loadingTimesheets ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading timesheets...</p> : pendingTimesheets.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No pending supervisor timesheets right now.</p> : <div style={{ display: "grid", gap: 9 }}>{pendingTimesheets.slice(0, 6).map((item) => <div key={item.id} style={{ borderRadius: 14, padding: 12, background: "#fff7ed", border: "1px solid #fdba74" }}><p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{item.airline || "\u2014"} {"\u00B7"} {item.reportDate || "\u2014"}</p><p style={{ margin: "6px 0 0", fontSize: 12 }}>Submitted by <b>{item.submittedByName || item.submittedByUsername || item.supervisorReporting || "Unknown"}</b></p><p style={{ margin: "5px 0 0", fontSize: 11 }}>Created: {formatCreatedAtLabel(item.createdAt)}</p></div>)}</div>}
          </GlassCard>}
        </div>

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <GlassCard title="Birthdays This Month" icon={"\u{1F382}"} accent="#ec4899" isMobile={isMobile}>
            {loadingBirthdays ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading birthdays...</p>
            ) : birthdays.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>
                No optional birthdays registered for this month.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {birthdays.map((person) => (
                  <BirthdayCard
                    key={person.id}
                    person={person}
                    isToday={Number(person.birthdayDay) === currentDay}
                  />
                ))}
              </div>
            )}
            <p style={{ margin: "10px 0 0", fontSize: 10.5, color: "#94a3b8", lineHeight: 1.5 }}>
              Birthday sharing is optional. Only month and day are shown; birth year is not displayed.
            </p>
          </GlassCard>

          <GlassCard title="Upcoming Events" icon={"\u{1F4C5}"} accent="#3b82f6" isMobile={isMobile}>
            {loadingEvents ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading events...</p> : events.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No events scheduled.</p> : <div style={{ display: "grid", gap: 9 }}>{events.map((ev) => <div key={ev.id} style={{ borderRadius: 14, padding: 12, background: "#eff6ff", border: "1px solid #dbeafe" }}><p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{ev.title || "Event"}</p><p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#2563eb", fontWeight: 700 }}>{formatDateLabel(ev.date)}{ev.time ? ` \u00B7 ${ev.time}` : ""}</p>{ev.details && <p style={{ margin: "7px 0 0", fontSize: 12 }}>{ev.details}</p>}</div>)}</div>}
          </GlassCard>

          <GlassCard title="Notices / Invitations" icon={"\u{1F4CC}"} accent="#f59e0b" isMobile={isMobile}>
            {loadingNotices ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading notices...</p> : notices.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No notices posted.</p> : <div style={{ display: "grid", gap: 9 }}>{notices.map((n) => <div key={n.id} style={{ borderRadius: 14, padding: 12, background: "#fffbeb", border: "1px solid #fde68a" }}><p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{n.title || "Notice"}</p>{n.body && <p style={{ margin: "7px 0 0", fontSize: 12 }}>{n.body}</p>}{n.link && <a href={n.link} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#b45309", textDecoration: "none" }}>View more {"\u2192"}</a>}</div>)}</div>}
          </GlassCard>

          <GlassCard title="Employees Not Available" icon={"\u{1F6AB}"} accent="#ef4444" isMobile={isMobile} action={blockedEmployees.length ? <button type="button" onClick={() => setShowBlockedList((v) => !v)} style={{ border: "1px solid #fecdd3", background: "#fff1f2", color: "#be123c", borderRadius: 12, padding: "8px 11px", fontWeight: 700, cursor: "pointer" }}>{showBlockedList ? "Hide list" : "View list"}</button> : null}>
            {loadingBlocked ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading employees...</p> : blockedEmployees.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No employees blocked.</p> : <>{!showBlockedList && <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{blockedEmployees.slice(0, 6).map((b) => <span key={b.id} style={{ padding: "7px 10px", borderRadius: 999, background: "#fff1f2", border: "1px solid #fecdd3", fontSize: 11.5, fontWeight: 700, color: "#9f1239" }}>{getEmployeeName(b)}</span>)}{blockedEmployees.length > 6 && <span style={{ padding: "7px 10px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 11.5, fontWeight: 700, color: "#64748b" }}>+{blockedEmployees.length - 6} more</span>}</div>}{showBlockedList && <div style={{ display: "grid", gap: 9 }}>{blockedEmployees.map((b) => <div key={b.id} style={{ borderRadius: 14, padding: 12, background: "#fff1f2", border: "1px solid #fecdd3" }}><p style={{ margin: 0, fontWeight: 800, color: "#881337", fontSize: 13 }}>{getEmployeeName(b)}</p>{b.reason && <p style={{ margin: "6px 0 0", fontSize: 12 }}>{b.reason}</p>}<p style={{ margin: "6px 0 0", fontSize: 11 }}>{b.start_date || b.startDate || "N/A"} {"\u2192"} {b.end_date || b.endDate || "N/A"}</p></div>)}</div>}</>}
          </GlassCard>

          <GlassCard title="Pending Schedules" icon={"\u{1F4E5}"} accent="#10b981" isMobile={isMobile} action={user?.role === "station_manager" ? <button type="button" onClick={() => navigate("/approvals")} style={{ border: "1px solid #bbf7d0", background: "#ecfdf5", color: "#166534", borderRadius: 12, padding: "8px 11px", fontWeight: 700, cursor: "pointer" }}>Approvals</button> : null}>
            {loadingPending ? <p style={{ margin: 0, color: "#94a3b8" }}>Loading schedules...</p> : pendingSchedules.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No schedules waiting for approval.</p> : <div style={{ display: "grid", gap: 9 }}>{pendingSchedules.slice(0, 4).map((sch) => <div key={sch.id} style={{ borderRadius: 14, padding: 12, background: "#f0fdf4", border: "1px solid #d1fae5" }}><p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>{sch.airlineDisplayName || sch.airline || "Airline"} {"\u2014"} {sch.department || "Department"}</p><p style={{ margin: "6px 0 0", fontSize: 11.5 }}>Total Hours: {Number(sch.airlineWeeklyHours || 0).toFixed(2)}</p></div>)}</div>}
          </GlassCard>
        </div>
      </div>

      <Modal open={Boolean(selectedRecognition)} onClose={() => setSelectedRecognition(null)}>
        {selectedRecognition && <div>
          <div style={{ padding: 18, background: "linear-gradient(135deg,#fff7ed 0%,#ffffff 100%)", borderBottom: "1px solid #fde68a" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, overflow: "hidden", background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#9a3412", fontSize: 20 }}>{selectedRecognition.photoURL || selectedRecognition.profilePhotoURL ? <img src={selectedRecognition.photoURL || selectedRecognition.profilePhotoURL} alt={selectedRecognition.employeeName || "Employee"} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(selectedRecognition.employeeName)}</div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{selectedRecognition.employeeName || "Employee"}</div><div style={{ marginTop: 3, fontSize: 12, color: "#9a3412", fontWeight: 700 }}>{selectedRecognition.position || "\u2014"} {"\u00B7"} {selectedRecognition.department || "\u2014"}</div>{selectedRecognition.airline && <div style={{ marginTop: 3, fontSize: 11.5, color: "#64748b" }}>{selectedRecognition.airline}</div>}</div>
              </div>
              <button type="button" onClick={() => setSelectedRecognition(null)} style={{ border: "none", background: "#f8fafc", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 18 }}>{"\u00D7"}</button>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>Recognition</div>
            <div style={{ borderRadius: 15, background: "#fffdf7", border: "1px solid #fde68a", padding: 14, fontSize: 13, lineHeight: 1.7, color: "#475569", whiteSpace: "pre-line" }}>{selectedRecognition.note || "No dedication added."}</div>
            <button type="button" disabled={!selectedRecognition.userId && !selectedRecognition.username} onClick={() => handleMessageEmployeeOfMonth(selectedRecognition)} style={{ marginTop: 14, width: "100%", border: "none", background: selectedRecognition.userId || selectedRecognition.username ? "linear-gradient(135deg,#0f4c81 0%,#1769aa 55%,#5aa9e6 100%)" : "#cbd5e1", color: "#fff", borderRadius: 13, padding: "11px 14px", fontWeight: 800, cursor: selectedRecognition.userId || selectedRecognition.username ? "pointer" : "not-allowed" }}>Send congratulations</button>
          </div>
        </div>}
      </Modal>
    </div>
  );
}

// END DashboardPage
