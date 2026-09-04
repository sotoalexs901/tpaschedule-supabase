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

// IMPORTANT:
// Special punctuation and symbols use Unicode escape sequences to reduce
// encoding issues when editing through GitHub/Safari/iPad.

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
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

function formatCreatedAtLabel(value) {
  if (!value) return "\u2014";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

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
    item?.employee_name ||
    item?.username ||
    item?.employeeId ||
    "Employee"
  );
}

function getEmployeePhoto(item) {
  return (
    item?.profilePhotoURL ||
    item?.photoURL ||
    item?.photoUrl ||
    item?.profilePhotoUrl ||
    item?.avatarURL ||
    item?.avatarUrl ||
    ""
  );
}

function getRecognitionNote(item) {
  return (
    item?.note ||
    item?.dedication ||
    item?.message ||
    item?.recognitionMessage ||
    item?.description ||
    ""
  );
}

function parseBirthdayValue(value) {
  if (!value) return null;

  try {
    let date = null;

    if (typeof value?.toDate === "function") {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      const clean = value.trim();
      if (!clean) return null;

      // Prefer local parsing for YYYY-MM-DD to avoid timezone shifting.
      const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (isoMatch) {
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return { month, day };
        }
      }

      // Support MM/DD/YYYY and MM/DD.
      const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (slashMatch) {
        const month = Number(slashMatch[1]);
        const day = Number(slashMatch[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return { month, day };
        }
      }

      date = new Date(clean);
    } else {
      date = new Date(value);
    }

    if (!date || Number.isNaN(date.getTime())) return null;

    return {
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  } catch {
    return null;
  }
}

function getBirthdayInfo(person) {
  // New privacy-friendly format from My Profile.
  // This is the primary source and does not contain a birth year.
  const month = Number(person?.birthdayMonth);
  const day = Number(person?.birthdayDay);

  if (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  ) {
    return { month, day };
  }

  // Legacy compatibility only. The year is ignored.
  const raw =
    person?.birthDate ||
    person?.birthday ||
    person?.birth_date ||
    person?.dateOfBirth ||
    person?.date_of_birth ||
    person?.dob ||
    person?.DOB ||
    null;

  return parseBirthdayValue(raw);
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function getIdentityKeys(person) {
  const keys = new Set();

  [
    person?.id,
    person?.userId,
    person?.uid,
    person?.employeeId,
    person?.employeeNumber,
    person?.username,
    person?.loginUsername,
    person?.email,
  ].forEach((value) => {
    const normalized = normalizeIdentity(value);
    if (normalized) keys.add(normalized);
  });

  return Array.from(keys);
}

function formatBirthdayDay(day) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const date = new Date(currentYear, currentMonth, day);

  return date.toLocaleDateString("en-US", {
    month: "short",
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
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: isMobile ? 16 : 20,
        padding: isMobile ? 14 : 16,
        boxShadow: "0 14px 32px rgba(23,105,170,0.07)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${accent}14 0%, transparent 58%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          position: "relative",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "#64748b" }}>
            {title}
          </p>

          <h3
            style={{
              margin: "7px 0 3px",
              fontSize: isMobile ? 23 : 26,
              lineHeight: 1.05,
              fontWeight: 850,
              color: "#0f172a",
              letterSpacing: "-0.03em",
            }}
          >
            {value}
          </h3>

          <p style={{ margin: 0, fontSize: 11, color: "#475569" }}>{subtitle}</p>
        </div>

        <div
          style={{
            width: isMobile ? 38 : 42,
            height: isMobile ? 38 : 42,
            borderRadius: 13,
            background: `${accent}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isMobile ? 17 : 19,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function GlassCard({ title, icon, action, children, accent = "#1769aa", isMobile }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: isMobile ? 18 : 22,
        padding: isMobile ? 15 : 18,
        boxShadow: "0 16px 36px rgba(15,23,42,0.055)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 13,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 13,
              background: `${accent}16`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 850,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {title}
          </h2>
        </div>

        {action}
      </div>

      {children}
    </div>
  );
}

function RecognitionCompactCard({ item, onOpen, isMobile }) {
  const employeeName = getEmployeeName(item);
  const photo = getEmployeePhoto(item);
  const initials = getInitials(employeeName);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: "100%",
        border: "1px solid #fde68a",
        background: "linear-gradient(135deg, #fffdf5 0%, #ffffff 100%)",
        borderRadius: 15,
        padding: isMobile ? 10 : 11,
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "0 8px 18px rgba(15,23,42,0.035)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          overflow: "hidden",
          background: "#ffedd5",
          border: "1px solid #fdba74",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9a3412",
          fontWeight: 850,
          fontSize: 15,
          flexShrink: 0,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={employeeName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: "#0f172a",
            fontSize: 13.5,
            fontWeight: 850,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {employeeName}
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 11,
            color: "#9a3412",
            fontWeight: 750,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item?.department || item?.position || "Employee of the Month"}
        </div>
      </div>

      <span
        style={{
          fontSize: 11,
          color: "#b45309",
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}
      >
        View {"\u2192"}
      </span>
    </button>
  );
}

function RecognitionModal({ item, onClose, onMessage, isMobile }) {
  if (!item) return null;

  const employeeName = getEmployeeName(item);
  const photo = getEmployeePhoto(item);
  const note = getRecognitionNote(item);
  const initials = getInitials(employeeName);
  const canWrite = Boolean(item?.userId || item?.username);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.58)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: isMobile ? 20 : 24,
          padding: isMobile ? 18 : 22,
          boxShadow: "0 28px 70px rgba(15,23,42,0.28)",
          border: "1px solid #fde68a",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", gap: 14, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                overflow: "hidden",
                background: "#ffedd5",
                border: "1px solid #fdba74",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9a3412",
                fontWeight: 850,
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {photo ? (
                <img
                  src={photo}
                  alt={employeeName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initials
              )}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#b45309",
                  fontWeight: 850,
                }}
              >
                Employee of the Month
              </div>
              <h3
                style={{
                  margin: "5px 0 0",
                  fontSize: isMobile ? 20 : 23,
                  color: "#0f172a",
                  lineHeight: 1.15,
                }}
              >
                {employeeName}
              </h3>
              <div style={{ marginTop: 5, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                {item?.position || "\u2014"} {"\u00B7"} {item?.department || "\u2014"}
              </div>
              {!!item?.airline && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  Airline: {item.airline}
                </div>
              )}
              {!!item?.monthLabel && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 750 }}>
                  {item.monthLabel}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#f8fafc",
              color: "#475569",
              fontSize: 18,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {"\u00D7"}
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            borderRadius: 16,
            padding: 16,
            background: "linear-gradient(135deg, #fff7ed 0%, #fffdf7 100%)",
            border: "1px solid #fde68a",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 850, color: "#92400e", marginBottom: 8 }}>
            Recognition message
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "#475569",
              lineHeight: 1.7,
              whiteSpace: "pre-line",
            }}
          >
            {note || "No dedication has been added yet."}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              borderRadius: 13,
              padding: "10px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Close
          </button>

          <button
            type="button"
            onClick={onMessage}
            disabled={!canWrite}
            style={{
              border: "none",
              background: canWrite
                ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)"
                : "#cbd5e1",
              color: "#ffffff",
              borderRadius: 13,
              padding: "10px 14px",
              fontWeight: 800,
              cursor: canWrite ? "pointer" : "not-allowed",
              opacity: canWrite ? 1 : 0.8,
            }}
          >
            Send congratulations
          </button>
        </div>
      </div>
    </div>
  );
}

function BirthdayCard({ employee, isToday }) {
  const employeeName = getEmployeeName(employee);
  const photo = getEmployeePhoto(employee);
  const initials = getInitials(employeeName);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderRadius: 15,
        padding: 10,
        background: isToday
          ? "linear-gradient(135deg, #fdf2f8 0%, #fff7ed 100%)"
          : "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
        border: isToday ? "1px solid #f9a8d4" : "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          overflow: "hidden",
          background: isToday ? "#fce7f3" : "#e0f2fe",
          border: isToday ? "1px solid #f9a8d4" : "1px solid #bae6fd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 850,
          color: isToday ? "#be185d" : "#0369a1",
          flexShrink: 0,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt={employeeName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 850,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {employeeName}
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
          {employee?.department || employee?.position || "Team Member"}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 850, color: isToday ? "#be185d" : "#1769aa" }}>
          {formatBirthdayDay(employee.__birthdayDay)}
        </div>
        {isToday && (
          <div style={{ marginTop: 2, fontSize: 9, fontWeight: 850, color: "#be185d" }}>
            TODAY {"\u{1F389}"}
          </div>
        )}
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
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [notices, setNotices] = useState([]);
  const [loadingNotices, setLoadingNotices] = useState(false);

  const [blockedEmployees, setBlockedEmployees] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [showBlockedList, setShowBlockedList] = useState(false);

  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const [pendingTimesheets, setPendingTimesheets] = useState([]);
  const [loadingTimesheets, setLoadingTimesheets] = useState(false);

  const [employeesOfMonth, setEmployeesOfMonth] = useState([]);
  const [loadingEmployeeOfMonth, setLoadingEmployeeOfMonth] = useState(false);
  const [selectedRecognition, setSelectedRecognition] = useState(null);

  const [birthdays, setBirthdays] = useState([]);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);

  const canTrackTimesheets =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const fetchMainMessage = async () => {
    try {
      const ref = doc(db, "dashboard", "main");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();

        setMainMessage(data.message || "");
        setMainMeta({
          updatedAt: data.updatedAt || null,
          updatedBy: data.updatedByLabel || data.updatedBy || FIXED_AUTHOR,
        });
      } else {
        setMainMessage("");
        setMainMeta(null);
      }
    } catch (err) {
      console.error("Error loading main dashboard message:", err);
    }
  };

  const fetchEmployeeOfMonth = async () => {
    setLoadingEmployeeOfMonth(true);

    try {
      const qEmployee = query(
        collection(db, "employee_of_month"),
        where("active", "==", true)
      );

      const snap = await getDocs(qEmployee);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

      setEmployeesOfMonth(items);
    } catch (err) {
      console.error("Error loading employee of month:", err);
      setEmployeesOfMonth([]);
    } finally {
      setLoadingEmployeeOfMonth(false);
    }
  };

  const fetchBirthdays = async () => {
    setLoadingBirthdays(true);

    try {
      // My Profile stores the new privacy-friendly birthday fields in /users.
      // /employees is loaded only as a legacy/enrichment fallback.
      const [usersSnap, employeesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "employees")),
      ]);

      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const employeeByIdentity = new Map();

      employees.forEach((employee) => {
        getIdentityKeys(employee).forEach((key) => {
          if (!employeeByIdentity.has(key)) {
            employeeByIdentity.set(key, employee);
          }
        });
      });

      const consumedEmployeeIds = new Set();
      const mergedPeople = [];

      users.forEach((profile) => {
        const match = getIdentityKeys(profile)
          .map((key) => employeeByIdentity.get(key))
          .find(Boolean);

        if (match?.id) consumedEmployeeIds.add(match.id);

        // Employee record can contribute department/legacy details.
        // User profile wins for name, photo and the new birthday fields.
        mergedPeople.push({
          ...(match || {}),
          ...profile,
          id: profile.id,
          __source: "users",
        });
      });

      // Keep legacy employees that do not have a matching user profile yet.
      employees.forEach((employee) => {
        if (!consumedEmployeeIds.has(employee.id)) {
          mergedPeople.push({
            ...employee,
            id: `employee_${employee.id}`,
            __legacyEmployeeId: employee.id,
            __source: "employees",
          });
        }
      });

      const now = new Date();
      const currentMonth = now.getMonth() + 1;

      const items = mergedPeople
        .map((person) => {
          const birthday = getBirthdayInfo(person);
          if (!birthday || birthday.month !== currentMonth) return null;

          return {
            ...person,
            __birthdayMonth: birthday.month,
            __birthdayDay: birthday.day,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.__birthdayDay !== b.__birthdayDay) {
            return a.__birthdayDay - b.__birthdayDay;
          }
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

  const fetchEvents = async () => {
    setLoadingEvents(true);

    try {
      const snap = await getDocs(collection(db, "dashboard_events"));
      const today = new Date().toISOString().slice(0, 10);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => !e.date || e.date >= today)
        .sort((a, b) => {
          const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
          if (dateCompare !== 0) return dateCompare;
          return String(a.time || "").localeCompare(String(b.time || ""));
        })
        .slice(0, 5);

      setEvents(items);
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

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
        .slice(0, 5);

      setNotices(items);
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

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getEmployeeName(a).localeCompare(getEmployeeName(b)));

      setBlockedEmployees(items);
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
      const qPending = query(collection(db, "schedules"), where("status", "==", "pending"));
      const snap = await getDocs(qPending);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

      setPendingSchedules(items);
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

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.url)
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

      setPhotos(items);
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
      const qPending = query(
        collection(db, "timesheet_reports"),
        where("status", "==", "submitted")
      );

      const snap = await getDocs(qPending);

      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));

      setPendingTimesheets(items);
    } catch (err) {
      console.error("Error loading pending timesheets:", err);
      setPendingTimesheets([]);
    } finally {
      setLoadingTimesheets(false);
    }
  };

  const handleMessageEmployeeOfMonth = (employee) => {
    if (!employee?.userId && !employee?.username) return;

    const personName = getEmployeeName(employee);
    const messageText = `Congratulations ${personName}! You were selected as Employee of the Month. Great job and thank you for your hard work!`;

    setSelectedRecognition(null);
    navigate("/messages", {
      state: {
        recipientUserId: employee.userId || "",
        recipientUsername: employee.username || "",
        recipientName: personName,
        prefilledMessage: messageText,
      },
    });
  };

  const reloadAll = () => {
    fetchMainMessage();
    fetchEmployeeOfMonth();
    fetchBirthdays();
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
      {
        title: "Upcoming Events",
        value: events.length,
        subtitle: "Scheduled items ahead",
        accent: "#1f7cc1",
        icon: "\u{1F4C5}",
      },
      {
        title: "Open Notices",
        value: notices.length,
        subtitle: "Latest crew updates",
        accent: "#f59e0b",
        icon: "\u{1F4CC}",
      },
      {
        title: "Birthdays This Month",
        value: birthdays.length,
        subtitle: "Team celebrations",
        accent: "#db2777",
        icon: "\u{1F382}",
      },
      {
        title: "Blocked Employees",
        value: blockedEmployees.length,
        subtitle: "Restrictions active",
        accent: "#ef4444",
        icon: "\u{1F6AB}",
      },
      {
        title: "Pending Schedules",
        value: pendingSchedules.length,
        subtitle: "Waiting for approval",
        accent: "#10b981",
        icon: "\u{1F4E5}",
      },
    ];

    if (canTrackTimesheets) {
      base.push({
        title: "Pending Timesheets",
        value: pendingTimesheets.length,
        subtitle: "Waiting for manager review",
        accent: "#c2410c",
        icon: "\u{1F552}",
      });
    }

    return base;
  }, [
    events.length,
    notices.length,
    birthdays.length,
    blockedEmployees.length,
    pendingSchedules.length,
    pendingTimesheets.length,
    canTrackTimesheets,
  ]);

  const currentDay = new Date().getDate();
  const currentMonthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div style={{ minHeight: "100%", fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #073b66 0%, #0f5c91 48%, #2e9fd6 100%)",
          borderRadius: isMobile ? 16 : 18,
          padding: isMobile ? "12px 14px" : "12px 16px",
          color: "#ffffff",
          boxShadow: "0 12px 28px rgba(15,76,129,0.16)",
          position: "relative",
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 150,
            height: 150,
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.09)",
            top: -88,
            right: -24,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: isMobile ? 38 : 42,
                height: isMobile ? 38 : 42,
                flex: `0 0 ${isMobile ? 38 : 42}px`,
                borderRadius: 12,
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(255,255,255,0.88)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isMobile ? 8 : 9,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.72)",
                  lineHeight: 1.2,
                  marginBottom: 3,
                }}
              >
                {APP_NAME} {"\u00B7"} Executive Dashboard
              </div>

              <div
                style={{
                  fontSize: isMobile ? 16 : 18,
                  lineHeight: 1.15,
                  fontWeight: 750,
                  letterSpacing: "-0.02em",
                  whiteSpace: isMobile ? "normal" : "nowrap",
                }}
              >
                Welcome back, {user?.username || "Team"} {"\u{1F44B}"}
              </div>

              {!isMobile && (
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 10.5,
                    color: "rgba(255,255,255,0.72)",
                    lineHeight: 1.35,
                  }}
                >
                  Station activity, team recognition, and pending actions at a glance.
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={reloadAll}
            style={{
              border: "1px solid rgba(255,255,255,0.20)",
              background: "rgba(255,255,255,0.10)",
              color: "#ffffff",
              borderRadius: 11,
              padding: isMobile ? "8px 11px" : "8px 12px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              width: isMobile ? "100%" : "auto",
              whiteSpace: "nowrap",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {canTrackTimesheets && (
        <div style={{ marginBottom: 16 }}>
          <OperationalAlertsPanel
            compact={isMobile}
            maxItems={6}
            onOpenSource={(alert) => {
              const target = String(alert?.sourcePath || "").trim();
              if (target) {
                navigate(target, {
                  state: {
                    operationalAlertId: alert?.id || "",
                    operationalAlertSourceId: alert?.sourceId || "",
                  },
                });
              }
            }}
          />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
          gap: isMobile ? 10 : 12,
          marginBottom: 16,
        }}
      >
        {stats.map((item) => (
          <StatCard key={item.title} {...item} isMobile={isMobile} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.7fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <GlassCard title="Station Manager Message" icon={"\u{1F4E2}"} accent="#1f7cc1" isMobile={isMobile}>
            <div
              style={{
                background: "linear-gradient(135deg, #edf7ff 0%, #f8fcff 100%)",
                border: "1px solid #d6ebff",
                borderRadius: 16,
                padding: 15,
              }}
            >
              <p
                style={{
                  margin: 0,
                  whiteSpace: "pre-line",
                  color: "#1e293b",
                  fontSize: isMobile ? 13 : 14,
                  lineHeight: 1.65,
                  wordBreak: "break-word",
                }}
              >
                {mainMessage || "No message posted yet."}
              </p>

              <p style={{ marginTop: 9, marginBottom: 0, fontSize: 11, color: "#64748b", fontWeight: 750 }}>
                By {mainMeta?.updatedBy || FIXED_AUTHOR}
              </p>
            </div>
          </GlassCard>

          <GlassCard
            title="Employees of the Month"
            icon={"\u{1F3C6}"}
            accent="#f59e0b"
            isMobile={isMobile}
            action={
              employeesOfMonth.length > 0 ? (
                <span style={{ fontSize: 11, color: "#92400e", fontWeight: 800 }}>
                  Tap a name to read the dedication
                </span>
              ) : null
            }
          >
            {loadingEmployeeOfMonth ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading employee recognitions...</p>
            ) : employeesOfMonth.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No employee recognition published.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 9,
                }}
              >
                {employeesOfMonth.map((employee) => (
                  <RecognitionCompactCard
                    key={employee.id}
                    item={employee}
                    isMobile={isMobile}
                    onOpen={() => setSelectedRecognition(employee)}
                  />
                ))}
              </div>
            )}
          </GlassCard>

          {canTrackTimesheets && (
            <GlassCard
              title="WCHR Billing & Monthly Close"
              icon={"\u{1F4CA}"}
              accent="#16a34a"
              isMobile={isMobile}
              action={
                <button
                  type="button"
                  onClick={() => navigate("/wchr/monthly-close")}
                  style={{
                    border: "1px solid #bbf7d0",
                    background: "#ecfdf5",
                    color: "#166534",
                    borderRadius: 13,
                    padding: "9px 13px",
                    fontWeight: 750,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Open Module
                </button>
              }
            >
              <p style={{ margin: 0, fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>
                Export billing, review monthly WCHR performance, close completed months, and manage archived WCHR data.
              </p>
            </GlassCard>
          )}

          <GlassCard
            title="Station Highlights"
            icon={"\u{2708}"}
            accent="#5aa9e6"
            isMobile={isMobile}
            action={
              photos.length > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 750, color: "#64748b" }}>
                  {photos.length} photo{photos.length !== 1 ? "s" : ""}
                </span>
              ) : null
            }
          >
            {loadingPhotos ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading photos...</p>
            ) : photos.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No station highlights yet.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 10,
                }}
              >
                {photos.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #e0f2fe",
                      borderRadius: 15,
                      overflow: "hidden",
                      boxShadow: "0 10px 20px rgba(15,23,42,0.04)",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ aspectRatio: "4 / 3", background: "#e2e8f0" }}>
                      <img
                        src={p.url}
                        alt={p.caption || "Station highlight"}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>

                    {p.caption && (
                      <div style={{ padding: 10 }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#475569", fontWeight: 750, wordBreak: "break-word" }}>
                          {p.caption}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title="Pending Schedules for Approval"
            icon={"\u{1F4E5}"}
            accent="#10b981"
            isMobile={isMobile}
            action={
              user?.role === "station_manager" ? (
                <button
                  type="button"
                  onClick={() => navigate("/approvals")}
                  style={{
                    border: "1px solid #cfe7fb",
                    background: "#edf7ff",
                    color: "#1769aa",
                    borderRadius: 13,
                    padding: "9px 13px",
                    fontWeight: 750,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Go to Approvals
                </button>
              ) : null
            }
          >
            {loadingPending ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading schedules...</p>
            ) : pendingSchedules.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No schedules waiting for approval.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {pendingSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    style={{
                      borderRadius: 15,
                      padding: 13,
                      background: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
                      border: "1px solid #d1fae5",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 850 }}>
                      {sch.airlineDisplayName || sch.airline || "Airline"} {"\u2014"} {sch.department || "Department"}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                      Total Hours: {Number(sch.airlineWeeklyHours || 0).toFixed(2)}
                    </p>
                    <p style={{ margin: "5px 0 0", fontSize: 11 }}>
                      Sent by: {sch.createdBy || "unknown"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {canTrackTimesheets && (
            <GlassCard
              title="Pending Timesheets Follow Up"
              icon={"\u{1F552}"}
              accent="#c2410c"
              isMobile={isMobile}
              action={
                <button
                  type="button"
                  onClick={() => navigate("/timesheets/reports")}
                  style={{
                    border: "1px solid #fdba74",
                    background: "#fff7ed",
                    color: "#c2410c",
                    borderRadius: 13,
                    padding: "9px 13px",
                    fontWeight: 750,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Open Reports
                </button>
              }
            >
              {loadingTimesheets ? (
                <p style={{ margin: 0, color: "#94a3b8" }}>Loading timesheets...</p>
              ) : pendingTimesheets.length === 0 ? (
                <p style={{ margin: 0, color: "#64748b" }}>No pending supervisor timesheets right now.</p>
              ) : (
                <div style={{ display: "grid", gap: 9 }}>
                  {pendingTimesheets.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)",
                        border: "1px solid #fdba74",
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 850 }}>
                        {item.airline || "\u2014"} {"\u00B7"} {item.reportDate || "\u2014"}
                      </p>
                      <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                        Submitted by <b>{item.submittedByName || item.submittedByUsername || item.supervisorReporting || "Unknown"}</b>
                      </p>
                      <p style={{ margin: "5px 0 0", fontSize: 11 }}>
                        Created: {formatCreatedAtLabel(item.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}
        </div>

        <div style={{ display: "grid", gap: 16, minWidth: 0, alignContent: "start" }}>
          <GlassCard
            title={`Birthdays \u00B7 ${currentMonthLabel}`}
            icon={"\u{1F382}"}
            accent="#db2777"
            isMobile={isMobile}
            action={
              <span style={{ fontSize: 10.5, color: "#9d174d", fontWeight: 800 }}>
                Month + day only
              </span>
            }
          >
            {loadingBirthdays ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading birthdays...</p>
            ) : birthdays.length === 0 ? (
              <div>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12.5 }}>
                  No birthdays registered for this month.
                </p>
                <p style={{ margin: "7px 0 0", color: "#94a3b8", fontSize: 10.5, lineHeight: 1.5 }}>
                  Birthday sharing is optional and can be updated from My Profile.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 8 }}>
                  {birthdays.map((employee) => (
                    <BirthdayCard
                      key={employee.id}
                      employee={employee}
                      isToday={employee.__birthdayDay === currentDay}
                    />
                  ))}
                </div>

                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#94a3b8",
                    fontSize: 10.5,
                    lineHeight: 1.5,
                  }}
                >
                  Birthday sharing is optional. Only month and day are displayed.
                </p>
              </>
            )}
          </GlassCard>

          <GlassCard title="Upcoming Events" icon={"\u{1F4C5}"} accent="#3b82f6" isMobile={isMobile}>
            {loadingEvents ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading events...</p>
            ) : events.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No events scheduled.</p>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
                      border: "1px solid #dbeafe",
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 850, fontSize: 13.5 }}>{ev.title || "Event"}</p>
                    <p style={{ margin: "5px 0 0", fontSize: 11, color: "#2563eb", fontWeight: 750 }}>
                      {formatDateLabel(ev.date)}
                      {ev.time ? ` \u00B7 ${ev.time}` : ""}
                    </p>
                    {ev.details && <p style={{ margin: "7px 0 0", fontSize: 12 }}>{ev.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard title="Notices / Invitations" icon={"\u{1F4CC}"} accent="#f59e0b" isMobile={isMobile}>
            {loadingNotices ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading notices...</p>
            ) : notices.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No notices posted.</p>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {notices.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
                      border: "1px solid #fde68a",
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 850, fontSize: 13.5 }}>{n.title || "Notice"}</p>
                    {n.body && <p style={{ margin: "7px 0 0", fontSize: 12 }}>{n.body}</p>}
                    {n.link && (
                      <a
                        href={n.link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-block",
                          marginTop: 8,
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#b45309",
                          textDecoration: "none",
                        }}
                      >
                        View more {"\u2192"}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard
            title="Employees Not Available"
            icon={"\u{1F6AB}"}
            accent="#ef4444"
            isMobile={isMobile}
            action={
              blockedEmployees.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowBlockedList((v) => !v)}
                  style={{
                    border: "1px solid #fecdd3",
                    background: "#fff1f2",
                    color: "#be123c",
                    borderRadius: 13,
                    padding: "9px 13px",
                    fontWeight: 750,
                    cursor: "pointer",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  {showBlockedList ? "Hide list" : "View list"}
                </button>
              ) : null
            }
          >
            {loadingBlocked ? (
              <p style={{ margin: 0, color: "#94a3b8" }}>Loading employees...</p>
            ) : blockedEmployees.length === 0 ? (
              <p style={{ margin: 0, color: "#64748b" }}>No employees blocked.</p>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 7,
                    marginBottom: showBlockedList ? 12 : 0,
                  }}
                >
                  {blockedEmployees.slice(0, 8).map((b) => (
                    <span
                      key={b.id}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 999,
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        fontSize: 11,
                        fontWeight: 750,
                        color: "#9f1239",
                      }}
                    >
                      {getEmployeeName(b)}
                    </span>
                  ))}

                  {blockedEmployees.length > 8 && (
                    <span
                      style={{
                        padding: "7px 10px",
                        borderRadius: 999,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        fontSize: 11,
                        fontWeight: 750,
                        color: "#64748b",
                      }}
                    >
                      +{blockedEmployees.length - 8} more
                    </span>
                  )}
                </div>

                {showBlockedList && (
                  <div style={{ display: "grid", gap: 9 }}>
                    {blockedEmployees.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: "linear-gradient(135deg, #fff1f2 0%, #ffffff 100%)",
                          border: "1px solid #fecdd3",
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 850, color: "#881337", fontSize: 13 }}>
                          {getEmployeeName(b)}
                        </p>
                        {b.reason && <p style={{ margin: "6px 0 0", fontSize: 12 }}>{b.reason}</p>}
                        <p style={{ margin: "6px 0 0", fontSize: 11 }}>
                          {b.start_date || b.startDate || "N/A"} {"\u2192"} {b.end_date || b.endDate || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </GlassCard>
        </div>
      </div>

      <RecognitionModal
        item={selectedRecognition}
        isMobile={isMobile}
        onClose={() => setSelectedRecognition(null)}
        onMessage={() => handleMessageEmployeeOfMonth(selectedRecognition)}
      />
    </div>
  );
}

// END DashboardPage
