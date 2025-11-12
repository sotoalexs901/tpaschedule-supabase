
import React, { useEffect, useState } from 'react'
import { db } from '../firebase'
import {
  collection, getDocs, doc, updateDoc
} from 'firebase/firestore'

export default function ApprovalsPage() {
  const [schedules, setSchedules] = useState([])
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'schedules'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSchedules(list.filter(s => s.status === 'pending_approval'))
    }
    load().catch(console.error)
  }, [])

  const openDetails = (sched) => {
    setSelected(sched)
  }

  const approve = async (sched, decision) => {
    setStatus('Saving decision...')
    await updateDoc(doc(db, 'schedules', sched.id), {
      status: decision === 'approve' ? 'approved' : 'rejected'
    })
    setSchedules(schedules.filter(s => s.id !== sched.id))
    setSelected(null)
    setStatus(`Schedule ${decision === 'approve' ? 'approved' : 'rejected'}.`)
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold">Schedules Pending Approval (Station Manager)</h2>
      {status && <p className="text-[11px] text-gray-600">{status}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Pending</h3>
          {schedules.map(s => (
            <div
              key={s.id}
              className="border rounded-xl px-2 py-1 text-xs cursor-pointer hover:bg-gray-50"
              onClick={() => openDetails(s)}
            >
              <div className="font-medium">Week starting {s.weekStart || '(no date)'}</div>
              <div className="text-[11px] text-gray-500">Status: {s.status}</div>
            </div>
          ))}
          {!schedules.length && (
            <p className="text-[11px] text-gray-400">No schedules pending.</p>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600">Details</h3>
          {!selected && (
            <p className="text-[11px] text-gray-400">Select a schedule to review.</p>
          )}
          {selected && (
            <div className="text-[11px] space-y-2">
              <div>Schedule ID: <span className="font-mono">{selected.id}</span></div>
              <div>Week start: {selected.weekStart || '-'}</div>
              <div>Status: {selected.status}</div>
              <p className="text-gray-500">
                In a full implementation, this panel would show a read-only version
                of the weekly grid, grouped by airline and day, with all employees
                and shifts. For now you can approve/reject to close the loop.
              </p>
              <div className="space-x-2">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => approve(selected, 'approve')}
                >
                  Approve
                </button>
                <button
                  className="btn text-xs"
                  type="button"
                  onClick={() => approve(selected, 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
