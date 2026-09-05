// src/pages/EmployeeTimeOffStatusPage.jsx
// This route/component is now used as the employee-facing Training Notices page.

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Employee"
  );
}

function formatDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "No due date";

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

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDaysUntilDue(dateValue) {
  const raw = String(dateValue || "").trim();

  if (!raw) return null;

  const due = new Date(`${raw}T00:00:00`);
  const today = new Date(`${getTodayKey()}T00:00:00`);

  if (
    Number.isNaN(due.getTime()) ||
    Number.isNaN(today.getTime())
  ) {
    return null;
  }

  return Math.ceil(
    (due.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function getTrainingState(notice) {
  const storedStatus = normalizeText(
    notice?.status || "pending"
  );

  if (
    storedStatus === "completed" ||
    storedStatus === "complete"
  ) {
    return "completed";
  }

  const daysUntilDue = getDaysUntilDue(
    notice?.dueDate
  );

  if (
    daysUntilDue !== null &&
    daysUntilDue < 0
  ) {
    return "overdue";
  }

  if (
    daysUntilDue !== null &&
    daysUntilDue <= 7
  ) {
    return "due_soon";
  }

  return "pending";
}

function getTrainingStateLabel(state) {
  if (state === "completed") {
    return "Completed";
  }

  if (state === "overdue") {
    return "Overdue";
  }

  if (state === "due_soon") {
    return "Due Soon";
  }

  return "Pending";
}

function getTrainingStateStyle(state) {
  if (state === "completed") {
    return {
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
    };
  }

  if (state === "overdue") {
    return {
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#9f1239",
    };
  }

  if (state === "due_soon") {
    return {
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#9a3412",
    };
  }

  return {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1769aa",
  };
}

function getTrainingStateIcon(state) {
  if (state === "completed") {
    return "\u2705";
  }

  if (state === "overdue") {
    return "\u{1F6A8}";
  }

  if (state === "due_soon") {
    return "\u23F0";
  }

  return "\u{1F4DA}";
}

function StatusSummary({
  label,
  value,
  tone,
}) {
  const tones = {
    blue: {
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1769aa",
    },
    orange: {
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      color: "#9a3412",
    },
    red: {
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#9f1239",
    },
    green: {
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
    },
  };

  const style = tones[tone] || tones.blue;

  return (
    <div
      style={{
        ...style,
        minWidth: 68,
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

function TrainingNoticeCard({
  notice,
  busy,
  onAcknowledge,
}) {
  const state = getTrainingState(notice);
  const stateStyle = getTrainingStateStyle(state);
  const stateLabel = getTrainingStateLabel(state);
  const stateIcon = getTrainingStateIcon(state);
  const acknowledged =
    notice?.acknowledged === true ||
    Boolean(notice?.acknowledgedAt);

  const daysUntilDue =
    getDaysUntilDue(
      notice?.dueDate
    );

  return (
    <div
      style={{
        border:
          state === "overdue"
            ? "1px solid #fecdd3"
            : state === "due_soon"
            ? "1px solid #fed7aa"
            : "1px solid #e2e8f0",
        borderRadius: 18,
        padding: 15,
        background: "#ffffff",
        boxShadow:
          "0 8px 22px rgba(15,23,42,0.04)",
        display: "grid",
        gap: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems:
              "flex-start",
            gap: 11,
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background:
                stateStyle.background,
              border:
                stateStyle.border,
              color:
                stateStyle.color,
              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",
              fontSize: 19,
              flexShrink: 0,
            }}
          >
            {stateIcon}
          </div>

          <div
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#0f172a",
                lineHeight: 1.35,
              }}
            >
              {notice.trainingName ||
                notice.title ||
                "Training Required"}
            </div>

            {notice.trainingCategory && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: "#1769aa",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.05em",
                }}
              >
                {notice.trainingCategory}
              </div>
            )}
          </div>
        </div>

        <span
          style={{
            ...stateStyle,
            display:
              "inline-flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding:
              "6px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 900,
            whiteSpace:
              "nowrap",
          }}
        >
          {stateLabel}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        <InfoBox
          label="Due Date"
          value={
            notice.dueDate
              ? formatDate(
                  notice.dueDate
                )
              : "No due date"
          }
        />

        <InfoBox
          label="Assigned By"
          value={
            notice.assignedByName ||
            notice.assignedByUsername ||
            "Management"
          }
        />

        <InfoBox
          label="Acknowledged"
          value={
            acknowledged
              ? "Yes"
              : "No"
          }
        />
      </div>

      {daysUntilDue !== null &&
        state !== "completed" && (
          <div
            style={{
              borderRadius: 12,
              padding: "9px 10px",
              background:
                state === "overdue"
                  ? "#fff1f2"
                  : state === "due_soon"
                  ? "#fff7ed"
                  : "#f8fbff",
              border:
                state === "overdue"
                  ? "1px solid #fecdd3"
                  : state === "due_soon"
                  ? "1px solid #fed7aa"
                  : "1px solid #dbeafe",
              color:
                state === "overdue"
                  ? "#9f1239"
                  : state === "due_soon"
                  ? "#9a3412"
                  : "#475569",
              fontSize: 11.5,
              fontWeight: 800,
            }}
          >
            {state === "overdue"
              ? `Training is overdue by ${Math.abs(
                  daysUntilDue
                )} day${
                  Math.abs(
                    daysUntilDue
                  ) === 1
                    ? ""
                    : "s"
                }.`
              : daysUntilDue === 0
              ? "Training is due today."
              : `Training is due in ${daysUntilDue} day${
                  daysUntilDue === 1
                    ? ""
                    : "s"
                }.`}
          </div>
        )}

      {(notice.message ||
        notice.instructions) && (
        <div
          style={{
            borderRadius: 13,
            background: "#f8fbff",
            border:
              "1px solid #dbeafe",
            padding: "11px 12px",
            color: "#475569",
            fontSize: 12.5,
            lineHeight: 1.65,
            whiteSpace: "pre-line",
          }}
        >
          {notice.message ||
            notice.instructions}
        </div>
      )}

      {notice.trainingLink && (
        <a
          href={
            notice.trainingLink
          }
          target="_blank"
          rel="noreferrer"
          style={{
            textDecoration: "none",
            display: "block",
          }}
        >
          <div
            style={{
              borderRadius: 12,
              padding:
                "10px 12px",
              textAlign: "center",
              background:
                "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
              color: "#ffffff",
              fontSize: 12.5,
              fontWeight: 900,
              boxShadow:
                "0 10px 20px rgba(23,105,170,0.16)",
            }}
          >
            Open Training
          </div>
        </a>
      )}

      {!acknowledged && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onAcknowledge(
              notice
            )
          }
          style={{
            width: "100%",
            borderRadius: 12,
            border:
              "1px solid #cfe7fb",
            background:
              busy
                ? "#f1f5f9"
                : "#ffffff",
            color:
              busy
                ? "#94a3b8"
                : "#1769aa",
            padding:
              "10px 12px",
            fontSize: 12.5,
            fontWeight: 900,
            cursor:
              busy
                ? "not-allowed"
                : "pointer",
          }}
        >
          {busy
            ? "Saving..."
            : "Acknowledge Notice"}
        </button>
      )}

      {acknowledged && (
        <div
          style={{
            textAlign: "center",
            fontSize: 11.5,
            fontWeight: 800,
            color: "#64748b",
          }}
        >
          Notice acknowledged. Training completion status is controlled by
          Management.
        </div>
      )}
    </div>
  );
}

function InfoBox({
  label,
  value,
}) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border:
          "1px solid #e5eef8",
        borderRadius: 12,
        padding: "9px 10px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          color: "#94a3b8",
          fontWeight: 900,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: "#334155",
          fontWeight: 800,
          lineHeight: 1.4,
          wordBreak:
            "break-word",
        }}
      >
        {value ||
          "\u2014"}
      </div>
    </div>
  );
}

export default function EmployeeTimeOffStatusPage() {
  const { user } = useUser();

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");

  const [notices, setNotices] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [busyNoticeId, setBusyNoticeId] = useState("");
  const [message, setMessage] = useState("");

  // ============================================================
  // LOAD EMPLOYEE PROFILE
  // ============================================================

  useEffect(() => {
    async function loadEmployeeProfile() {
      if (!user) {
        setEmployeeId("");
        setEmployeeName("");
        setPageLoading(false);
        return;
      }

      if (!user?.employeeId) {
        setEmployeeId("");
        setEmployeeName(
          getVisibleUserName(
            user
          )
        );
        setEmployeeDepartment(
          user?.department ||
            ""
        );
        setEmployeePosition(
          user?.position ||
            ""
        );
        setPageLoading(false);
        return;
      }

      try {
        const ref = doc(
          db,
          "employees",
          user.employeeId
        );

        const snap =
          await getDoc(ref);

        if (snap.exists()) {
          const data =
            snap.data();

          setEmployeeId(
            snap.id
          );

          setEmployeeName(
            data.name ||
              data.fullName ||
              data.displayName ||
              getVisibleUserName(
                user
              )
          );

          setEmployeeDepartment(
            data.department ||
              user?.department ||
              ""
          );

          setEmployeePosition(
            data.position ||
              user?.position ||
              ""
          );
        } else {
          setEmployeeId(
            user.employeeId
          );

          setEmployeeName(
            getVisibleUserName(
              user
            )
          );

          setEmployeeDepartment(
            user?.department ||
              ""
          );

          setEmployeePosition(
            user?.position ||
              ""
          );
        }
      } catch (err) {
        console.error(
          "Error loading employee profile for Training Notices:",
          err
        );

        setEmployeeId(
          user?.employeeId ||
            ""
        );

        setEmployeeName(
          getVisibleUserName(
            user
          )
        );

        setEmployeeDepartment(
          user?.department ||
            ""
        );

        setEmployeePosition(
          user?.position ||
            ""
        );
      } finally {
        setPageLoading(
          false
        );
      }
    }

    loadEmployeeProfile().catch(
      console.error
    );
  }, [user]);

  // ============================================================
  // LIVE TRAINING NOTICES
  // ============================================================

  useEffect(() => {
    if (!employeeId) {
      setNotices([]);
      setNoticesLoading(false);
      return undefined;
    }

    setNoticesLoading(true);

    const qNotices = query(
      collection(
        db,
        "training_notices"
      ),
      where(
        "employeeId",
        "==",
        employeeId
      )
    );

    const unsub =
      onSnapshot(
        qNotices,
        (snap) => {
          const list =
            snap.docs
              .map(
                (item) => ({
                  id:
                    item.id,
                  ...item.data(),
                })
              )
              .filter(
                (notice) =>
                  normalizeText(
                    notice.visibility ||
                      "active"
                  ) !==
                  "archived"
              )
              .sort(
                (a, b) => {
                  const aCompleted =
                    getTrainingState(
                      a
                    ) ===
                    "completed";

                  const bCompleted =
                    getTrainingState(
                      b
                    ) ===
                    "completed";

                  if (
                    aCompleted !==
                    bCompleted
                  ) {
                    return aCompleted
                      ? 1
                      : -1;
                  }

                  const aDue =
                    String(
                      a.dueDate ||
                        "9999-12-31"
                    );

                  const bDue =
                    String(
                      b.dueDate ||
                        "9999-12-31"
                    );

                  if (
                    aDue !==
                    bDue
                  ) {
                    return aDue.localeCompare(
                      bDue
                    );
                  }

                  return (
                    (b.createdAt
                      ?.seconds ||
                      0) -
                    (a.createdAt
                      ?.seconds ||
                      0)
                  );
                }
              );

          setNotices(
            list
          );

          setNoticesLoading(
            false
          );
        },
        (err) => {
          console.error(
            "Error listening Training Notices:",
            err
          );

          setNoticesLoading(
            false
          );

          setMessage(
            "Could not load your Training Notices. Please try again."
          );
        }
      );

    return () =>
      unsub();
  }, [employeeId]);

  // ============================================================
  // ACKNOWLEDGE NOTICE
  // ============================================================

  const handleAcknowledge =
    async (notice) => {
      if (!notice?.id) {
        return;
      }

      try {
        setBusyNoticeId(
          notice.id
        );

        setMessage("");

        await updateDoc(
          doc(
            db,
            "training_notices",
            notice.id
          ),
          {
            acknowledged:
              true,
            acknowledgedAt:
              serverTimestamp(),
            acknowledgedByUserId:
              user?.id ||
              "",
            acknowledgedByUsername:
              user?.username ||
              user?.loginUsername ||
              "",
          }
        );

        setMessage(
          "Training notice acknowledged successfully."
        );
      } catch (err) {
        console.error(
          "Error acknowledging Training Notice:",
          err
        );

        setMessage(
          "Could not acknowledge this notice. Please try again."
        );
      } finally {
        setBusyNoticeId(
          ""
        );
      }
    };

  const counts =
    useMemo(() => {
      const result = {
        pending: 0,
        dueSoon: 0,
        overdue: 0,
        completed: 0,
        unread: 0,
      };

      notices.forEach(
        (notice) => {
          const state =
            getTrainingState(
              notice
            );

          if (
            state ===
            "completed"
          ) {
            result.completed += 1;
          } else if (
            state ===
            "overdue"
          ) {
            result.overdue += 1;
          } else if (
            state ===
            "due_soon"
          ) {
            result.dueSoon += 1;
          } else {
            result.pending += 1;
          }

          const acknowledged =
            notice
              ?.acknowledged ===
              true ||
            Boolean(
              notice
                ?.acknowledgedAt
            );

          if (
            !acknowledged
          ) {
            result.unread += 1;
          }
        }
      );

      return result;
    }, [notices]);

  if (!user) {
    return (
      <PageCard
        style={{
          padding: 22,
        }}
      >
        <div
          style={{
            background:
              "#fff1f2",
            border:
              "1px solid #fecdd3",
            borderRadius: 18,
            padding:
              "16px 18px",
            color:
              "#9f1239",
            fontWeight: 700,
          }}
        >
          You must be logged in to view your Training Notices.
        </div>
      </PageCard>
    );
  }

  if (pageLoading) {
    return (
      <PageCard
        style={{
          padding: 22,
        }}
      >
        <div
          style={{
            background:
              "#f8fbff",
            border:
              "1px solid #dbeafe",
            borderRadius: 18,
            padding:
              "16px 18px",
            color:
              "#475569",
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
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 940,
        margin:
          "0 auto",
        width:
          "100%",
        minWidth: 0,
        boxSizing:
          "border-box",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #071c33 0%, #0f4c81 48%, #1769aa 72%, #62c4ef 100%)",
          borderRadius: 28,
          padding: 24,
          color:
            "#fff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
          position:
            "relative",
          overflow:
            "hidden",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width: 220,
            height: 220,
            borderRadius:
              "999px",
            background:
              "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position:
              "relative",
            display:
              "flex",
            gap: 14,
            alignItems:
              "center",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              overflow:
                "hidden",
              background:
                "#ffffff",
              border:
                "1px solid rgba(255,255,255,0.86)",
              flexShrink: 0,
            }}
          >
            <img
              src="/icons/aerostation-icon.png"
              alt={APP_NAME}
              style={{
                width:
                  "100%",
                height:
                  "100%",
                objectFit:
                  "contain",
              }}
            />
          </div>

          <div
            style={{
              minWidth: 0,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.16em",
                color:
                  "rgba(255,255,255,0.76)",
                fontWeight: 800,
              }}
            >
              {APP_NAME} {"\u00B7"} Training
            </p>

            <h1
              style={{
                margin:
                  "6px 0 4px",
                fontSize: 28,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing:
                  "-0.04em",
              }}
            >
              Training Notices
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 13,
                color:
                  "rgba(255,255,255,0.88)",
                lineHeight: 1.5,
              }}
            >
              Review training assignments, deadlines and instructions sent
              directly to you by Management.
            </p>

            <p
              style={{
                margin:
                  "4px 0 0",
                fontSize: 10,
                color:
                  "rgba(255,255,255,0.70)",
                fontWeight: 700,
              }}
            >
              {APP_SUBTITLE}
            </p>
          </div>
        </div>
      </div>

      <PageCard
        style={{
          padding: 18,
        }}
      >
        <div
          style={{
            background:
              "#f8fbff",
            border:
              "1px solid #dbeafe",
            borderRadius: 16,
            padding:
              "14px 16px",
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            gap: 12,
            flexWrap:
              "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 900,
                color:
                  "#1769aa",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.08em",
              }}
            >
              Employee
            </p>

            <p
              style={{
                margin:
                  "8px 0 0",
                fontSize: 20,
                fontWeight: 900,
                color:
                  "#0f172a",
              }}
            >
              {employeeName ||
                user.username}
            </p>

            <p
              style={{
                margin:
                  "4px 0 0",
                fontSize: 13,
                color:
                  "#64748b",
              }}
            >
              {[
                employeePosition ||
                  user?.position,
                employeeDepartment ||
                  user?.department,
              ]
                .filter(
                  Boolean
                )
                .join(
                  " \u00B7 "
                ) ||
                `Role: ${user.role}`}
            </p>
          </div>

          {counts.unread >
            0 && (
            <div
              style={{
                minWidth: 42,
                height: 42,
                padding:
                  "0 11px",
                borderRadius:
                  999,
                background:
                  "#dc2626",
                color:
                  "#ffffff",
                display:
                  "inline-flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                fontSize: 14,
                fontWeight: 900,
                boxShadow:
                  "0 8px 18px rgba(220,38,38,0.22)",
              }}
            >
              {counts.unread >
              99
                ? "99+"
                : counts.unread}
            </div>
          )}
        </div>
      </PageCard>

      <PageCard
        style={{
          padding: 18,
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
            gap: 12,
            flexWrap:
              "wrap",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color:
                  "#0f172a",
                letterSpacing:
                  "-0.02em",
              }}
            >
              My Training Status
            </h2>

            <p
              style={{
                margin:
                  "4px 0 0",
                fontSize: 12,
                color:
                  "#64748b",
                lineHeight: 1.5,
              }}
            >
              Completion status is maintained by Management.
            </p>
          </div>

          <div
            style={{
              display:
                "flex",
              gap: 6,
              flexWrap:
                "wrap",
            }}
          >
            <StatusSummary
              label="Pending"
              value={
                counts.pending
              }
              tone="blue"
            />

            <StatusSummary
              label="Due Soon"
              value={
                counts.dueSoon
              }
              tone="orange"
            />

            <StatusSummary
              label="Overdue"
              value={
                counts.overdue
              }
              tone="red"
            />

            <StatusSummary
              label="Completed"
              value={
                counts.completed
              }
              tone="green"
            />
          </div>
        </div>
      </PageCard>

      {message && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              background:
                message
                  .toLowerCase()
                  .includes(
                    "successfully"
                  )
                  ? "#ecfdf5"
                  : "#fff7ed",
              border:
                message
                  .toLowerCase()
                  .includes(
                    "successfully"
                  )
                  ? "1px solid #a7f3d0"
                  : "1px solid #fed7aa",
              borderRadius: 14,
              padding:
                "11px 12px",
              color:
                message
                  .toLowerCase()
                  .includes(
                    "successfully"
                  )
                  ? "#065f46"
                  : "#9a3412",
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      <PageCard
        style={{
          padding: 18,
        }}
      >
        <div
          style={{
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color:
                "#0f172a",
              letterSpacing:
                "-0.02em",
            }}
          >
            Assigned Trainings
          </h2>

          <p
            style={{
              margin:
                "4px 0 0",
              fontSize: 12,
              color:
                "#64748b",
              lineHeight: 1.5,
            }}
          >
            New notices and status changes appear here automatically.
          </p>
        </div>

        {!employeeId ? (
          <div
            style={{
              padding: 18,
              textAlign:
                "center",
              background:
                "#fff7ed",
              border:
                "1px solid #fed7aa",
              borderRadius: 14,
              color:
                "#9a3412",
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            Your employee profile is not linked to this AeroStation Hub
            account. Please contact Management.
          </div>
        ) : noticesLoading ? (
          <div
            style={{
              padding: 18,
              textAlign:
                "center",
              color:
                "#64748b",
              fontSize: 13,
            }}
          >
            Loading your Training Notices...
          </div>
        ) : notices.length ===
          0 ? (
          <div
            style={{
              padding: 18,
              textAlign:
                "center",
              background:
                "#f8fbff",
              border:
                "1px solid #dbeafe",
              borderRadius: 14,
              color:
                "#64748b",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            You do not have any Training Notices assigned at this time.
          </div>
        ) : (
          <div
            style={{
              display:
                "grid",
              gap: 10,
            }}
          >
            {notices.map(
              (notice) => (
                <TrainingNoticeCard
                  key={
                    notice.id
                  }
                  notice={
                    notice
                  }
                  busy={
                    busyNoticeId ===
                    notice.id
                  }
                  onAcknowledge={
                    handleAcknowledge
                  }
                />
              )
            )}
          </div>
        )}
      </PageCard>
    </div>
  );
}

// END EmployeeTimeOffStatusPage
