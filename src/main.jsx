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

// 🔒 Protección de rutas
function ProtectedRoute({ children, roles }) {
  const { user } = useUser();

  // No está logueado → enviar a login
  if (!user) return <Navigate to="/login" replace />;

  // Tiene rol restringido
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

// 🔵 Sistema de rutas principal
function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<LoginPage />} />

        {/* RUTAS PROTEGIDAS (requieren usuario logueado) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Dashboard Editor (solo station_manager) */}
          <Route
            path="dashboard-editor"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <DashboardEditorPage />
              </ProtectedRoute>
            }
          />

          {/* Crear horario (todos los roles logueados) */}
          <Route path="schedule" element={<SchedulePage />} />

          {/* Employees blocked → station_manager + duty_manager */}
          <Route
            path="blocked"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <BlockedEmployeesPage />
              </ProtectedRoute>
            }
          />

          {/* Employees → station_manager + duty_manager */}
          <Route
            path="employees"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />

          {/* Approvals → solo station_manager */}
          <Route
            path="approvals"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />

          {/* Approved schedules → station_manager + duty_manager */}
          <Route
            path="approved"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <ApprovedSchedulesPage />
              </ProtectedRoute>
            }
          />

          {/* Ver un schedule aprobado → station_manager + duty_manager */}
          <Route
            path="approved/:id"
            element={
              <ProtectedRoute roles={["station_manager", "duty_manager"]}>
                <ApprovedScheduleView />
              </ProtectedRoute>
            }
          />

          {/* Budgets → solo station_manager */}
          <Route
            path="budgets"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />

          {/* Crear usuario → solo station_manager */}
          <Route
            path="create-user"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <CreateUserPage />
              </ProtectedRoute>
            }
          />

          {/* Editar usuarios → solo station_manager */}
          <Route
            path="edit-users"
            element={
              <ProtectedRoute roles={["station_manager"]}>
                <EditUsersPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// 🔵 Render principal
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <UserProvider>
      <AppRouter />
    </UserProvider>
  </React.StrictMode>
);
