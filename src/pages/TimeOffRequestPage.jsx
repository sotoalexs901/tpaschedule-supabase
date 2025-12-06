// src/pages/TimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffRequestPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Cargar lista de empleados
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for day off request:", err);
      }
    }
    loadEmployees().catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!employeeId || !reasonType || !startDate || !endDate || pin.length !== 4) {
      setMessage("Please complete all required fields and use a 4-digit PIN.");
      return;
    }

    const selectedEmp = employees.find((e) => e.id === employeeId);
    const employeeName = selectedEmp?.name || "";

    try {
      setSubmitting(true);
      await addDoc(collection(db, "timeOffRequests"), {
        employeeId,
        employeeName,
        reasonType,
        startDate,
        endDate,
        notes: notes.trim() || null,
        pin,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setEmployeeId("");
      setReasonType("");
      setStartDate("");
      setEndDate("");
      setPin("");
      setNotes("");
      setMessage("Your request has been submitted successfully.");
    } catch (err) {
      console.error("Error submitting time off request:", err);
      setMessage("Error submitting request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: "url('/tpa-flamingo-bw.jpg')" }}
    >
      <div className="bg-white/85 backdrop-blur-md rounded-2xl shadow-2xl px-8 py-7 w-[340px] sm:w-[420px] border border-white/40">
        <h1 className="text-xl font-bold text-center mb-1 text-slate-900">
          Day Off Request
        </h1>
        <p className="text-[11px] text-center text-slate-600 mb-5">
          Please complete this form to request PTO, Sick, or other time off.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {/* Employee Name */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Employee Name
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select your name</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Reason Type
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={reasonType}
              onChange={(e) => setReasonType(e.target.value)}
            >
              <option value="">Select reason</option>
              <option value="PTO">PTO</option>
              <option value="Sick">Sick</option>
              <option value="Emergency">Emergency</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">
                Start Date
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2 text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                End Date
              </label>
              <input
                type="date"
                className="w-full border rounded px-2 py-2 text-sm"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              4-digit PIN <span className="font-normal text-[11px]">(to check your request status)</span>
            </label>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              className="w-full border rounded px-2 py-2 text-sm tracking-[0.3em]"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Notes <span className="font-normal text-[11px]">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="w-full border rounded px-2 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details (flight, doctor appointment, etc.)"
            />
          </div>

          {/* Info 72h */}
          <p className="text-[11px] text-slate-500 mt-1">
            HR and Management team may take up to <b>72 hours</b> to approve or
            reject your request.
          </p>

          {/* Mensaje */}
          {message && (
            <p className="text-[11px] text-center mt-1 text-slate-700">
              {message}
            </p>
          )}

          {/* Botón */}
          <button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-semibold shadow-md transition"
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
