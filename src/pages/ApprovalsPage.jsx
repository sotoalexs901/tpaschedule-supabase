// src/pages/ApprovalsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

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
  variant = "primary",
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

function StatusBadge({ overBudget }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: overBudget ? "#fff1f2" : "#ecfdf5",
        color: overBudget ? "#9f1239" : "#065f46",
        border: `1px solid ${overBudget ? "#fecdd3" : "#a7f3d0"}`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: overBudget ? "#e11d48" : "#10b981",
        }}
      />
      {overBudget ? "Over budget" : "Within budget"}
    </span>
  );
}

export default function ApprovalsPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const loadPending = async () => {
    setLoading(true);
    setStatusMessage("");
    try {
      const qPending = query(
        collection(db, "schedules"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qPending);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingSchedules(items);
    } catch (err) {
      console.error("Error loading pending schedules:", err);
      setStatusMessage("Could not load pending schedules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const formatWeekLabel = (sch) => {
    if (!sch.days) return "";
    return DAY_KEYS.map((k) => {
      const label = DAY_LABELS[k];
      const num = sch.days[k];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  const handleApprove = async (scheduleId) => {
    const ok = window.confirm("Approve this schedule?");
    if (!ok) return;

    try {
      await updateDoc(doc(db, "schedules", scheduleId), {
        status: "approved",
        approvedBy: user?.username || "station_manager",
        approvedAt: serverTimestamp(),
        reviewNotes: null,
      });

      setPendingSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      setStatusMessage("Schedule approved successfully.");
    } catch (err) {
      console.error("Error approving schedule:", err);
      setStatusMessage("Error approving schedule.");
    }
  };

  const handleReturnToDuty = async (scheduleId) => {
    const note = window.prompt(
      "Reason to return this schedule to Duty Manager:"
    );
    if (note === null) return;

    try {
      await updateDoc(doc(db, "schedules", scheduleId), {
        status: "returned",
        reviewNotes: note,
        reviewedBy: user?.username || "station_manager",
        reviewedAt: serverTimestamp(),
      });

      setPendingSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      setStatusMessage("Schedule returned to Duty Manager.");
    } catch (err) {
      console.error("Error returning schedule:", err);
      setStatusMessage("Error returning schedule.");
    }
  };

  const handleView = (scheduleId) => {
    navigate(`/approved/${scheduleId}`);
  };

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
              TPA OPS · Scheduling
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
              Pending Schedules Approval
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review schedules submitted for approval, validate hours against
              budget, and approve or return them to Duty Manager.
            </p>
          </div>

          <ActionButton onClick={loadPending} variant="secondary">
            Refresh
          </ActionButton>
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
            Loading pending schedules...
          </p>
        </PageCard>
      ) : pendingSchedules.length === 0 ? (
        <PageCard style={{ padding: 22 }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            There are no schedules waiting for approval.
          </p>
        </PageCard>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 18,
          }}
        >
          {pendingSchedules.map((sch) => {
            const totalHours =
              typeof sch.airlineWeeklyHours === "number"
                ? sch.airlineWeeklyHours.toFixed(2)
                : "0.00";

            const overBudget =
              sch.budget && sch.airlineWeeklyHours > sch.budget;

            return (
              <PageCard key={sch.id} style={{ padding: 20 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 19,
                        fontWeight: 800,
                        color: "#0f172a",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                      }}
                    >
                      {sch.airline} — {sch.department}
                    </h2>

                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.5,
                      }}
                    >
                      Week: {formatWeekLabel(sch)}
                    </p>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Created by: <b>{sch.createdBy || "unknown"}</b>
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
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
                        Total hours
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 24,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {totalHours}
                      </p>
                    </div>

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
                        Budget
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 24,
                          fontWeight: 800,
                          color: "#0f172a",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {sch.budget ?? 0}
                      </p>
                    </div>
                  </div>

                  <div>
                    <StatusBadge overBudget={overBudget} />
                  </div>

                  {sch.reviewNotes && (
                    <div
                      style={{
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: 16,
                        padding: "14px 16px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#9a3412",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Last review note
                      </p>
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 13,
                          color: "#7c2d12",
                          lineHeight: 1.55,
                        }}
                      >
                        {sch.reviewNotes}
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={() => handleView(sch.id)}
                    >
                      View schedule
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="primary"
                      onClick={() => handleApprove(sch.id)}
                    >
                      Approve
                    </ActionButton>

                    <ActionButton
                      type="button"
                      variant="danger"
                      onClick={() => handleReturnToDuty(sch.id)}
                    >
                      Return to Duty
                    </ActionButton>
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
