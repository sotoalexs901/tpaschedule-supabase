import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles.css";

import { UserProvider, useUser } from "./UserContext.jsx";

import LoginPage from "./pages/LoginPage.jsx";
import AppLayout from "./pages/AppLayout.jsx";

import DashboardPage from "./pages/DashboardPage.jsx";
import DashboardEditorPage from "./pages/DashboardEditorPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import BlockedEmployeesPage from "./pages/BlockedEmployeesPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import ApprovedSchedulesPage from "./pages/ApprovedSchedulesPage.jsx";
import ApprovedScheduleView from "./pages/ApprovedScheduleView.jsx";
import BudgetsPage from "./pages/BudgetsPage.jsx";
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
import ProfilePage from "./pages/ProfilePage.jsx";
import AdminActivityDashboard from "./pages/AdminActivityDashboard.jsx";

import SupervisorTimesheetPage from "./pages/SupervisorTimesheetPage.jsx";
import TimesheetAdminPage from "./pages/TimesheetAdminPage.jsx";

import SupervisorOperationalReportPage from "./pages/SupervisorOperationalReportPage.jsx";
import OperationalReportAdminPage from "./pages/OperationalReportAdminPage.jsx";
import OperationalReportFormBuilderPage from "./pages/OperationalReportFormBuilderPage.jsx";

import WCHRScan from "./pages/WCHRScan.jsx";
import MyWCHRReports from "./pages/MyWCHRReports.jsx";
import WCHRFlights from "./pages/WCHRFlights.jsx";

import CabinServicePage from "./pages/CabinServicePage.jsx";
import CabinSavedSchedulesPage from "./pages/CabinSavedSchedulesPage.jsx";
import CabinScheduleViewPage from "./pages/CabinScheduleViewPage.jsx";

function ProtectedRoute({ children, roles }) {
  const { user } = useUser();

  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

function DashboardEntry() {
  const { user } = useUser();

  if (user?.role === "agent" || user?.role === "supervisor") {
    return <EmployeeDashboardPage />;
  }

  return <DashboardPage />;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/request-dayoff" element={<TimeOffRequestPage />} />
        <Route path="/dayoff-status" element={<TimeOffStatusPublicPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardEntry />} />
          <Route path="dashboard" element={<DashboardEntry />} />

          <Route path="profile" element={<ProfilePage />} />
          <Route path="messages" element={<MessagesPage />} />

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
              <ProtectedRoute roles={["duty_manager", "station_manager"]}>
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

          <Route
            path="wchr/scan"
            element={
              <ProtectedRoute
                roles={["agent", "supervisor", "duty_manager", "station_manager"]}
              >
                <WCHRScan />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/my-reports"
            element={
              <ProtectedRoute
                roles={["agent", "supervisor", "duty_manager", "station_manager"]}
              >
                <MyWCHRReports />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/admin/flights"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <WCHRFlights />
              </ProtectedRoute>
            }
          />

          <Route
            path="admin/activity-dashboard"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <AdminActivityDashboard />
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

          <Route path="schedule" element={<SchedulePage />} />

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
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approvals"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approved"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <ApprovedSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="approved/:id"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <ApprovedScheduleView />
              </ProtectedRoute>
            }
          />

          <Route
            path="returned"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <ReturnedSchedulesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="timeoff-requests"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <TimeOffRequestsAdminPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="weekly-summary"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <WeeklyEmployeesSummaryPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="budgets"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />

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

          <Route
            path="drafts"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <DraftSchedulesPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UserProvider>
      <AppRouter />
    </UserProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Error registrando el service worker:", err);
    });
  });
}
