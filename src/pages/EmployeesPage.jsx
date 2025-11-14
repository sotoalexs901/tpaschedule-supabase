import React, { useEffect, useState } from 'react'
import { db } from '../firebase'
import {
  collection, getDocs, addDoc, updateDoc, doc
} from 'firebase/firestore'
import { useUser } from '../UserContext.jsx'

export default function EmployeesPage() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const { user } = useUser()   // ⬅ usamos el usuario logueado

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'employees'))
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    load().catch(console.error)
  }, [])

  const addEmployee = async () => {
    const name = prompt('Employee name')
    if (!name) return

    const position = prompt('Position') || ''
    const department = prompt('Department') || ''

    const ref = await addDoc(collection(db, 'employees'), {
      name,
      position,
      department,
      status: 'active',
      role: user.role   // ⬅ NECESARIO PARA ESCRIBIR EN FIRESTORE
    })

    setRows([
      ...rows,
      { id: ref.id, name, position, department, status: 'active', role: user.role }
    ])
  }

  const toggleStatus = async (row) => {
    const newStatus = row.status === 'active' ? 'inactive' : 'active'

    await updateDoc(doc(db, 'employees', row.id), {
      status: newStatus,
      role: user.role  // ⬅ requerido por las reglas
    })

    setRows(rows.map(r =>
      r.id === row.id ? { ...r, status: newStatus } : r
    ))
  }

  const filtered = rows.filter(r =>
    (r.name || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="card space-y-3">
      <div className="flex gap-2 items-center">
        <input
          className="border rounded px-2 py-1 text-xs flex-1"
          placeholder="Search employee"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="btn btn-primary text-xs" type="button" onClick={addEmployee}>
          Add Employee
        </button>
      </div>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr className="bg-gray-50">
              <th>Name</th>
              <th>Position</th>
              <th>Department</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.position}</td>
                <td>{r.department}</td>
                <td>{r.status}</td>
                <td>
                  <button
                    className="btn text-xs"
                    type="button"
                    onClick={() => toggleStatus(r)}
                  >
                    {r.status === 'active' ? 'Inactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

        </table>
      </div>

      <p className="text-[11px] text-gray-500">
        This replaces the Employee Database sheet in Excel.
      </p>
    </div>
  )
}

