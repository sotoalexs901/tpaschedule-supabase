
import React, { useEffect, useState, useMemo } from 'react'
import { db } from '../firebase'
import {
  collection, getDocs, addDoc, serverTimestamp, query, where
} from 'firebase/firestore'
import ScheduleGrid from '../components/ScheduleGrid.jsx'

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState('')
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [restrictions, setRestrictions] = useState([])
  const [budgets, setBudgets] = useState({})
  const [status, setStatus] = useState('')

  useEffect(() => {
    async function loadBase() {
      const empSnap = await getDocs(collection(db, 'employees'))
      setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })))

      const restSnap = await getDocs(collection(db, 'restrictions'))
      setRestrictions(restSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    loadBase().catch(console.error)
  }, [])

  useEffect(() => {
    async function loadBudgets() {
      if (!weekStart) {
        setBudgets({})
        return
      }
      const qBud = query(
        collection(db, 'airlineBudgets'),
        where('weekStart', '==', weekStart)
      )
      const snap = await getDocs(qBud)
      const map = {}
      snap.forEach(doc => {
        const d = doc.data()
        map[d.airline] = d.budgetHours || 0
      })
      setBudgets(map)
    }
    loadBudgets().catch(console.error)
  }, [weekStart])

  const blockedIds = useMemo(() => {
    const set = new Set()
    restrictions.forEach(r => {
      if (r.employeeId) set.add(r.employeeId)
    })
    return set
  }, [restrictions])

  const handleSubmit = async () => {
    if (!weekStart) {
      alert('Select week start date')
      return
    }
    setStatus('Saving schedule...')
    const schedRef = await addDoc(collection(db, 'schedules'), {
      weekStart,
      status: 'pending_approval',
      createdAt: serverTimestamp()
    })
    const shiftsCol = collection(db, 'schedules', schedRef.id, 'shifts')
    for (const row of rows) {
      const { employeeId, airline, role, shiftsByDay } = row
      if (!employeeId || !airline) continue
      Object.entries(shiftsByDay || {}).forEach(async ([day, s]) => {
        if (!s.start && !s.end) return
        await addDoc(shiftsCol, {
          dateDay: day,
          employeeId,
          airline,
          role,
          start: s.start || '',
          end: s.end || ''
        })
      })
    }
    setStatus(`Schedule submitted for approval (id: ${schedRef.id})`)
  }

  return (
    <div className="card space-y-4">
      <h2 className="text-sm font-semibold">Create Weekly Schedule (Duty Managers)</h2>
      <div className="flex gap-2 items-center text-xs">
        <label className="font-medium">Week start (Monday):</label>
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={weekStart}
          onChange={e => setWeekStart(e.target.value)}
        />
        <button className="btn" type="button" onClick={() => setRows([])}>
          Clear grid
        </button>
      </div>

      <ScheduleGrid
        rows={rows}
        onChange={setRows}
        employees={employees}
        blockedIds={blockedIds}
        budgets={budgets}
      />

      <div className="flex justify-between items-center text-xs">
        <div className="space-x-2">
          <span className="badge">Multiple rows allowed per employee (two shifts / 24h)</span>
          <span className="badge badge-blocked">Blocked employees cannot be assigned</span>
        </div>
        <button className="btn btn-primary" type="button" onClick={handleSubmit}>
          Submit schedule for approval
        </button>
      </div>

      {status && <p className="text-[11px] text-gray-600">{status}</p>}
    </div>
  )
}
