
import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useUser } from '../UserContext.jsx'

export default function AppLayout() {
  const { user, setUser } = useUser()
  const navigate = useNavigate()
  const link = ({ isActive }) =>
    'btn text-xs ' + (isActive ? 'btn-primary' : '')

  const logout = () => {
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">TPA Schedule</h1>
          <p className="text-[11px] text-gray-500">
            Duty Managers create schedules · Station Manager approves · Dashboard central de avisos
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <nav className="space-x-1 text-xs">
            <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
            <NavLink to="/schedule" className={link}>Schedule</NavLink>
            {user?.role === 'station_manager' && (
              <>
                <NavLink to="/blocked" className={link}>Blocked</NavLink>
                <NavLink to="/employees" className={link}>Employees</NavLink>
                <NavLink to="/approvals" className={link}>Approvals</NavLink>
                <NavLink to="/dashboard-editor" className={link}>Edit Dashboard</NavLink>
              </>
            )}
          </nav>
          <div className="text-[11px] text-gray-600">
            Logged in as <span className="font-semibold">{user?.username}</span> ({user?.role})
            <button className="btn ml-2" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
