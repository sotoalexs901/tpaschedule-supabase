// src/main.jsx

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";

import { UserProvider, useUser } from "./UserContext.jsx";

import {
  activateAeroStationUpdate,
  checkAeroStationServiceWorkerUpdate,
  AEROSTATION_PWA_UPDATE_EVENT,
  AEROSTATION_PWA_CONTROLLER_EVENT,
} from "./services/pwaService.js";

import { APP_NAME } from "./config/appConfig.js";

import LoginPage from "./pages/LoginPage.jsx";
import AppLayout from "./pages/AppLayout.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import PrivacyAcknowledgmentsPage from "./pages/PrivacyAcknowledgmentsPage.jsx";
import ReportsDataManagementPage from "./pages/ReportsDataManagementPage.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";
import DashboardEditorPage from "./pages/DashboardEditorPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import BlockedEmployeesPage from "./pages/BlockedEmployeesPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import ApprovedSchedulesPage from "./pages/ApprovedSchedulesPage.jsx";
import ApprovedScheduleView from "./pages/ApprovedScheduleView.jsx";
import BudgetsPage from "./pages/BudgetsPage.jsx";
import MonthlyBudgetsVsActualPage from "./pages/MonthlyBudgetsVsActualPage.jsx";
import CreateUserPage from "./pages/CreateUserPage.jsx";
import EditUsersPage from "./pages/EditUsersPage.jsx";
import WeeklyEmployeesSummaryPage from "./pages/WeeklyEmployeesSummaryPage.jsx";
import ReturnedSchedulesPage from "./pages/ReturnedSchedulesPage.jsx";
import DraftSchedulesPage from "./pages/DraftSchedulesPage.jsx";

import TimeOffRequestPage from "./pages/TimeOffRequestPage.jsx";
import TimeOffRequestsAdminPage from "./pages/TimeOffRequestsAdminPage.jsx";
import TimeOffStatusPublicPage from "./pages/TimeOffStatusPublicPage.jsx";
import EmployeeDashboardPage from "./pages/EmployeeDashboardPage.jsx";
import MySchedulePage from "./pages/MySchedulePage.jsx";
import CrewAnnouncementsPage from "./pages/CrewAnnouncementsPage.jsx";
import EmployeeTimeOffRequestPage from "./pages/EmployeeTimeOffRequestPage.jsx";
import EmployeeTimeOffStatusPage from "./pages/EmployeeTimeOffStatusPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AdminActivityDashboard from "./pages/AdminActivityDashboard.jsx";
import StationTeamPage from "./pages/StationTeamPage.jsx";

import SupervisorTimesheetPage from "./pages/SupervisorTimesheetPage.jsx";
import TimesheetAdminPage from "./pages/TimesheetAdminPage.jsx";

import SupervisorOperationalReportPage from "./pages/SupervisorOperationalReportPage.jsx";
import OperationalReportAdminPage from "./pages/OperationalReportAdminPage.jsx";
import OperationalReportFormBuilderPage from "./pages/OperationalReportFormBuilderPage.jsx";

import WCHRScan from "./pages/WCHRScan.jsx";
import MyWCHRReports from "./pages/MyWCHRReports.jsx";
import WCHRFlights from "./pages/WCHRFlights.jsx";
import WCHRMonthlyClose from "./pages/WCHRMonthlyClose.jsx";

import CabinServicePage from "./pages/CabinServicePage.jsx";
import CabinSavedSchedulesPage from "./pages/CabinSavedSchedulesPage.jsx";
import CabinScheduleViewPage from "./pages/CabinScheduleViewPage.jsx";

import SupervisorCleaningSecurityPage from "./pages/SupervisorCleaningSecurityPage.jsx";
import CleaningSecurityReportsAdminPage from "./pages/CleaningSecurityReportsAdminPage.jsx";

import SupervisorOperationsRequestsPage from "./pages/SupervisorOperationsRequestsPage.jsx";
import OperationsRequestsReportsAdminPage from "./pages/OperationsRequestsReportsAdminPage.jsx";

import SupervisorWchrPoiPage from "./pages/SupervisorWchrPoiPage.jsx";
import WchrPoiReportsAdminPage from "./pages/WchrPoiReportsAdminPage.jsx";

import SupervisorRegulatedGarbagePage from "./pages/SupervisorRegulatedGarbagePage.jsx";
import RegulatedGarbageAdminPage from "./pages/RegulatedGarbageAdminPage.jsx";

import MonthlyEmployeePerformanceReportPage from "./pages/MonthlyEmployeePerformanceReportPage.jsx";
import EmployeePerformanceManagementPage from "./pages/EmployeePerformanceManagementPage.jsx";

import GateChecklistPage from "./pages/GateChecklistPage.jsx";
import GateChecklistManagementPage from "./pages/GateChecklistManagementPage.jsx";

import FuelEntryPage from "./pages/FuelEntryPage.jsx";
import FuelManagementPage from "./pages/FuelManagementPage.jsx";

import CierreVuelo from "./pages/CierreVuelo.jsx";
import CierreVueloManagement from "./pages/CierreVueloManagement.jsx";

// ============================================================
// PROTECTED ROUTE
// ============================================================

function ProtectedRoute({
  children,
  roles,
  blockedDepartments = [],
  allowedUsernames = [],
  blockedUsernames = [],
}) {
  const { user } = useUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const userDepartment = String(user?.department || "")
    .trim()
    .toLowerCase();

  const username = String(user?.username || "")
    .trim()
    .toLowerCase();

  const normalizedBlockedDepartments = blockedDepartments.map((department) =>
    String(department || "").trim().toLowerCase()
  );

  const normalizedAllowedUsernames = allowedUsernames.map((allowedUsername) =>
    String(allowedUsername || "").trim().toLowerCase()
  );

  const normalizedBlockedUsernames = blockedUsernames.map((blockedUsername) =>
    String(blockedUsername || "").trim().toLowerCase()
  );

  if (normalizedBlockedDepartments.includes(userDepartment)) {
    return <Navigate to="/" replace />;
  }

  if (
    normalizedAllowedUsernames.length > 0 &&
    !normalizedAllowedUsernames.includes(username)
  ) {
    return <Navigate to="/" replace />;
  }

  if (normalizedBlockedUsernames.includes(username)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// ============================================================
// DASHBOARD ENTRY
// ============================================================

function DashboardEntry() {
  const { user } = useUser();

  if (user?.role === "agent" || user?.role === "supervisor") {
    return <EmployeeDashboardPage />;
  }

  return <DashboardPage />;
}

// ============================================================
// APP UPDATE PROMPT
// ============================================================

function UpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    const STORAGE_KEY = "aerostation_app_version";

    async function checkVersion() {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();
        const incomingVersion = String(data?.version || "").trim();

        if (!incomingVersion) return;

        const savedVersion = localStorage.getItem(STORAGE_KEY);

        if (!savedVersion) {
          localStorage.setItem(STORAGE_KEY, incomingVersion);
          return;
        }

        if (savedVersion !== incomingVersion) {
          await checkAeroStationServiceWorkerUpdate();

          if (!cancelled) {
            setUpdateReady(true);
            setShowPrompt(true);
          }
        }
      } catch (error) {
        console.error("Version check failed:", error);
      }
    }

    const handleServiceWorkerUpdate = () => {
      if (cancelled) return;

      setUpdateReady(true);
      setShowPrompt(true);
    };

    const handleControllerChange = () => {
      if (cancelled) return;

      window.location.reload();
    };

    window.addEventListener(
      AEROSTATION_PWA_UPDATE_EVENT,
      handleServiceWorkerUpdate
    );

    window.addEventListener(
      AEROSTATION_PWA_CONTROLLER_EVENT,
      handleControllerChange
    );

    checkVersion();
    checkAeroStationServiceWorkerUpdate();

    intervalId = window.setInterval(() => {
      if (!cancelled) {
        checkVersion();
        checkAeroStationServiceWorkerUpdate();
      }
    }, 60000);

    const onFocus = () => {
      if (!cancelled) {
        checkVersion();
        checkAeroStationServiceWorkerUpdate();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        checkVersion();
        checkAeroStationServiceWorkerUpdate();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);

      window.removeEventListener(
        AEROSTATION_PWA_UPDATE_EVENT,
        handleServiceWorkerUpdate
      );

      window.removeEventListener(
        AEROSTATION_PWA_CONTROLLER_EVENT,
        handleControllerChange
      );
    };
  }, []);

  const handleLater = () => {
    setShowPrompt(false);
  };

  const handleRefresh = async () => {
    if (refreshing) return;

    try {
      setRefreshing(true);

      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        const incomingVersion = String(data?.version || "").trim();

        if (incomingVersion) {
          localStorage.setItem(
            "aerostation_app_version",
            incomingVersion
          );
        }
      }
    } catch (error) {
      console.error(
        "Could not save AeroStation Hub version before refresh:",
        error
      );
    }

    try {
      await activateAeroStationUpdate();
    } catch (error) {
      console.error("Could not activate app update:", error);
      window.location.reload();
    }
  };

  return (
    <>
      {updateReady && !showPrompt && (
        <button
          type="button"
          onClick={() => setShowPrompt(true)}
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 9999,
            border: "none",
            background:
              "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
            color: "#fff",
            borderRadius: 999,
            padding: "13px 16px",
            fontWeight: 850,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 16px 30px rgba(23,105,170,0.28)",
          }}
        >
          Update AeroStation
        </button>
      )}

      {showPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.42)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: 18,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.24)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background:
                  "linear-gradient(135deg, #061f3d 0%, #0f4c81 55%, #1769aa 100%)",
                color: "#ffffff",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 850,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                {APP_NAME}
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 19,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                }}
              >
                New update available
              </div>
            </div>

            <div
              style={{
                padding: "20px 20px 16px",
                fontSize: 14,
                lineHeight: 1.65,
                color: "#334155",
                fontWeight: 650,
              }}
            >
              A newer version of AeroStation Hub is ready. Update now to load
              the latest operational changes while keeping your current login
              session.
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={handleLater}
                disabled={refreshing}
                style={{
                  border: "1px solid #cfe7fb",
                  background: "#ffffff",
                  color: "#1769aa",
                  borderRadius: 13,
                  padding: "11px 17px",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: refreshing ? "not-allowed" : "pointer",
                  opacity: refreshing ? 0.65 : 1,
                }}
              >
                Later
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 13,
                  padding: "11px 19px",
                  fontWeight: 850,
                  fontSize: 13,
                  cursor: refreshing ? "not-allowed" : "pointer",
                  opacity: refreshing ? 0.75 : 1,
                  boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
                }}
              >
                {refreshing ? "Updating..." : "Update now"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// APP ROUTER
// ============================================================

function AppRouter() {
  return (
    <BrowserRouter>
      <UpdatePrompt />

      <Routes>
        {/* PUBLIC ROUTES */}

        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/request-dayoff" element={<TimeOffRequestPage />} />
        <Route path="/dayoff-status" element={<TimeOffStatusPublicPage />} />

        {/* PROTECTED PLATFORM */}

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* GENERAL */}

          <Route index element={<DashboardEntry />} />
          <Route path="dashboard" element={<DashboardEntry />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />

          <Route
            path="station-team"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
              >
                <StationTeamPage />
              </ProtectedRoute>
            }
          />

          {/* EMPLOYEE SCHEDULE / TIME OFF */}

          <Route
            path="my-schedule"
            element={
              <ProtectedRoute roles={["agent", "supervisor"]}>
                <MySchedulePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="request-dayoff-internal"
            element={
              <ProtectedRoute roles={["agent", "supervisor"]}>
                <EmployeeTimeOffRequestPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="dayoff-status-internal"
            element={
              <ProtectedRoute roles={["agent", "supervisor"]}>
                <EmployeeTimeOffStatusPage />
              </ProtectedRoute>
            }
          />

          {/* TIMESHEETS */}

          <Route
            path="timesheets/submit"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <SupervisorTimesheetPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="timesheets/reports"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <TimesheetAdminPage />
              </ProtectedRoute>
            }
          />

          {/* OPERATIONAL REPORTS */}

          <Route
            path="operational-report/submit"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <SupervisorOperationalReportPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="operational-report/reports"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <OperationalReportAdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="operational-report/form-builder"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <OperationalReportFormBuilderPage />
              </ProtectedRoute>
            }
          />

          {/* REGULATED GARBAGE */}

          <Route
            path="regulated-garbage/submit"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <SupervisorRegulatedGarbagePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="regulated-garbage/reports"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <RegulatedGarbageAdminPage />
              </ProtectedRoute>
            }
          />

          {/* CLEANING & SECURITY */}

          <Route
            path="cleaning-security/submit"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <SupervisorCleaningSecurityPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="cleaning-security/reports"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <CleaningSecurityReportsAdminPage />
              </ProtectedRoute>
            }
          />

          {/* OPERATIONS REQUESTS */}

          <Route
            path="operations-requests/submit"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
              >
                <SupervisorOperationsRequestsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="operations-requests/reports"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <OperationsRequestsReportsAdminPage />
              </ProtectedRoute>
            }
          />

          {/* WCHR POI */}

          <Route
            path="wchr-poi/submit"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <SupervisorWchrPoiPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr-poi/reports"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <WchrPoiReportsAdminPage />
              </ProtectedRoute>
            }
          />

          {/* EMPLOYEE PERFORMANCE */}

          <Route
            path="employee-performance-report"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <MonthlyEmployeePerformanceReportPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="employee-performance-management"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <EmployeePerformanceManagementPage />
              </ProtectedRoute>
            }
          />

          {/* GATE CHECKLIST */}

          <Route
            path="gate-checklist"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
              >
                <GateChecklistPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="gate-checklist-management"
            element={
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
                <GateChecklistManagementPage />
              </ProtectedRoute>
            }
          />

          {/* FUEL */}

          <Route
            path="fuel-entry"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
              >
                <FuelEntryPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="fuel-management"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <FuelManagementPage />
              </ProtectedRoute>
            }
          />

          {/* CIERRE DE VUELO */}

          <Route
            path="cierre-vuelo"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
              >
                <CierreVuelo />
              </ProtectedRoute>
            }
          />

          <Route
            path="cierre-vuelo-management"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
              >
                <CierreVueloManagement />
              </ProtectedRoute>
            }
          />

          {/* WCHR */}

          <Route
            path="wchr/scan"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
                blockedDepartments={["DL Cabin Service", "Cabin Service"]}
              >
                <WCHRScan />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/my-reports"
            element={
              <ProtectedRoute
                roles={[
                  "agent",
                  "supervisor",
                  "duty_manager",
                  "station_manager",
                ]}
                blockedDepartments={["DL Cabin Service", "Cabin Service"]}
              >
                <MyWCHRReports />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/admin/flights"
            element={
              <ProtectedRoute
                roles={["supervisor", "duty_manager", "station_manager"]}
                blockedDepartments={["DL Cabin Service", "Cabin Service"]}
              >
                <WCHRFlights />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/monthly-close"
            element={
              <ProtectedRoute
                roles={["duty_manager", "station_manager"]}
                blockedDepartments={["DL Cabin Service", "Cabin Service"]}
              >
                <WCHRMonthlyClose />
              </ProtectedRoute>
            }
          />

          {/* MANAGEMENT / ADMIN */}

          <Route
            path="admin/activity-dashboard"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <AdminActivityDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="admin/privacy-acknowledgments"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <PrivacyAcknowledgmentsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="admin/reports-data-management"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <ReportsDataManagementPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="employee-announcements"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <CrewAnnouncementsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="dashboard-editor"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <DashboardEditorPage />
              </ProtectedRoute>
            }
          />

          {/* SCHEDULES */}

          <Route
            path="schedule"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <SchedulePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="cabin-service"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <CabinServicePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="cabin-saved-schedules"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <CabinSavedSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="cabin-saved-schedules/:id"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <CabinScheduleViewPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="blocked"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <BlockedEmployeesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="employees"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approvals"
            element={
              <ProtectedRoute
                roles={["station_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approved"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <ApprovedSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approved/:id"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <ApprovedScheduleView />
              </ProtectedRoute>
            }
          />

          <Route
            path="returned"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <ReturnedSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="drafts"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <DraftSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="weekly-summary"
            element={
              <ProtectedRoute
                roles={["station_manager", "duty_manager"]}
                blockedUsernames={["hhernandez", "hhernadez"]}
              >
                <WeeklyEmployeesSummaryPage />
              </ProtectedRoute>
            }
          />

          {/* TIME OFF ADMIN */}

          <Route
            path="timeoff-requests"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <TimeOffRequestsAdminPage />
              </ProtectedRoute>
            }
          />

          {/* BUDGETS */}

          <Route
            path="budgets"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="monthly-budgets-vs-actual"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <MonthlyBudgetsVsActualPage />
              </ProtectedRoute>
            }
          />

          {/* USER MANAGEMENT */}

          <Route
            path="create-user"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <CreateUserPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="edit-users"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <EditUsersPage />
              </ProtectedRoute>
            }
          />

          {/* UNKNOWN PROTECTED ROUTE */}

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* UNKNOWN PUBLIC ROUTE */}

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// ============================================================
// APPLICATION ENTRY
// ============================================================

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UserProvider>
      <AppRouter />
    </UserProvider>
  </React.StrictMode>
);

// END main.jsx
