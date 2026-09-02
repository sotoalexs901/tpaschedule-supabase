// src/pages/TimeOffStatusPublicPage.jsx

import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 20,
        boxShadow: "0 18px 44px rgba(15,23,42,0.14)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
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
        fontSize: 11,
        fontWeight: 800,
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "11px 13px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function getStatusIcon(status) {
  if (status === "approved") return "\u2705";
  if (status === "rejected") return "\u274C";
  if (status === "needs_info") return "\u{1F4DD}";
  return "\u23F3";
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
  const { isMobile, isTablet } = useViewport();

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadEmployees() {
      try {
        setEmployeesLoading(true);

        const snap = await getDocs(collection(db, "employees"));

        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((emp) => String(emp?.name || "").trim())
          .sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""))
          );

        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for status page:", err);
        setMessage("Could not load the employee list. Please try again.");
      } finally {
        setEmployeesLoading(false);
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

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

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
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "center",
        padding: isMobile ? "18px 12px 28px" : "24px 16px",
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: isTablet ? 720 : 760,
          display: "grid",
          gap: isMobile ? 12 : 16,
          minWidth: 0,
        }}
      >
        <div
          style={{
            color: "#fff",
            textAlign: "center",
            padding: isMobile ? "4px 8px 0" : "0 8px",
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{
              width: isMobile ? 42 : 50,
              height: isMobile ? 42 : 50,
              borderRadius: 12,
              background: "#fff",
              objectFit: "contain",
              boxShadow: "0 10px 25px rgba(15,23,42,0.16)",
              marginBottom: isMobile ? 7 : 9,
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 9 : 10,
              textTransform: "uppercase",
              letterSpacing: isMobile ? "0.12em" : "0.16em",
              color: "rgba(255,255,255,0.82)",
              fontWeight: 800,
            }}
          >
            {APP_NAME} {"\u00B7"} Time Off
          </p>

          <h1
            style={{
              margin: isMobile ? "6px 0 5px" : "8px 0 6px",
              fontSize: isMobile ? 23 : 29,
              lineHeight: 1.08,
              fontWeight: 800,
              letterSpacing: "-0.035em",
            }}
          >
            Check Day Off Request Status
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: isMobile ? 11.5 : 13,
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.90)",
              maxWidth: 620,
              marginInline: "auto",
            }}
          >
            Select your name and PIN to review the current status of your time
            off requests.
          </p>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: isMobile ? 9.5 : 10.5,
              color: "rgba(255,255,255,0.72)",
              fontWeight: 700,
            }}
          >
            {APP_SUBTITLE}
          </p>
        </div>

        <PageCard style={{ padding: isMobile ? 16 : 22 }}>
          <div style={{ marginBottom: isMobile ? 12 : 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 17 : 19,
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
                fontSize: isMobile ? 11.5 : 12.5,
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
              gap: isMobile ? 11 : 13,
            }}
          >
            <div>
              <FieldLabel>Employee Name</FieldLabel>

              <SelectInput
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={employeesLoading}
              >
                <option value="">
                  {employeesLoading
                    ? "Loading employees..."
                    : "Select your name"}
                </option>

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
                autoComplete="one-time-code"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                style={{
                  letterSpacing: "0.22em",
                  fontSize: 16,
                  textAlign: "center",
                }}
                placeholder="Enter 4-digit PIN"
              />
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: isMobile ? "11px 12px" : "12px 14px",
                fontSize: isMobile ? 11.5 : 12.5,
                color: "#334155",
                lineHeight: 1.6,
              }}
            >
              HR and Management may take up to <b>72 hours</b> to approve,
              reject, or request more information.
            </div>

            {message && (
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 14,
                  padding: "11px 12px",
                  color: "#9a3412",
                  fontSize: 12.5,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || employeesLoading}
              style={{
                marginTop: 2,
                width: "100%",
                background:
                  loading || employeesLoading
                    ? "#94a3b8"
                    : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                borderRadius: 12,
                border: "none",
                padding: "12px 15px",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 800,
                cursor:
                  loading || employeesLoading ? "not-allowed" : "pointer",
                boxShadow:
                  loading || employeesLoading
                    ? "none"
                    : "0 10px 22px rgba(23,105,170,0.24)",
              }}
            >
              {loading ? "Checking..." : "Check Status"}
            </button>
          </form>

          {requests.length > 0 && (
            <div
              style={{
                marginTop: isMobile ? 14 : 16,
                paddingTop: isMobile ? 14 : 16,
                borderTop: "1px solid #e2e8f0",
                display: "grid",
                gap: 10,
              }}
            >
              {requests.map((r) => {
                const statusStyles = getStatusStyles(r.status);

                return (
                  <div
                    key={r.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding: isMobile ? 12 : 14,
                      background: "#ffffff",
                      boxShadow: "0 6px 18px rgba(15,23,42,0.035)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: isMobile ? 9 : 11,
                      }}
                    >
                      <div
                        style={{
                          fontSize: isMobile ? 21 : 24,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        {getStatusIcon(r.status)}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: isMobile ? 13 : 14,
                            fontWeight: 800,
                            color: "#0f172a",
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                          }}
                        >
                          {r.reasonType || "Reason"} {"\u2014"}{" "}
                          {r.startDate || "\u2014"} {"\u2192"}{" "}
                          {r.endDate || "\u2014"}
                        </div>

                        <div style={{ marginTop: 7 }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 11,
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
                              marginTop: 10,
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                              borderRadius: 12,
                              padding: "10px 11px",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: 10.5,
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
                                margin: "5px 0 0",
                                fontSize: 12.5,
                                color: "#334155",
                                lineHeight: 1.55,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                              }}
                            >
                              {r.managerNote}
                            </p>
                          </div>
                        )}

                        {r.notes && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color: "#64748b",
                              lineHeight: 1.55,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
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
