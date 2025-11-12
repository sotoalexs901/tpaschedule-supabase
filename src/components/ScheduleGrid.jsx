
import React, { useMemo } from 'react'

const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function diffHours(start, end) {
  if (!start || !end) return 0
  const [hs, ms] = start.split(':').map(Number)
  const [he, me] = end.split(':').map(Number)
  if (isNaN(hs) || isNaN(ms) || isNaN(he) || isNaN(me)) return 0
  let startMin = hs * 60 + ms
  let endMin = he * 60 + me
  if (endMin < startMin) endMin += 24 * 60
  return (endMin - startMin) / 60
}

/**
 * rows: [ { id, employeeId, airline, role, shiftsByDay: { Mon:{start,end}, ... } } ]
 * employees: [{id,name}]
 * blockedIds: Set of employeeIds blocked
 * budgets: { [airline]: budgetHours }
 */
export default function ScheduleGrid({ rows, onChange, employees, blockedIds, budgets }) {
  const updateCell = (rowId, day, field, value) => {
    const updated = rows.map(r => {
      if (r.id !== rowId) return r
      const shiftsByDay = { ...(r.shiftsByDay || {}) }
      const shift = { ...(shiftsByDay[day] || {}) }
      shift[field] = value
      shiftsByDay[day] = shift
      return { ...r, shiftsByDay }
    })
    onChange(updated)
  }

  const updateRowField = (rowId, field, value) => {
    const updated = rows.map(r => r.id === rowId ? { ...r, [field]: value } : r)
    onChange(updated)
  }

  const addRow = () => {
    const newRow = {
      id: crypto.randomUUID(),
      employeeId: '',
      airline: '',
      role: '',
      shiftsByDay: {}
    }
    onChange([...rows, newRow])
  }

  const removeRow = (rowId) => {
    onChange(rows.filter(r => r.id !== rowId))
  }

  const getEmployee = (id) => employees.find(e => e.id === id)

  const { totalsByEmployee, totalsByAirline } = useMemo(() => {
    const empTotals = {}
    const airTotals = {}
    rows.forEach(row => {
      const { employeeId, airline, shiftsByDay } = row
      if (!employeeId) return
      const empKey = employeeId
      const airKey = airline || 'N/A'
      if (!empTotals[empKey]) empTotals[empKey] = 0
      if (!airTotals[airKey]) airTotals[airKey] = 0
      Object.values(shiftsByDay || {}).forEach(shift => {
        const h = diffHours(shift.start, shift.end)
        empTotals[empKey] += h
        airTotals[airKey] += h
      })
    })
    return { totalsByEmployee: empTotals, totalsByAirline: airTotals }
  }, [rows])

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold">Weekly Schedule</h2>
        <button className="btn btn-primary" type="button" onClick={addRow}>
          Add Row
        </button>
      </div>
      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr className="bg-gray-50">
              <th>Airline</th>
              <th>Employee</th>
              <th>Role</th>
              {days.map(d => (
                <th key={d}>{d}<br/><span className="text-[10px] text-gray-400">Start–End</span></th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const emp = getEmployee(row.employeeId)
              const isBlocked = emp && blockedIds.has(emp.id)
              return (
                <tr key={row.id} className={isBlocked ? 'bg-red-50' : ''}>
                  <td>
                    <input
                      className="border rounded px-1 py-0.5 w-20"
                      value={row.airline || ''}
                      onChange={e => updateRowField(row.id, 'airline', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="border rounded px-1 py-0.5 text-xs"
                      value={row.employeeId || ''}
                      onChange={e => updateRowField(row.id, 'employeeId', e.target.value)}
                    >
                      <option value="">Select...</option>
                      {employees.map(emp => (
                        <option
                          key={emp.id}
                          value={emp.id}
                          disabled={blockedIds.has(emp.id)}
                        >
                          {emp.name} {blockedIds.has(emp.id) ? ' (BLOCKED)' : ''}
                        </option>
                      ))}
                    </select>
                    {isBlocked && (
                      <div className="text-[10px] text-red-600">
                        Blocked this period
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      className="border rounded px-1 py-0.5 w-24"
                      value={row.role || ''}
                      onChange={e => updateRowField(row.id, 'role', e.target.value)}
                    />
                  </td>
                  {days.map(d => {
                    const shift = (row.shiftsByDay && row.shiftsByDay[d]) || {}
                    return (
                      <td key={d}>
                        <div className="flex flex-col gap-1">
                          <input
                            className="border rounded px-1 py-0.5 w-16"
                            placeholder="HH:MM"
                            value={shift.start || ''}
                            onChange={e => updateCell(row.id, d, 'start', e.target.value)}
                          />
                          <input
                            className="border rounded px-1 py-0.5 w-16"
                            placeholder="HH:MM"
                            value={shift.end || ''}
                            onChange={e => updateCell(row.id, d, 'end', e.target.value)}
                          />
                        </div>
                      </td>
                    )
                  })}
                  <td>
                    <button className="btn text-xs" type="button" onClick={() => removeRow(row.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-xs">
        <div className="card space-y-1">
          <h3 className="font-semibold">Hours per Employee (week)</h3>
          {Object.keys(totalsByEmployee).map(id => {
            const emp = getEmployee(id)
            return (
              <div key={id} className="flex justify-between">
                <span>{emp?.name || id}</span>
                <span>{totalsByEmployee[id].toFixed(2)} h</span>
              </div>
            )
          })}
          {!Object.keys(totalsByEmployee).length && (
            <p className="text-[11px] text-gray-400">No hours yet.</p>
          )}
        </div>
        <div className="card space-y-1">
          <h3 className="font-semibold">Airline vs Budget (hours)</h3>
          {Object.keys(totalsByAirline).map(airline => {
            const scheduled = totalsByAirline[airline]
            const budget = budgets?.[airline] ?? 0
            const diff = scheduled - budget
            const over = diff > 0
            return (
              <div key={airline} className="flex justify-between">
                <span>{airline}</span>
                <span>
                  {scheduled.toFixed(1)} / {budget.toFixed(1)} h{' '}
                  <span className={over ? 'text-red-600' : 'text-green-600'}>
                    ({over ? '+' : ''}{diff.toFixed(1)} h)
                  </span>
                </span>
              </div>
            )
          })}
          {!Object.keys(totalsByAirline).length && (
            <p className="text-[11px] text-gray-400">No airline hours yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
