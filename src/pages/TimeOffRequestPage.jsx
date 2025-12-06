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
  const [error, setError] = useState("");

  // Cargar empleados desde "employees"
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for time off form:", err);
      }
    }
    loadEmployees().catch(console.error);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!employeeId || !reasonType || !startDate || !endDate) {
      setError("Please complete all required fields.");
      return;
    }

    if (pin.length !== 4) {
      setError("PIN must be 4 digits.");
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    const employeeName = emp?.name || "";

    try {
      setSubmitting(true);

      await addDoc(collection(db, "timeOffRequests"), {
        employeeId,
        employeeName,
        reasonType,
        startDate,
        endDate,
        pin,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        createdVia: "public_form",
      });

      setMessage("Your request has been submitted successfully.");
      setEmployeeId("");
      setReasonType("");
      setStartDate("");
      setEndDate("");
      setPin("");
      setNotes("");
    } catch (err) {
      console.error("Error submitting time off request:", err);
      setError("There was an error submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // --- ESTILOS INLINE PARA QUE SE VEA COMO EL LOGIN ---
  const outerStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: "url('/flamingo-tpa.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  const cardStyle = {
    background: "rgba(15,23,42,0.88)",
    backdropFilter: "blur(10px)",
    borderRadius: "18px",
    boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
    border: "1px solid rgba(148,163,184,0.45)",
    padding: "24px 28px",
    width: "340px",
    maxWidth: "92vw",
    color: "#f9fafb",
  };

  const inputStyle = {
    width: "100%",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    padding: "7px 9px",
    fontSize: "0.85rem",
    color: "#0f172a",
  };

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    marginBottom: "3px",
    display: "block",
  };

  const smallTextStyle = {
    fontSize: "11px",
    color: "#e5e7eb",
  };

  return (
    <div style={outerStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            textAlign: "center",
            marginBottom: "4px",
          }}
        >
          Day Off Request
        </h1>
        <p
          style={{
            ...smallTextStyle,
            textAlign: "center",
            marginBottom: "14px",
            color: "#cbd5f5",
          }}
        >
          Please complete this form to request PTO, Sick, or other time off.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "10px" }}>
          {/* Employee Name */}
          <div>
            <label style={labelStyle}>Employee Name</label>
            <select
              style={inputStyle}
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
            <label style={labelStyle}>Reason Type</label>
            <select
              style={inputStyle}
              value={reasonType}
              onChange={(e) => setReasonType(e.target.value)}
            >
              <option value="">Select reason</option>
              <option value="PTO">PTO</option>
              <option value="Sick">Sick</option>
              <option value="Personal">Personal</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input
                type="date"
                style={inputStyle}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>End Date</label>
              <input
                type="date"
                style={inputStyle}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* PIN */}
          <div>
            <label style={labelStyle}>4-digit PIN (to check your request status)</label>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              style={{ ...inputStyle, letterSpacing: "0.3em" }}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Additional details (flight, doctor appointment, etc.)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Info 72h */}
          <p style={{ ...smallTextStyle, marginTop: "2px" }}>
            HR and Management team may take up to <b>72 hours</b> to approve or
            reject your request.
          </p>

          {error && (
            <p
              style={{
                fontSize: "11px",
                color: "#fecaca",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}
          {message && (
            <p
              style={{
                fontSize: "11px",
                color: "#bbf7d0",
                textAlign: "center",
              }}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: "4px",
              width: "100%",
              background:
                "linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)",
              borderRadius: "999px",
              border: "none",
              padding: "8px 0",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 12px 25px rgba(37,99,235,0.55)",
            }}
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
