// src/pages/WCHRFlights.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import WchrOperationalClosePanel from "../components/WchrOperationalClosePanel.jsx";

import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// ============================================================
// CONSTANTS
// ============================================================

const REPORTS_COLLECTION = "wch_reports";
const TRACKING_EVENTS_COLLECTION = "wch_tracking_events";
const SERVICE_SEGMENTS_COLLECTION = "service_segments";

const REPORT_FILTERS = [
  { value: "ALL", label: "All Services" },
  { value: "ACTIVE", label: "Active" },
  { value: "AT_GATE", label: "At Gate" },
  { value: "BOARDED", label: "Boarded" },
  { value: "PENDING_STORAGE", label: "Pending Storage" },
  { value: "STORED", label: "Stored" },
  { value: "ALERT", label: "30+ Min Alert" },
];

// ============================================================
// DATE / TEXT HELPERS
// ============================================================

function pad2(value) {
  return String(value).padStart(2, "0");
}

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
}

function toYYYYMMDD(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function toMMDDYYYY(date) {
  return `${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}-${date.getFullYear()}`;
}

function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0
  );
}

function endOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function toDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;
}

function getMillis(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function formatDateTime(value) {
  const date = toDate(value);

  if (!date) return "â";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getReportDate(report) {
  return (
    toDate(report?.flight_date) ||
    toDate(report?.submitted_at) ||
    toDate(report?.billing_date) ||
    toDate(report?.created_at)
  );
}

function getReportDateKey(report) {
  const date = getReportDate(report);
  return date ? toYYYYMMDD(date) : "NO_DATE";
}

function minutesBetween(startValue, endValue) {
  const start = getMillis(startValue);
  const end = getMillis(endValue);

  if (!start || !end || end < start) {
    return null;
  }

  return Math.round((end - start) / 60000);
}

function formatMinutes(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "â";
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return minutes
    ? `${hours}h ${minutes}m`
    : `${hours}h`;
}

function minutesSince(value) {
  const millis = getMillis(value);

  if (!millis) return 0;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - millis) / 60000
    )
  );
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Management"
  );
}

// ============================================================
// SERVICE STATUS HELPERS
// ============================================================

function getServiceStatus(report) {
  const trackingStatus =
    safeUpper(
      report?.service_status ||
      report?.tracking_status
    );

  if (
    trackingStatus === "STORED" ||
    Boolean(report?.stored_at)
  ) {
    return "STORED";
  }

  if (
    trackingStatus === "BOARDED" ||
    Boolean(report?.boarded_at)
  ) {
    return "BOARDED";
  }

  if (
    trackingStatus === "PENDING_STORAGE"
  ) {
    return "PENDING_STORAGE";
  }

  if (
    report?.passenger_delivered === true ||
    trackingStatus === "COMPLETED" ||
    Boolean(report?.delivered_at) ||
    Boolean(report?.dropoff_at)
  ) {
    return "PENDING_STORAGE";
  }

  if (
    trackingStatus === "AT_GATE" ||
    Boolean(report?.gate_arrived_at)
  ) {
    return "AT_GATE";
  }

  if (
    [
      "READY_FOR_PICKUP",
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "BOARDING",
      "WAITING_HANDOFF",
      "IN_PROGRESS",
      "ACTIVE",
    ].includes(trackingStatus)
  ) {
    return "ACTIVE";
  }

  return trackingStatus || "ACTIVE";
}

function getServiceStatusLabel(report) {
  const status = getServiceStatus(report);

  const labels = {
    ACTIVE: "Active",
    AT_GATE: "At Gate",
    BOARDED: "Boarded",
    PENDING_STORAGE: "Pending Storage",
    STORED: "Stored",
  };

  return labels[status] || status;
}

function getTimerStart(report) {
  return (
    report?.timer_started_at ||
    report?.ready_for_pickup_at ||
    report?.pickup_at ||
    report?.submitted_at ||
    report?.created_at ||
    null
  );
}

function getServiceEnd(report) {
  return (
    report?.stored_at ||
    report?.boarded_at ||
    report?.delivered_at ||
    report?.dropoff_at ||
    null
  );
}

function getTotalServiceMinutes(report) {
  return minutesBetween(
    getTimerStart(report),
    getServiceEnd(report)
  );
}

function getCounterToGateMinutes(report) {
  return minutesBetween(
    report?.pickup_at ||
      report?.ready_for_pickup_at ||
      report?.submitted_at,
    report?.gate_arrived_at
  );
}

function getGateToBoardedMinutes(report) {
  return minutesBetween(
    report?.gate_arrived_at,
    report?.boarded_at ||
      report?.delivered_at ||
      report?.dropoff_at
  );
}

function needs30MinuteAlert(report) {
  const status = getServiceStatus(report);

  if (
    status === "STORED" ||
    status === "BOARDED"
  ) {
    return false;
  }

  if (report?.alerts_enabled === false) {
    return false;
  }

  const limit =
    Number(
      report?.alert_after_minutes || 30
    ) || 30;

  const reference =
    report?.last_location_update_at ||
    report?.last_updated_at ||
    getTimerStart(report);

  return minutesSince(reference) >= limit;
}

function reportMatchesFilter(report, filter) {
  const normalized = safeUpper(filter || "ALL");

  if (normalized === "ALL") {
    return true;
  }

  if (normalized === "ALERT") {
    return needs30MinuteAlert(report);
  }

  return getServiceStatus(report) === normalized;
}

function isPersonalWheelchair(report) {
  const number =
    safeUpper(report?.wheelchair_number);

  return (
    report?.personal_wheelchair === true ||
    report?.is_personal_wheelchair === true ||
    number === "PERSONAL" ||
    number === "PERSONAL WCHR" ||
    number === "PAX WCHR"
  );
}

// ============================================================
// VIEWPORT
// ============================================================

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth
      : 1280
  );

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener(
      "resize",
      onResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        onResize
      );
    };
  }, []);

  return {
    isMobile: width < 768,
    isTablet:
      width >= 768 &&
      width < 1100,
  };
}

// ============================================================
// CSV
// ============================================================

function escapeCsv(value) {
  return `"${String(
    value ?? ""
  ).replace(/"/g, '""')}"`;
}

function downloadTextFile(
  filename,
  content,
  type = "text/csv;charset=utf-8;"
) {
  const blob = new Blob(
    [content],
    { type }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function downloadOperationalCSV(
  filename,
  rows
) {
  const headers = [
    "Report ID",
    "Passenger",
    "Airline",
    "Flight",
    "PNR",
    "WCHR Type",
    "Wheelchair",
    "Personal WCHR",
    "Agent",
    "Service Status",
    "Created",
    "Ready for Pickup",
    "Assigned",
    "Picked Up",
    "Gate Arrival",
    "Boarded",
    "Passenger Delivered",
    "Stored",
    "Current Location",
    "Counter to Gate",
    "Gate to Boarded",
    "Total Service Time",
  ];

  const body = rows.map(
    (report) => [
      report.report_id || report.id,
      report.passenger_name,
      report.airline,
      report.flight_number,
      report.pnr,
      report.wch_type,
      report.wheelchair_number,
      isPersonalWheelchair(report)
        ? "Yes"
        : "No",
      report.wchr_agent_name ||
        report.assigned_wchr_agent ||
        report.employee_name,
      getServiceStatusLabel(report),
      formatDateTime(
        report.submitted_at ||
        report.created_at
      ),
      formatDateTime(
        report.ready_for_pickup_at
      ),
      formatDateTime(
        report.assigned_at
      ),
      formatDateTime(
        report.picked_up_at ||
        report.pickup_at
      ),
      formatDateTime(
        report.gate_arrived_at
      ),
      formatDateTime(
        report.boarded_at
      ),
      formatDateTime(
        report.delivered_at ||
        report.dropoff_at
      ),
      formatDateTime(
        report.stored_at
      ),
      report.current_location,
      formatMinutes(
        getCounterToGateMinutes(report)
      ),
      formatMinutes(
        getGateToBoardedMinutes(report)
      ),
      formatMinutes(
        getTotalServiceMinutes(report)
      ),
    ]
      .map(escapeCsv)
      .join(",")
  );

  downloadTextFile(
    filename,
    [
      headers
        .map(escapeCsv)
        .join(","),
      ...body,
    ].join("\n")
  );
}

function downloadBillingCSV(
  filename,
  rows
) {
  const headers = [
    "Passenger Name",
    "Date",
    "Airline",
    "Flight Number",
    "PNR",
    "WCHR Type",
    "WCHR Number",
    "Personal WCHR",
    "Agent Name",
  ];

  const body = rows.map(
    (report) => {
      const reportDate =
        getReportDate(report);

      return [
        report.passenger_name,
        reportDate
          ? toMMDDYYYY(reportDate)
          : "",
        report.airline,
        report.flight_number,
        report.pnr,
        report.wch_type,
        report.wheelchair_number,
        isPersonalWheelchair(report)
          ? "Yes"
          : "No",
        report.wchr_agent_name ||
          report.assigned_wchr_agent ||
          report.employee_name,
      ]
        .map(escapeCsv)
        .join(",");
    }
  );

  downloadTextFile(
    filename,
    [
      headers
        .map(escapeCsv)
        .join(","),
      ...body,
    ].join("\n")
  );
}

// ============================================================
// REPORT AGGREGATION
// ============================================================

function buildSummary(rows) {
  return rows.reduce(
    (summary, report) => {
      summary.total += 1;

      const status =
        getServiceStatus(report);

      if (status === "ACTIVE") {
        summary.active += 1;
      }

      if (status === "AT_GATE") {
        summary.atGate += 1;
      }

      if (status === "BOARDED") {
        summary.boarded += 1;
      }

      if (status === "PENDING_STORAGE") {
        summary.pendingStorage += 1;
      }

      if (status === "STORED") {
        summary.stored += 1;
      }

      if (needs30MinuteAlert(report)) {
        summary.alerts += 1;
      }

      if (isPersonalWheelchair(report)) {
        summary.personal += 1;
      }

      return summary;
    },
    {
      total: 0,
      active: 0,
      atGate: 0,
      boarded: 0,
      pendingStorage: 0,
      stored: 0,
      alerts: 0,
      personal: 0,
    }
  );
}

function buildFlights(rows) {
  const map = new Map();

  for (const report of rows) {
    const airline =
      safeUpper(report.airline) ||
      "â";

    const flightNumber =
      safeUpper(report.flight_number) ||
      "NO_FLIGHT";

    const dateKey =
      getReportDateKey(report);

    const key =
      `${dateKey}-${airline}-${flightNumber}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        airline,
        flight_number:
          flightNumber,
        report_date:
          getReportDate(report),
        total: 0,
        active: 0,
        at_gate: 0,
        boarded: 0,
        pending_storage: 0,
        stored: 0,
        alerts: 0,
        personal: 0,
        wheelchairs:
          new Set(),
      });
    }

    const item = map.get(key);
    const status =
      getServiceStatus(report);

    item.total += 1;

    if (status === "ACTIVE") {
      item.active += 1;
    }

    if (status === "AT_GATE") {
      item.at_gate += 1;
    }

    if (status === "BOARDED") {
      item.boarded += 1;
    }

    if (status === "PENDING_STORAGE") {
      item.pending_storage += 1;
    }

    if (status === "STORED") {
      item.stored += 1;
    }

    if (needs30MinuteAlert(report)) {
      item.alerts += 1;
    }

    if (isPersonalWheelchair(report)) {
      item.personal += 1;
    }

    const wheelchair =
      safeUpper(
        report.wheelchair_number
      );

    if (wheelchair) {
      item.wheelchairs.add(
        wheelchair
      );
    }
  }

  return Array.from(
    map.values()
  )
    .map((item) => ({
      ...item,
      wheelchairs:
        Array.from(
          item.wheelchairs
        ).sort(
          undefined,
          {
            numeric: true,
            sensitivity: "base",
          }
        ),
    }))
    .sort((a, b) => {
      const aDate =
        a.report_date
          ? a.report_date.getTime()
          : 0;

      const bDate =
        b.report_date
          ? b.report_date.getTime()
          : 0;

      if (aDate !== bDate) {
        return aDate - bDate;
      }

      if (
        a.airline !== b.airline
      ) {
        return a.airline.localeCompare(
          b.airline
        );
      }

      return a.flight_number.localeCompare(
        b.flight_number,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    });
}

function buildEmployeeStats(rows) {
  const map = new Map();

  for (const report of rows) {
    const agentName =
      safeText(
        report.wchr_agent_name
      ) ||
      safeText(
        report.assigned_wchr_agent
      ) ||
      safeText(
        report.employee_name
      ) ||
      "Unknown";

    const key =
      safeText(
        report.wchr_agent_id
      ) ||
      safeText(
        report.employee_id
      ) ||
      agentName;

    if (!map.has(key)) {
      map.set(key, {
        key,
        agent_name:
          agentName,
        services: 0,
        gate_count: 0,
        boarded_count: 0,
        stored_count: 0,
        total_minutes: 0,
        timed_services: 0,
      });
    }

    const item =
      map.get(key);

    item.services += 1;

    if (report.gate_arrived_at) {
      item.gate_count += 1;
    }

    if (
      report.boarded_at ||
      getServiceStatus(report) ===
        "BOARDED"
    ) {
      item.boarded_count += 1;
    }

    if (
      report.stored_at ||
      getServiceStatus(report) ===
        "STORED"
    ) {
      item.stored_count += 1;
    }

    const totalMinutes =
      getTotalServiceMinutes(report);

    if (totalMinutes !== null) {
      item.total_minutes +=
        totalMinutes;

      item.timed_services += 1;
    }
  }

  return Array.from(
    map.values()
  )
    .map((item) => ({
      ...item,
      avg_service_minutes:
        item.timed_services > 0
          ? Math.round(
              item.total_minutes /
              item.timed_services
            )
          : null,
    }))
    .sort((a, b) => {
      if (
        b.services !== a.services
      ) {
        return (
          b.services -
          a.services
        );
      }

      const avgA =
        a.avg_service_minutes ??
        999999;

      const avgB =
        b.avg_service_minutes ??
        999999;

      return avgA - avgB;
    });
}

// ============================================================
// UI COMPONENTS
// ============================================================

function PageCard({
  children,
  style = {},
}) {
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing:
          "border-box",
        background:
          "rgba(255,255,255,0.96)",
        border:
          "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow:
          "0 16px 38px rgba(15,23,42,0.07)",
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
  style = {},
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#ffffff",
      border: "none",
    },
    secondary: {
      background:
        "#ffffff",
      color:
        "#1769aa",
      border:
        "1px solid #cfe7fb",
    },
    success: {
      background:
        "#16a34a",
      color:
        "#ffffff",
      border:
        "1px solid #16a34a",
    },
    warning: {
      background:
        "#f59e0b",
      color:
        "#ffffff",
      border:
        "1px solid #f59e0b",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding:
          "10px 14px",
        fontSize: 12.5,
        fontWeight: 850,
        cursor:
          disabled
            ? "not-allowed"
            : "pointer",
        opacity:
          disabled
            ? 0.55
            : 1,
        fontFamily:
          "inherit",
        whiteSpace:
          "nowrap",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function MetricCard({
  label,
  value,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background: "#eff6ff",
      border: "#bfdbfe",
      color: "#1769aa",
    },
    green: {
      background: "#ecfdf5",
      border: "#bbf7d0",
      color: "#166534",
    },
    amber: {
      background: "#fff7ed",
      border: "#fed7aa",
      color: "#9a3412",
    },
    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      color: "#b91c1c",
    },
    slate: {
      background: "#f8fafc",
      border: "#e2e8f0",
      color: "#334155",
    },
  };

  const selected =
    tones[tone] ||
    tones.blue;

  return (
    <div
      style={{
        borderRadius: 16,
        padding:
          "12px 14px",
        background:
          selected.background,
        border:
          `1px solid ${selected.border}`,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          color:
            selected.color,
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
          fontSize: 25,
          fontWeight: 950,
          color:
            selected.color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({
  report,
}) {
  const status =
    getServiceStatus(report);

  const alert =
    needs30MinuteAlert(report);

  const tones = {
    ACTIVE: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "#bfdbfe",
    },
    AT_GATE: {
      background: "#fefce8",
      color: "#854d0e",
      border: "#fde68a",
    },
    BOARDED: {
      background: "#ecfdf5",
      color: "#166534",
      border: "#bbf7d0",
    },
    PENDING_STORAGE: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "#fed7aa",
    },
    STORED: {
      background: "#f0fdf4",
      color: "#166534",
      border: "#86efac",
    },
  };

  const selected =
    alert
      ? {
          background: "#fff1f2",
          color: "#b91c1c",
          border: "#fecdd3",
        }
      : tones[status] ||
        tones.ACTIVE;

  return (
    <span
      style={{
        display:
          "inline-flex",
        alignItems:
          "center",
        borderRadius: 999,
        padding:
          "6px 10px",
        background:
          selected.background,
        color:
          selected.color,
        border:
          `1px solid ${selected.border}`,
        fontSize: 10.5,
        fontWeight: 900,
        whiteSpace:
          "nowrap",
      }}
    >
      {alert
        ? "30+ MIN ALERT"
        : getServiceStatusLabel(
            report
          )}
    </span>
  );
}

function InfoField({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding:
          "9px 10px",
        borderRadius: 12,
        background:
          "#f8fbff",
        border:
          "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          color: "#94a3b8",
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
          marginTop: 3,
          fontSize: 12.5,
          fontWeight: 750,
          color: "#0f172a",
          lineHeight: 1.45,
          wordBreak:
            "break-word",
        }}
      >
        {value || "â"}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding:
          "8px 12px",
        border:
          active
            ? "1px solid #1769aa"
            : "1px solid #dbeafe",
        background:
          active
            ? "#1769aa"
            : "#ffffff",
        color:
          active
            ? "#ffffff"
            : "#1769aa",
        fontSize: 11.5,
        fontWeight: 850,
        cursor: "pointer",
      }}
    >
      {label} Â· {count}
    </button>
  );
}

function Timeline({
  events,
  loading,
}) {
  if (loading) {
    return (
      <div style={infoBoxStyle}>
        Loading service timeline...
      </div>
    );
  }

  if (!events.length) {
    return (
      <div style={infoBoxStyle}>
        No tracking events were recorded for this service.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
      }}
    >
      {events.map(
        (event) => (
          <div
            key={event.id}
            style={{
              display: "grid",
              gridTemplateColumns:
                "110px 1fr",
              gap: 10,
              padding:
                "10px 11px",
              borderRadius: 13,
              background:
                "#f8fbff",
              border:
                "1px solid #dbeafe",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
              }}
            >
              {formatDateTime(
                event.created_at
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {safeUpper(
                  event.event_type
                ).replaceAll(
                  "_",
                  " "
                ) || "EVENT"}
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: 11.5,
                  color: "#475569",
                  lineHeight: 1.5,
                }}
              >
                {[
                  event.location
                    ? `Location: ${event.location}`
                    : "",
                  event.employee_name
                    ? `By: ${event.employee_name}`
                    : "",
                  event.notes ||
                    event.note ||
                    "",
                ]
                  .filter(Boolean)
                  .join(" Â· ")}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function SegmentsTable({
  segments,
  loading,
}) {
  if (loading) {
    return (
      <div style={infoBoxStyle}>
        Loading service segments...
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div style={infoBoxStyle}>
        No service segment records are available.
      </div>
    );
  }

  return (
    <div
      style={{
        overflowX: "auto",
        border:
          "1px solid #e2e8f0",
        borderRadius: 14,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse:
            "collapse",
          minWidth: 760,
          background:
            "#ffffff",
        }}
      >
        <thead>
          <tr
            style={{
              background:
                "#f8fbff",
            }}
          >
            <th style={thStyle}>
              Segment
            </th>
            <th style={thStyle}>
              Agent
            </th>
            <th style={thStyle}>
              Start
            </th>
            <th style={thStyle}>
              End
            </th>
            <th style={thStyle}>
              Result
            </th>
          </tr>
        </thead>

        <tbody>
          {segments.map(
            (segment) => (
              <tr key={segment.id}>
                <td style={tdStyle}>
                  {segment.segment_number ||
                    "â"}
                </td>
                <td style={tdStyle}>
                  {segment.agent_name ||
                    "â"}
                </td>
                <td style={tdStyle}>
                  {segment.start_location ||
                    "â"}
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      color: "#64748b",
                    }}
                  >
                    {formatDateTime(
                      segment.started_at
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  {segment.end_location ||
                    "â"}
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      color: "#64748b",
                    }}
                  >
                    {formatDateTime(
                      segment.ended_at
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  {safeUpper(
                    segment.segment_result ||
                    segment.segment_status
                  ).replaceAll(
                    "_",
                    " "
                  ) || "â"}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function WCHRFlights() {
  const navigate =
    useNavigate();

  const { user } =
    useUser();

  const {
    isMobile,
    isTablet,
  } = useViewport();

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    () => new Date()
  );

  const [
    allDayReports,
    setAllDayReports,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    filter,
    setFilter,
  ] = useState("ALL");

  const [
    selectedFlightKey,
    setSelectedFlightKey,
  ] = useState("");

  const [
    selectedReportId,
    setSelectedReportId,
  ] = useState("");

  const [
    timeline,
    setTimeline,
  ] = useState([]);

  const [
    segments,
    setSegments,
  ] = useState([]);

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  // ==========================================================
  // LOAD REPORTS FOR DATE
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    async function loadReports() {
      try {
        setLoading(true);
        setError("");

        const start =
          Timestamp.fromDate(
            startOfDay(
              selectedDate
            )
          );

        const end =
          Timestamp.fromDate(
            endOfDay(
              selectedDate
            )
          );

        const reportQuery =
          query(
            collection(
              db,
              REPORTS_COLLECTION
            ),
            where(
              "submitted_at",
              ">=",
              start
            ),
            where(
              "submitted_at",
              "<=",
              end
            )
          );

        const snapshot =
          await getDocs(
            reportQuery
          );

        const rows =
          snapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .sort(
              (a, b) =>
                getMillis(
                  a.submitted_at
                ) -
                getMillis(
                  b.submitted_at
                )
            );

        if (!mounted) return;

        setAllDayReports(
          rows
        );
      } catch (loadError) {
        console.error(
          "WCHR report load error:",
          loadError
        );

        if (mounted) {
          setAllDayReports(
            []
          );

          setError(
            loadError?.message ||
            "Could not load WCHR reports."
          );
        }
      } finally {
        if (mounted) {
          setLoading(
            false
          );
        }
      }
    }

    loadReports();

    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  // ==========================================================
  // DERIVED REPORTS
  // ==========================================================

  const summary =
    useMemo(
      () =>
        buildSummary(
          allDayReports
        ),
      [allDayReports]
    );

  const filteredReports =
    useMemo(
      () =>
        allDayReports.filter(
          (report) =>
            reportMatchesFilter(
              report,
              filter
            )
        ),
      [
        allDayReports,
        filter,
      ]
    );

  const flights =
    useMemo(
      () =>
        buildFlights(
          filteredReports
        ),
      [filteredReports]
    );

  const employeeStats =
    useMemo(
      () =>
        buildEmployeeStats(
          allDayReports
        ),
      [allDayReports]
    );

  const selectedFlight =
    useMemo(
      () =>
        flights.find(
          (flight) =>
            flight.key ===
            selectedFlightKey
        ) || null,
      [
        flights,
        selectedFlightKey,
      ]
    );

  const flightReports =
    useMemo(() => {
      if (!selectedFlight) {
        return [];
      }

      return filteredReports.filter(
        (report) => {
          const airline =
            safeUpper(
              report.airline
            ) || "â";

          const flightNumber =
            safeUpper(
              report.flight_number
            ) || "NO_FLIGHT";

          const key =
            `${getReportDateKey(
              report
            )}-${airline}-${flightNumber}`;

          return (
            key ===
            selectedFlight.key
          );
        }
      );
    }, [
      filteredReports,
      selectedFlight,
    ]);

  const selectedReport =
    useMemo(
      () =>
        allDayReports.find(
          (report) =>
            report.id ===
            selectedReportId
        ) || null,
      [
        allDayReports,
        selectedReportId,
      ]
    );

  // ==========================================================
  // CLEAN SELECTION WHEN FILTER CHANGES
  // ==========================================================

  useEffect(() => {
    if (
      selectedFlightKey &&
      !flights.some(
        (flight) =>
          flight.key ===
          selectedFlightKey
      )
    ) {
      setSelectedFlightKey(
        ""
      );
    }
  }, [
    flights,
    selectedFlightKey,
  ]);

  // ==========================================================
  // LOAD TIMELINE + SEGMENTS FOR SELECTED REPORT
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    async function loadDetails() {
      if (!selectedReportId) {
        setTimeline([]);
        setSegments([]);
        return;
      }

      try {
        setDetailLoading(true);

        const [
          eventSnapshot,
          segmentSnapshot,
        ] = await Promise.all([
          getDocs(
            query(
              collection(
                db,
                TRACKING_EVENTS_COLLECTION
              ),
              where(
                "report_doc_id",
                "==",
                selectedReportId
              )
            )
          ),
          getDocs(
            query(
              collection(
                db,
                SERVICE_SEGMENTS_COLLECTION
              ),
              where(
                "report_doc_id",
                "==",
                selectedReportId
              )
            )
          ),
        ]);

        if (!mounted) return;

        setTimeline(
          eventSnapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .sort(
              (a, b) =>
                getMillis(
                  a.created_at
                ) -
                getMillis(
                  b.created_at
                )
            )
        );

        setSegments(
          segmentSnapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .sort(
              (a, b) =>
                Number(
                  a.segment_number || 0
                ) -
                Number(
                  b.segment_number || 0
                )
            )
        );
      } catch (detailError) {
        console.error(
          "WCHR report detail load error:",
          detailError
        );

        if (mounted) {
          setTimeline([]);
          setSegments([]);
        }
      } finally {
        if (mounted) {
          setDetailLoading(
            false
          );
        }
      }
    }

    loadDetails();

    return () => {
      mounted = false;
    };
  }, [selectedReportId]);

  // ==========================================================
  // EXPORTS
  // ==========================================================

  const handleExportFullDay =
    () => {
      if (!allDayReports.length) {
        return;
      }

      downloadOperationalCSV(
        `WCHR_REPORT_${toYYYYMMDD(
          selectedDate
        )}.csv`,
        allDayReports
      );
    };

  const handleExportBilling =
    () => {
      if (!allDayReports.length) {
        return;
      }

      downloadBillingCSV(
        `WCHR_BILLING_${toYYYYMMDD(
          selectedDate
        )}.csv`,
        allDayReports
      );
    };

  const handleExportFlight =
    () => {
      if (
        !selectedFlight ||
        !flightReports.length
      ) {
        return;
      }

      downloadOperationalCSV(
        `WCHR_${selectedFlight.airline}_${selectedFlight.flight_number}_${toYYYYMMDD(
          selectedFlight.report_date ||
          selectedDate
        )}.csv`,
        flightReports
      );
    };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1450,
        margin: "0 auto",
        display: "grid",
        gap:
          isMobile
            ? 12
            : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        boxSizing:
          "border-box",
      }}
    >
      {/* HERO */}

      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius:
            isMobile
              ? 20
              : 28,
          padding:
            isMobile
              ? 17
              : 23,
          color: "#ffffff",
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          boxShadow:
            "0 22px 55px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: 999,
            background:
              "rgba(255,255,255,0.07)",
            right: -65,
            top: -95,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            justifyContent:
              "space-between",
            gap: 16,
            alignItems:
              isMobile
                ? "flex-start"
                : "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 13,
              alignItems:
                "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                flex:
                  "0 0 52px",
                borderRadius: 16,
                overflow: "hidden",
                background:
                  "#ffffff",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit:
                    "contain",
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  color:
                    "rgba(255,255,255,0.72)",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.14em",
                }}
              >
                {APP_NAME} Â· WCHR Reports
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",
                  fontSize:
                    isMobile
                      ? 23
                      : 29,
                  lineHeight: 1.08,
                  fontWeight: 900,
                  letterSpacing:
                    "-0.035em",
                }}
              >
                WCHR Flight Reports
              </h1>

              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color:
                    "rgba(255,255,255,0.86)",
                }}
              >
                Review completed and active wheelchair services, employee
                performance, billing data, service times and full passenger
                journey history.
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.66)",
                  fontWeight: 700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              width:
                isMobile
                  ? "100%"
                  : "auto",
            }}
          >
            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/wchr/duty-follow-up"
                )
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Duty Follow Up
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/dashboard"
                )
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              padding:
                "11px 13px",
              background:
                "#fff1f2",
              border:
                "1px solid #fecdd3",
              color:
                "#9f1239",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {/* DATE + EXPORTS */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            gap: 12,
            alignItems:
              isMobile
                ? "stretch"
                : "end",
            justifyContent:
              "space-between",
          }}
        >
          <div
            style={{
              minWidth:
                isMobile
                  ? 0
                  : 220,
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 10,
                fontWeight: 900,
                color: "#64748b",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.06em",
              }}
            >
              Report Date
            </label>

            <input
              type="date"
              value={toYYYYMMDD(
                selectedDate
              )}
              onChange={(event) => {
                const value =
                  event.target.value;

                if (!value) return;

                setSelectedDate(
                  new Date(
                    `${value}T00:00:00`
                  )
                );

                setSelectedFlightKey(
                  ""
                );

                setSelectedReportId(
                  ""
                );
              }}
              style={{
                width: "100%",
                boxSizing:
                  "border-box",
                border:
                  "1px solid #dbeafe",
                borderRadius: 13,
                padding:
                  "11px 13px",
                background:
                  "#ffffff",
                color:
                  "#0f172a",
                fontSize: 13.5,
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              width:
                isMobile
                  ? "100%"
                  : "auto",
            }}
          >
            <ActionButton
              variant="success"
              disabled={
                !allDayReports.length
              }
              onClick={
                handleExportBilling
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Export Billing
            </ActionButton>

            <ActionButton
              variant="secondary"
              disabled={
                !allDayReports.length
              }
              onClick={
                handleExportFullDay
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Export Full Report
            </ActionButton>
          </div>
        </div>
      </PageCard>

      {/* CLOSE PANEL */}

      <WchrOperationalClosePanel
        selectedDate={selectedDate}
        reports={allDayReports}
        user={user}
      />

      {/* METRICS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : isTablet
              ? "repeat(4, minmax(0, 1fr))"
              : "repeat(7, minmax(0, 1fr))",
          gap: 9,
        }}
      >
        <MetricCard
          label="Total"
          value={summary.total}
          tone="slate"
        />

        <MetricCard
          label="Active"
          value={summary.active}
          tone="blue"
        />

        <MetricCard
          label="At Gate"
          value={summary.atGate}
          tone="amber"
        />

        <MetricCard
          label="Boarded"
          value={summary.boarded}
          tone="green"
        />

        <MetricCard
          label="Pending Storage"
          value={summary.pendingStorage}
          tone="amber"
        />

        <MetricCard
          label="Stored"
          value={summary.stored}
          tone="green"
        />

        <MetricCard
          label="30+ Min"
          value={summary.alerts}
          tone="red"
        />
      </div>

      {/* FILTERS */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 14
              : 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          {REPORT_FILTERS.map(
            (item) => {
              let count =
                summary.total;

              if (
                item.value ===
                "ACTIVE"
              ) {
                count =
                  summary.active;
              } else if (
                item.value ===
                "AT_GATE"
              ) {
                count =
                  summary.atGate;
              } else if (
                item.value ===
                "BOARDED"
              ) {
                count =
                  summary.boarded;
              } else if (
                item.value ===
                "PENDING_STORAGE"
              ) {
                count =
                  summary.pendingStorage;
              } else if (
                item.value ===
                "STORED"
              ) {
                count =
                  summary.stored;
              } else if (
                item.value ===
                "ALERT"
              ) {
                count =
                  summary.alerts;
              }

              return (
                <FilterButton
                  key={item.value}
                  active={
                    filter ===
                    item.value
                  }
                  label={item.label}
                  count={count}
                  onClick={() => {
                    setFilter(
                      item.value
                    );

                    setSelectedFlightKey(
                      ""
                    );

                    setSelectedReportId(
                      ""
                    );
                  }}
                />
              );
            }
          )}
        </div>
      </PageCard>

      {/* FLIGHT SUMMARY */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div
          style={{
            marginBottom: 13,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize:
                isMobile
                  ? 18
                  : 20,
              color:
                "#0f172a",
              fontWeight: 900,
            }}
          >
            Flight Summary
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
            Select a flight to review every passenger service recorded for
            that operation.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>
            Loading WCHR reports...
          </div>
        ) : flights.length === 0 ? (
          <div style={infoBoxStyle}>
            No WCHR services match the selected filter.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 8,
            }}
          >
            {flights.map(
              (flight) => (
                <button
                  type="button"
                  key={flight.key}
                  onClick={() => {
                    setSelectedFlightKey(
                      flight.key
                    );

                    setSelectedReportId(
                      ""
                    );
                  }}
                  style={{
                    width: "100%",
                    textAlign:
                      "left",
                    borderRadius: 15,
                    padding:
                      "12px 13px",
                    border:
                      selectedFlightKey ===
                      flight.key
                        ? "2px solid #5aa9e6"
                        : "1px solid #e2e8f0",
                    background:
                      selectedFlightKey ===
                      flight.key
                        ? "#edf7ff"
                        : "#ffffff",
                    cursor: "pointer",
                    fontFamily:
                      "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection:
                        isMobile
                          ? "column"
                          : "row",
                      justifyContent:
                        "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 900,
                          color:
                            "#0f172a",
                        }}
                      >
                        {flight.airline}{" "}
                        {flight.flight_number}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11.5,
                          color:
                            "#64748b",
                        }}
                      >
                        {flight.report_date
                          ? toMMDDYYYY(
                              flight.report_date
                            )
                          : "â"}{" "}
                        Â· {flight.total} passenger service
                        {flight.total === 1
                          ? ""
                          : "s"}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 5,
                        flexWrap:
                          "wrap",
                      }}
                    >
                      {flight.active >
                        0 && (
                        <span
                          style={miniPillStyle(
                            "#eff6ff",
                            "#1d4ed8",
                            "#bfdbfe"
                          )}
                        >
                          Active {flight.active}
                        </span>
                      )}

                      {flight.at_gate >
                        0 && (
                        <span
                          style={miniPillStyle(
                            "#fefce8",
                            "#854d0e",
                            "#fde68a"
                          )}
                        >
                          Gate {flight.at_gate}
                        </span>
                      )}

                      {flight.boarded >
                        0 && (
                        <span
                          style={miniPillStyle(
                            "#ecfdf5",
                            "#166534",
                            "#bbf7d0"
                          )}
                        >
                          Boarded {flight.boarded}
                        </span>
                      )}

                      {flight.stored >
                        0 && (
                        <span
                          style={miniPillStyle(
                            "#f0fdf4",
                            "#166534",
                            "#86efac"
                          )}
                        >
                          Stored {flight.stored}
                        </span>
                      )}

                      {flight.alerts >
                        0 && (
                        <span
                          style={miniPillStyle(
                            "#fff1f2",
                            "#b91c1c",
                            "#fecdd3"
                          )}
                        >
                          Alert {flight.alerts}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </PageCard>

      {/* FLIGHT DETAILS */}

      {selectedFlight && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 15
                : 19,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection:
                isMobile
                  ? "column"
                  : "row",
              justifyContent:
                "space-between",
              gap: 12,
              alignItems:
                isMobile
                  ? "stretch"
                  : "center",
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.07em",
                  color:
                    "#1769aa",
                }}
              >
                Selected Flight
              </div>

              <h2
                style={{
                  margin:
                    "4px 0 0",
                  fontSize:
                    isMobile
                      ? 19
                      : 22,
                  color:
                    "#0f172a",
                  fontWeight: 900,
                }}
              >
                {selectedFlight.airline}{" "}
                {selectedFlight.flight_number}
              </h2>
            </div>

            <ActionButton
              variant="secondary"
              onClick={
                handleExportFlight
              }
              disabled={
                !flightReports.length
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Export Flight CSV
            </ActionButton>
          </div>

          <div
            style={{
              display: "grid",
              gap: 9,
            }}
          >
            {flightReports.map(
              (report) => (
                <button
                  type="button"
                  key={report.id}
                  onClick={() =>
                    setSelectedReportId(
                      report.id
                    )
                  }
                  style={{
                    width: "100%",
                    textAlign:
                      "left",
                    padding:
                      "13px 14px",
                    borderRadius: 16,
                    background:
                      selectedReportId ===
                      report.id
                        ? "#edf7ff"
                        : "#ffffff",
                    border:
                      selectedReportId ===
                      report.id
                        ? "2px solid #5aa9e6"
                        : "1px solid #e2e8f0",
                    cursor: "pointer",
                    fontFamily:
                      "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        isMobile ||
                        isTablet
                          ? "1fr"
                          : "1.5fr 1fr 1fr 1fr auto",
                      gap: 9,
                      alignItems:
                        "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color:
                            "#0f172a",
                        }}
                      >
                        {report.passenger_name ||
                          "Passenger"}
                      </div>

                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          color:
                            "#64748b",
                        }}
                      >
                        {report.report_id ||
                          report.id}
                      </div>
                    </div>

                    <InfoField
                      label="Wheelchair"
                      value={
                        report.wheelchair_number ||
                        (isPersonalWheelchair(
                          report
                        )
                          ? "Personal WCHR"
                          : "â")
                      }
                    />

                    <InfoField
                      label="Agent"
                      value={
                        report.wchr_agent_name ||
                        report.assigned_wchr_agent ||
                        report.employee_name
                      }
                    />

                    <InfoField
                      label="Total Time"
                      value={formatMinutes(
                        getTotalServiceMinutes(
                          report
                        )
                      )}
                    />

                    <StatusBadge
                      report={report}
                    />
                  </div>
                </button>
              )
            )}
          </div>
        </PageCard>
      )}

      {/* SELECTED SERVICE REPORT */}

      {selectedReport && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 15
                : 20,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection:
                isMobile
                  ? "column"
                  : "row",
              justifyContent:
                "space-between",
              gap: 12,
              marginBottom: 15,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color:
                    "#1769aa",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.07em",
                }}
              >
                Passenger Service Report
              </div>

              <h2
                style={{
                  margin:
                    "4px 0 0",
                  fontSize:
                    isMobile
                      ? 20
                      : 24,
                  color:
                    "#0f172a",
                  fontWeight: 900,
                }}
              >
                {selectedReport.passenger_name ||
                  "Passenger"}
              </h2>

              <div
                style={{
                  marginTop: 5,
                  display: "flex",
                  gap: 7,
                  flexWrap:
                    "wrap",
                }}
              >
                <StatusBadge
                  report={
                    selectedReport
                  }
                />

                {isPersonalWheelchair(
                  selectedReport
                ) && (
                  <span
                    style={miniPillStyle(
                      "#f8fafc",
                      "#334155",
                      "#cbd5e1"
                    )}
                  >
                    Personal WCHR
                  </span>
                )}
              </div>
            </div>

            <ActionButton
              variant="secondary"
              onClick={() =>
                window.print()
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Print Report
            </ActionButton>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(4, minmax(0, 1fr))",
              gap: 9,
            }}
          >
            <InfoField
              label="Report ID"
              value={
                selectedReport.report_id ||
                selectedReport.id
              }
            />

            <InfoField
              label="Passenger"
              value={
                selectedReport.passenger_name
              }
            />

            <InfoField
              label="Flight"
              value={[
                selectedReport.airline,
                selectedReport.flight_number,
              ]
                .filter(Boolean)
                .join(" ")}
            />

            <InfoField
              label="PNR"
              value={
                selectedReport.pnr
              }
            />

            <InfoField
              label="WCHR Type"
              value={
                selectedReport.wch_type
              }
            />

            <InfoField
              label="Wheelchair"
              value={
                selectedReport.wheelchair_number ||
                (isPersonalWheelchair(
                  selectedReport
                )
                  ? "Personal WCHR"
                  : "â")
              }
            />

            <InfoField
              label="Assigned Agent"
              value={
                selectedReport.wchr_agent_name ||
                selectedReport.assigned_wchr_agent ||
                selectedReport.employee_name
              }
            />

            <InfoField
              label="Current Location"
              value={
                selectedReport.current_location
              }
            />

            <InfoField
              label="Created"
              value={formatDateTime(
                selectedReport.submitted_at ||
                selectedReport.created_at
              )}
            />

            <InfoField
              label="Ready for Pickup"
              value={formatDateTime(
                selectedReport.ready_for_pickup_at
              )}
            />

            <InfoField
              label="Assigned"
              value={formatDateTime(
                selectedReport.assigned_at
              )}
            />

            <InfoField
              label="Picked Up"
              value={formatDateTime(
                selectedReport.picked_up_at ||
                selectedReport.pickup_at
              )}
            />

            <InfoField
              label="Gate Arrival"
              value={formatDateTime(
                selectedReport.gate_arrived_at
              )}
            />

            <InfoField
              label="Boarded"
              value={formatDateTime(
                selectedReport.boarded_at
              )}
            />

            <InfoField
              label="Passenger Delivered"
              value={formatDateTime(
                selectedReport.delivered_at ||
                selectedReport.dropoff_at
              )}
            />

            <InfoField
              label="Stored"
              value={formatDateTime(
                selectedReport.stored_at
              )}
            />

            <InfoField
              label="Counter to Gate"
              value={formatMinutes(
                getCounterToGateMinutes(
                  selectedReport
                )
              )}
            />

            <InfoField
              label="Gate to Boarded"
              value={formatMinutes(
                getGateToBoardedMinutes(
                  selectedReport
                )
              )}
            />

            <InfoField
              label="Total Service Time"
              value={formatMinutes(
                getTotalServiceMinutes(
                  selectedReport
                )
              )}
            />

            <InfoField
              label="Last Update"
              value={formatDateTime(
                selectedReport.last_updated_at ||
                selectedReport.last_location_update_at
              )}
            />
          </div>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns:
                isMobile ||
                isTablet
                  ? "1fr"
                  : "1fr 1fr",
              gap: 14,
              alignItems:
                "start",
            }}
          >
            <div>
              <h3
                style={{
                  margin:
                    "0 0 9px",
                  fontSize: 16,
                  color:
                    "#0f172a",
                  fontWeight: 900,
                }}
              >
                Service Timeline
              </h3>

              <Timeline
                events={timeline}
                loading={
                  detailLoading
                }
              />
            </div>

            <div>
              <h3
                style={{
                  margin:
                    "0 0 9px",
                  fontSize: 16,
                  color:
                    "#0f172a",
                  fontWeight: 900,
                }}
              >
                Service Segments
              </h3>

              <SegmentsTable
                segments={
                  segments
                }
                loading={
                  detailLoading
                }
              />
            </div>
          </div>
        </PageCard>
      )}

      {/* EMPLOYEE PERFORMANCE */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div
          style={{
            marginBottom: 13,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize:
                isMobile
                  ? 18
                  : 20,
              color:
                "#0f172a",
              fontWeight: 900,
            }}
          >
            Employee WCHR Performance
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
            Daily service volume and average service time by assigned WCHR
            agent.
          </p>
        </div>

        {!employeeStats.length ? (
          <div style={infoBoxStyle}>
            No employee performance data for this date.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 14,
              border:
                "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: 850,
                background:
                  "#ffffff",
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      "#f8fbff",
                  }}
                >
                  <th style={thStyle}>
                    Agent
                  </th>
                  <th style={thStyle}>
                    Services
                  </th>
                  <th style={thStyle}>
                    Gate Arrivals
                  </th>
                  <th style={thStyle}>
                    Boarded
                  </th>
                  <th style={thStyle}>
                    Stored
                  </th>
                  <th style={thStyle}>
                    Avg Service Time
                  </th>
                </tr>
              </thead>

              <tbody>
                {employeeStats.map(
                  (item) => (
                    <tr key={item.key}>
                      <td style={tdStyle}>
                        <b>
                          {item.agent_name}
                        </b>
                      </td>
                      <td style={tdStyle}>
                        {item.services}
                      </td>
                      <td style={tdStyle}>
                        {item.gate_count}
                      </td>
                      <td style={tdStyle}>
                        {item.boarded_count}
                      </td>
                      <td style={tdStyle}>
                        {item.stored_count}
                      </td>
                      <td style={tdStyle}>
                        <b>
                          {formatMinutes(
                            item.avg_service_minutes
                          )}
                        </b>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <div
        style={{
          textAlign:
            "center",
          padding:
            "2px 8px 10px",
          color:
            "#94a3b8",
          fontSize: 10,
        }}
      >
        {APP_NAME} Â· {APP_SUBTITLE} Â· Report view for {getVisibleName(user)}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================

function miniPillStyle(
  background,
  color,
  border
) {
  return {
    display:
      "inline-flex",
    alignItems:
      "center",
    borderRadius: 999,
    padding:
      "5px 8px",
    background,
    color,
    border:
      `1px solid ${border}`,
    fontSize: 10,
    fontWeight: 850,
    whiteSpace:
      "nowrap",
  };
}

const thStyle = {
  padding:
    "12px 13px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 900,
  color: "#64748b",
  textTransform:
    "uppercase",
  letterSpacing:
    "0.05em",
  borderBottom:
    "1px solid #e2e8f0",
  whiteSpace:
    "nowrap",
};

const tdStyle = {
  padding:
    "12px 13px",
  fontSize: 12.5,
  color: "#0f172a",
  borderBottom:
    "1px solid #eef2f7",
  verticalAlign:
    "middle",
};

const infoBoxStyle = {
  padding: 15,
  borderRadius: 14,
  background:
    "#f8fbff",
  border:
    "1px solid #dbeafe",
  color:
    "#64748b",
  fontSize: 12.5,
  fontWeight: 700,
  lineHeight: 1.55,
};

// END WCHRFlights.jsx
