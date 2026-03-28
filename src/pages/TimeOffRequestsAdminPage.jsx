// src/pages/TimeOffRequestsAdminPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },
    success: {
      background: "#ecfdf5",
      color: "#065f46",
      border: "1px solid #a7f3d0",
      boxShadow: "none",
    },
    warning: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
      boxShadow: "none",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
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
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
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

export default function TimeOffRequestsAdminPage() {
  const { user } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [notesById, setNotesById] = useState({});
  const [statusMessage, setStatusMessage] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "timeOffRequests"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRequests(list);
    } catch (err) {
      console.error("Error loading time off requests:", err);
      setStatusMessage("Error loading requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests().catch(console.error);
  }, []);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const updateLocalRequest = (id, patch) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleApprove = async (req) => {
    const note = notesById[req.id] || "";
    const confirmText = `Approve day-off for ${req.employeeName} (${req.reasonType}) from ${req.startDate} to ${req.endDate}?`;
    if (!window.confirm(confirmText)) return;

    try {
      await addDoc(collection(db, "restrictions"), {
        employeeId: req.employeeId || null,
        employeeName: req.employeeName || "",
        reason: `TIME OFF: ${req.reasonType}${req.notes ? " - " + req.notes : ""}`,
        start_date: req.startDate,
        end_date: req.endDate,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
        source: "timeOffRequest",
      });

      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "approved",
        managerNote: note,
        handledBy: user?.username || null,
      });

      setStatusMessage("Request approved.");
    } catch (err) {
      console.error("Error approving request:", err);
      window.alert("Error approving request. Try again.");
    }
  };

  const handleReject = async (req) => {
    const note = notesById[req.id] || "";
    const confirmText = `Reject day-off request from ${req.employeeName}?`;
    if (!window.confirm(confirmText)) return;

    try {
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "rejected",
        managerNote: note,
        handledBy: user?.username || null,
      });

      setStatusMessage("Request rejected.");
    } catch (err) {
      console.error("Error rejecting request:", err);
      window.alert("Error rejecting request. Try again.");
    }
  };

  const handleNeedsInfo = async (req) => {
    const note = notesById[req.id] || "";
    if (!note) {
      window.alert("Please write what additional information is needed.");
      return;
    }

    const confirmText = `Mark request for ${req.employeeName} as 'More info needed'?`;
    if (!window.confirm(confirmText)) return;

    try {
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      updateLocalRequest(req.id, {
        status: "needs_info",
        managerNote: note,
        handledBy: user?.username || null,
      });

      setStatusMessage("Request marked as needs info.");
    } catch (err) {
      console.error("Error setting needs_info:", err);
      window.alert("Error updating request. Try again.");
    }
  };

  const handleDelete = async (req) => {
    const confirmText = `Delete this request from ${req.employeeName}? This cannot be undone.`;
    if (!window.confirm(confirmText)) return;

    try {
      await deleteDoc(doc(db, "timeOffRequests", req.id));
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setStatusMessage("Request deleted.");
    } catch (err) {
      console.error("Error deleting request:", err);
      window.alert("Error deleting request. Try again.");
    }
  };

  const handlePrint = (req) => {
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;

    const html = `
      <html>
        <head>
          <title>Day Off Request - ${req.employeeName}</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 10px; }
            p { font-size: 13px; margin: 4px 0; }
            .label { font-weight: 600; }
            hr { margin: 12px 0; }
          </style>
        </head>
        <body>
          <h1>Day Off Request</h1>
          <p><span class="label">Employee:</span> ${req.employeeName || ""}</p>
          <p><span class="label">Reason:</span> ${req.reasonType || ""}</p>
          <p><span class="label">Dates:</span> ${req.startDate} → ${req.endDate}</p>
          <p><span class="label">Status:</span> ${(req.status || "").toUpperCase()}</p>
          ${
            req.managerNote
              ? `<p><span class="label">Manager note:</span> ${req.managerNote}</p>`
              : ""
          }
          ${
            req.notes
              ? `<p><span class="label">Employee note:</span> ${req.notes}</p>`
              : ""
          }
          <hr />
          <p><span class="label">Handled by:</span> ${req.handledBy || ""}</p>
        </body>
      </html>
    `;

    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const filteredRequests =
    filterStatus === "all"
      ? requests
      : requests.filter((r) => r.status === filterStatus);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
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

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
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
              Day Off Requests
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review, approve, reject, print and manage employee time off
              requests from one place.
            </p>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.16)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 16,
              padding: "12px 14px",
              minWidth: 130,
            }}
          >
            <div
              style={{
                fontSize: 11,
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
                marginTop: 4,
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {pendingCount}
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
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
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
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
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading requests...
          </p>
        </PageCard>
      ) : filteredRequests.length === 0 ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No requests for this filter.
          </p>
        </PageCard>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 14,
          }}
        >
          {filteredRequests.map((req) => (
            <PageCard key={req.id} style={{ padding: 20 }}>
              <div
                style={{
                  display: "grid",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {req.employeeName || "Unknown employee"}
                    </h2>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                        lineHeight: 1.5,
                      }}
                    >
                      {req.reasonType} • {req.startDate} → {req.endDate}
                    </p>

                    <div style={{ marginTop: 10 }}>
                      <span style={statusBadge(req.status)}>
                        {(req.status || "pending").toUpperCase()}
                      </span>
                    </div>

                    {req.managerNote && (
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
                          {req.managerNote}
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      alignSelf: "start",
                    }}
                  >
                    <ActionButton
                      variant="success"
                      onClick={() => handleApprove(req)}
                    >
                      Approve
                    </ActionButton>

                    <ActionButton
                      variant="warning"
                      onClick={() => handleNeedsInfo(req)}
                    >
                      Needs Info
                    </ActionButton>

                    <ActionButton
                      variant="danger"
                      onClick={() => handleReject(req)}
                    >
                      Reject
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={() => handlePrint(req)}
                    >
                      Print
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
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
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#475569",
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    Manager Note
                  </label>

                  <textarea
                    rows={3}
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
          ))}
        </div>
      )}
    </div>
  );
}
