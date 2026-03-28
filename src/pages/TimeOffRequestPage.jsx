// src/pages/TimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 28,
        boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: 700,
        color: "#475569",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        ...props.style,
      }}
    />
  );
}

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

  const normalizeRange = () => {
    if (!startDate) return null;
    const start = startDate;
    const end = endDate || startDate;
    if (end < start) return null;
    return { start, end };
  };

  const toDateSafe = (value) => {
    if (!value) return null;
    if (typeof value === "string") return new Date(value);
    if (value.toDate) return value.toDate();
    return new Date(value);
  };

  const normalizeMidnight = (date) => {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!employeeId || !reasonType || !startDate) {
      setError("Please complete all required fields.");
      return;
    }

    const range = normalizeRange();
    if (!range) {
      setError("Please select a valid start/end date.");
      return;
    }

    if (pin.length !== 4) {
      setError("PIN must be 4 digits.");
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    const employeeName = emp?.name || "";

    const newStartDate = normalizeMidnight(toDateSafe(range.start));
    const newEndDate = normalizeMidnight(toDateSafe(range.end));

    try {
      setSubmitting(true);

      const qRef = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId)
      );
      const snap = await getDocs(qRef);
      const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const blockingStatuses = ["pending", "approved"];
      const conflicts = [];

      for (const req of existing) {
        if (!blockingStatuses.includes(req.status || "pending")) continue;

        const existingStartRaw = req.startDate || req.date;
        const existingEndRaw = req.endDate || req.date || req.startDate;

        const existingStartDate = normalizeMidnight(
          toDateSafe(existingStartRaw)
        );
        const existingEndDate = normalizeMidnight(
          toDateSafe(existingEndRaw || existingStartRaw)
        );

        if (!existingStartDate || !existingEndDate) continue;

        if (
          newStartDate <= existingEndDate &&
          existingStartDate <= newEndDate
        ) {
          const format = (d) => d.toISOString().slice(0, 10);
          conflicts.push(
            `${format(existingStartDate)} → ${format(existingEndDate)}`
          );
        }
      }

      if (conflicts.length > 0) {
        setError(
          `There is already a pending/approved request overlapping these dates:\n${conflicts.join(
            " | "
          )}\nPlease adjust your dates or contact your manager.`
        );
        setSubmitting(false);
        return;
      }

      await addDoc(collection(db, "timeOffRequests"), {
        employeeId,
        employeeName,
        reasonType,
        startDate: range.start,
        endDate: range.end,
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

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, rgba(15,92,145,0.92) 0%, rgba(31,124,193,0.86) 42%, rgba(110,198,232,0.82) 100%), url('/flamingo-tpa.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          display: "grid",
          gap: 18,
        }}
      >
        <div
          style={{
            color: "#fff",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.82)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Time Off
          </p>

          <h1
            style={{
              margin: "10px 0 8px",
              fontSize: 34,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Day Off Request
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "rgba(255,255,255,0.90)",
              maxWidth: 620,
              marginInline: "auto",
            }}
          >
            Submit PTO, Sick, Personal or other time off requests for review by
            HR and Management.
          </p>
        </div>

        <PageCard style={{ padding: 26 }}>
          <div style={{ marginBottom: 16 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Request Details
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Complete the form below to submit your request.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Employee Name</FieldLabel>
              <SelectInput
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Select your name</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Reason Type</FieldLabel>
              <SelectInput
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value)}
              >
                <option value="">Select reason</option>
                <option value="PTO">PTO</option>
                <option value="Sick">Sick</option>
                <option value="Personal">Personal</option>
                <option value="Other">Other</option>
              </SelectInput>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <TextInput
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  min={todayStr}
                />
              </div>

              <div>
                <FieldLabel>End Date</FieldLabel>
                <TextInput
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || todayStr}
                />
              </div>
            </div>

            <div>
              <FieldLabel>4-digit PIN</FieldLabel>
              <TextInput
                type="password"
                maxLength={4}
                inputMode="numeric"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                style={{ letterSpacing: "0.25em" }}
                placeholder="Enter 4-digit PIN"
              />
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.6,
                }}
              >
                This PIN is used to check the status of your request later.
              </p>
            </div>

            <div>
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextArea
                rows={4}
                placeholder="Additional details (flight, doctor appointment, etc.)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 16,
                padding: "14px 16px",
                fontSize: 13,
                color: "#334155",
                lineHeight: 1.7,
              }}
            >
              HR and Management may take up to <b>72 hours</b> to approve or
              reject your request.
            </div>

            {error && (
              <div
                style={{
                  whiteSpace: "pre-line",
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "#9f1239",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {error}
              </div>
            )}

            {message && (
              <div
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "#065f46",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 4,
                width: "100%",
                background: submitting
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                borderRadius: 14,
                border: "none",
                padding: "13px 16px",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 800,
                cursor: submitting ? "not-allowed" : "pointer",
                boxShadow: submitting
                  ? "none"
                  : "0 12px 25px rgba(23,105,170,0.28)",
              }}
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </PageCard>
      </div>
    </div>
  );
}
