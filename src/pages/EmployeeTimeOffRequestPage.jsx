// src/pages/EmployeeTimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
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

function ActionButton({
  children,
  type = "button",
  disabled = false,
  onClick,
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        border: "none",
        color: "#fff",
        background:
          "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
        boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();

  const [employeeName, setEmployeeName] = useState("");
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
    async function loadEmployeeProfile() {
      if (!user?.employeeId) {
        setEmployeeId("");
        setEmployeeName(user?.username || "");
        return;
      }

      try {
        const ref = doc(db, "employees", user.employeeId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setEmployeeId(snap.id);
          setEmployeeName(data.name || user.username || "");
        } else {
          setEmployeeId(user.employeeId);
          setEmployeeName(user.username || "");
        }
      } catch (err) {
        console.error("Error loading employee profile:", err);
        setEmployeeName(user?.username || "Unknown");
      }
    }

    loadEmployeeProfile().catch(console.error);
  }, [user]);

  const validateForm = () => {
    if (!reasonType || !startDate || !endDate) {
      setError("Please complete reason and both dates.");
      return false;
    }

    if (!pin || pin.length !== 4) {
      setError("PIN must be 4 digits.");
      return false;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return false;
    }

    return true;
  };

  const checkDuplicateRequest = async () => {
    if (!employeeId) return false;

    const q = query(
      collection(db, "timeOffRequests"),
      where("employeeId", "==", employeeId),
      where("startDate", "==", startDate),
      where("endDate", "==", endDate)
    );

    const snap = await getDocs(q);

    if (snap.empty) return false;

    const hasActive = snap.docs.some((d) => {
      const data = d.data();
      const st = (data.status || "pending").toLowerCase();
      return !["rejected", "cancelled", "deleted"].includes(st);
    });

    return hasActive;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const duplicate = await checkDuplicateRequest();
      if (duplicate) {
        setError(
          "You already have a request for these dates. Please check your status page."
        );
        setSubmitting(false);
        return;
      }

      await addDoc(collection(db, "timeOffRequests"), {
        employeeId: employeeId || null,
        employeeName: employeeName || user?.username || "",
        userLogin: user?.username || null,
        reasonType,
        startDate,
        endDate,
        pin,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        createdVia: "employee_portal",
      });

      setMessage("Your request has been submitted successfully.");
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

  if (!user) {
    return (
      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 18,
            padding: "16px 18px",
            color: "#9f1239",
            fontWeight: 700,
          }}
        >
          You must be logged in to request time off.
        </div>
      </PageCard>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const success = message.toLowerCase().includes("successfully");

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div style={{ position: "relative" }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Time Off
          </p>

          <h1
            style={{
              margin: "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: "-0.04em",
            }}
          >
            Request Day Off / PTO
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Submit your day off, PTO or personal leave request directly from
            your employee portal.
          </p>
        </div>
      </div>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 16,
            padding: "14px 16px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 800,
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Logged Employee
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {employeeName || user.username}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Role: {user.role}
          </p>
        </div>
      </PageCard>

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error
                ? "#fff1f2"
                : success
                ? "#ecfdf5"
                : "#edf7ff",
              border: `1px solid ${
                error ? "#fecdd3" : success ? "#a7f3d0" : "#cfe7fb"
              }`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error ? "#9f1239" : success ? "#065f46" : "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
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
            Submit Request
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Complete the form below. Management may take up to 72 hours to
            review your request.
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
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Start Date</FieldLabel>
              <TextInput
                type="date"
                value={startDate}
                min={todayStr}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
              />
            </div>

            <div>
              <FieldLabel>End Date</FieldLabel>
              <TextInput
                type="date"
                value={endDate}
                min={startDate || todayStr}
                onChange={(e) => setEndDate(e.target.value)}
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
              placeholder="Enter your 4-digit PIN"
              style={{ letterSpacing: "0.2em" }}
            />
          </div>

          <div>
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextArea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details like appointment, emergency, personal explanation, etc."
            />
          </div>

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#475569",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            HR and Management may take up to <b>72 hours</b> to process your
            request. Duplicate requests for the same dates will be blocked.
          </div>

          <div>
            <ActionButton type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </ActionButton>
          </div>
        </form>
      </PageCard>
    </div>
  );
}
