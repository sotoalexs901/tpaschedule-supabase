// src/pages/TimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const REASON_OPTIONS = ["PTO / Vacation", "Sick", "Personal", "Family", "Other"];

export default function TimeOffRequestPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [reasonType, setReasonType] = useState("PTO / Vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    // Opcional: mostrar lista de empleados para evitar errores de nombre
    getDocs(collection(db, "employees"))
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // orden alfabético
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      })
      .catch((err) => {
        console.error("Error loading employees for time off:", err);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    if (!employeeId || !startDate || !endDate) {
      setStatusMessage("Please select employee and dates.");
      return;
    }

    try {
      const employee = employees.find((e) => e.id === employeeId);

      await addDoc(collection(db, "timeOffRequests"), {
        employeeId,
        employeeName: employee?.name || "",
        reasonType,
        startDate,
        endDate,
        notes: notes.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStatusMessage("Request sent. Thank you!");
      setReasonType("PTO / Vacation");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (err) {
      console.error(err);
      setStatusMessage("Error sending request. Please try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage: "url('/flamingo-tpa.jpg')", // misma imagen que login si quieres
      }}
    >
      <div className="login-overlay" />

      <div className="login-content">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1 className="login-title">Day Off Request</h1>
          <p className="login-subtitle text-center">
            TPA Schedule · Employee access
          </p>

          {/* Employee */}
          <div className="login-field">
            <label className="login-label">Employee</label>
            <select
              className="login-input"
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

          {/* Reason Type */}
          <div className="login-field">
            <label className="login-label">Reason</label>
            <select
              className="login-input"
              value={reasonType}
              onChange={(e) => setReasonType(e.target.value)}
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="login-field">
            <label className="login-label">From</label>
            <input
              type="date"
              className="login-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label className="login-label">To</label>
            <input
              type="date"
              className="login-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="login-field">
            <label className="login-label">Notes (optional)</label>
            <textarea
              className="login-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Short explanation (ex. family event, doctor, etc.)"
            />
          </div>

          {statusMessage && (
            <p
              style={{
                marginTop: "0.25rem",
                marginBottom: "0.5rem",
                fontSize: "0.75rem",
                textAlign: "center",
                color: statusMessage.includes("Error") ? "#fecaca" : "#bbf7d0",
              }}
            >
              {statusMessage}
            </p>
          )}

          <button type="submit" className="login-button">
            Submit request
          </button>

          <p className="login-footer">
            If you made a mistake, please contact Duty or Station Manager.
          </p>
        </form>
      </div>
    </div>
  );
}
