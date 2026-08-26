// src/pages/CabinSavedSchedulesPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const PAGE_SIZE = 50;

// ============================================================
// UI COMPONENTS
// ============================================================

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
  disabled = false,
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
    dark: {
      background: "#0f172a",
      color: "#ffffff",
      border: "none",
      boxShadow: "0 12px 24px rgba(15,23,42,0.14)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
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

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
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
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

// ============================================================
// STATUS
// ============================================================

function statusBadge(status) {
  const s = String(status || "draft").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    textTransform: "capitalize",
  };

  if (s === "approved") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (s === "pending") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (s === "rejected" || s === "returned") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

// ============================================================
// HELPERS
// ============================================================

function formatDateTime(value) {
  if (!value) return "-";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function prettifyCodeName(value) {
  const clean = normalizeText(value);

  if (!clean) return "-";

  if (
    clean.includes(" ") &&
    !clean.includes("_") &&
    !clean.includes(".") &&
    !/@/.test(clean)
  ) {
    return clean;
  }

  if (/^[a-z]+\.[a-z]+$/i.test(clean)) {
    return clean
      .split(".")
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  if (/^[a-z]+_[a-z]+$/i.test(clean)) {
    return clean
      .split("_")
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  if (/@/.test(clean)) {
    const left = clean.split("@")[0] || clean;
    return prettifyCodeName(left);
  }

  if (
    /^[a-z]+[0-9]*$/i.test(clean) &&
    clean === clean.toLowerCase()
  ) {
    return (
      clean.charAt(0).toUpperCase() +
      clean.slice(1)
    );
  }

  return clean;
}

function SummaryBox({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          margin: "8px 0 0",
          fontSize: 22,
          fontWeight: 800,
          color: "#0f172a",
          letterSpacing: "-0.03em",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function CabinSavedSchedulesPage() {
  const navigate = useNavigate();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deletingId, setDeletingId] =
    useState("");

  // Used for Approve / Return to Draft.
  const [updatingStatusId, setUpdatingStatusId] =
    useState("");

  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] =
    useState("");

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
  });

  // ==========================================================
  // LOAD SAVED CABIN SCHEDULES
  // ==========================================================

  useEffect(() => {
    async function loadSchedules() {
      try {
        setLoading(true);
        setError("");
        setStatusMessage("");

        const snap = await getDocs(
          query(
            collection(db, "cabinSchedules"),
            orderBy("createdAt", "desc")
          )
        );

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setSchedules(rows);
      } catch (err) {
        console.error(
          "Error loading saved cabin schedules:",
          err
        );

        setError(
          "Could not load saved cabin schedules."
        );
      } finally {
        setLoading(false);
      }
    }

    loadSchedules();
  }, []);

  // ==========================================================
  // FILTERS
  // ==========================================================

  const filteredSchedules = useMemo(() => {
    return schedules.filter((item) => {
      const status = String(
        item.status || "draft"
      ).toLowerCase();

      if (
        filters.status !== "all" &&
        status !== filters.status
      ) {
        return false;
      }

      const haystack = [
        item.weekStartDate,
        item.weekStart,
        item.createdBy,
        item.createdByName,
        item.createdByUsername,
        item.createdByEmail,
        item.status,
        item.totalFlights,
        item.totalSlots,
        Array.isArray(item.uploadedDays)
          ? item.uploadedDays.join(" ")
          : "",
      ]
        .join(" ")
        .toLowerCase();

      if (
        filters.search &&
        !haystack.includes(
          filters.search
            .toLowerCase()
            .trim()
        )
      ) {
        return false;
      }

      return true;
    });
  }, [schedules, filters]);

  const visibleSchedules = useMemo(() => {
    return filteredSchedules.slice(
      0,
      PAGE_SIZE
    );
  }, [filteredSchedules]);

  // ==========================================================
  // TOTALS
  // ==========================================================

  const totals = useMemo(() => {
    return {
      total: filteredSchedules.length,

      approved: filteredSchedules.filter(
        (item) =>
          String(
            item.status || ""
          ).toLowerCase() === "approved"
      ).length,

      pending: filteredSchedules.filter(
        (item) =>
          String(
            item.status || ""
          ).toLowerCase() === "pending"
      ).length,

      draft: filteredSchedules.filter(
        (item) =>
          !item.status ||
          String(
            item.status || ""
          ).toLowerCase() === "draft"
      ).length,
    };
  }, [filteredSchedules]);

  // ==========================================================
  // APPROVE SCHEDULE
  // ==========================================================

  async function handleApproveSchedule(item) {
    const week =
      item.weekStartDate ||
      item.weekStart ||
      "";

    const confirmed = window.confirm(
      `Approve the Cabin Service schedule for week ${week}?\n\nOnce approved, its assigned hours will be available to the Weekly Employees Summary under Approved schedules.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingStatusId(item.id);
      setStatusMessage("");
      setError("");

      await updateDoc(
        doc(db, "cabinSchedules", item.id),
        {
          status: "approved",
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      // Immediately update the page without
      // requiring a refresh.
      setSchedules((previous) =>
        previous.map((schedule) =>
          schedule.id === item.id
            ? {
                ...schedule,
                status: "approved",
                approvedAt: new Date(),
                updatedAt: new Date(),
              }
            : schedule
        )
      );

      setStatusMessage(
        `Cabin Service schedule for week ${week} has been approved.`
      );
    } catch (err) {
      console.error(
        "Error approving cabin schedule:",
        err
      );

      setError(
        "Could not approve the Cabin Service schedule."
      );
    } finally {
      setUpdatingStatusId("");
    }
  }

  // ==========================================================
  // RETURN APPROVED SCHEDULE TO DRAFT
  // ==========================================================

  async function handleReturnToDraft(item) {
    const week =
      item.weekStartDate ||
      item.weekStart ||
      "";

    const confirmed = window.confirm(
      `Return the Cabin Service schedule for week ${week} to Draft?\n\nIt will no longer be included when Weekly Employees Summary is filtered to Approved schedules.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setUpdatingStatusId(item.id);
      setStatusMessage("");
      setError("");

      await updateDoc(
        doc(db, "cabinSchedules", item.id),
        {
          status: "draft",
          returnedToDraftAt:
            serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setSchedules((previous) =>
        previous.map((schedule) =>
          schedule.id === item.id
            ? {
                ...schedule,
                status: "draft",
                returnedToDraftAt:
                  new Date(),
                updatedAt: new Date(),
              }
            : schedule
        )
      );

      setStatusMessage(
        `Cabin Service schedule for week ${week} was returned to Draft.`
      );
    } catch (err) {
      console.error(
        "Error returning cabin schedule to draft:",
        err
      );

      setError(
        "Could not return the Cabin Service schedule to Draft."
      );
    } finally {
      setUpdatingStatusId("");
    }
  }

  // ==========================================================
  // DELETE
  // ==========================================================

  async function handleDeleteSchedule(
    scheduleId
  ) {
    const confirmed = window.confirm(
      "Delete this saved cabin schedule? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      setDeletingId(scheduleId);
      setStatusMessage("");
      setError("");

      await deleteDoc(
        doc(
          db,
          "cabinSchedules",
          scheduleId
        )
      );

      setSchedules((prev) =>
        prev.filter(
          (item) =>
            item.id !== scheduleId
        )
      );

      setStatusMessage(
        "Saved schedule deleted."
      );
    } catch (err) {
      console.error(
        "Error deleting cabin schedule:",
        err
      );

      setError(
        "Could not delete saved schedule."
      );
    } finally {
      setDeletingId("");
    }
  }

  // ==========================================================
  // OPEN
  // ==========================================================

  function openSchedule(item) {
    navigate(
      `/cabin-saved-schedules/${item.id}`
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
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
            background:
              "rgba(255,255,255,0.08)",
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
              color:
                "rgba(255,255,255,0.78)",
              fontWeight: 700,
            }}
          >
            TPA OPS · Cabin Service
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
            Cabin Saved Schedules
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 780,
              fontSize: 14,
              color:
                "rgba(255,255,255,0.88)",
            }}
          >
            Review, approve and manage all saved
            weekly Cabin Service schedules.
          </p>
        </div>
      </div>

      {/* ======================================================
          STATUS MESSAGE
      ====================================================== */}

      {statusMessage && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#065f46",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      {/* ======================================================
          ERROR
      ====================================================== */}

      {error && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#fff1f2",
              border:
                "1px solid #fecdd3",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {/* ======================================================
          SUMMARY
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <SummaryBox
            label="Schedules"
            value={String(totals.total)}
          />

          <SummaryBox
            label="Approved"
            value={String(
              totals.approved
            )}
          />

          <SummaryBox
            label="Pending"
            value={String(totals.pending)}
          />

          <SummaryBox
            label="Draft"
            value={String(totals.draft)}
          />
        </div>
      </PageCard>

      {/* ======================================================
          FILTERS
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <div
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
              Search
            </div>

            <TextInput
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  search:
                    e.target.value,
                }))
              }
              placeholder="Week, creator, status, uploaded days..."
            />
          </div>

          <div>
            <div
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
              Status
            </div>

            <SelectInput
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status:
                    e.target.value,
                }))
              }
            >
              <option value="all">
                All
              </option>

              <option value="draft">
                Draft
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="approved">
                Approved
              </option>

              <option value="rejected">
                Rejected
              </option>

              <option value="returned">
                Returned
              </option>
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {/* ======================================================
          SAVED SCHEDULES
      ====================================================== */}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Saved Weekly Schedules
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Approve a completed schedule to make
              its assigned hours available to the
              Weekly Employees Summary.
            </p>
          </div>

          <Link
            to="/cabin-service"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent:
                "center",
              padding: "10px 14px",
              borderRadius: 12,
              background: "#ffffff",
              color: "#1769aa",
              border:
                "1px solid #cfe7fb",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Create New Schedule
          </Link>
        </div>

        {loading ? (
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            Loading saved schedules...
          </div>
        ) : visibleSchedules.length ===
          0 ? (
          <div
            style={{
              fontSize: 14,
              color: "#64748b",
              fontWeight: 600,
            }}
          >
            No saved schedules found.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {visibleSchedules.map(
              (item) => {
                const uploadedDays =
                  Array.isArray(
                    item.uploadedDays
                  )
                    ? item.uploadedDays
                    : [];

                const currentStatus =
                  String(
                    item.status ||
                      "draft"
                  )
                    .trim()
                    .toLowerCase();

                const isApproved =
                  currentStatus ===
                  "approved";

                const isUpdating =
                  updatingStatusId ===
                  item.id;

                const isDeleting =
                  deletingId ===
                  item.id;

                return (
                  <div
                    key={item.id}
                    style={{
                      border: isApproved
                        ? "1px solid #a7f3d0"
                        : "1px solid #e2e8f0",
                      borderRadius: 18,
                      padding: 16,
                      background:
                        isApproved
                          ? "#fbfffd"
                          : "#ffffff",
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
                        flexWrap:
                          "wrap",
                      }}
                    >
                      {/* ============================
                          SCHEDULE INFORMATION
                      ============================ */}

                      <div
                        style={{
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems:
                              "center",
                            gap: 10,
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 800,
                              color:
                                "#0f172a",
                            }}
                          >
                            Week of{" "}
                            {item.weekStartDate ||
                              item.weekStart ||
                              "-"}
                          </div>

                          <span
                            style={statusBadge(
                              item.status
                            )}
                          >
                            {item.status ||
                              "draft"}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 14,
                            color: "#475569",
                            lineHeight: 1.6,
                          }}
                        >
                          <div>
                            <b>
                              Created by:
                            </b>{" "}
                            {prettifyCodeName(
                              item.createdByName ||
                                item.createdByDisplayName ||
                                item.createdByFullName ||
                                item.createdByUsername ||
                                item.createdBy ||
                                "-"
                            )}
                          </div>

                          <div>
                            <b>Flights:</b>{" "}
                            {item.totalFlights ||
                              0}{" "}
                            · <b>Slots:</b>{" "}
                            {item.totalSlots ||
                              0}
                          </div>

                          <div>
                            <b>
                              Uploaded days:
                            </b>{" "}
                            {uploadedDays.length
                              ? uploadedDays.join(
                                  ", "
                                )
                              : "-"}
                          </div>

                          <div>
                            <b>
                              Created at:
                            </b>{" "}
                            {formatDateTime(
                              item.createdAt
                            )}
                          </div>

                          {isApproved && (
                            <div
                              style={{
                                marginTop: 5,
                                color:
                                  "#047857",
                                fontWeight:
                                  800,
                              }}
                            >
                              ✓ Included in
                              Approved Weekly
                              Summary
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ============================
                          ACTIONS
                      ============================ */}

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <ActionButton
                          variant="primary"
                          onClick={() =>
                            openSchedule(
                              item
                            )
                          }
                          disabled={
                            isUpdating ||
                            isDeleting
                          }
                        >
                          Open Schedule
                        </ActionButton>

                        {/* ==========================
                            APPROVE
                        ========================== */}

                        {!isApproved && (
                          <ActionButton
                            variant="success"
                            onClick={() =>
                              handleApproveSchedule(
                                item
                              )
                            }
                            disabled={
                              isUpdating ||
                              isDeleting
                            }
                          >
                            {isUpdating
                              ? "Approving..."
                              : "✓ Approve"}
                          </ActionButton>
                        )}

                        {/* ==========================
                            RETURN TO DRAFT
                        ========================== */}

                        {isApproved && (
                          <ActionButton
                            variant="warning"
                            onClick={() =>
                              handleReturnToDraft(
                                item
                              )
                            }
                            disabled={
                              isUpdating ||
                              isDeleting
                            }
                          >
                            {isUpdating
                              ? "Updating..."
                              : "Return to Draft"}
                          </ActionButton>
                        )}

                        {/* ==========================
                            DELETE
                        ========================== */}

                        <ActionButton
                          variant="danger"
                          onClick={() =>
                            handleDeleteSchedule(
                              item.id
                            )
                          }
                          disabled={
                            isDeleting ||
                            isUpdating
                          }
                        >
                          {isDeleting
                            ? "Deleting..."
                            : "Delete"}
                        </ActionButton>
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </PageCard>
    </div>
  );
}
