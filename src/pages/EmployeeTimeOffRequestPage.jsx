// src/pages/EmployeeTimeOffRequestPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";
import { triggerTimeOffSubmittedPush } from "../utils/timeOffPush.js";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
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
        fontSize: 12,
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        fontFamily: "inherit",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        background: disabled
          ? "#94a3b8"
          : "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
        boxShadow: disabled
          ? "none"
          : "0 12px 24px rgba(23,105,170,0.18)",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "\u2014";

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeStatus(value) {
  const status = String(value || "pending")
    .trim()
    .toLowerCase();

  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "needs_info") return "needs_info";

  return "pending";
}

function getStatusLabel(value) {
  const status = normalizeStatus(value);

  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "needs_info") return "Needs Info";

  return "Pending";
}

function getStatusTone(value) {
  const status = normalizeStatus(value);

  if (status === "approved") {
    return {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    };
  }

  if (status === "rejected") {
    return {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    };
  }

  if (status === "needs_info") {
    return {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    };
  }

  return {
    background: "#eff6ff",
    color: "#1769aa",
    border: "1px solid #bfdbfe",
  };
}

function StatusSummary({ label, value, tone }) {
  const tones = {
    blue: {
      background: "#eff6ff",
      color: "#1769aa",
      border: "1px solid #bfdbfe",
    },
    green: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    },
    orange: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    },
    red: {
      background: "#fff1f2",
      color: "#9f1239",
      border: "1px solid #fecdd3",
    },
  };

  return (
    <div
      style={{
        ...tones[tone],
        minWidth: 66,
        borderRadius: 12,
        padding: "7px 9px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 2,
          fontSize: 17,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TimeOffStatusCard({ request }) {
  const status = normalizeStatus(request.status);
  const tone = getStatusTone(status);

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 14,
        background: "#ffffff",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            {request.reasonType || "Time Off"}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            {formatDate(request.startDate)}
            {request.endDate && request.endDate !== request.startDate
              ? ` \u2192 ${formatDate(request.endDate)}`
              : ""}
          </div>
        </div>

        <span
          style={{
            ...tone,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "6px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      {request.notes && (
        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            borderRadius: 12,
            padding: "9px 10px",
            fontSize: 12,
            color: "#475569",
            lineHeight: 1.55,
          }}
        >
          <strong>My note: </strong>
          {request.notes}
        </div>
      )}

      {request.managerNote && (
        <div
          style={{
            background:
              status === "approved"
                ? "#f0fdf4"
                : status === "rejected"
                ? "#fff1f2"
                : "#fff7ed",
            border:
              status === "approved"
                ? "1px solid #bbf7d0"
                : status === "rejected"
                ? "1px solid #fecdd3"
                : "1px solid #fed7aa",
            borderRadius: 12,
            padding: "10px 11px",
            color:
              status === "approved"
                ? "#166534"
                : status === "rejected"
                ? "#9f1239"
                : "#9a3412",
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <strong>Management note: </strong>
          {request.managerNote}
        </div>
      )}

      {status === "approved" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#166534",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Your request has been approved.
        </div>
      )}

      {status === "rejected" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#9f1239",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Your request was not approved. Review the Management note if one was
          provided.
        </div>
      )}

      {status === "needs_info" && (
        <div
          style={{
            fontSize: 11.5,
            color: "#9a3412",
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Management needs additional information before making a decision.
        </div>
      )}
    </div>
  );
}

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");

  const [reasonType, setReasonType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const [myRequests, setMyRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ============================================================
  // LOAD LOGGED EMPLOYEE
  // ============================================================

  useEffect(() => {
    async function loadEmployeeProfile() {
      if (!user) {
        setEmployeeId("");
        setEmployeeName("");
        return;
      }

      if (!user?.employeeId) {
        setEmployeeId("");
        setEmployeeName(
          user?.displayName ||
            user?.fullName ||
            user?.name ||
            user?.username ||
            ""
        );
        return;
      }

      try {
        const ref = doc(db, "employees", user.employeeId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();

          setEmployeeId(snap.id);

          setEmployeeName(
            data.name ||
              data.fullName ||
              data.displayName ||
              user?.displayName ||
              user?.username ||
              ""
          );

          setEmployeeDepartment(data.department || "");
          setEmployeePosition(data.position || "");
        } else {
          setEmployeeId(user.employeeId);

          setEmployeeName(
            user?.displayName ||
              user?.fullName ||
              user?.name ||
              user?.username ||
              ""
          );
        }
      } catch (err) {
        console.error("Error loading employee profile:", err);

        setEmployeeId(user?.employeeId || "");

        setEmployeeName(
          user?.displayName ||
            user?.fullName ||
            user?.name ||
            user?.username ||
            "Unknown"
        );
      }
    }

    loadEmployeeProfile().catch(console.error);
  }, [user]);

  // ============================================================
  // LIVE STATUS
  // ============================================================

  useEffect(() => {
    if (!employeeId) {
      setMyRequests([]);
      setRequestsLoading(false);
      return undefined;
    }

    setRequestsLoading(true);

    const qRef = query(
      collection(db, "timeOffRequests"),
      where("employeeId", "==", employeeId)
    );

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((a, b) => {
            const aSeconds = a.createdAt?.seconds || 0;
            const bSeconds = b.createdAt?.seconds || 0;

            if (aSeconds !== bSeconds) {
              return bSeconds - aSeconds;
            }

            return String(b.startDate || "").localeCompare(
              String(a.startDate || "")
            );
          });

        setMyRequests(list);
        setRequestsLoading(false);
      },
      (err) => {
        console.error("Error loading time off status:", err);
        setRequestsLoading(false);
      }
    );

    return () => unsub();
  }, [employeeId]);

  // ============================================================
  // VALIDATION
  // ============================================================

  const validateForm = () => {
    if (!reasonType || !startDate || !endDate) {
      setError("Please complete reason and both dates.");
      return false;
    }

    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return false;
    }

    if (!employeeId) {
      setError(
        "Your employee profile is not linked to this account. Please contact Management."
      );
      return false;
    }

    return true;
  };

  const checkDuplicateRequest = async () => {
    if (!employeeId) return false;

    const qRef = query(
      collection(db, "timeOffRequests"),
      where("employeeId", "==", employeeId),
      where("startDate", "==", startDate),
      where("endDate", "==", endDate)
    );

    const snap = await getDocs(qRef);

    if (snap.empty) return false;

    return snap.docs.some((item) => {
      const data = item.data();
      const status = normalizeStatus(data.status);

      return !["rejected"].includes(status);
    });
  };

  // ============================================================
  // SUBMIT
  // ============================================================

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
          "You already have an active request for these dates. Review your requests below."
        );
        return;
      }

      const requestRef = await addDoc(
        collection(db, "timeOffRequests"),
        {
          employeeId,
          employeeName:
            employeeName ||
            user?.displayName ||
            user?.username ||
            "",

          department:
            employeeDepartment ||
            user?.department ||
            "",

          position:
            employeePosition ||
            user?.position ||
            "",

          userLogin:
            user?.username ||
            user?.loginUsername ||
            null,

          requestedByUserId:
            user?.id ||
            "",

          requestedByUsername:
            user?.username ||
            user?.loginUsername ||
            "",

          requestedByName:
            user?.displayName ||
            user?.fullName ||
            user?.name ||
            employeeName ||
            "",

          requestedByRole:
            user?.role ||
            "",

          reasonType,
          startDate,
          endDate,
          notes:
            notes.trim(),

          status:
            "pending",

          createdAt:
            serverTimestamp(),

          createdVia:
            "authenticated_employee_portal",

          managementSubmissionPushStatus:
            "PENDING",

          managementSubmissionPushError:
            "",
        }
      );

      // The request is already stored before Push delivery is attempted.
      triggerTimeOffSubmittedPush(requestRef.id);

      setMessage(
        "Your request has been submitted successfully. You can track the status below."
      );

      setReasonType("");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (err) {
      console.error("Error submitting time off request:", err);

      setError(
        "There was an error submitting your request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const statusCounts = useMemo(() => {
    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
      needsInfo: 0,
    };

    myRequests.forEach((request) => {
      const status = normalizeStatus(request.status);

      if (status === "approved") {
        result.approved += 1;
      } else if (status === "rejected") {
        result.rejected += 1;
      } else if (status === "needs_info") {
        result.needsInfo += 1;
      } else {
        result.pending += 1;
      }
    });

    return result;
  }, [myRequests]);

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
        maxWidth: 940,
        margin: "0 auto",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #071c33 0%, #0f4c81 48%, #1769aa 72%, #62c4ef 100%)",
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

        <div
          style={{
            position: "relative",
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              overflow: "hidden",
              background: "#ffffff",
              border: "1px solid rgba(255,255,255,0.86)",
              flexShrink: 0,
            }}
          >
            <img
              src="/icons/aerostation-icon.png"
              alt={APP_NAME}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.76)",
                fontWeight: 800,
              }}
            >
              {APP_NAME} {"\u00B7"} My Time Off
            </p>

            <h1
              style={{
                margin: "6px 0 4px",
                fontSize: 28,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing: "-0.04em",
              }}
            >
              Request & Track Time Off
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 13,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.5,
              }}
            >
              Submit your request and monitor Management's decision from the
              same AeroStation Hub page.
            </p>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 10,
                color: "rgba(255,255,255,0.70)",
                fontWeight: 700,
              }}
            >
              {APP_SUBTITLE}
            </p>
          </div>
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
              fontWeight: 900,
              color: "#1769aa",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Signed In Employee
          </p>

          <p
            style={{
              margin: "8px 0 0",
              fontSize: 20,
              fontWeight: 900,
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
            {[
              employeePosition || user?.position,
              employeeDepartment || user?.department,
            ]
              .filter(Boolean)
              .join(" \u00B7 ") || `Role: ${user.role}`}
          </p>

          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              padding: "6px 9px",
              borderRadius: 999,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontSize: 10.5,
              fontWeight: 900,
            }}
          >
            No PIN required
          </div>
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
                error
                  ? "#fecdd3"
                  : success
                  ? "#a7f3d0"
                  : "#cfe7fb"
              }`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error
                ? "#9f1239"
                : success
                ? "#065f46"
                : "#1769aa",
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
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            New Request
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Your request is automatically linked to your signed-in employee
            account. Management may take up to 72 hours to review it.
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
              disabled={submitting}
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
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <FieldLabel>Start Date</FieldLabel>

              <TextInput
                type="date"
                value={startDate}
                min={todayStr}
                disabled={submitting}
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
                disabled={submitting}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notes (optional)</FieldLabel>

            <TextArea
              rows={4}
              value={notes}
              disabled={submitting}
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
            Management may take up to <b>72 hours</b> to process your request.
            You will receive a Push notification when Management approves,
            rejects, or requests more information.
          </div>

          <div>
            <ActionButton
              type="submit"
              disabled={submitting || !employeeId}
            >
              {submitting
                ? "Submitting..."
                : !employeeId
                ? "Employee Profile Not Linked"
                : "Submit Request"}
            </ActionButton>
          </div>
        </form>
      </PageCard>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              My Time Off Requests
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Status updates appear here automatically.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <StatusSummary
              label="Pending"
              value={statusCounts.pending}
              tone="blue"
            />

            <StatusSummary
              label="Approved"
              value={statusCounts.approved}
              tone="green"
            />

            <StatusSummary
              label="Needs Info"
              value={statusCounts.needsInfo}
              tone="orange"
            />

            <StatusSummary
              label="Rejected"
              value={statusCounts.rejected}
              tone="red"
            />
          </div>
        </div>

        {requestsLoading ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              color: "#64748b",
              fontSize: 13,
            }}
          >
            Loading your requests...
          </div>
        ) : myRequests.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 14,
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            You do not have any Time Off requests yet.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
            }}
          >
            {myRequests.map((request) => (
              <TimeOffStatusCard
                key={request.id}
                request={request}
              />
            ))}
          </div>
        )}
      </PageCard>
    </div>
  );
}

// END EmployeeTimeOffRequestPage
