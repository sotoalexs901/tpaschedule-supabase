// src/pages/TimeOffRequestsAdminPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";
import { createOperationalAlert } from "../utils/operationalAlerts.js";
import { triggerTimeOffDecisionPush } from "../utils/timeOffPush.js";

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
        background: "rgba(255,255,255,0.94)",
        border: "1px solid #e2e8f0",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function statusBadge(status) {
  const s = String(status || "pending").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (s === "approved") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (s === "rejected") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }

  if (s === "needs_info") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

export default function TimeOffRequestsAdminPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [notesById, setNotesById] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");

  const canAccess =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const loadRequests = async () => {
    setLoading(true);

    try {
      const q = query(collection(db, "timeOffRequests"));
      const snap = await getDocs(q);

      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

      setRequests(list);

      setNotesById((prev) => {
        const next = { ...prev };
        for (const req of list) {
          if (next[req.id] === undefined && req.managerNote) {
            next[req.id] = req.managerNote;
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Error loading time off requests:", err);
      setStatusMessage("Error loading requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) {
      loadRequests().catch(console.error);
    } else {
      setLoading(false);
    }
  }, [canAccess]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  const updateLocalRequest = (id, patch) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const sendLowStatusAlert = async (req, nextStatus, note = "") => {
    try {
      const statusLabel =
        nextStatus === "approved"
          ? "Approved"
          : nextStatus === "rejected"
          ? "Rejected"
          : nextStatus === "needs_info"
          ? "More Info Needed"
          : nextStatus;

      await createOperationalAlert({
        alertType: "TIME_OFF_STATUS_UPDATED",
        category: "TIME_OFF",
        severity: "LOW",
        priority: "LOW",
        title: `Day Off Request ${statusLabel}`,
        message: [
          `${req.employeeName || "Employee"}'s day off request was updated to ${statusLabel}.`,
          `${req.startDate || ""} to ${req.endDate || ""}.`,
          req.reasonType ? `Reason: ${req.reasonType}.` : "",
          note ? `Management note: ${note}` : "",
          `Handled by: ${getVisibleName(user)}.`,
        ]
          .filter(Boolean)
          .join(" "),
        source: "TimeOffRequestsAdminPage",
        sourceId: req.id,
        department: req.department || "",
        reportDate: req.startDate || "",
        targetRoles: ["station_manager", "duty_manager"],
        createdByUserId: user?.id || "",
        createdByUsername: user?.username || "",
        createdByName: getVisibleName(user),
        createdByRole: user?.role || "",
        metadata: {
          timeOffRequestId: req.id,
          employeeId: req.employeeId || "",
          employeeName: req.employeeName || "",
          reasonType: req.reasonType || "",
          startDate: req.startDate || "",
          endDate: req.endDate || "",
          newStatus: nextStatus,
          managerNote: note,
        },
      });
    } catch (alertErr) {
      console.error("Time Off status alert error:", alertErr);
    }
  };

  const handleApprove = async (req) => {
    if (req.status === "approved") {
      setStatusMessage("This request is already approved.");
      return;
    }

    const note = notesById[req.id] || "";
    const confirmText = `Approve day-off for ${req.employeeName} (${req.reasonType}) from ${req.startDate} to ${req.endDate}?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await addDoc(collection(db, "restrictions"), {
        employeeId: req.employeeId || null,
        employeeName: req.employeeName || "",
        reason: `TIME OFF: ${req.reasonType}${
          req.notes ? " - " + req.notes : ""
        }`,
        start_date: req.startDate,
        end_date: req.endDate,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
        source: "timeOffRequest",
        sourceRequestId: req.id,
      });

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "approved",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The approval is already saved before Push is requested.
      // The server resolves the employee's linked AeroStation Hub user account.
      triggerTimeOffDecisionPush(req.id, "approved");

      await sendLowStatusAlert(req, "approved", note);
      setStatusMessage("Request approved.");
    } catch (err) {
      console.error("Error approving request:", err);
      setStatusMessage("Error approving request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleReject = async (req) => {
    if (req.status === "rejected") {
      setStatusMessage("This request is already rejected.");
      return;
    }

    const note = notesById[req.id] || "";
    const confirmText = `Reject day-off request from ${req.employeeName}?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "rejected",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The rejection is already saved before Push is requested.
      triggerTimeOffDecisionPush(req.id, "rejected");

      await sendLowStatusAlert(req, "rejected", note);
      setStatusMessage("Request rejected.");
    } catch (err) {
      console.error("Error rejecting request:", err);
      setStatusMessage("Error rejecting request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleNeedsInfo = async (req) => {
    const note = String(notesById[req.id] || "").trim();

    if (!note) {
      setStatusMessage("Please write what additional information is needed.");
      return;
    }

    const confirmText = `Mark request for ${req.employeeName} as 'More info needed'?`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
        handledAt: serverTimestamp(),

        decisionPushStatus: "PENDING",
        decisionPushDecision: "needs_info",
        decisionPushError: "",
      });

      updateLocalRequest(req.id, {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledByName: getVisibleName(user),
      });

      // Fire-and-forget. The request update is already saved before Push is requested.
      triggerTimeOffDecisionPush(req.id, "needs_info");

      await sendLowStatusAlert(req, "needs_info", note);
      setStatusMessage("Request marked as needs info.");
    } catch (err) {
      console.error("Error setting needs_info:", err);
      setStatusMessage("Error updating request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handleDelete = async (req) => {
    const confirmText = `Delete this request from ${req.employeeName}? This cannot be undone.`;

    if (!window.confirm(confirmText)) return;

    try {
      setBusyRequestId(req.id);

      await deleteDoc(doc(db, "timeOffRequests", req.id));

      setRequests((prev) => prev.filter((r) => r.id !== req.id));

      setNotesById((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });

      setStatusMessage("Request deleted.");
    } catch (err) {
      console.error("Error deleting request:", err);
      setStatusMessage("Error deleting request. Try again.");
    } finally {
      setBusyRequestId("");
    }
  };

  const handlePrint = (req) => {
    const win = window.open("", "_blank", "width=720,height=850");

    if (!win) {
      setStatusMessage("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Day Off Request - ${req.employeeName || ""}</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              padding: 24px;
              color: #0f172a;
            }
            .brand {
              font-size: 11px;
              font-weight: 800;
              color: #1769aa;
              text-transform: uppercase;
              letter-spacing: .08em;
            }
            h1 {
              margin: 6px 0 4px;
              font-size: 24px;
            }
            .subtitle {
              margin-bottom: 20px;
              font-size: 12px;
              color: #64748b;
            }
            .card {
              border: 1px solid #dbeafe;
              border-radius: 12px;
              padding: 10px 12px;
              margin-bottom: 8px;
              background: #f8fbff;
            }
            .label {
              font-size: 10px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
            }
            .value {
              margin-top: 4px;
              font-size: 13px;
              font-weight: 700;
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <div class="brand">${APP_NAME}</div>
          <h1>Day Off Request</h1>
          <div class="subtitle">${APP_SUBTITLE}</div>

          <div class="card">
            <div class="label">Employee</div>
            <div class="value">${req.employeeName || ""}</div>
          </div>

          <div class="card">
            <div class="label">Reason</div>
            <div class="value">${req.reasonType || ""}</div>
          </div>

          <div class="card">
            <div class="label">Dates</div>
            <div class="value">${req.startDate || ""} to ${
      req.endDate || ""
    }</div>
          </div>

          <div class="card">
            <div class="label">Status</div>
            <div class="value">${String(
              req.status || "pending"
            ).toUpperCase()}</div>
          </div>

          ${
            req.managerNote
              ? `<div class="card"><div class="label">Manager Note</div><div class="value">${req.managerNote}</div></div>`
              : ""
          }

          ${
            req.notes
              ? `<div class="card"><div class="label">Employee Note</div><div class="value">${req.notes}</div></div>`
              : ""
          }

          <div class="card">
            <div class="label">Handled By</div>
            <div class="value">${
              req.handledByName || req.handledBy || ""
            }</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const filteredRequests = useMemo(() => {
    if (filterStatus === "all") return requests;
    return requests.filter((r) => r.status === filterStatus);
  }, [requests, filterStatus]);

  if (!canAccess) {
    return (
      <PageCard style={{ padding: 18 }}>
        Only Duty Managers and Station Managers can view this page.
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 18 : 22,
          padding: isMobile
            ? "14px"
            : isTablet
            ? "16px 18px"
            : "18px 20px",
          color: "#fff",
          boxShadow: "0 18px 42px rgba(23,105,170,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.07)",
            top: -92,
            right: -28,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            gap: isMobile ? 10 : 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: isMobile ? 5 : 7,
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: isMobile ? 34 : 40,
                  height: isMobile ? 34 : 40,
                  borderRadius: 10,
                  objectFit: "contain",
                  background: "#ffffff",
                  flexShrink: 0,
                }}
              />

              <p
                style={{
                  margin: 0,
                  fontSize: isMobile ? 9 : 10,
                  textTransform: "uppercase",
                  letterSpacing: isMobile ? "0.12em" : "0.16em",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 800,
                }}
              >
                {APP_NAME} {"\u00B7"} Time Off Management
              </p>
            </div>

            <h1
              style={{
                margin: "0 0 4px",
                fontSize: isMobile ? 20 : isTablet ? 23 : 25,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.035em",
              }}
            >
              Day Off Requests
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: isMobile ? 11.5 : 12.5,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review, approve, reject, print and manage employee time off
              requests.
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

          <div
            style={{
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: isMobile ? "9px 11px" : "10px 12px",
              minWidth: isMobile ? 0 : 118,
              width: isMobile ? "fit-content" : "auto",
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 800,
              }}
            >
              Pending
            </div>

            <div
              style={{
                marginTop: 3,
                fontSize: isMobile ? 22 : 26,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {pendingCount}
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: isMobile ? 12 : 16 }}>
          <div
            style={{
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              borderRadius: 14,
              padding: "12px 14px",
              color: "#1769aa",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 12 : 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "pending", label: "Pending" },
            { key: "approved", label: "Approved" },
            { key: "rejected", label: "Rejected" },
            { key: "needs_info", label: "Needs Info" },
            { key: "all", label: "All" },
          ].map((f) => (
            <ActionButton
              key={f.key}
              variant={filterStatus === f.key ? "primary" : "secondary"}
              onClick={() => setFilterStatus(f.key)}
            >
              {f.label}
            </ActionButton>
          ))}
        </div>
      </PageCard>

      {loading ? (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Loading requests...
          </p>
        </PageCard>
      ) : filteredRequests.length === 0 ? (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            No requests for this filter.
          </p>
        </PageCard>
      ) : (
        <div style={{ display: "grid", gap: isMobile ? 10 : 12 }}>
          {filteredRequests.map((req) => {
            const currentStatus = String(req.status || "pending").toLowerCase();
            const busy = busyRequestId === req.id;
            const canProcess =
              currentStatus === "pending" || currentStatus === "needs_info";

            return (
              <PageCard
                key={req.id}
                style={{ padding: isMobile ? 14 : 18 }}
              >
                <div style={{ display: "grid", gap: 13 }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      alignItems: isMobile ? "stretch" : "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: isMobile ? 16 : 18,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.02em",
                          wordBreak: "break-word",
                        }}
                      >
                        {req.employeeName || "Unknown employee"}
                      </h2>

                      <p
                        style={{
                          margin: "5px 0 0",
                          fontSize: isMobile ? 12 : 13,
                          color: "#64748b",
                          lineHeight: 1.5,
                          wordBreak: "break-word",
                        }}
                      >
                        {req.reasonType || "Reason"} {"\u00B7"}{" "}
                        {req.startDate || "\u2014"} {"\u2192"}{" "}
                        {req.endDate || "\u2014"}
                      </p>

                      <div style={{ marginTop: 8 }}>
                        <span style={statusBadge(req.status)}>
                          {currentStatus.toUpperCase()}
                        </span>
                      </div>

                      {req.notes && (
                        <div
                          style={{
                            marginTop: 10,
                            background: "#f8fbff",
                            border: "1px solid #dbeafe",
                            borderRadius: 12,
                            padding: "10px 11px",
                            fontSize: 12.5,
                            color: "#334155",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          <strong>Employee note: </strong>
                          {req.notes}
                        </div>
                      )}

                      {req.managerNote && (
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
                            {req.managerNote}
                          </p>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                        justifyContent: isMobile ? "flex-start" : "flex-end",
                      }}
                    >
                      {canProcess && (
                        <>
                          <ActionButton
                            variant="success"
                            disabled={busy}
                            onClick={() => handleApprove(req)}
                          >
                            Approve
                          </ActionButton>

                          <ActionButton
                            variant="warning"
                            disabled={busy}
                            onClick={() => handleNeedsInfo(req)}
                          >
                            Needs Info
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            disabled={busy}
                            onClick={() => handleReject(req)}
                          >
                            Reject
                          </ActionButton>
                        </>
                      )}

                      <ActionButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handlePrint(req)}
                      >
                        Print
                      </ActionButton>

                      <ActionButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() => handleDelete(req)}
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </div>

                  <div>
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
                      Manager Note
                    </label>

                    <textarea
                      rows={3}
                      disabled={busy}
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
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      placeholder='e.g. "More documentation needed, please pass by the office."'
                      value={notesById[req.id] || ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [req.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </PageCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
