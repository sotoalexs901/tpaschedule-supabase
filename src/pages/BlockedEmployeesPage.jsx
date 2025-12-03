import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useUser } from "../UserContext.jsx";

export default function BlockedEmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [status, setStatus] = useState("");
  const { user } = useUser();

  // 🔒 Solo station_manager y duty_manager
  if (
    !user ||
    (user.role !== "station_manager" && user.role !== "duty_manager")
  ) {
    return (
      <div className="card">
        <p className="text-sm text-red-600">
          You are not authorized to manage blocked employees.
        </p>
      </div>
    );
  }

  useEffect(() => {
    async function load() {
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const restSnap = await getDocs(collection(db, "restrictions"));
      setRestrictions(restSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load().catch(console.error);
  }, []);

  const addRestriction = async () => {
    const employeeId = prompt("Employee ID (from Employees table)");
    if (!employeeId) return;

    const reason =
      prompt("Reason (PTO, Sick, Day Off, Maternity, Suspended)") || "PTO";
    const start_date = prompt("Start date (YYYY-MM-DD)") || null;
    const end_date = prompt("End date (YYYY-MM-DD)") || null;

    setStatus("Saving restriction...");

    const ref = await addDoc(collection(db, "restrictions"), {
      employeeId,
      reason,
      start_date,
      end_date,
      role: user.role, // se guarda quién lo creó (duty/station)
      createdBy: user.username || null,
    });

    setRestrictions([
      ...restrictions,
      {
        id: ref.id,
        employeeId,
        reason,
        start_date,
        end_date,
        role: user.role,
        createdBy: user.username || null,
      },
    ]);

    setStatus("Restriction added.");
  };

  const removeRestriction = async (id) => {
    await deleteDoc(doc(db, "restrictions", id));
    setRestrictions(restrictions.filter((r) => r.id !== id));
  };

  const nameFor = (id) => employees.find((e) => e.id === id)?.name || id;

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold">
          Blocked Employees (Station & Duty Managers)
        </h2>
        <button
          className="btn btn-primary text-xs"
          type="button"
          onClick={addRestriction}
        >
          Add Restriction
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        Employees here are blocked from being assigned to any shift (PTO, Sick,
        Day Off Requested, Maternity, Suspended).
      </p>

      <div className="overflow-auto">
        <table className="table">
          <thead>
            <tr className="bg-gray-50">
              <th>Employee</th>
              <th>Reason</th>
              <th>Start</th>
              <th>End</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {restrictions.map((r) => (
              <tr key={r.id}>
                <td>{nameFor(r.employeeId)}</td>
                <td>{r.reason}</td>
                <td>{r.start_date || "-"}</td>
                <td>{r.end_date || "-"}</td>
                <td>
                  <button
                    className="btn text-xs"
                    type="button"
                    onClick={() => removeRestriction(r.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {restrictions.length === 0 && (
              <tr>
                <td colSpan={5} className="text-xs text-gray-500">
                  No blocked employees.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {status && <p className="text-[11px] text-gray-600">{status}</p>}
    </div>
  );
}
