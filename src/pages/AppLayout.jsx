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
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

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

export default function AppLayout() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingTimeOff, setPendingTimeOff] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");

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
  // UNREAD MESSAGES
  // ============================================================

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

  // ============================================================
  // UNREAD NOTIFICATIONS
  // ============================================================

  useEffect(() => {
    if (!user?.id) return;

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
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
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
      { to: "/dashboard", label: "Dashboard", icon: "ð " },
      { to: "/profile", label: "My Profile", icon: "ð¤" },
      { to: "/station-team", label: "Station Team", icon: "ð§âð¤âð§" },
      {
        to: "/messages",
        label: "Messages",
        icon: "ð¬",
        showDot: unreadMessages > 0,
      },
      {
        to: "/notifications",
        label: "Notifications",
        icon: "ð",
        showDot: unreadNotifications > 0,
      },
    ];

    const schedules = [];
    const submissionReports = [];
    const managementReports = [];
    const timeoff = [];
    const wchr = [];
    const admin = [];

    // MANAGER SCHEDULES

    if (canAccessRegularManagerSchedules) {
      schedules.push(
        { to: "/schedule", label: "Create Schedule", icon: "ðï¸" },
        { to: "/cabin-service", label: "Cabin Service", icon: "ð§³" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "ð",
        },
        { to: "/approvals", label: "Approvals", icon: "â" },
        { to: "/drafts", label: "Draft Schedules", icon: "ð" },
        { to: "/approved", label: "Approved Schedules", icon: "ð" },
        { to: "/returned", label: "Returned Schedules", icon: "â©ï¸" },
        { to: "/weekly-summary", label: "Weekly Summary", icon: "ð" }
      );

      timeoff.push(
        {
          to: "/timeoff-requests",
          label: "Day Off Requests",
          icon: "ð´",
          showDot: pendingTimeOff > 0,
        },
        { to: "/blocked", label: "Blocked Employees", icon: "ð«" }
      );

      admin.push(
        {
          to: "/employee-announcements",
          label: "Crew Announcements",
          icon: "ð£",
        },
        {
          to: "/dashboard-editor",
          label: "Dashboard Editor",
          icon: "ðï¸",
        },
        { to: "/budgets", label: "Budgets", icon: "ð°" },
        {
          to: "/monthly-budgets-vs-actual",
          label: "Monthly Budgets vs Actual",
          icon: "ð",
        }
      );
    }

    // CABIN SERVICE MANAGER

    if (canAccessCabinServiceOnlyManager) {
      schedules.push(
        { to: "/cabin-service", label: "Cabin Service", icon: "ð§³" },
        {
          to: "/cabin-saved-schedules",
          label: "Cabin Service Saved Schedules",
          icon: "ð",
        }
      );
    }

    // STATION MANAGER ADMIN

    if (user?.role === "station_manager") {
      admin.push(
        {
          to: "/admin/activity-dashboard",
          label: "User Activity",
          icon: "ð",
        },
        {
          to: "/admin/privacy-acknowledgments",
          label: "Privacy Acknowledgments",
          icon: "ð",
        },

        {
          to: "/admin/reports-data-management",
          label: "Reports Data Management",
          icon: "ðï¸",
        },

        {
          to: "/create-user",
          label: "Create User",
          icon: "â",
        },
        {
          to: "/edit-users",
          label: "Manage Users",
          icon: "âï¸",
        },
        {
          to: "/employees",
          label: "Employees",
          icon: "ð¥",
        }
      );
    }

    // AGENT / SUPERVISOR SCHEDULES

    if (isAgentOrSupervisor) {
      schedules.push({
        to: "/my-schedule",
        label: "My Schedule",
        icon: "ð",
      });

      timeoff.push(
        {
          to: "/request-dayoff-internal",
          label: "Request Day Off",
          icon: "ð«",
        },
        {
          to: "/dayoff-status-internal",
          label: "My Day Off Status",
          icon: "ð",
        }
      );
    }

    // SUBMISSION OF REPORTS

    if (canAccessTimesheets) {
      submissionReports.push({
        to: "/timesheets/submit",
        label: "Timesheet Submit",
        icon: "ð",
      });
    }

    if (canAccessOperationalReports) {
      submissionReports.push(
        {
          to: "/operational-report/submit",
          label: "Supervisor Report",
          icon: "ð",
        },
        {
          to: "/cleaning-security/submit",
          label: "Cleaning & Security Report",
          icon: "ð§¼",
        }
      );
    }

    if (canSubmitRegulatedGarbage) {
      submissionReports.push({
        to: "/regulated-garbage/submit",
        label: "Regulated Garbage",
        icon: "ðï¸",
      });
    }

    if (canSubmitOperationsRequests) {
      submissionReports.push({
        to: "/operations-requests/submit",
        label: isAgent
          ? "Supplies / Uniform Requests"
          : "Supplies, Uniform & OT Requests",
        icon: "ð¦",
      });
    }

    if (canSubmitWchrPoi) {
      submissionReports.push({
        to: "/wchr-poi/submit",
        label: "WCHR POI",
        icon: "ð¦½",
      });
    }

    if (canSubmitEmployeePerformance) {
      submissionReports.push({
        to: "/employee-performance-report",
        label: "Monthly Employee Performance",
        icon: "â­",
      });
    }

    if (canSubmitGateChecklist) {
      submissionReports.push({
        to: "/gate-checklist",
        label: "Gate Checklist",
        icon: "ð¬",
      });
    }

    if (canSubmitFuel) {
      submissionReports.push({
        to: "/fuel-entry",
        label: "Fuel Entry",
        icon: "â½",
      });
    }

    if (canSubmitCierreVuelo) {
      submissionReports.push({
        to: "/cierre-vuelo",
        label: "Cierre de Vuelo",
        icon: "âï¸",
      });
    }

    // MANAGEMENT OF REPORTS

    if (canAccessTimesheets) {
      managementReports.push({
        to: "/timesheets/reports",
        label: "Timesheet Reports",
        icon: "ð",
      });
    }

    if (canAccessOperationalReportAdmin) {
      managementReports.push({
        to: "/operational-report/reports",
        label:
          user?.role === "supervisor"
            ? "Supervisor Operational Reports"
            : "Operational Reports",
        icon: "ð",
      });
    }

    if (canManageRegulatedGarbage) {
      managementReports.push({
        to: "/regulated-garbage/reports",
        label: "Regulated Garbage Reports",
        icon: "ðï¸",
      });
    }

    if (
      user?.role === "duty_manager" ||
      user?.role === "station_manager"
    ) {
      managementReports.push({
        to: "/cleaning-security/reports",
        label: "Cleaning & Security Reports",
        icon: "ðï¸",
      });
    }

    if (canManageOperationsRequests) {
      managementReports.push({
        to: "/operations-requests/reports",
        label: "Operations Requests Reports",
        icon: "ð¦",
      });
    }

    if (canManageWchrPoi) {
      managementReports.push({
        to: "/wchr-poi/reports",
        label: "WCHR POI Reports",
        icon: "ð¦½",
      });
    }

    if (canManageEmployeePerformance) {
      managementReports.push({
        to: "/employee-performance-management",
        label: "Employee Performance Reports",
        icon: "ð",
      });
    }

    if (canManageGateChecklist) {
      managementReports.push({
        to: "/gate-checklist-management",
        label: "Gate Checklist Management",
        icon: "ð",
      });
    }

    if (canManageFuel) {
      managementReports.push({
        to: "/fuel-management",
        label: "Fuel Management",
        icon: "â½",
      });
    }

    if (canManageCierreVuelo) {
      managementReports.push({
        to: "/cierre-vuelo-management",
        label: "Cierre de Vuelo Reports",
        icon: "ð",
      });
    }

    // WCHR

    if (canAccessWchrTools) {
      wchr.push(
        {
          to: "/wchr/scan",
          label: "Scan Boarding Pass",
          icon: "ð«",
        },
        {
          to: "/wchr/my-reports",
          label: "My Reports",
          icon: "ð",
        }
      );
    }

    if (canAccessWchrFlightReport) {
      wchr.push({
        to: "/wchr/admin/flights",
        label: "WCHR Flight Report",
        icon: "â¿",
      });
    }

    if (canAccessWchrMonthlyClose) {
      wchr.push({
        to: "/wchr/monthly-close",
        label: "WCHR Billing & Monthly Close",
        icon: "ð",
      });
    }

    // OPERATIONAL REPORT BUILDER

    if (canManageOperationalReportForm) {
      admin.push({
        to: "/operational-report/form-builder",
        label: "Operational Report Builder",
        icon: "ð§©",
      });
    }

    // BUILD SECTIONS

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
            {/* PRODUCT BRAND */}
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

            {/* PRODUCT NAME */}
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

            {/* DIVIDER */}
            <div
              aria-hidden="true"
              style={{
                width: 1,
                height: 40,
                background: "#e2e8f0",
                margin: "0 2px",
              }}
            />

            {/* USER PROFILE */}
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
            <StatusPill label="Messages" value={unreadMessages} />
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
// STATUS PILL
// ============================================================

function StatusPill({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #d7e9fb",
        borderRadius: 14,
        padding: "8px 10px",
        minWidth: 92,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 16,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {value}
      </div>
    </div>
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
