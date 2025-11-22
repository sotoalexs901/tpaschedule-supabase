import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles.css'

import { UserProvider, useUser } from './UserContext.jsx'

import LoginPage from './pages/LoginPage.jsx'
import AppLayout from './pages/AppLayout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DashboardEditorPage from './pages/DashboardEditorPage.jsx'
import SchedulePage from './pages/SchedulePage.jsx'
import BlockedEmployeesPage from './pages/BlockedEmployeesPage.jsx'
import EmployeesPage from './pages/EmployeesPage.jsx'
import ApprovalsPage from './pages/ApprovalsPage.jsx'
import BudgetsPage from './pages/BudgetsPage.jsx'
import ApprovedSchedulesPage from './pages/ApprovedSchedulesPage.jsx'
import ApprovedScheduleView from "./pages/ApprovedScheduleView.jsx"
import CreateUserPage from "./pages/CreateUserPage.jsx"
import EditUsersPage from "./pages/EditUsersPage.jsx"


function ProtectedRoute({ children, roles }) {
  const { user } = useUser()

  if (!user) return <Navigate to="/login" replace />

  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />

  return children
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        {/* LOGIN */}
        <Route path="/login" element={<LoginPage />} />

        {/* MAIN LAYOUT */}
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

          {/* Dashboard Editor */}
          <Route
            path="dashboard-editor"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <DashboardEditorPage />
              </ProtectedRoute>
            }
          />

          {/* Create schedule */}
          <Route path="schedule" element={<SchedulePage />} />

          {/* Blocked employees */}
          <Route
            path="blocked"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <BlockedEmployeesPage />
              </ProtectedRoute>
            }
          />

          {/* Employees database */}
          <Route
            path="employees"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />

          {/* Approvals (ONLY station manager) */}
          <Route
            path="approvals"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />

          {/* Approved schedules (station + duty managers) */}
          <Route
            path="approved"
            element={
              <ProtectedRoute roles={['station_manager', 'duty_manager']}>
                <ApprovedSchedulesPage />
              </ProtectedRoute>
            }
          />

          {/* View single approved schedule */}
          <Route
            path="approved/:id"
            element={
              <ProtectedRoute roles={['station_manager', 'duty_manager']}>
                <ApprovedScheduleView />
              </ProtectedRoute>
            }
          />

          {/* Budgets */}
          <Route
            path="budgets"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />

          {/* CREATE USER */}
          <Route
            path="create-user"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <CreateUserPage />
              </ProtectedRoute>
            }
          />

          {/* EDIT USERS */}
          <Route
            path="edit-users"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <EditUsersPage />
              </ProtectedRoute>
            }
          />

        </Route>

      </Routes>
    </BrowserRouter>
  )
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserProvider>
      <AppRouter />
    </UserProvider>
  </React.StrictMode>
)
