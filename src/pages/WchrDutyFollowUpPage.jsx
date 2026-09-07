// src/pages/WchrDutyFollowUpPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
}

function tsToDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function formatDateTime(value) {
  const date = tsToDate(value);

  if (!date) return "—";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getReportOperationalStatus(report) {
  if (!report) return "MISSING";

  const trackingStatus = safeUpper(
    report.tracking_status || "IN_PROGRESS"
  );

  const delivered =
    report.passenger_delivered === true ||
    trackingStatus === "COMPLETED" ||
    Boolean(report.delivered_at) ||
    Boolean(report.dropoff_at);

  const stored =
    trackingStatus === "STORED" ||
    Boolean(report.stored_at) ||
    (
      report.is_active === false &&
      safeText(report.current_location) ===
        "Wheelchair Storage"
    );

  if (stored) {
    return "STORED";
  }

  if (delivered) {
    return "PENDING_STORAGE";
  }

  return "PENDING_DELIVERY";
}

function statusBadge(status) {
  const normalized = safeUpper(status);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 850,
    border: "1px solid transparent",
  };

  if (normalized === "OPEN") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (normalized === "COMPLETED") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (normalized === "PENDING_DELIVERY") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fdba74",
    };
  }

  if (normalized === "PENDING_STORAGE") {
    return {
      ...base,
      background: "#fefce8",
      color: "#854d0e",
      borderColor: "#fde68a",
    };
  }

  if (normalized === "STORED") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (normalized === "MISSING") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow: "0 14px 34px rgba(15,23,42,0.055)",
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
  disabled = false,
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#fff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
        fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone = "blue" }) {
  const tones = {
    blue: {
      bg: "#eff6ff",
      border: "#bfdbfe",
      color: "#1d4ed8",
    },
    orange: {
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
    amber: {
      bg: "#fefce8",
      border: "#fde68a",
      color: "#854d0e",
    },
    green: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#065f46",
    },
  };

  const selected = tones[tone] || tones.blue;

  return (
    <div
      style={{
        background: selected.bg,
        border: `1px solid ${selected.border}`,
        borderRadius: 14,
        padding: "11px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 850,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 20,
          fontWeight: 900,
          color: selected.color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function WchrDutyFollowUpPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [closures, setClosures] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportDetails, setReportDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [filter, setFilter] = useState("OPEN");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const role = safeText(user?.role).toLowerCase();

  const canComplete =
    role === "duty_manager" ||
    role === "station_manager";

  const currentUserId =
    safeText(
      user?.id ||
        user?.uid ||
        user?.username
    );

  const currentUserName =
    safeText(
      user?.fullName ||
        user?.displayName ||
        user?.name ||
        user?.username
    );

  const loadClosures = async () => {
    setLoading(true);
    setError("");

    try {
      const snap = await getDocs(
        collection(
          db,
          "wchr_operational_closures"
        )
      );

      const items = snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter(
          (item) =>
            item.requiresDutyFollowUp === true
        )
        .sort((a, b) =>
          String(
            b.operationalDate || b.id
          ).localeCompare(
            String(
              a.operationalDate || a.id
            )
          )
        );

      setClosures(items);

      if (
        selectedId &&
        !items.some(
          (item) =>
            item.id === selectedId
        )
      ) {
        setSelectedId("");
        setReportDetails([]);
      }
    } catch (loadError) {
      console.error(
        "Error loading WCHR follow-up closures:",
        loadError
      );

      setError(
        loadError?.message ||
          "Could not load WCHR follow-up items."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClosures().catch(
      console.error
    );
  }, []);

  const filteredClosures = useMemo(() => {
    if (filter === "ALL") {
      return closures;
    }

    return closures.filter(
      (item) =>
        safeUpper(
          item.dutyFollowUpStatus ||
            "OPEN"
        ) === filter
    );
  }, [closures, filter]);

  const selectedClosure = useMemo(
    () =>
      closures.find(
        (item) =>
          item.id === selectedId
      ) || null,
    [closures, selectedId]
  );

  const liveSummary = useMemo(() => {
    return reportDetails.reduce(
      (summary, item) => {
        summary.total += 1;

        const status =
          item.currentStatus;

        if (status === "STORED") {
          summary.stored += 1;
        } else if (
          status ===
          "PENDING_STORAGE"
        ) {
          summary.pendingStorage += 1;
        } else if (
          status ===
          "PENDING_DELIVERY"
        ) {
          summary.pendingDelivery += 1;
        } else if (
          status === "MISSING"
        ) {
          summary.missing += 1;
        }

        return summary;
      },
      {
        total: 0,
        stored: 0,
        pendingDelivery: 0,
        pendingStorage: 0,
        missing: 0,
      }
    );
  }, [reportDetails]);

  const allResolved =
    reportDetails.length > 0 &&
    liveSummary.stored ===
      reportDetails.length;

  const loadReportDetails =
    async (closure) => {
      setSelectedId(closure.id);
      setLoadingReports(true);
      setMessage("");
      setError("");

      try {
        const ids =
          Array.isArray(
            closure.unresolvedReportIds
          )
            ? closure.unresolvedReportIds.filter(
                Boolean
              )
            : [];

        const snapshots =
          await Promise.all(
            ids.map(async (reportId) => {
              try {
                const snap =
                  await getDoc(
                    doc(
                      db,
                      "wch_reports",
                      reportId
                    )
                  );

                if (!snap.exists()) {
                  return {
                    id: reportId,
                    exists: false,
                    currentStatus:
                      "MISSING",
                  };
                }

                const data =
                  snap.data();

                return {
                  id: snap.id,
                  exists: true,
                  ...data,
                  currentStatus:
                    getReportOperationalStatus(
                      data
                    ),
                };
              } catch (readError) {
                console.error(
                  "Error loading WCHR report:",
                  reportId,
                  readError
                );

                return {
                  id: reportId,
                  exists: false,
                  currentStatus:
                    "MISSING",
                };
              }
            })
          );

        setReportDetails(
          snapshots
        );
      } catch (detailsError) {
        console.error(
          "Error loading WCHR report details:",
          detailsError
        );

        setError(
          detailsError?.message ||
            "Could not load the pending WCHR details."
        );
      } finally {
        setLoadingReports(false);
      }
    };

  const handleRefreshSelected =
    async () => {
      if (!selectedClosure) {
        return;
      }

      await loadReportDetails(
        selectedClosure
      );
    };

  const handleCompleteFollowUp =
    async () => {
      if (
        !selectedClosure ||
        !canComplete
      ) {
        return;
      }

      if (!reportDetails.length) {
        setError(
          "Load the pending WCHR details before completing follow-up."
        );
        return;
      }

      if (!allResolved) {
        setError(
          "Follow-up cannot be completed yet. All pending WCHR records must be Stored / Not In Use."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Complete WCHR Duty Follow-Up for ${selectedClosure.operationalDate || selectedClosure.id}?\n\nAll pending wheelchair records are now Stored / Not In Use.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setCompleting(true);
        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            "wchr_operational_closures",
            selectedClosure.id
          ),
          {
            dutyFollowUpStatus:
              "COMPLETED",

            dutyFollowUpCompletedByUserId:
              currentUserId,

            dutyFollowUpCompletedByName:
              currentUserName,

            dutyFollowUpCompletedByRole:
              safeText(user?.role),

            dutyFollowUpCompletedAt:
              serverTimestamp(),

            dutyFollowUpFinalStoredCount:
              liveSummary.stored,

            dutyFollowUpFinalPendingDeliveryCount:
              liveSummary.pendingDelivery,

            dutyFollowUpFinalPendingStorageCount:
              liveSummary.pendingStorage,

            dutyFollowUpFinalMissingCount:
              liveSummary.missing,

            updatedAt:
              serverTimestamp(),
          }
        );

        setMessage(
          "WCHR Duty Follow-Up completed successfully."
        );

        await loadClosures();

        setClosures(
          (previous) =>
            previous.map((item) =>
              item.id ===
              selectedClosure.id
                ? {
                    ...item,
                    dutyFollowUpStatus:
                      "COMPLETED",
                    dutyFollowUpCompletedByName:
                      currentUserName,
                    dutyFollowUpCompletedAt:
                      new Date(),
                  }
                : item
            )
        );
      } catch (completeError) {
        console.error(
          "Error completing WCHR follow-up:",
          completeError
        );

        setError(
          completeError?.message ||
            "Could not complete WCHR Duty Follow-Up."
        );
      } finally {
        setCompleting(false);
      }
    };

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        maxWidth: 1380,
        margin: "0 auto",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #7c2d12 0%, #c2410c 48%, #f59e0b 100%)",
          color: "#fff",
          borderRadius: 26,
          padding: 22,
          boxShadow:
            "0 20px 48px rgba(194,65,12,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems:
              "flex-start",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 850,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.12em",
                opacity: 0.82,
              }}
            >
              WCHR Management
            </div>

            <h1
              style={{
                margin:
                  "5px 0 4px",
                fontSize: 27,
                fontWeight: 900,
              }}
            >
              Duty Follow-Up
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 13,
                lineHeight: 1.6,
                opacity: 0.9,
              }}
            >
              Review unresolved WCHR items transferred from Operational Day Close and confirm when every wheelchair has returned to storage.
            </p>
          </div>

          <ActionButton
            variant="secondary"
            onClick={() =>
              navigate(
                "/wchr/admin/flights"
              )
            }
          >
            Back to WCHR Reports
          </ActionButton>
        </div>
      </div>

      {(error || message) && (
        <PageCard
          style={{ padding: 15 }}
        >
          <div
            style={{
              borderRadius: 14,
              padding: "12px 14px",
              background: error
                ? "#fff1f2"
                : "#ecfdf5",
              border: `1px solid ${
                error
                  ? "#fecdd3"
                  : "#a7f3d0"
              }`,
              color: error
                ? "#be123c"
                : "#065f46",
              fontSize: 13,
              fontWeight: 750,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard
        style={{ padding: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {[
              ["OPEN", "Open"],
              ["COMPLETED", "Completed"],
              ["ALL", "All"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setFilter(value)
                }
                style={{
                  borderRadius: 999,
                  border:
                    filter === value
                      ? "1px solid #1769aa"
                      : "1px solid #dbeafe",
                  background:
                    filter === value
                      ? "#1769aa"
                      : "#fff",
                  color:
                    filter === value
                      ? "#fff"
                      : "#1769aa",
                  padding:
                    "7px 11px",
                  fontSize: 11.5,
                  fontWeight: 850,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <ActionButton
            variant="secondary"
            onClick={() =>
              loadClosures()
            }
          >
            Refresh
          </ActionButton>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(300px, 0.9fr) minmax(0, 1.4fr)",
          gap: 16,
        }}
      >
        <PageCard
          style={{ padding: 16 }}
        >
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 18,
              fontWeight: 850,
              color: "#0f172a",
            }}
          >
            Operational Closures
          </h2>

          {loading ? (
            <div
              style={{
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Loading follow-up items...
            </div>
          ) : filteredClosures.length ===
            0 ? (
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background:
                  "#f8fafc",
                border:
                  "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: 13,
              }}
            >
              No WCHR follow-up items match this filter.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 9,
              }}
            >
              {filteredClosures.map(
                (item) => {
                  const active =
                    item.id ===
                    selectedId;

                  const status =
                    safeUpper(
                      item.dutyFollowUpStatus ||
                        "OPEN"
                    );

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        loadReportDetails(
                          item
                        )
                      }
                      style={{
                        textAlign:
                          "left",
                        borderRadius: 15,
                        padding:
                          "12px 13px",
                        border: active
                          ? "2px solid #1769aa"
                          : "1px solid #e2e8f0",
                        background:
                          active
                            ? "#eff6ff"
                            : "#fff",
                        cursor:
                          "pointer",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          gap: 8,
                          alignItems:
                            "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize:
                              14,
                            fontWeight:
                              900,
                            color:
                              "#0f172a",
                          }}
                        >
                          {item.operationalDate ||
                            item.id}
                        </div>

                        <span
                          style={statusBadge(
                            status
                          )}
                        >
                          {status}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          fontSize:
                            11.5,
                          lineHeight:
                            1.55,
                          color:
                            "#64748b",
                        }}
                      >
                        Pending at close:{" "}
                        <b>
                          {Number(
                            item.unresolvedCount ||
                              0
                          )}
                        </b>
                        <br />
                        Closed by:{" "}
                        <b>
                          {item.closedByName ||
                            "—"}
                        </b>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </PageCard>

        <PageCard
          style={{ padding: 16 }}
        >
          {!selectedClosure ? (
            <div
              style={{
                padding: 18,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              Select an operational closure to review its pending WCHR items.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems:
                    "flex-start",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 19,
                      fontWeight: 900,
                      color: "#0f172a",
                    }}
                  >
                    Follow-Up{" "}
                    {selectedClosure.operationalDate ||
                      selectedClosure.id}
                  </h2>

                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 12,
                      color: "#64748b",
                      lineHeight: 1.55,
                    }}
                  >
                    Closed by{" "}
                    <b>
                      {selectedClosure.closedByName ||
                        "—"}
                    </b>{" "}
                    on{" "}
                    <b>
                      {formatDateTime(
                        selectedClosure.closedAt
                      )}
                    </b>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={
                      handleRefreshSelected
                    }
                    disabled={
                      loadingReports
                    }
                  >
                    {loadingReports
                      ? "Refreshing..."
                      : "Refresh WCHR Status"}
                  </ActionButton>

                  {safeUpper(
                    selectedClosure.dutyFollowUpStatus ||
                      "OPEN"
                  ) !==
                    "COMPLETED" && (
                    <ActionButton
                      variant="success"
                      onClick={
                        handleCompleteFollowUp
                      }
                      disabled={
                        completing ||
                        !canComplete ||
                        !allResolved
                      }
                    >
                      {completing
                        ? "Completing..."
                        : "Complete Follow-Up"}
                    </ActionButton>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 8,
                }}
              >
                <Metric
                  label="Pending at Close"
                  value={Number(
                    selectedClosure.unresolvedCount ||
                      0
                  )}
                />

                <Metric
                  label="Now Stored"
                  value={
                    liveSummary.stored
                  }
                  tone="green"
                />

                <Metric
                  label="Pending Delivery"
                  value={
                    liveSummary.pendingDelivery
                  }
                  tone="orange"
                />

                <Metric
                  label="Pending Storage"
                  value={
                    liveSummary.pendingStorage
                  }
                  tone="amber"
                />
              </div>

              {safeUpper(
                selectedClosure.dutyFollowUpStatus ||
                  "OPEN"
              ) === "COMPLETED" && (
                <div
                  style={{
                    padding:
                      "12px 13px",
                    borderRadius: 14,
                    background:
                      "#ecfdf5",
                    border:
                      "1px solid #a7f3d0",
                    color:
                      "#065f46",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    fontWeight: 750,
                  }}
                >
                  Follow-up completed by{" "}
                  <b>
                    {selectedClosure.dutyFollowUpCompletedByName ||
                      "—"}
                  </b>{" "}
                  on{" "}
                  <b>
                    {formatDateTime(
                      selectedClosure.dutyFollowUpCompletedAt
                    )}
                  </b>
                  .
                </div>
              )}

              {loadingReports ? (
                <div
                  style={{
                    color: "#64748b",
                    fontSize: 13,
                  }}
                >
                  Loading current WCHR status...
                </div>
              ) : reportDetails.length ===
                0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background:
                      "#f8fafc",
                    border:
                      "1px solid #e2e8f0",
                    color: "#64748b",
                    fontSize: 13,
                  }}
                >
                  No unresolved report IDs were recorded for this closure.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 9,
                  }}
                >
                  {reportDetails.map(
                    (report) => (
                      <div
                        key={report.id}
                        style={{
                          border:
                            "1px solid #e2e8f0",
                          borderRadius: 15,
                          padding:
                            "12px 13px",
                          background:
                            "#fff",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            gap: 10,
                            flexWrap:
                              "wrap",
                            alignItems:
                              "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize:
                                  14,
                                fontWeight:
                                  900,
                                color:
                                  "#0f172a",
                              }}
                            >
                              Wheelchair{" "}
                              {report.wheelchair_number ||
                                report.wheelchairNumber ||
                                "—"}
                            </div>

                            <div
                              style={{
                                marginTop:
                                  4,
                                fontSize:
                                  11.5,
                                color:
                                  "#64748b",
                              }}
                            >
                              Flight{" "}
                              {report.flight_number ||
                                report.flightNumber ||
                                "—"}{" "}
                              · Passenger{" "}
                              {report.passenger_name ||
                                report.passengerName ||
                                "—"}
                            </div>
                          </div>

                          <span
                            style={statusBadge(
                              report.currentStatus
                            )}
                          >
                            {report.currentStatus}
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            display:
                              "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: 8,
                            fontSize:
                              11.5,
                            color:
                              "#475569",
                          }}
                        >
                          <div>
                            Current Location:{" "}
                            <b>
                              {report.current_location ||
                                report.currentLocation ||
                                "—"}
                            </b>
                          </div>

                          <div>
                            Agent:{" "}
                            <b>
                              {report.wchr_agent_name ||
                                report.employee_name ||
                                report.assignedAgent ||
                                "—"}
                            </b>
                          </div>

                          <div>
                            PNR:{" "}
                            <b>
                              {report.pnr ||
                                "—"}
                            </b>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {safeUpper(
                selectedClosure.dutyFollowUpStatus ||
                  "OPEN"
              ) !== "COMPLETED" &&
                reportDetails.length >
                  0 &&
                !allResolved && (
                  <div
                    style={{
                      padding:
                        "11px 12px",
                      borderRadius: 13,
                      background:
                        "#fff7ed",
                      border:
                        "1px solid #fdba74",
                      color:
                        "#9a3412",
                      fontSize:
                        12,
                      fontWeight:
                        750,
                      lineHeight:
                        1.55,
                    }}
                  >
                    Follow-up remains open until every pending WCHR record is marked Stored / Not In Use.
                  </div>
                )}
            </div>
          )}
        </PageCard>
      </div>
    </div>
  );
}

// END WchrDutyFollowUpPage.jsx
