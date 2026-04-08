import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../UserContext.jsx";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import {
  updateUserPresence,
  updateUserPage,
  markUserOffline,
} from "../services/presenceService";

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
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getStoredBoolean(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true";
  } catch {
    return fallback;
  }
}

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  const [headerCollapsed, setHeaderCollapsed] = useState(() =>
    getStoredBoolean("tpa_header_collapsed", false)
  );

  const [openSections, setOpenSections] = useState({
    General: true,
    Schedules: true,
    "Submission of Reports": true,
    "Management of Reports": true,
    "Time Off": false,
    WCHR: true,
    Admin: false,
  });

  const visibleName = useMemo(() => getVisibleName(user), [user]);
  const visiblePosition = useMemo(() => getVisiblePosition(user), [user]);
  const profilePhotoURL = user?.profilePhotoURL || "";

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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("tpa_header_collapsed", String(headerCollapsed));
    } catch {
      // ignore
    }
  }, [headerCollapsed]);

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

  useEffect(() => {
    if (!user?.id) return;

    const qMsgs = query(
      collection(db, "messages"),
      where("toUserId", "==", user.id),
      where("read", "==", false)
    );

    const unsub = onSnapshot(
      qMsgs,
      (snap) => setUnreadMessages(snap.size),
      (err) => console.error("Error listening unread messages:", err)
    );

    return () => unsub();
  }, [user?.id]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.id) return;

    updateUserPresence(user, {
      currentPage: location.pathname,
    }).catch((err) => console.error("Error updating user presence:", err));
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;

    updateUserPage(user, location.pathname).catch((err) =>
      console.error("Error updating current page:", err)
    );
  }, [location.pathname, user]);

  useEffect(() => {
    if (!user?.id) return;

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
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, location.pathname]);

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

  const isManager =
    user?.role === "station_manager" || user?.role === "duty_manager";

  const isAgent = user?.role === "agent";
  const isAgentOrSupervisor =
    user?.role === "agent" || user?.role === "supervisor";

  const canAccessRegularManagerSchedules = isManager && !isHhernandez;

  const canAccessCabinServiceOnlyManager =
    user?.role === "duty_manager" && isHhernandez;

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

  const canManageOperationalReportForm = user?.role === "station_manager";

  const canSubmitOperationsRequests =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageOperationsRequests =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canSubmitWchrPoi =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageWchrPoi =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canSubmitRegulatedGarbage =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageRegulatedGarbage =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canAccessWchrTools =
    !isDLCabinService &&
    (user?.role === "agent" ||
      user?.role === "supervisor" ||
      user?.role === "duty_manager" ||
      user?.role === "station_manager");

  const canSubmitEmployeePerformance =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageEmployeePerformance =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canSubmitGateChecklist =
    user?.role === "agent" ||
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canManageGateChecklist =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const navSections = useMemo(() => {
    const sections = [];

    const general = [
      { to: "/dashboard", label: "Dashboard", icon: "🏠" },
      { to: "/profile", label: "My Profile", icon: "👤" },
      { to: "/station-team", label: "Station Team", icon: "🧑‍🤝‍🧑" },
      {
        to: "/messages",
        label: "Messages",
        icon: "💬",
        showDot: unreadMessages > 0,
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
        { to: "/schedule", label: "Create Schedule", icon: "🗓️" },
        { to: "/cabin-service", label: "Cabin Service", icon: "🧳" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "📁",
        },
        { to: "/approvals", label: "Approvals", icon: "✅" },
        { to: "/drafts", label: "Draft Schedules", icon: "📝" },
        { to: "/approved", label: "Approved Schedules", icon: "📌" },
        { to: "/returned", label: "Returned Schedules", icon: "↩️" },
        { to: "/weekly-summary", label: "Weekly Summary", icon: "📊" }
      );

      timeoff.push(
        {
          to: "/timeoff-requests",
          label: "Day Off Requests",
          icon: "🌴",
          showDot: pendingTimeOff > 0,
        },
        { to: "/blocked", label: "Blocked Employees", icon: "🚫" }
      );

      wchr.push({
        to: "/wchr/admin/flights",
        label: "WCHR Close Flight",
        icon: "♿",
      });

      admin.push(
        {
          to: "/employee-announcements",
          label: "Crew Announcements",
          icon: "📣",
        },
        { to: "/dashboard-editor", label: "Dashboard Editor", icon: "🎛️" },
        { to: "/budgets", label: "Budgets", icon: "💰" },
        {
          to: "/monthly-budgets-vs-actual",
          label: "Monthly Budgets vs Actual",
          icon: "📈",
        }
      );
    }

    if (canAccessCabinServiceOnlyManager) {
      schedules.push(
        { to: "/cabin-service", label: "Cabin Service", icon: "🧳" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "📁",
        }
      );
    }

    if (user?.role === "station_manager") {
      admin.push(
        {
          to: "/admin/activity-dashboard",
          label: "User Activity",
          icon: "📈",
        },
        { to: "/create-user", label: "Create User", icon: "➕" },
        { to: "/edit-users", label: "Manage Users", icon: "⚙️" },
        { to: "/employees", label: "Employees", icon: "👥" }
      );
    }

    if (isAgentOrSupervisor) {
      schedules.push({ to: "/my-schedule", label: "My Schedule", icon: "📅" });

      timeoff.push(
        {
          to: "/request-dayoff-internal",
          label: "Request Day Off",
          icon: "🛫",
        },
        {
          to: "/dayoff-status-internal",
          label: "My Day Off Status",
          icon: "📍",
        }
      );
    }

    if (canAccessTimesheets) {
      submissionReports.push({
        to: "/timesheets/submit",
        label: "Timesheet Submit",
        icon: "🕒",
      });
    }

    if (canAccessOperationalReports) {
      submissionReports.push(
        {
          to: "/operational-report/submit",
          label: "Supervisor Report",
          icon: "📝",
        },
        {
          to: "/cleaning-security/submit",
          label: "Cleaning & Security Report",
          icon: "🧼",
        }
      );
    }

    if (canSubmitRegulatedGarbage) {
      submissionReports.push({
        to: "/regulated-garbage/submit",
        label: "Regulated Garbage",
        icon: "🗑️",
      });
    }

    if (canSubmitOperationsRequests) {
      submissionReports.push({
        to: "/operations-requests/submit",
        label: isAgent
          ? "Supplies / Uniform Requests"
          : "Supplies, Uniform & OT Requests",
        icon: "📦",
      });
    }

    if (canSubmitWchrPoi) {
      submissionReports.push({
        to: "/wchr-poi/submit",
        label: "WCHR POI",
        icon: "🦽",
      });
    }

    if (canSubmitEmployeePerformance) {
      submissionReports.push({
        to: "/employee-performance-report",
        label: "Monthly Employee Performance",
        icon: "⭐",
      });
    }

    if (canSubmitGateChecklist) {
      submissionReports.push({
        to: "/gate-checklist",
        label: "Gate Checklist",
        icon: "🛬",
      });
    }

    if (canAccessTimesheets) {
      managementReports.push({
        to: "/timesheets/reports",
        label: "Timesheet Reports",
        icon: "📋",
      });
    }

    if (canAccessOperationalReportAdmin) {
      managementReports.push({
        to: "/operational-report/reports",
        label:
          user?.role === "supervisor"
            ? "Supervisor Operational Reports"
            : "Operational Reports",
        icon: "📑",
      });
    }

    if (canManageRegulatedGarbage) {
      managementReports.push({
        to: "/regulated-garbage/reports",
        label: "Regulated Garbage Reports",
        icon: "🗑️",
      });
    }

    if (user?.role === "duty_manager" || user?.role === "station_manager") {
      managementReports.push({
        to: "/cleaning-security/reports",
        label: "Cleaning & Security Reports",
        icon: "🗂️",
      });
    }

    if (canManageOperationsRequests) {
      managementReports.push({
        to: "/operations-requests/reports",
        label: "Operations Requests Reports",
        icon: "📦",
      });
    }

    if (canManageWchrPoi) {
      managementReports.push({
        to: "/wchr-poi/reports",
        label: "WCHR POI Reports",
        icon: "🦽",
      });
    }

    if (canManageEmployeePerformance) {
      managementReports.push({
        to: "/employee-performance-management",
        label: "Employee Performance Reports",
        icon: "📂",
      });
    }

    if (canManageGateChecklist) {
      managementReports.push({
        to: "/gate-checklist-management",
        label: "Gate Checklist Management",
        icon: "📊",
      });
    }

    if (canAccessWchrTools) {
      wchr.push(
        { to: "/wchr/scan", label: "Scan Boarding Pass", icon: "🎫" },
        { to: "/wchr/my-reports", label: "My Reports", icon: "📄" }
      );
    }

    if (canManageOperationalReportForm) {
      admin.push({
        to: "/operational-report/form-builder",
        label: "Operational Report Builder",
        icon: "🧩",
      });
    }

    if (general.length) sections.push({ title: "General", items: general });
    if (schedules.length) sections.push({ title: "Schedules", items: schedules });
    if (submissionReports.length) {
      sections.push({ title: "Submission of Reports", items: submissionReports });
    }
    if (managementReports.length) {
      sections.push({ title: "Management of Reports", items: managementReports });
    }
    if (timeoff.length) sections.push({ title: "Time Off", items: timeoff });
    if (wchr.length) sections.push({ title: "WCHR", items: wchr });
    if (admin.length) sections.push({ title: "Admin", items: admin });

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
    unreadMessages,
    pendingTimeOff,
    user,
    user?.role,
    isAgent,
  ]);

  const allSectionsOpen = navSections.every(
    (section) => openSections[section.title]
  );

  const toggleSection = (title) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const setAllSections = (isOpen) => {
    const next = {};
    navSections.forEach((section) => {
      next[section.title] = isOpen;
    });
    setOpenSections((prev) => ({
      ...prev,
      ...next,
    }));
  };

  const toggleHeaderCollapsed = () => {
    setHeaderCollapsed((prev) => !prev);
    setMenuOpen(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #eef6ff 0%, #f4faff 45%, #f8fcff 100%)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: headerCollapsed
            ? "8px 10px 0"
            : isMobile
            ? "10px 10px 0"
            : "14px 16px 0",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.84)",
            border: "1px solid rgba(255,255,255,0.96)",
            boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
            borderRadius: headerCollapsed ? 20 : 30,
            padding: headerCollapsed ? (isMobile ? 10 : 12) : 16,
            transition: "all 0.22s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: headerCollapsed ? 10 : 14,
                minWidth: 0,
                flex: "1 1 auto",
              }}
            >
              <div
                style={{
                  width: headerCollapsed ? 42 : 50,
                  height: headerCollapsed ? 42 : 50,
                  borderRadius: headerCollapsed ? 14 : 18,
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: headerCollapsed ? 18 : 22,
                  boxShadow: "0 10px 24px rgba(23,105,170,0.25)",
                  flexShrink: 0,
                  overflow: "hidden",
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
                  <span>{getInitials(visibleName)}</span>
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: headerCollapsed ? 11 : 12,
                    fontWeight: 800,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#1769aa",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  TPA OPS SYSTEM
                </p>
                <p
                  style={{
                    margin: headerCollapsed ? "2px 0 0" : "4px 0 0",
                    fontSize: headerCollapsed ? 13 : 14,
                    color: "#0f172a",
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {visibleName}
                </p>
                {!headerCollapsed && (
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12,
                      color: "#64748b",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {visiblePosition}
                  </p>
                )}
              </div>
            </div>

            {isMobile ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={toggleHeaderCollapsed}
                  style={mobileActionButtonStyle("secondary")}
                >
                  {headerCollapsed ? "Show" : "Hide"}
                </button>

                {!headerCollapsed && (
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    style={mobileActionButtonStyle("primary")}
                  >
                    {menuOpen ? "Close" : "Menu"}
                  </button>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {!headerCollapsed && (
                  <>
                    <StatusPill label="Unread Messages" value={unreadMessages} />
                    <StatusPill label="Pending Day Off" value={pendingTimeOff} />
                  </>
                )}

                <button
                  onClick={toggleHeaderCollapsed}
                  style={{
                    border: "1px solid #cfe7fb",
                    background: "#ffffff",
                    color: "#1769aa",
                    borderRadius: 14,
                    padding: headerCollapsed ? "10px 12px" : "11px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {headerCollapsed ? "Show Menu" : "Hide Menu"}
                </button>

                <button
                  onClick={logout}
                  style={{
                    border: "none",
                    background:
                      "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                    color: "#fff",
                    borderRadius: 14,
                    padding: headerCollapsed ? "10px 14px" : "11px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 10px 24px rgba(23,105,170,0.22)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {!isMobile && !headerCollapsed && (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => setAllSections(!allSectionsOpen)}
                  style={smallUtilityButtonStyle}
                >
                  {allSectionsOpen ? "Collapse All" : "Expand All"}
                </button>
              </div>

              {navSections.map((section) => (
                <div
                  key={section.title}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleSection(section.title)}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "#f8fbff",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#1769aa",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    <span>{section.title}</span>
                    <span>{openSections[section.title] ? "−" : "+"}</span>
                  </button>

                  {openSections[section.title] && (
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        padding: 12,
                      }}
                    >
                      {section.items.map((item) => (
                        <TopNavItem key={item.to} {...item} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isMobile && menuOpen && !headerCollapsed && (
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gap: 12,
                paddingTop: 12,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <StatusPill label="Unread Messages" value={unreadMessages} />
                <StatusPill label="Pending Day Off" value={pendingTimeOff} />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => setAllSections(!allSectionsOpen)}
                  style={smallUtilityButtonStyle}
                >
                  {allSectionsOpen ? "Collapse All" : "Expand All"}
                </button>
              </div>

              {navSections.map((section) => (
                <div
                  key={section.title}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 18,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleSection(section.title)}
                    style={{
                      width: "100%",
                      border: "none",
                      background: "#f8fbff",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#1769aa",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    <span>{section.title}</span>
                    <span>{openSections[section.title] ? "−" : "+"}</span>
                  </button>

                  {openSections[section.title] && (
                    <div style={{ display: "grid", gap: 8, padding: 12 }}>
                      {section.items.map((item) => (
                        <TopNavItem key={item.to} {...item} mobile />
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={logout}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "12px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <main
        style={{
          padding: isMobile
            ? "12px 10px 18px"
            : headerCollapsed
            ? "12px 12px 24px"
            : "16px",
          maxWidth: headerCollapsed ? "100%" : 1600,
          width: "100%",
          margin: "0 auto",
          transition: "all 0.22s ease",
        }}
      >
        {headerCollapsed && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 10,
            }}
          >
            <button
              onClick={toggleHeaderCollapsed}
              style={{
                border: "1px solid #cfe7fb",
                background: "rgba(255,255,255,0.92)",
                color: "#1769aa",
                borderRadius: 14,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 10px 24px rgba(23,105,170,0.10)",
              }}
            >
              Show Top Menu
            </button>
          </div>
        )}

        <Outlet />
      </main>
    </div>
  );
}

function StatusPill({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #d7e9fb",
        borderRadius: 14,
        padding: "10px 12px",
        minWidth: 130,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 18,
          fontWeight: 800,
          color: "#0f172a",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TopNavItem({ to, label, showDot, icon, mobile = false }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: mobile ? "12px 14px" : "10px 14px",
        borderRadius: 14,
        textDecoration: "none",
        fontSize: mobile ? 15 : 14,
        fontWeight: isActive ? 800 : 600,
        color: isActive ? "#0f4c81" : "#334155",
        background: isActive
          ? "linear-gradient(135deg, #dff0ff 0%, #eef8ff 100%)"
          : "#ffffff",
        border: isActive ? "1px solid #bfe0fb" : "1px solid #e2e8f0",
        boxShadow: isActive ? "0 10px 22px rgba(23,105,170,0.10)" : "none",
        minWidth: mobile ? "auto" : "fit-content",
        whiteSpace: mobile ? "normal" : "nowrap",
        flexShrink: 0,
        minHeight: mobile ? 48 : "auto",
      })}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span>{label}</span>
      </span>

      {showDot && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "#ef4444",
            boxShadow: "0 0 0 4px rgba(239,68,68,0.12)",
            flexShrink: 0,
          }}
        />
      )}
    </NavLink>
  );
}

const smallUtilityButtonStyle = {
  border: "1px solid #cfe7fb",
  background: "#ffffff",
  color: "#1769aa",
  borderRadius: 12,
  padding: "9px 12px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

function mobileActionButtonStyle(kind) {
  if (kind === "primary") {
    return {
      border: "none",
      background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
      color: "#fff",
      borderRadius: 14,
      padding: "11px 14px",
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 10px 24px rgba(23,105,170,0.22)",
    };
  }

  return {
    border: "1px solid #cfe7fb",
    background: "#ffffff",
    color: "#1769aa",
    borderRadius: 14,
    padding: "11px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };
}
