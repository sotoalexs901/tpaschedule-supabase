import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  updateUserPresence,
  updateUserPage,
  markUserOffline,
} from "../services/presenceService";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// Menu icons intentionally use Unicode escape sequences (for example "\\u{1F3E0}")
// instead of literal emoji characters. This prevents mojibake/encoding corruption
// when editing the file from GitHub web, Safari, iPad, or different text encodings.
//
// SESSION CONTROL:
// Admin User Activity can increment users/{userId}.sessionVersion.
// AppLayout listens to that value in real time. When the remote version becomes
// greater than the version loaded with the current session, the user is logged out.
//
// ACTIVITY HEARTBEAT:
// Pointer, keyboard, touch, scroll and focus activity refresh presence at a
// throttled interval. This gives the User Activity dashboard a better "lastSeen"
// signal even when an employee stays on the same page for a long time.

const ACTIVITY_PING_MS = 60 * 1000;

function getDefaultPosition(role) {
  if (role === "station_manager") return "Station Manager";
  if (role === "duty_manager") return "Duty Manager";
  if (role === "supervisor") return "Supervisor";
  if (role === "agent") return "Agent";
  return "Team Member";
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function getVisiblePosition(user) {
  return user?.position || getDefaultPosition(user?.role);
}

function getInitials(name) {
  const clean = String(name || "").trim();

  if (!clean) return "U";

  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getSessionVersion(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [operationalAlerts, setOperationalAlerts] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");

  const sessionVersionRef = useRef(getSessionVersion(user?.sessionVersion));
  const forcedLogoutHandledRef = useRef(false);
  const lastActivityPingRef = useRef(0);

  const previousUnreadMessagesRef = useRef(0);
  const soundReadyRef = useRef(false);

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(() => getVisiblePosition(user), [user]);

  const profilePhotoURL = user?.profilePhotoURL || "";

  // ============================================================
  // LOGOUT
  // ============================================================

  const logout = async () => {
    try {
      if (user?.id) {
        await markUserOffline(user);
      }
    } catch (err) {
      console.error("Error marking user offline on logout:", err);
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  // ============================================================
  // REMOTE SESSION CONTROL / FORCE LOGOUT
  // ============================================================

  useEffect(() => {
    if (!user?.id) return undefined;

    // The login flow normally loads the complete user document.
    // That means sessionVersion from the current login becomes our baseline.
    sessionVersionRef.current = getSessionVersion(user?.sessionVersion);
    forcedLogoutHandledRef.current = false;

    const userRef = doc(db, "users", user.id);

    const unsub = onSnapshot(
      userRef,
      async (snap) => {
        if (!snap.exists()) {
          // Account removed while the employee is signed in.
          if (forcedLogoutHandledRef.current) return;

          forcedLogoutHandledRef.current = true;

          try {
            await markUserOffline(user);
          } catch (err) {
            console.error("Error marking deleted user offline:", err);
          } finally {
            setUser(null);
            navigate("/login", {
              replace: true,
              state: {
                sessionMessage:
                  "Your AeroStation Hub account is no longer active. Please contact management.",
              },
            });
          }

          return;
        }

        const remoteData = snap.data();
        const remoteVersion = getSessionVersion(remoteData.sessionVersion);
        const localVersion = getSessionVersion(sessionVersionRef.current);

        if (
          remoteVersion > localVersion &&
          !forcedLogoutHandledRef.current
        ) {
          forcedLogoutHandledRef.current = true;

          try {
            await markUserOffline(user);
          } catch (err) {
            console.error("Error marking forced-logout user offline:", err);
          } finally {
            setUser(null);
            navigate("/login", {
              replace: true,
              state: {
                sessionMessage:
                  "Your session was refreshed by management. Please sign in again to load the latest AeroStation Hub updates.",
              },
            });
          }
        }
      },
      (err) => {
        console.error("Error listening for session control:", err);
      }
    );

    return () => unsub();
  }, [user?.id, user?.sessionVersion, setUser, navigate]);

  // ============================================================
  // PENDING TIME OFF
  // ============================================================

  useEffect(() => {
    const qTimeoff = query(
      collection(db, "timeOffRequests"),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(
      qTimeoff,
      (snap) => setPendingTimeOff(snap.size),
      (err) => console.error("Error listening timeOffRequests:", err)
    );

    return () => unsub();
  }, []);

  // ============================================================
  // MESSAGE SOUND ENABLEMENT
  // ============================================================

  useEffect(() => {
    const enableSound = () => {
      soundReadyRef.current = true;
    };

    window.addEventListener("pointerdown", enableSound, { once: true });
    window.addEventListener("touchstart", enableSound, { once: true });
    window.addEventListener("keydown", enableSound, { once: true });

    return () => {
      window.removeEventListener("pointerdown", enableSound);
      window.removeEventListener("touchstart", enableSound);
      window.removeEventListener("keydown", enableSound);
    };
  }, []);

  const playMessageSound = () => {
    if (!soundReadyRef.current) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(720, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        980,
        context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.2
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.22);

      oscillator.addEventListener("ended", () => {
        context.close().catch(() => {});
      });
    } catch (err) {
      console.warn("Message sound unavailable:", err);
    }
  };

  // ============================================================
  // UNREAD MESSAGES - LIVE CHAT V2
  // ============================================================

  useEffect(() => {
    if (!user?.id) {
      setUnreadMessages(0);
      return undefined;
    }

    const qConversations = query(
      collection(db, "conversations"),
      where("participants", "array-contains", user.id)
    );

    const unsub = onSnapshot(
      qConversations,
      (snap) => {
        const unreadCount = snap.docs.filter((item) => {
          const data = item.data();
          const unreadUserIds = Array.isArray(data.unreadUserIds)
            ? data.unreadUserIds
            : [];

          return unreadUserIds.includes(user.id);
        }).length;

        const previousCount = previousUnreadMessagesRef.current;

        if (unreadCount > previousCount && previousCount >= 0) {
          playMessageSound();
        }

        previousUnreadMessagesRef.current = unreadCount;
        setUnreadMessages(unreadCount);
      },
      (err) => {
        console.error("Error listening unread conversations:", err);
        setUnreadMessages(0);
      }
    );

    return () => unsub();
  }, [user?.id]);

  // ============================================================
  // UNREAD NOTIFICATIONS
  // ============================================================

  useEffect(() => {
    if (!user?.id) return undefined;

    const qNotifications = query(
      collection(db, "notifications"),
      where("userId", "==", user.id),
      where("read", "==", false)
    );

    const unsub = onSnapshot(
      qNotifications,
      (snap) => setUnreadNotifications(snap.size),
      (err) => console.error("Error listening notifications:", err)
    );

    return () => unsub();
  }, [user?.id]);

  // ============================================================
  // ACTIVE OPERATIONAL ALERTS - DUTY / STATION MANAGEMENT
  // ============================================================

  useEffect(() => {
    const role = String(user?.role || "").trim().toLowerCase();

    if (role !== "station_manager" && role !== "duty_manager") {
      setOperationalAlerts(0);
      return undefined;
    }

    const unsub = onSnapshot(
      collection(db, "operational_alerts"),
      (snap) => {
        const count = snap.docs.filter((item) => {
          const data = item.data();
          const targets = Array.isArray(data.targetRoles)
            ? data.targetRoles.map((value) =>
                String(value || "").trim().toLowerCase()
              )
            : [];

          return !targets.length || targets.includes(role);
        }).length;

        setOperationalAlerts(count);
      },
      (err) => {
        console.error("Error listening operational alerts:", err);
        setOperationalAlerts(0);
      }
    );

    return () => unsub();
  }, [user?.role]);

  // ============================================================
  // CLOSE MENU WHEN NAVIGATING
  // ============================================================

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // ============================================================
  // USER PRESENCE
  // ============================================================

  useEffect(() => {
    if (!user?.id) return;

    updateUserPresence(user, {
      currentPage: location.pathname,
    }).catch((err) =>
      console.error("Error updating user presence:", err)
    );
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;

    updateUserPage(user, location.pathname).catch((err) =>
      console.error("Error updating current page:", err)
    );
  }, [location.pathname, user]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const handleBeforeUnload = () => {
      markUserOffline(user).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        markUserOffline(user).catch(() => {});
      } else {
        updateUserPresence(user, {
          currentPage: location.pathname,
        }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [user, location.pathname]);

  // ============================================================
  // REAL USER ACTIVITY HEARTBEAT
  // ============================================================

  useEffect(() => {
    if (!user?.id) return undefined;

    const sendActivityPing = () => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();

      if (
        lastActivityPingRef.current &&
        now - lastActivityPingRef.current < ACTIVITY_PING_MS
      ) {
        return;
      }

      lastActivityPingRef.current = now;

      updateUserPresence(user, {
        currentPage: location.pathname,
        lastActivityAt: new Date(now).toISOString(),
      }).catch((err) =>
        console.error("Error updating activity heartbeat:", err)
      );
    };

    // Initial activity mark after login/layout mount.
    sendActivityPing();

    const passiveOptions = { passive: true };

    window.addEventListener("pointerdown", sendActivityPing, passiveOptions);
    window.addEventListener("touchstart", sendActivityPing, passiveOptions);
    window.addEventListener("scroll", sendActivityPing, passiveOptions);
    window.addEventListener("focus", sendActivityPing);
    window.addEventListener("keydown", sendActivityPing);

    return () => {
      window.removeEventListener("pointerdown", sendActivityPing, passiveOptions);
      window.removeEventListener("touchstart", sendActivityPing, passiveOptions);
      window.removeEventListener("scroll", sendActivityPing, passiveOptions);
      window.removeEventListener("focus", sendActivityPing);
      window.removeEventListener("keydown", sendActivityPing);
    };
  }, [user, location.pathname]);

  // ============================================================
  // USER NORMALIZATION
  // ============================================================

  const normalizedDepartment = String(user?.department || "")
    .trim()
    .toLowerCase();

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isHhernandez =
    normalizedUsername === "hhernandez" ||
    normalizedUsername === "hhernadez";

  const isDLCabinService =
    normalizedDepartment.includes("dl cabin") ||
    normalizedDepartment.includes("cabin service");

  // ============================================================
  // ROLE HELPERS
  // ============================================================

  const isManager =
    user?.role === "station_manager" ||
    user?.role === "duty_manager";

  const isAgent = user?.role === "agent";

  const isAgentOrSupervisor =
    user?.role === "agent" ||
    user?.role === "supervisor";

  // ============================================================
  // PERMISSIONS
  // ============================================================

  const canAccessRegularManagerSchedules =
    isManager && !isHhernandez;

  const canAccessCabinServiceOnlyManager =
    user?.role === "duty_manager" &&
    isHhernandez;

  const canAccessTimesheets =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canAccessOperationalReports =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canAccessOperationalReportAdmin =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageOperationalReportForm =
    user?.role === "station_manager";

  const canSubmitOperationsRequests =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageOperationsRequests =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canSubmitWchrPoi =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageWchrPoi =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canSubmitRegulatedGarbage =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageRegulatedGarbage =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canAccessWchrTools =
    !isDLCabinService &&
    (
      user?.role === "agent" ||
      user?.role === "supervisor" ||
      user?.role === "duty_manager" ||
      user?.role === "station_manager"
    );

  const canAccessWchrFlightReport =
    !isDLCabinService &&
    (
      user?.role === "supervisor" ||
      user?.role === "duty_manager" ||
      user?.role === "station_manager"
    );

  const canAccessWchrMonthlyClose =
    !isDLCabinService &&
    (
      user?.role === "duty_manager" ||
      user?.role === "station_manager"
    );

  const canSubmitEmployeePerformance =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageEmployeePerformance =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canSubmitGateChecklist =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageGateChecklist =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canSubmitFuel =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageFuel =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canSubmitCierreVuelo =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageCierreVuelo =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  // ============================================================
  // NAVIGATION
  // ============================================================

  const navSections = useMemo(() => {
    const sections = [];

    const general = [
      { to: "/dashboard", label: "Dashboard", icon: "\u{1F3E0}" },
      { to: "/profile", label: "My Profile", icon: "\u{1F464}" },
      { to: "/station-team", label: "Station Team", icon: "\u{1F465}" },
      {
        to: "/messages",
        label: "Messages",
        icon: "\u{1F4AC}",
        showDot: unreadMessages > 0,
      },
      {
        to: "/notifications",
        label: "Notifications",
        icon: "\u{1F514}",
        showDot: unreadNotifications > 0,
      },
    ];

    const schedules = [];
    const submissionReports = [];
    const managementReports = [];
    const timeoff = [];
    const wchr = [];
    const admin = [];

    if (canAccessRegularManagerSchedules) {
      schedules.push(
        { to: "/schedule", label: "Create Schedule", icon: "\u{1F5D3}" },
        { to: "/cabin-service", label: "Cabin Service", icon: "\u{1F9F3}" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "\u{1F4C1}",
        },
        { to: "/approvals", label: "Approvals", icon: "\u{2705}" },
        { to: "/drafts", label: "Draft Schedules", icon: "\u{1F4DD}" },
        { to: "/approved", label: "Approved Schedules", icon: "\u{1F4CC}" },
        { to: "/returned", label: "Returned Schedules", icon: "\u{21A9}" },
        { to: "/weekly-summary", label: "Weekly Summary", icon: "\u{1F4CA}" }
      );

      timeoff.push(
        {
          to: "/timeoff-requests",
          label: "Day Off Requests",
          icon: "\u{1F334}",
          showDot: pendingTimeOff > 0,
        },
        { to: "/blocked", label: "Blocked Employees", icon: "\u{1F6AB}" }
      );

      admin.push(
        {
          to: "/employee-announcements",
          label: "Crew Announcements",
          icon: "\u{1F4E3}",
        },
        {
          to: "/dashboard-editor",
          label: "Dashboard Editor",
          icon: "\u{1F39B}",
        },
        { to: "/budgets", label: "Budgets", icon: "\u{1F4B0}" },
        {
          to: "/monthly-budgets-vs-actual",
          label: "Monthly Budgets vs Actual",
          icon: "\u{1F4C8}",
        }
      );
    }

    if (canAccessCabinServiceOnlyManager) {
      schedules.push(
        { to: "/cabin-service", label: "Cabin Service", icon: "\u{1F9F3}" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "\u{1F4C1}",
        }
      );
    }

    if (user?.role === "station_manager") {
      admin.push(
        {
          to: "/admin/activity-dashboard",
          label: "User Activity",
          icon: "\u{1F4C8}",
        },
        {
          to: "/admin/privacy-acknowledgments",
          label: "Privacy Acknowledgments",
          icon: "\u{1F510}",
        },
        {
          to: "/admin/reports-data-management",
          label: "Reports Data Management",
          icon: "\u{1F5C3}",
        },
        {
          to: "/create-user",
          label: "Create User",
          icon: "\u{2795}",
        },
        {
          to: "/edit-users",
          label: "Manage Users",
          icon: "\u{2699}",
        },
        {
          to: "/employees",
          label: "Employees",
          icon: "\u{1F465}",
        }
      );
    }

    if (isAgentOrSupervisor) {
      schedules.push({
        to: "/my-schedule",
        label: "My Schedule",
        icon: "\u{1F4C5}",
      });

      timeoff.push(
        {
          to: "/request-dayoff-internal",
          label: "Request Day Off",
          icon: "\u{1F6EB}",
        },
        {
          to: "/dayoff-status-internal",
          label: "My Day Off Status",
          icon: "\u{1F4CD}",
        }
      );
    }

    if (canAccessTimesheets) {
      submissionReports.push({
        to: "/timesheets/submit",
        label: "Timesheet Submit",
        icon: "\u{1F552}",
      });
    }

    if (canAccessOperationalReports) {
      submissionReports.push(
        {
          to: "/operational-report/submit",
          label: "Supervisor Report",
          icon: "\u{1F4DD}",
        },
        {
          to: "/cleaning-security/submit",
          label: "Cleaning & Security Report",
          icon: "\u{1F9FC}",
        }
      );
    }

    if (canSubmitRegulatedGarbage) {
      submissionReports.push({
        to: "/regulated-garbage/submit",
        label: "Regulated Garbage",
        icon: "\u{1F5D1}",
      });
    }

    if (canSubmitOperationsRequests) {
      submissionReports.push({
        to: "/operations-requests/submit",
        label: isAgent
          ? "Supplies / Uniform Requests"
          : "Supplies, Uniform & OT Requests",
        icon: "\u{1F4E6}",
      });
    }

    if (canSubmitWchrPoi) {
      submissionReports.push({
        to: "/wchr-poi/submit",
        label: "WCHR POI",
        icon: "\u{1F9BD}",
      });
    }

    if (canSubmitEmployeePerformance) {
      submissionReports.push({
        to: "/employee-performance-report",
        label: "Monthly Employee Performance",
        icon: "\u{2B50}",
      });
    }

    if (canSubmitGateChecklist) {
      submissionReports.push({
        to: "/gate-checklist",
        label: "Gate Checklist",
        icon: "\u{1F6EC}",
      });
    }

    if (canSubmitFuel) {
      submissionReports.push({
        to: "/fuel-entry",
        label: "Fuel Entry",
        icon: "\u{26FD}",
      });
    }

    if (canSubmitCierreVuelo) {
      submissionReports.push({
        to: "/cierre-vuelo",
        label: "Cierre de Vuelo",
        icon: "\u{2708}",
      });
    }

    if (canAccessTimesheets) {
      managementReports.push({
        to: "/timesheets/reports",
        label: "Timesheet Reports",
        icon: "\u{1F4CB}",
      });
    }

    if (canAccessOperationalReportAdmin) {
      managementReports.push({
        to: "/operational-report/reports",
        label:
          user?.role === "supervisor"
            ? "Supervisor Operational Reports"
            : "Operational Reports",
        icon: "\u{1F4D1}",
      });
    }

    if (canManageRegulatedGarbage) {
      managementReports.push({
        to: "/regulated-garbage/reports",
        label: "Regulated Garbage Reports",
        icon: "\u{1F5D1}",
      });
    }

    if (
      user?.role === "duty_manager" ||
      user?.role === "station_manager"
    ) {
      managementReports.push({
        to: "/cleaning-security/reports",
        label: "Cleaning & Security Reports",
        icon: "\u{1F5C2}",
      });
    }

    if (canManageOperationsRequests) {
      managementReports.push({
        to: "/operations-requests/reports",
        label: "Operations Requests Reports",
        icon: "\u{1F4E6}",
      });
    }

    if (canManageWchrPoi) {
      managementReports.push({
        to: "/wchr-poi/reports",
        label: "WCHR POI Reports",
        icon: "\u{1F9BD}",
      });
    }

    if (canManageEmployeePerformance) {
      managementReports.push({
        to: "/employee-performance-management",
        label: "Employee Performance Reports",
        icon: "\u{1F4C2}",
      });
    }

    if (canManageGateChecklist) {
      managementReports.push({
        to: "/gate-checklist-management",
        label: "Gate Checklist Management",
        icon: "\u{1F4CA}",
      });
    }

    if (canManageFuel) {
      managementReports.push({
        to: "/fuel-management",
        label: "Fuel Management",
        icon: "\u{26FD}",
      });
    }

    if (canManageCierreVuelo) {
      managementReports.push({
        to: "/cierre-vuelo-management",
        label: "Cierre de Vuelo Reports",
        icon: "\u{1F4D8}",
      });
    }

    if (canAccessWchrTools) {
      wchr.push(
        {
          to: "/wchr/scan",
          label: "Scan Boarding Pass",
          icon: "\u{1F3AB}",
        },
        {
          to: "/wchr/my-reports",
          label: "My Reports",
          icon: "\u{1F4C4}",
        }
      );
    }

    if (canAccessWchrFlightReport) {
      wchr.push({
        to: "/wchr/admin/flights",
        label: "WCHR Flight Report",
        icon: "\u{267F}",
      });
    }

    if (canAccessWchrMonthlyClose) {
      wchr.push({
        to: "/wchr/monthly-close",
        label: "WCHR Billing & Monthly Close",
        icon: "\u{1F4CA}",
      });
    }

    if (canManageOperationalReportForm) {
      admin.push({
        to: "/operational-report/form-builder",
        label: "Operational Report Builder",
        icon: "\u{1F9E9}",
      });
    }

    if (general.length) {
      sections.push({ title: "General", items: general });
    }

    if (schedules.length) {
      sections.push({ title: "Schedules", items: schedules });
    }

    if (submissionReports.length) {
      sections.push({
        title: "Submission of Reports",
        items: submissionReports,
      });
    }

    if (managementReports.length) {
      sections.push({
        title: "Management of Reports",
        items: managementReports,
      });
    }

    if (timeoff.length) {
      sections.push({ title: "Time Off", items: timeoff });
    }

    if (wchr.length) {
      sections.push({ title: "WCHR", items: wchr });
    }

    if (admin.length) {
      sections.push({ title: "Admin", items: admin });
    }

    return sections;
  }, [
    canAccessRegularManagerSchedules,
    canAccessCabinServiceOnlyManager,
    isAgentOrSupervisor,
    canAccessTimesheets,
    canAccessOperationalReports,
    canAccessOperationalReportAdmin,
    canManageOperationalReportForm,
    canAccessWchrTools,
    canAccessWchrFlightReport,
    canAccessWchrMonthlyClose,
    canSubmitOperationsRequests,
    canManageOperationsRequests,
    canSubmitWchrPoi,
    canManageWchrPoi,
    canSubmitRegulatedGarbage,
    canManageRegulatedGarbage,
    canSubmitEmployeePerformance,
    canManageEmployeePerformance,
    canSubmitGateChecklist,
    canManageGateChecklist,
    canSubmitFuel,
    canManageFuel,
    canSubmitCierreVuelo,
    canManageCierreVuelo,
    unreadMessages,
    unreadNotifications,
    pendingTimeOff,
    user,
    isAgent,
  ]);

  // ============================================================
  // MENU SEARCH
  // ============================================================

  const filteredNavSections = useMemo(() => {
    const search = navSearch.trim().toLowerCase();

    if (!search) {
      return navSections;
    }

    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${item.label} ${section.title}`.toLowerCase().includes(search)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [navSections, navSearch]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #eef6ff 0%, #f4faff 45%, #f8fcff 100%)",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid #e2e8f0",
          boxShadow: "0 10px 28px rgba(15,23,42,0.08)",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                flex: "0 0 46px",
                borderRadius: 15,
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                boxShadow: "0 10px 24px rgba(23,105,170,0.16)",
                border: "1px solid #dbeafe",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <div
              style={{
                minWidth: 0,
                paddingRight: 4,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#1769aa",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                {APP_NAME}
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#94a3b8",
                  lineHeight: 1.25,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>

            <div
              aria-hidden="true"
              style={{
                width: 1,
                height: 40,
                background: "#e2e8f0",
                margin: "0 2px",
              }}
            />

            <div
              style={{
                width: 42,
                height: 42,
                flex: "0 0 42px",
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                overflow: "hidden",
                boxShadow: "0 8px 18px rgba(23,105,170,0.18)",
              }}
            >
              {profilePhotoURL ? (
                <img
                  src={profilePhotoURL}
                  alt={visibleName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                getInitials(visibleName)
              )}
            </div>

            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.25,
                }}
              >
                {visibleName}
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748b",
                  lineHeight: 1.25,
                }}
              >
                {visiblePosition}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {(user?.role === "station_manager" ||
              user?.role === "duty_manager") && (
              <OperationalAlertBell
                value={operationalAlerts}
                onClick={() => navigate("/dashboard")}
              />
            )}

            <StatusPill
              label="Messages"
              value={unreadMessages}
              active={unreadMessages > 0}
              onClick={() => navigate("/messages")}
              title={
                unreadMessages > 0
                  ? `${unreadMessages} unread conversation${
                      unreadMessages === 1 ? "" : "s"
                    }. Open Messages.`
                  : "Open Messages"
              }
            />
            <StatusPill label="Notifications" value={unreadNotifications} />
            <StatusPill label="Day Off" value={pendingTimeOff} />

            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              style={topButtonStyle}
            >
              {menuOpen ? "Close Menu" : "Menu"}
            </button>

            <button
              type="button"
              onClick={logout}
              style={logoutButtonStyle}
            >
              Logout
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            style={{
              padding: "0 16px 16px",
              display: "grid",
              gap: 12,
              maxHeight: "72vh",
              overflowY: "auto",
            }}
          >
            <input
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Search menu..."
              style={searchInputStyle}
            />

            {filteredNavSections.map((section) => (
              <div
                key={section.title}
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: 10,
                  }}
                >
                  {section.title}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 8,
                  }}
                >
                  {section.items.map((item) => (
                    <TopNavItem key={item.to} {...item} />
                  ))}
                </div>
              </div>
            ))}

            {filteredNavSections.length === 0 && (
              <div style={emptySearchStyle}>
                No menu items found.
              </div>
            )}
          </div>
        )}
      </header>

      <main
        style={{
          width: "100%",
          maxWidth: 1600,
          margin: "0 auto",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

// ============================================================
// OPERATIONAL ALERT BELL
// ============================================================

function OperationalAlertBell({ value, onClick }) {
  const hasAlerts = Number(value || 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        hasAlerts
          ? `${value} active operational alert${value === 1 ? "" : "s"}`
          : "No active operational alerts"
      }
      style={{
        position: "relative",
        minWidth: 58,
        minHeight: 48,
        border: hasAlerts
          ? "1px solid #fecaca"
          : "1px solid #d7e9fb",
        background: hasAlerts ? "#fff1f2" : "#f8fbff",
        color: hasAlerts ? "#b91c1c" : "#1769aa",
        borderRadius: 14,
        padding: "8px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        boxSizing: "border-box",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        {"\u{1F6A8}"}
      </span>

      {hasAlerts && (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: "0 6px",
            borderRadius: 999,
            background: "#dc2626",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 900,
            lineHeight: 1,
            boxShadow: "0 4px 10px rgba(220,38,38,0.24)",
          }}
        >
          {value > 99 ? "99+" : value}
        </span>
      )}
    </button>
  );
}

// ============================================================
// STATUS PILL
// ============================================================

function StatusPill({
  label,
  value,
  active = false,
  onClick,
  title = "",
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <>
      <style>
        {`
          @keyframes aerostationMessagePulse {
            0%, 100% {
              transform: translateY(0) scale(1);
              box-shadow: 0 8px 22px rgba(220, 38, 38, 0.16);
            }
            50% {
              transform: translateY(-1px) scale(1.025);
              box-shadow: 0 12px 28px rgba(220, 38, 38, 0.30);
            }
          }
        `}
      </style>

      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={onClick}
        title={title || undefined}
        style={{
          position: "relative",
          appearance: "none",
          WebkitAppearance: "none",
          textAlign: "left",
          background: active
            ? "linear-gradient(135deg, #fff1f2 0%, #ffffff 52%, #eaf6ff 100%)"
            : "#f8fbff",
          border: active
            ? "1px solid #fca5a5"
            : "1px solid #d7e9fb",
          borderRadius: 14,
          padding: "8px 10px",
          minWidth: 92,
          minHeight: 48,
          cursor: onClick ? "pointer" : "default",
          fontFamily: "inherit",
          animation: active
            ? "aerostationMessagePulse 1.8s ease-in-out infinite"
            : "none",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {active && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 7,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#dc2626",
              boxShadow: "0 0 0 4px rgba(220,38,38,0.10)",
            }}
          />
        )}

        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: active ? "#b91c1c" : "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            paddingRight: active ? 14 : 0,
          }}
        >
          {label}
        </div>

        <div
          style={{
            marginTop: 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: active ? "#b91c1c" : "#0f172a",
            }}
          >
            {value}
          </div>

          {active && (
            <span
              aria-hidden="true"
              style={{
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              {"\u{1F4AC}"}
            </span>
          )}
        </div>
      </Wrapper>
    </>
  );
}

// ============================================================
// NAV ITEM
// ============================================================

function TopNavItem({ to, label, showDot, icon }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 14,
        textDecoration: "none",
        fontSize: 14,
        fontWeight: isActive ? 900 : 700,
        color: isActive ? "#0f4c81" : "#334155",
        background: isActive
          ? "linear-gradient(135deg, #dff0ff 0%, #eef8ff 100%)"
          : "#ffffff",
        border: isActive
          ? "1px solid #bfe0fb"
          : "1px solid #e2e8f0",
      })}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </span>

      {showDot && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "#ef4444",
          }}
        />
      )}
    </NavLink>
  );
}

// ============================================================
// STYLES
// ============================================================

const topButtonStyle = {
  border: "1px solid #cfe7fb",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 14,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const logoutButtonStyle = {
  border: "none",
  background:
    "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
  color: "#fff",
  borderRadius: 14,
  padding: "10px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const searchInputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  background: "#f8fbff",
  color: "#0f172a",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 700,
  outline: "none",
  boxSizing: "border-box",
};

const emptySearchStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  color: "#64748b",
  borderRadius: 18,
  padding: 16,
  fontWeight: 800,
  textAlign: "center",
};

// END AppLayout
