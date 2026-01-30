// src/main.jsx
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

// ⭐ NUEVOS
import TimeOffRequestPage from "./pages/TimeOffRequestPage.jsx";
import TimeOffRequestsAdminPage from "./pages/TimeOffRequestsAdminPage.jsx";
import TimeOffStatusPublicPage from "./pages/TimeOffStatusPublicPage.jsx";
import EmployeeDashboardPage from "./pages/EmployeeDashboardPage.jsx";
import MySchedulePage from "./pages/MySchedulePage.jsx";
import CrewAnnouncementsPage from "./pages/CrewAnnouncementsPage.jsx";
import EmployeeTimeOffRequestPage from "./pages/EmployeeTimeOffRequestPage.jsx";
import EmployeeTimeOffStatusPage from "./pages/EmployeeTimeOffStatusPage.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx"; // 👈 NUEVO

// ✅ WCHR PAGES (NUEVO)
import WCHRScan from "./pages/WCHRScan.jsx";
import MyWCHRReports from "./pages/MyWCHRReports.jsx";
import WCHRFlights from "./pages/WCHRFlights.jsx";

// -------- protección de rutas ----------
function ProtectedRoute({ children, roles }) {
  const { user } = useUser();

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

// Decide qué dashboard mostrar según rol
function DashboardEntry() {
  const { user } = useUser();

  if (user?.role === "agent" || user?.role === "supervisor") {
    return <EmployeeDashboardPage />;
  }

  // station_manager / duty_manager (o cualquier otro rol)
  return <DashboardPage />;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<LoginPage />} />

        {/* 🔓 RUTAS PÚBLICAS (no requieren login) */}
        <Route path="/request-dayoff" element={<TimeOffRequestPage />} />
        <Route path="/dayoff-status" element={<TimeOffStatusPublicPage />} />

        {/* RUTAS PROTEGIDAS */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard según rol */}
          <Route index element={<DashboardEntry />} />
          <Route path="dashboard" element={<DashboardEntry />} />

          {/* PERFIL – TODOS LOS USUARIOS LOGUEADOS */}
          <Route path="profile" element={<ProfilePage />} />

          {/* MENSAJES – TODOS LOS USUARIOS LOGUEADOS */}
          <Route path="messages" element={<MessagesPage />} />

          {/* SOLO AGENT / SUPERVISOR */}
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

          {/* ✅ WCHR – AGENT / SUPERVISOR */}
          <Route
            path="wchr/scan"
            element={
              <ProtectedRoute roles={["agent", "supervisor"]}>
                <WCHRScan />
              </ProtectedRoute>
            }
          />

          <Route
            path="wchr/my-reports"
            element={
              <ProtectedRoute roles={["agent", "supervisor"]}>
                <MyWCHRReports />
              </ProtectedRoute>
            }
          />

          {/* ✅ WCHR – ADMIN / MANAGERS */}
          <Route
            path="wchr/admin/flights"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <WCHRFlights />
              </ProtectedRoute>
            }
          />
          {/* Si quieres que supervisor también pueda cerrar vuelos, usa:
              roles={["station_manager", "duty_manager", "supervisor"]}
          */}

          {/* SOLO STATION MANAGER: anuncios para empleados */}
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

          {/* ⭐ PÁGINA ADMIN PARA APROBAR DAY OFF */}
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
              <ProtectedRoute roles={["station_manager"]}>
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

// ✅ Registro del Service Worker para PWA (no rompe nada si falla)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Error registrando el service worker:", err);
    });
  });
}
