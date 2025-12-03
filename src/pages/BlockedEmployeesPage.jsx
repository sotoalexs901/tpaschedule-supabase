// src/pages/BlockedEmployeesPage.jsx
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
  const { user } = useUser();

  const [employees, setEmployees] = useState([]);
  const [restrictions, setRestrictions] = useState([]);
  const [status, setStatus] = useState("");

  // 🔹 Campos del formulario
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reason, setReason] = useState("PTO");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Cargar empleados + restricciones
  useEffect(() => {
    async function load() {
      try {
        const empSnap = await getDocs(collection(db, "employees"));
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const restSnap = await getDocs(collection(db, "restrictions"));
        setRestrictions(restSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading blocked employees:", err);
        setStatus("Error loading data.");
      }
    }
    load().catch(console.error);
  }, []);

  const resetForm = () => {
    setSelectedEmployeeId("");
    setReason("PTO");
    setStartDate("");
    setEndDate("");
  };

  const addRestriction = async (e) => {
    e?.preventDefault?.();

    if (!selectedEmployeeId) {
      setStatus("Select an employee first.");
      return;
    }

    setStatus("Saving restriction...");

    const payload = {
      employeeId: selectedEmployeeId,
      reason,
      start_date: startDate || null,
      end_date: endDate || null,
      createdAt: new Date().toISOString(),
      createdBy: user?.username || null,
      role: user?.role || "station_manager",
    };

    const ref = await addDoc(collection(db, "restrictions"), payload);

    setRestrictions((prev) => [...prev, { id: ref.id, ...payload }]);
    resetForm();
    setStatus("Restriction added.");
  };

  const removeRestriction = async (id) => {
    await deleteDoc(doc(db, "restrictions", id));
    setRestrictions((prev) => prev.filter((r) => r.id !== id));
  };

  // Buscar nombre del empleado por id
  const nameFor = (id) => {
    const emp = employees.find((e) => e.id === id);
    return emp?.name || emp?.fullName || id;
  };

  return (
    <div className="card space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold">
          Blocked Employees (Station Manager)
        </h2>
      </div>

      <p className="text-[11px] text-gray-500">
        Employees here are blocked from being assigned to any shift (PTO, Sick,
        Day Off Requested, Maternity, Suspended).
      </p>

      {/* 🔹 FORMULARIO PARA AGREGAR RESTRICCIÓN */}
      <form
        onSubmit={addRestriction}
        className="grid md:grid-cols-4 gap-2 items-end mb-3"
      >
        {/* Employee selector */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            Employee
          </label>
          <select
            className="border rounded w-full text-xs px-2 py-1"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
          >
            <option value="">Select employee</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name || emp.fullName || emp.id}
              </option>
            ))}
          </select>
        </div>

        {/* Reason */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            Reason
          </label>
          <select
            className="border rounded w-full text-xs px-2 py-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="PTO">PTO</option>
            <option value="Sick">Sick</option>
            <option value="Day Off Requested">Day Off Requested</option>
            <option value="Maternity">Maternity</option>
            <option value="Suspended">Suspended</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Start date */}
        <div>
          <label className="text-[11px] font-semibold block mb-1">
            Start date
          </label>
          <input
            type="date"
            className="border rounded w-full text-xs px-2 py-1"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        {/* End date + botón */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] font-semibold block mb-1">
              End date
            </label>
            <input
              type="date"
              className="border rounded w-full text-xs px-2 py-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary text-xs h-9 self-end"
          >
            Add
          </button>
        </div>
      </form>

      {/* TABLA DE RESTRICCIONES */}
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
                <td colSpan={5} className="text-center text-xs text-gray-500">
                  No blocked employees yet.
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
