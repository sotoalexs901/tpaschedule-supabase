// src/pages/EmployeeTimeOffStatusPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, getDoc, doc } from "firebase/firestore";
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

function getStatusStyles(status) {
  const s = String(status || "").toLowerCase();

  if (s === "approved") {
    return {
      badgeBg: "#ecfdf5",
      badgeBorder: "#a7f3d0",
      badgeColor: "#065f46",
      icon: "😊",
      label: "APPROVED",
    };
  }

  if (s === "rejected") {
    return {
      badgeBg: "#fff1f2",
      badgeBorder: "#fecdd3",
      badgeColor: "#9f1239",
      icon: "😞",
      label: "REJECTED",
    };
  }

  if (s === "needs_info") {
    return {
      badgeBg: "#fff7ed",
      badgeBorder: "#fed7aa",
      badgeColor: "#9a3412",
      icon: "📝",
      label: "MORE INFO NEEDED",
    };
  }

  return {
    badgeBg: "#edf7ff",
    badgeBorder: "#cfe7fb",
    badgeColor: "#1769aa",
    icon: "⏳",
    label: (status || "pending").toUpperCase(),
  };
}

export default function EmployeeTimeOffStatusPage() {
  const { user } = useUser();

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadEmployeeProfile() {
      if (!user?.employeeId) {
        setEmployeeId("");
        setEmployeeName(user?.username || "");
        setPageLoading(false);
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
      } finally {
        setPageLoading(false);
      }
    }

    loadEmployeeProfile().catch(console.error);
  }, [user]);

  const handleCheck = async (e) => {
    e.preventDefault();
    setMessage("");
    setRequests([]);

    if (!pin || pin.length !== 4) {
      setMessage("Please enter your 4-digit PIN.");
      return;
    }

    if (!employeeId) {
      setMessage("Employee profile not found.");
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

      list.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
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
          You must be logged in to view your request status.
        </div>
      </PageCard>
    );
  }

  if (pageLoading) {
    return (
      <PageCard style={{ padding: 22 }}>
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 18,
            padding: "16px 18px",
            color: "#475569",
            fontWeight: 700,
          }}
        >
          Loading employee profile...
        </div>
      </PageCard>
    );
  }

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
            My Request Status
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 760,
              fontSize: 14,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Check the current status of your submitted day off and PTO requests.
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
            Check Status
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Enter the same 4-digit PIN you used when sending the request.
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
            request.
          </div>

          <div>
            <ActionButton type="submit" disabled={loading}>
              {loading ? "Checking..." : "Check Status"}
            </ActionButton>
          </div>
        </form>
      </PageCard>

      {message && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {requests.length > 0 && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Request History
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Review the latest updates from management on your submitted requests.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {requests.map((r) => {
              const statusUI = getStatusStyles(r.status);

              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 20,
                    padding: 18,
                    background: "#ffffff",
                    boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 22 }}>{statusUI.icon}</span>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 18,
                            fontWeight: 800,
                            color: "#0f172a",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {r.reasonType || "Request"}
                        </h3>
                      </div>

                      <p
                        style={{
                          margin: "10px 0 0",
                          fontSize: 14,
                          color: "#334155",
                          lineHeight: 1.7,
                        }}
                      >
                        <b>Dates:</b> {r.startDate} → {r.endDate}
                      </p>

                      {r.notes && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: 14,
                            color: "#475569",
                            lineHeight: 1.7,
                          }}
                        >
                          <b>Your notes:</b> {r.notes}
                        </p>
                      )}

                      {r.managerNote && (
                        <p
                          style={{
                            margin: "8px 0 0",
                            fontSize: 14,
                            color: "#475569",
                            lineHeight: 1.7,
                          }}
                        >
                          <b>Management note:</b> {r.managerNote}
                        </p>
                      )}
                    </div>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        border: `1px solid ${statusUI.badgeBorder}`,
                        background: statusUI.badgeBg,
                        color: statusUI.badgeColor,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusUI.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </PageCard>
      )}
    </div>
  );
}
