// src/pages/TimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffRequestPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Cargar empleados para el SELECT
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for time off:", err);
      }
    }

    loadEmployees().catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMsg("");

    if (!selectedEmployeeId || !reasonType || !startDate || !endDate || !pin) {
      setStatusMsg("Please complete all required fields.");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setStatusMsg("PIN must be exactly 4 digits.");
      return;
    }

    if (endDate < startDate) {
      setStatusMsg("End date cannot be earlier than start date.");
      return;
    }

    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      setStatusMsg("Employee not found. Please select a valid name.");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "timeOffRequests"), {
        employeeId: employee.id,
        employeeName: employee.name || "",
        reasonType,
        startDate,
        endDate,
        notes: notes.trim() || "",
        pin,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStatusMsg(
        "Your request has been submitted successfully. Please keep your 4-digit PIN to check the status."
      );

      // limpiar formulario
      setSelectedEmployeeId("");
      setReasonType("");
      setStartDate("");
      setEndDate("");
      setNotes("");
      setPin("");
    } catch (err) {
      console.error("Error sending time off request:", err);
      setStatusMsg("Error sending request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: "url('/flamingo-bg.jpg')" }}
    >
      <div
        className="bg-white/75 backdrop-blur-md shadow-2xl border border-white/60"
        style={{ maxWidth: 460, width: "100%", borderRadius: 20, padding: "1.75rem" }}
      >
        <h1 className="text-xl font-bold mb-1 text-center text-gray-800">
          Day Off Request
        </h1>
        <p className="text-[11px] text-gray-600 text-center mb-4">
          Please complete this form to request PTO, Sick, or other time off.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {/* Employee SELECT */}
          <div>
            <label className="font-medium text-xs block mb-1">
              Employee Name
            </label>
            <select
              className="border rounded w-full px-2 py-2 text-sm"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
              <option value="">Select your name</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reason type */}
          <div>
            <label className="font-medium text-xs block mb-1">
              Reason Type
            </label>
            <select
              className="border rounded w-full px-2 py-2 text-sm"
              value={reasonType}
              onChange={(e) => setReasonType(e.target.value)}
            >
              <option value="">Select reason</option>
              <option value="PTO">PTO</option>
              <option value="Sick">Sick</option>
              <option value="Personal">Personal</option>
              <option value="Emergency">Emergency</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-xs block mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="border rounded w-full px-2 py-2 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium text-xs block mb-1">
                End Date
              </label>
              <input
                type="date"
                className="border rounded w-full px-2 py-2 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="font-medium text-xs block mb-1">
              4-digit PIN (to check your request status)
            </label>
            <input
              type="password"
              className="border rounded w-full px-2 py-2 text-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="XXXX"
              maxLength={4}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="font-medium text-xs block mb-1">
              Notes (optional)
            </label>
            <textarea
              className="border rounded w-full px-2 py-2 text-sm"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details (flight, doctor appointment, etc.)"
            />
          </div>

          {/* Mensaje de estado */}
          {statusMsg && (
            <p className="text-[11px] text-center mt-1 text-gray-700">
              {statusMsg}
            </p>
          )}

          {/* Botón submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded mt-2 text-sm font-semibold shadow"
          >
            {submitting ? "Sending..." : "Submit Request"}
          </button>

          {/* Nota 72 horas */}
          <p className="text-[11px] text-gray-600 text-center mt-2">
            HR and Management team may take up to 72 hours to approve or reject
            your request.
          </p>
        </form>
      </div>
    </div>
  );
}
