// src/pages/TimeOffStatusPublicPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
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

function getStatusIcon(status) {
  if (status === "approved") return "😊";
  if (status === "rejected") return "😞";
  if (status === "needs_info") return "📝";
  return "⏳";
}

function getStatusLabel(status) {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "needs_info") return "MORE INFO NEEDED";
  return (status || "pending").toUpperCase();
}

function getStatusStyles(status) {
  if (status === "approved") {
    return {
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
    };
  }
  if (status === "rejected") {
    return {
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#9f1239",
    };
  }
  if (status === "needs_info") {
    return {
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#9a3412",
    };
  }
  return {
    background: "#edf7ff",
    border: "1px solid #cfe7fb",
    color: "#1769aa",
  };
}

export default function TimeOffStatusPublicPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for status page:", err);
      }
    }
    loadEmployees().catch(console.error);
  }, []);

  const handleCheck = async (e) => {
    e.preventDefault();
    setMessage("");
    setRequests([]);

    if (!employeeId || pin.length !== 4) {
      setMessage("Please select your name and enter your 4-digit PIN.");
      return;
    }

    try {
      setLoading(true);

      const qReq = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId),
        where("pin", "==", pin)
      );

      const snap = await getDocs(qReq);
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      if (list.length === 0) {
        setMessage("No requests found for this employee and PIN.");
      } else {
        setRequests(list);
      }
    } catch (err) {
      console.error("Error checking time off status:", err);
      setMessage("Error loading status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
            Check Day Off Request Status
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
            Select your name and PIN to review the current status of your time
            off requests.
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
              Status Lookup
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Enter your information below to see submitted requests.
            </p>
          </div>

          <form
            onSubmit={handleCheck}
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
              HR and Management may take up to <b>72 hours</b> to approve,
              reject or request more information.
            </div>

            {message && (
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 16,
                  padding: "14px 16px",
                  color: "#9a3412",
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
              disabled={loading}
              style={{
                marginTop: 4,
                width: "100%",
                background: loading
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                borderRadius: 14,
                border: "none",
                padding: "13px 16px",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading
                  ? "none"
                  : "0 12px 25px rgba(23,105,170,0.28)",
              }}
            >
              {loading ? "Checking..." : "Check Status"}
            </button>
          </form>

          {requests.length > 0 && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid #e2e8f0",
                display: "grid",
                gap: 12,
              }}
            >
              {requests.map((r) => {
                const statusStyles = getStatusStyles(r.status);

                return (
                  <div
                    key={r.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 20,
                      padding: 16,
                      background: "#ffffff",
                      boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 26,
                          lineHeight: 1,
                        }}
                      >
                        {getStatusIcon(r.status)}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: "#0f172a",
                            lineHeight: 1.3,
                          }}
                        >
                          {r.reasonType || "Reason"} — {r.startDate} → {r.endDate}
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "7px 12px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              ...statusStyles,
                            }}
                          >
                            {getStatusLabel(r.status)}
                          </span>
                        </div>

                        {r.managerNote && (
                          <div
                            style={{
                              marginTop: 12,
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                              borderRadius: 14,
                              padding: "12px 14px",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12,
                                fontWeight: 800,
                                color: "#1769aa",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              Message from Management
                            </p>
                            <p
                              style={{
                                margin: "6px 0 0",
                                fontSize: 13,
                                color: "#334155",
                                lineHeight: 1.6,
                              }}
                            >
                              {r.managerNote}
                            </p>
                          </div>
                        )}

                        {r.notes && (
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 13,
                              color: "#64748b",
                              lineHeight: 1.6,
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>Your notes: </span>
                            {r.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PageCard>
      </div>
    </div>
  );
}
