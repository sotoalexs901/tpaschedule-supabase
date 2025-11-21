
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
import ApprovedScheduleView from "./pages/ApprovedScheduleView.jsx"


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
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route
            path="dashboard-editor"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <DashboardEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="schedule" element={<SchedulePage />} />
          <Route
            path="blocked"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <BlockedEmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="employees"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="approvals"
            element={
              <ProtectedRoute roles={['station_manager']}>
                <ApprovalsPage />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route
  path="approved"
  element={
    <ProtectedRoute roles={['station_manager', 'duty_manager']}>
      <ApprovedSchedulesPage />
    </ProtectedRoute>
  }
/>

<Route
  path="budgets"
  element={
    <ProtectedRoute roles={['station_manager']}>
      <BudgetsPage />
    </ProtectedRoute>
  }
/>
<Route
  path="approved/:id"
  element={
    <ProtectedRoute roles={['station_manager', 'duty_manager']}>
      <ApprovedScheduleView />
    </ProtectedRoute>
  }
/>
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
