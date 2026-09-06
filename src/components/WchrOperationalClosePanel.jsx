// src/components/WchrOperationalClosePanel.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { triggerWchrOperationalClosePush } from "../utils/wchrOpsPush.js";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toYYYYMMDD(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(
    dateObj.getMonth() + 1
  )}-${pad2(dateObj.getDate())}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
}

function getMillis(value) {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPassengerDelivered(report) {
  const trackingStatus = safeUpper(
    report?.tracking_status || "IN_PROGRESS"
  );

  return (
    report?.passenger_delivered === true ||
    trackingStatus === "COMPLETED" ||
    Boolean(report?.delivered_at) ||
    Boolean(report?.dropoff_at)
  );
}

function isWheelchairStored(report) {
  const trackingStatus = safeUpper(
    report?.tracking_status || "IN_PROGRESS"
  );

  return (
    trackingStatus === "STORED" ||
    Boolean(report?.stored_at) ||
    (
      report?.is_active === false &&
      safeText(report?.current_location) ===
        "Wheelchair Storage"
    )
  );
}

function getOperationalStatus(report) {
  if (isWheelchairStored(report)) {
    return "STORED";
  }

  if (isPassengerDelivered(report)) {
    return "PENDING_STORAGE";
  }

  return "PENDING_DELIVERY";
}

function needsLocationAlert(report) {
  const status =
    getOperationalStatus(report);

  if (status === "STORED") {
    return false;
  }

  if (report?.alerts_enabled === false) {
    return false;
  }

  const limit =
    Number(
      report?.alert_after_minutes || 30
    ) || 30;

  const lastUpdate =
    getMillis(
      report?.last_location_update_at ||
        report?.last_updated_at ||
        report?.submitted_at
    );

  if (!lastUpdate) {
    return false;
  }

  const minutes =
    Math.floor(
      (Date.now() - lastUpdate) /
        60000
    );

  return minutes >= limit;
}

function buildSummary(reports) {
  return reports.reduce(
    (summary, report) => {
      const status =
        getOperationalStatus(report);

      summary.total += 1;

      if (status === "STORED") {
        summary.stored += 1;
      }

      if (
        status ===
        "PENDING_DELIVERY"
      ) {
        summary.pendingDelivery += 1;
      }

      if (
        status ===
        "PENDING_STORAGE"
      ) {
        summary.pendingStorage += 1;
      }

      if (
        needsLocationAlert(report)
      ) {
        summary.alerts += 1;
      }

      return summary;
    },
    {
      total: 0,
      stored: 0,
      pendingDelivery: 0,
      pendingStorage: 0,
      alerts: 0,
    }
  );
}

function getVisibleUserName(user) {
  return (
    user?.fullName ||
    user?.displayName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function formatTimestamp(value) {
  if (!value) return "";

  let date = null;

  if (
    typeof value?.toDate ===
    "function"
  ) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (
    !date ||
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return date.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}) {
  const tones = {
    slate: {
      background: "#f8fafc",
      border: "#e2e8f0",
      color: "#334155",
    },
    green: {
      background: "#ecfdf5",
      border: "#a7f3d0",
      color: "#065f46",
    },
    orange: {
      background: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
    amber: {
      background: "#fefce8",
      border: "#fde68a",
      color: "#854d0e",
    },
    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      color: "#be123c",
    },
  };

  const style =
    tones[tone] || tones.slate;

  return (
    <div
      style={{
        borderRadius: 14,
        background:
          style.background,
        border: `1px solid ${style.border}`,
        padding: "11px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 850,
          color: "#64748b",
          textTransform:
            "uppercase",
          letterSpacing:
            "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 21,
          fontWeight: 900,
          color: style.color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function WchrOperationalClosePanel({
  selectedDate,
  reports = [],
  user,
  onClosed,
}) {
  const [closure, setClosure] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [closing, setClosing] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const dateKey = useMemo(
    () =>
      toYYYYMMDD(
        selectedDate ||
          new Date()
      ),
    [selectedDate]
  );

  const summary = useMemo(
    () => buildSummary(reports),
    [reports]
  );

  const unresolvedReports =
    useMemo(
      () =>
        reports.filter(
          (report) =>
            getOperationalStatus(
              report
            ) !== "STORED"
        ),
      [reports]
    );

  const unresolvedCount =
    unresolvedReports.length;

  const isClosed =
    safeUpper(
      closure?.status
    ) === "CLOSED";

  const role =
    safeText(user?.role)
      .toLowerCase();

  const canClose =
    role === "supervisor" ||
    role === "duty_manager" ||
    role === "station_manager";

  useEffect(() => {
    let active = true;

    async function loadClosure() {
      setLoading(true);
      setError("");
      setMessage("");

      try {
        const snap =
          await getDoc(
            doc(
              db,
              "wchr_operational_closures",
              dateKey
            )
          );

        if (!active) return;

        setClosure(
          snap.exists()
            ? {
                id: snap.id,
                ...snap.data(),
              }
            : null
        );
      } catch (loadError) {
        console.error(
          "Error loading WCHR operational closure:",
          loadError
        );

        if (active) {
          setError(
            "Could not load the operational close status."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadClosure();

    return () => {
      active = false;
    };
  }, [dateKey]);

  const handleClose =
    async () => {
      if (!canClose || isClosed) {
        return;
      }

      setError("");
      setMessage("");

      const summaryText =
        `Close WCHR Operational Day for ${dateKey}?\n\n` +
        `Total WCHR: ${summary.total}\n` +
        `Stored / Completed: ${summary.stored}\n` +
        `Pending Delivery: ${summary.pendingDelivery}\n` +
        `Pending Storage: ${summary.pendingStorage}\n` +
        `30+ Minute Alerts: ${summary.alerts}\n\n` +
        (
          unresolvedCount > 0
            ? `WARNING: ${unresolvedCount} unresolved WCHR item${
                unresolvedCount === 1
                  ? ""
                  : "s"
              } will require Duty Manager / Station Manager follow-up.\n\nContinue with operational close?`
            : "All wheelchairs are accounted for. Continue with operational close?"
        );

      const confirmed =
        window.confirm(
          summaryText
        );

      if (!confirmed) {
        return;
      }

      try {
        setClosing(true);

        const closureRef =
          doc(
            db,
            "wchr_operational_closures",
            dateKey
          );

        const unresolvedItems =
          unresolvedReports.map(
            (report) => ({
              reportDocId:
                safeText(report.id),
              reportId:
                safeText(
                  report.report_id
                ),
              wheelchairNumber:
                safeText(
                  report.wheelchair_number
                ),
              passengerName:
                safeText(
                  report.passenger_name
                ),
              flightNumber:
                safeText(
                  report.flight_number
                ),
              pnr:
                safeText(report.pnr),
              operationalStatus:
                getOperationalStatus(
                  report
                ),
              currentLocation:
                safeText(
                  report.current_location
                ),
              assignedAgent:
                safeText(
                  report.wchr_agent_name ||
                    report.employee_name
                ),
            })
          );

        const payload = {
          operationalDate:
            dateKey,

          status: "CLOSED",

          totalReports:
            summary.total,

          storedCount:
            summary.stored,

          pendingDeliveryCount:
            summary.pendingDelivery,

          pendingStorageCount:
            summary.pendingStorage,

          alertCount:
            summary.alerts,

          unresolvedCount,

          unresolvedReportIds:
            unresolvedReports.map(
              (report) =>
                safeText(report.id)
            ),

          unresolvedItems,

          requiresDutyFollowUp:
            unresolvedCount > 0,

          dutyFollowUpStatus:
            unresolvedCount > 0
              ? "OPEN"
              : "NOT_REQUIRED",

          closedByUserId:
            safeText(
              user?.id ||
                user?.uid
            ),

          closedByUsername:
            safeText(
              user?.username
            ),

          closedByName:
            getVisibleUserName(
              user
            ),

          closedByRole:
            safeText(
              user?.role
            ),

          closedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          managementPushStatus:
            unresolvedCount > 0
              ? "PENDING"
              : "NOT_REQUIRED",

          managementPushError:
            "",
        };

        await setDoc(
          closureRef,
          payload,
          {
            merge: true,
          }
        );

        const localClosure = {
          ...payload,
          closedAt:
            new Date(),
        };

        setClosure(
          localClosure
        );

        if (
          unresolvedCount > 0
        ) {
          triggerWchrOperationalClosePush(
            dateKey
          );

          setMessage(
            `Operational day closed with ${unresolvedCount} pending WCHR item${
              unresolvedCount === 1
                ? ""
                : "s"
            }. Duty Managers and Station Manager were queued for notification.`
          );
        } else {
          setMessage(
            "Operational day closed successfully. No Duty follow-up is required."
          );
        }

        if (
          typeof onClosed ===
          "function"
        ) {
          onClosed(
            localClosure
          );
        }
      } catch (closeError) {
        console.error(
          "Error closing WCHR operational day:",
          closeError
        );

        setError(
          closeError?.message ||
            "Could not close the WCHR operational day."
        );
      } finally {
        setClosing(false);
      }
    };

  return (
    <section
      style={{
        background:
          "rgba(255,255,255,0.96)",
        border:
          isClosed
            ? "1px solid #bbf7d0"
            : unresolvedCount > 0
            ? "1px solid #fed7aa"
            : "1px solid #dbeafe",
        borderRadius: 22,
        padding: 18,
        boxShadow:
          "0 14px 34px rgba(15,23,42,0.055)",
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
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 850,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
              color:
                isClosed
                  ? "#15803d"
                  : unresolvedCount > 0
                  ? "#b45309"
                  : "#1769aa",
            }}
          >
            WCHR Operational Control
          </div>

          <h2
            style={{
              margin:
                "4px 0 0",
              fontSize: 19,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            {isClosed
              ? "Operational Day Closed"
              : "Close Operational Day"}
          </h2>

          <p
            style={{
              margin:
                "5px 0 0",
              fontSize: 12.5,
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            {dateKey}
            {isClosed &&
            closure?.closedByName
              ? ` \u00B7 Closed by ${closure.closedByName}`
              : ""}
          </p>
        </div>

        {isClosed ? (
          <div
            style={{
              borderRadius: 999,
              background:
                "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              color:
                "#065f46",
              padding:
                "7px 11px",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            CLOSED
          </div>
        ) : (
          <button
            type="button"
            onClick={
              handleClose
            }
            disabled={
              loading ||
              closing ||
              !canClose
            }
            style={{
              border: "none",
              borderRadius: 12,
              padding:
                "10px 14px",
              background:
                unresolvedCount > 0
                  ? "linear-gradient(135deg,#b45309 0%,#d97706 58%,#f59e0b 100%)"
                  : "linear-gradient(135deg,#15803d 0%,#16a34a 100%)",
              color: "#ffffff",
              fontSize: 12.5,
              fontWeight: 850,
              cursor:
                loading ||
                closing ||
                !canClose
                  ? "not-allowed"
                  : "pointer",
              opacity:
                loading ||
                closing ||
                !canClose
                  ? 0.6
                  : 1,
            }}
          >
            {closing
              ? "Closing..."
              : "Close Operational Day"}
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        <Metric
          label="Total WCHR"
          value={
            isClosed
              ? Number(
                  closure?.totalReports ||
                    0
                )
              : summary.total
          }
        />

        <Metric
          label="Stored"
          value={
            isClosed
              ? Number(
                  closure?.storedCount ||
                    0
                )
              : summary.stored
          }
          tone="green"
        />

        <Metric
          label="Pending Delivery"
          value={
            isClosed
              ? Number(
                  closure?.pendingDeliveryCount ||
                    0
                )
              : summary.pendingDelivery
          }
          tone="orange"
        />

        <Metric
          label="Pending Storage"
          value={
            isClosed
              ? Number(
                  closure?.pendingStorageCount ||
                    0
                )
              : summary.pendingStorage
          }
          tone="amber"
        />

        <Metric
          label="30+ Min Alerts"
          value={
            isClosed
              ? Number(
                  closure?.alertCount ||
                    0
                )
              : summary.alerts
          }
          tone="red"
        />
      </div>

      {!isClosed &&
        unresolvedCount > 0 && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              background:
                "#fff7ed",
              border:
                "1px solid #fdba74",
              padding:
                "11px 12px",
              color:
                "#9a3412",
              fontSize: 12,
              fontWeight: 750,
              lineHeight: 1.55,
            }}
          >
            {unresolvedCount} unresolved WCHR item
            {unresolvedCount === 1
              ? ""
              : "s"}{" "}
            will be transferred to Duty Manager and Station Manager follow-up when the operational day is closed.
          </div>
        )}

      {isClosed &&
        Number(
          closure?.unresolvedCount ||
            0
        ) > 0 && (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              background:
                "#fff7ed",
              border:
                "1px solid #fdba74",
              padding:
                "11px 12px",
              color:
                "#9a3412",
              fontSize: 12,
              fontWeight: 750,
              lineHeight: 1.55,
            }}
          >
            Follow-up required:{" "}
            <b>
              {Number(
                closure?.unresolvedCount ||
                  0
              )}
            </b>{" "}
            unresolved WCHR item
            {Number(
              closure?.unresolvedCount ||
                0
            ) === 1
              ? ""
              : "s"}
            . Status:{" "}
            <b>
              {safeUpper(
                closure?.dutyFollowUpStatus ||
                  "OPEN"
              )}
            </b>
            .
          </div>
        )}

      {isClosed &&
        closure?.closedAt && (
          <div
            style={{
              marginTop: 9,
              fontSize: 10.5,
              color: "#64748b",
            }}
          >
            Closed at:{" "}
            {formatTimestamp(
              closure.closedAt
            ) || "Recorded"}
          </div>
        )}

      {!canClose && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#64748b",
          }}
        >
          Operational close is available to Supervisor, Duty Manager, and Station Manager roles.
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            borderRadius: 12,
            background:
              "#fff1f2",
            border:
              "1px solid #fecdd3",
            color: "#be123c",
            padding:
              "10px 12px",
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            marginTop: 12,
            borderRadius: 12,
            background:
              "#ecfdf5",
            border:
              "1px solid #a7f3d0",
            color: "#065f46",
            padding:
              "10px 12px",
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {message}
        </div>
      )}
    </section>
  );
}

// END WchrOperationalClosePanel.jsx
