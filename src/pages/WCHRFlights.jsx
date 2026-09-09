 //src/pages/WCHRFlights.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
const INVENTORY_COLLECTION = "wchr_inventory";

const REPORT_FILTERS = [
  { value: "ALL", label: "All Services" },
  { value: "ACTIVE", label: "OB Active" },
  { value: "AT_GATE", label: "At Gate" },
  { value: "BOARDED", label: "Boarded" },
  { value: "PENDING_STORAGE", label: "Pending Storage" },
  { value: "STORED", label: "Stored" },
  { value: "IB_WAITING", label: "IB Waiting" },
  { value: "IB_ACCEPTED", label: "IB Accepted" },
  { value: "IB_IN_TRANSIT", label: "IB In Transit" },
  { value: "IB_DELIVERED", label: "IB Delivered" },
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

  if (!date) return "\u2014";

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
    return "\u2014";
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

function isInboundReport(report) {
  return (
    safeUpper(report?.service_direction) === "IB" ||
    Boolean(report?.ib_status) ||
    Boolean(report?.ib_accepted_at) ||
    Boolean(report?.ib_transit_started_at) ||
    Boolean(report?.ib_delivered_at)
  );
}

function getInboundStatus(report) {
  if (!isInboundReport(report)) return "";

  const direct = safeUpper(
    report?.ib_status ||
      report?.service_status ||
      report?.tracking_status
  );

  if (direct === "IB_DELIVERED" || report?.ib_delivered_at) {
    return "IB_DELIVERED";
  }

  if (direct === "IB_IN_TRANSIT" || report?.ib_transit_started_at) {
    return "IB_IN_TRANSIT";
  }

  if (direct === "IB_ACCEPTED" || report?.ib_accepted_at) {
    return "IB_ACCEPTED";
  }

  return "IB_WAITING";
}

function getInboundTransitMinutes(report) {
  if (!isInboundReport(report)) return null;

  const storedMinutes = Number(report?.ib_transit_minutes);
  if (Number.isFinite(storedMinutes) && storedMinutes >= 0) {
    return Math.round(storedMinutes);
  }

  return minutesBetween(
    report?.ib_transit_started_at || report?.timer_started_at,
    report?.ib_delivered_at || report?.delivered_at || report?.dropoff_at
  );
}

function getServiceStatus(report) {
  if (isInboundReport(report)) {
    return getInboundStatus(report);
  }

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
    IB_WAITING: "IB Waiting",
    IB_ACCEPTED: "IB Accepted",
    IB_IN_TRANSIT: "IB In Transit",
    IB_DELIVERED: "IB Delivered",
  };

  return labels[status] || status;
}

function getTimerStart(report) {
  if (isInboundReport(report)) {
    return report?.ib_transit_started_at || report?.timer_started_at || null;
  }

  return (
    report?.timer_started_at ||
    report?.ready_for_pickup_at ||
    report?.pickup_at ||
    report?.submitted_at ||
    report?.created_at ||
    null
  );
}

function getBoardingStartedAt(report) {
  return (
    report?.boarding_started_at ||
    report?.boarding_at ||
    report?.boarding_declared_at ||
    null
  );
}

function getBoardedAt(report) {
  const direct =
    report?.boarded_at ||
    report?.passenger_boarded_at ||
    report?.boarding_completed_at ||
    null;

  if (direct) {
    return direct;
  }

  // Legacy-safe fallback:
  // older records sometimes changed the status to BOARDED without saving boarded_at.
  if (
    safeUpper(
      report?.service_status ||
        report?.tracking_status
    ) === "BOARDED"
  ) {
    return (
      report?.last_updated_at ||
      report?.last_location_update_at ||
      null
    );
  }

  return null;
}

function getPassengerDeliveredAt(report) {
  const direct =
    report?.ib_delivered_at ||
    report?.passenger_delivered_at ||
    report?.delivered_at ||
    report?.dropoff_at ||
    report?.main_terminal_delivered_at ||
    null;

  if (direct) {
    return direct;
  }

  if (
    report?.passenger_delivered === true ||
    safeUpper(
      report?.service_status ||
        report?.tracking_status
    ) === "COMPLETED"
  ) {
    return (
      report?.last_updated_at ||
      report?.last_location_update_at ||
      null
    );
  }

  return null;
}

function getServiceEnd(report) {
  if (isInboundReport(report)) {
    return (
      report?.ib_delivered_at ||
      report?.delivered_at ||
      report?.dropoff_at ||
      null
    );
  }

  // Passenger service time ends when the passenger is boarded
  // OR delivered to Main Terminal. Storage is an inventory event
  // and must not extend passenger service time.
  return (
    getBoardedAt(report) ||
    getPassengerDeliveredAt(report) ||
    null
  );
}

function getTotalServiceMinutes(report) {
  if (isInboundReport(report)) {
    return getInboundTransitMinutes(report);
  }

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
    getBoardedAt(report) ||
      getPassengerDeliveredAt(report)
  );
}

function getGateToBoardingMinutes(report) {
  return minutesBetween(
    report?.gate_arrived_at,
    getBoardingStartedAt(report)
  );
}

function getBoardingToBoardedMinutes(report) {
  return minutesBetween(
    getBoardingStartedAt(report),
    getBoardedAt(report)
  );
}

function needs30MinuteAlert(report) {
  const status = getServiceStatus(report);

  const deliveredToGate =
    Boolean(report?.gate_arrived_at) ||
    Boolean(report?.passenger_delivered_to_gate_at) ||
    report?.passenger_delivered_to_gate === true ||
    [
      "AT_GATE",
      "BOARDING",
      "BOARDED",
      "PENDING_STORAGE",
      "STORED",
      "COMPLETED",
    ].includes(status) ||
    [
      "AT_GATE",
      "BOARDING",
      "BOARDED",
      "PENDING_STORAGE",
      "STORED",
      "COMPLETED",
    ].includes(
      safeUpper(
        report?.tracking_status ||
          report?.service_status
      )
    );

  // The 30-minute alert is only for transport to Gate.
  // After Gate, the 15-minute supervisor monitoring logic takes over.
  if (deliveredToGate) {
    return false;
  }

  if (report?.transport_alert_active === false) {
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
    "Service Direction",
    "Service Status",
    "Created",
    "Ready for Pickup",
    "Assigned",
    "Picked Up",
    "Gate Arrival",
    "Boarding Started",
    "Boarded",
    "Passenger Delivered",
    "IB Accepted",
    "IB Transit Started",
    "IB Destination",
    "IB Delivered",
    "IB Transit Time",
    "Stored",
    "Current Location",
    "Counter to Gate",
    "Gate to Boarding",
    "Boarding to Boarded",
    "Gate to Boarded / Delivered",
    "Total Passenger Service Time",
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
      isInboundReport(report) ? "IB" : "OB",
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
        getBoardingStartedAt(report)
      ),
      formatDateTime(
        getBoardedAt(report)
      ),
      formatDateTime(
        getPassengerDeliveredAt(report)
      ),
      formatDateTime(report.ib_accepted_at),
      formatDateTime(report.ib_transit_started_at),
      report.ib_destination || report.delivered_location || report.dropoff_location || "",
      formatDateTime(report.ib_delivered_at),
      formatMinutes(getInboundTransitMinutes(report)),
      formatDateTime(
        report.stored_at
      ),
      report.current_location,
      formatMinutes(
        getCounterToGateMinutes(report)
      ),
      formatMinutes(
        getGateToBoardingMinutes(report)
      ),
      formatMinutes(
        getBoardingToBoardedMinutes(report)
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
    "Service Direction",
    "IB Destination",
    "IB Transit Minutes",
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
          report.assigned_agent_name ||
          report.employee_name,
        isInboundReport(report) ? "IB" : "OB",
        report.ib_destination || "",
        getInboundTransitMinutes(report) ?? "",
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

      if (status === "IB_WAITING") {
        summary.ibWaiting += 1;
      }

      if (status === "IB_ACCEPTED") {
        summary.ibAccepted += 1;
      }

      if (status === "IB_IN_TRANSIT") {
        summary.ibInTransit += 1;
      }

      if (status === "IB_DELIVERED") {
        summary.ibDelivered += 1;
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
      ibWaiting: 0,
      ibAccepted: 0,
      ibInTransit: 0,
      ibDelivered: 0,
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
      "\u2014";

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
        ib_waiting: 0,
        ib_accepted: 0,
        ib_in_transit: 0,
        ib_delivered: 0,
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

    if (status === "IB_WAITING") {
      item.ib_waiting += 1;
    }

    if (status === "IB_ACCEPTED") {
      item.ib_accepted += 1;
    }

    if (status === "IB_IN_TRANSIT") {
      item.ib_in_transit += 1;
    }

    if (status === "IB_DELIVERED") {
      item.ib_delivered += 1;
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
      safeText(report.wchr_agent_name) ||
      safeText(report.assigned_wchr_agent) ||
      safeText(report.assigned_agent_name) ||
      safeText(report.assignment_accepted_by_agent_name) ||
      safeText(report.employee_name) ||
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
      getBoardedAt(report) ||
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
    IB_WAITING: {
      background: "#f8fafc",
      color: "#475569",
      border: "#cbd5e1",
    },
    IB_ACCEPTED: {
      background: "#eef2ff",
      color: "#4338ca",
      border: "#c7d2fe",
    },
    IB_IN_TRANSIT: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "#93c5fd",
    },
    IB_DELIVERED: {
      background: "#ecfdf5",
      color: "#047857",
      border: "#a7f3d0",
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
        {value || "\u2014"}
      </div>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  children,
  disabled = false,
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      disabled={disabled}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        borderRadius: 13,
        padding: "11px 13px",
        background: disabled ? "#f8fafc" : "#ffffff",
        color: "#0f172a",
        fontSize: 13,
        fontFamily: "inherit",
        outline: "none",
      }}
    >
      {children}
    </select>
  );
}

function TextArea({
  value,
  onChange,
  placeholder = "",
  disabled = false,
}) {
  return (
    <textarea
      rows={3}
      value={value}
      onChange={(event) =>
        onChange(event.target.value)
      }
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        borderRadius: 13,
        padding: "11px 13px",
        background: disabled ? "#f8fafc" : "#ffffff",
        color: "#0f172a",
        fontSize: 13,
        fontFamily: "inherit",
        resize: "vertical",
        outline: "none",
      }}
    />
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
      {label} | {count}
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
                  .join(" | ")}
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
                    "\u2014"}
                </td>
                <td style={tdStyle}>
                  {segment.agent_name ||
                    "\u2014"}
                </td>
                <td style={tdStyle}>
                  {segment.start_location ||
                    "\u2014"}
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
                    "\u2014"}
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
                  ) || "\u2014"}
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
// BRANDED PRINT VIEW
// ============================================================

function escapePrintHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildWchrPrintableHtml(report, timeline = [], segments = []) {
  const logoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/icons/aerostation-icon.png`
      : "/icons/aerostation-icon.png";

  const serviceStatus = getServiceStatusLabel(report);
  const passengerName = report?.passenger_name || "Passenger";
  const reportId = report?.report_id || report?.id || "â";
  const flightLabel = [report?.airline, report?.flight_number]
    .filter(Boolean)
    .join(" ") || "â";
  const agentName =
    report?.wchr_agent_name ||
    report?.assigned_wchr_agent ||
    report?.employee_name ||
    "â";
  const wheelchairLabel =
    report?.wheelchair_number ||
    (isPersonalWheelchair(report) ? "Personal WCHR" : "â");
  const inbound = isInboundReport(report);
  const serviceDirection = inbound ? "IB Arrival" : "OB Departure";
  const inboundDestination =
    report?.ib_destination || report?.delivered_location || report?.dropoff_location || "â";

  const card = (label, value) => `
    <div class="card">
      <div class="card-label">${escapePrintHtml(label)}</div>
      <div class="card-value">${escapePrintHtml(value || "â")}</div>
    </div>
  `;

  const timelineRows = timeline.length
    ? timeline
        .map((event) => {
          const eventType =
            safeUpper(event?.event_type).replaceAll("_", " ") || "EVENT";
          const details = [
            event?.location ? `Location: ${event.location}` : "",
            event?.employee_name ? `By: ${event.employee_name}` : "",
            event?.notes || event?.note || "",
          ]
            .filter(Boolean)
            .join(" | ");

          return `
            <tr>
              <td>${escapePrintHtml(formatDateTime(event?.created_at))}</td>
              <td><strong>${escapePrintHtml(eventType)}</strong></td>
              <td>${escapePrintHtml(details || "â")}</td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="3" class="empty-cell">No tracking events recorded.</td></tr>`;

  const segmentRows = segments.length
    ? segments
        .map((segment) => `
          <tr>
            <td>${escapePrintHtml(segment?.segment_number || "â")}</td>
            <td>${escapePrintHtml(segment?.agent_name || "â")}</td>
            <td>
              ${escapePrintHtml(segment?.start_location || "â")}
              <div class="subtext">${escapePrintHtml(
                formatDateTime(segment?.started_at)
              )}</div>
            </td>
            <td>
              ${escapePrintHtml(segment?.end_location || "â")}
              <div class="subtext">${escapePrintHtml(
                formatDateTime(segment?.ended_at)
              )}</div>
            </td>
            <td>${escapePrintHtml(
              safeUpper(segment?.segment_result || segment?.segment_status)
                .replaceAll("_", " ") || "â"
            )}</td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="5" class="empty-cell">No service segment records available.</td></tr>`;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapePrintHtml(APP_NAME)} - WCHR Passenger Service Report</title>
        <style>
          * { box-sizing: border-box; }

          @page {
            size: auto;
            margin: 12mm;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            color: #111827;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            width: 100%;
          }

          .brand-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            padding-bottom: 16px;
            margin-bottom: 18px;
            border-bottom: 2px solid #e5eef7;
          }

          .brand-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .brand-logo {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            border: 1px solid #dbeafe;
            background: #ffffff;
            object-fit: contain;
          }

          .brand-name {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #1769aa;
          }

          .brand-subtitle {
            margin-top: 3px;
            font-size: 11px;
            color: #64748b;
            font-weight: 700;
          }

          .document-label {
            font-size: 11px;
            color: #64748b;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            text-align: right;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            margin-bottom: 18px;
          }

          .title {
            margin: 0;
            font-size: 27px;
            line-height: 1.1;
            font-weight: 800;
            letter-spacing: -0.03em;
          }

          .subtitle {
            margin-top: 6px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }

          .status {
            display: inline-block;
            padding: 7px 11px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
            border: 1px solid #cfe7fb;
            background: #edf7ff;
            color: #1769aa;
            white-space: nowrap;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 16px;
          }

          .card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 11px 12px;
            min-width: 0;
          }

          .card-label,
          .section-label {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .card-value {
            margin-top: 5px;
            font-size: 13px;
            line-height: 1.35;
            font-weight: 800;
            color: #0f172a;
            overflow-wrap: anywhere;
          }

          .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
            gap: 9px;
            margin-bottom: 18px;
          }

          .metric {
            padding: 11px 12px;
            border-radius: 12px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
          }

          .metric-value {
            margin-top: 5px;
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
          }

          .section {
            margin-top: 18px;
            page-break-inside: avoid;
          }

          .section-title {
            margin: 0 0 8px;
            font-size: 15px;
            font-weight: 800;
            color: #0f172a;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #dbeafe;
            padding: 8px 9px;
            text-align: left;
            vertical-align: top;
            font-size: 10.5px;
            line-height: 1.4;
          }

          th {
            background: #f8fbff;
            font-size: 9.5px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
          }

          .subtext {
            margin-top: 3px;
            font-size: 9.5px;
            color: #64748b;
          }

          .empty-cell {
            text-align: center;
            color: #64748b;
            font-weight: 700;
          }

          .print-footer {
            margin-top: 28px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 9px;
            text-align: center;
          }

          @media print {
            .brand-header,
            .header,
            .grid,
            .metrics,
            .section,
            table,
            tr,
            td,
            th {
              break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="brand-header">
            <div class="brand-left">
              <img
                class="brand-logo"
                src="${escapePrintHtml(logoUrl)}"
                alt="${escapePrintHtml(APP_NAME)}"
              />

              <div>
                <div class="brand-name">${escapePrintHtml(APP_NAME)}</div>
                <div class="brand-subtitle">${escapePrintHtml(APP_SUBTITLE)}</div>
              </div>
            </div>

            <div class="document-label">
              WCHR Passenger Service Report
            </div>
          </div>

          <div class="header">
            <div>
              <h1 class="title">${escapePrintHtml(passengerName)}</h1>
              <div class="subtitle">
                ${escapePrintHtml(flightLabel)} &middot; ${escapePrintHtml(reportId)}
              </div>
            </div>

            <div class="status">${escapePrintHtml(serviceStatus)}</div>
          </div>

          <div class="grid">
            ${card("Report ID", reportId)}
            ${card("Passenger", passengerName)}
            ${card("Flight", flightLabel)}
            ${card("PNR", report?.pnr || "â")}
            ${card("WCHR Type", report?.wch_type || "â")}
            ${card("Wheelchair", wheelchairLabel)}
            ${card("Assigned Agent", agentName)}
            ${card("Service Direction", serviceDirection)}
            ${card("Current Location", report?.current_location || "â")}
            ${inbound ? card("IB Accepted", formatDateTime(report?.ib_accepted_at)) : ""}
            ${inbound ? card("Transit Started at CBP", formatDateTime(report?.ib_transit_started_at)) : ""}
            ${inbound ? card("Destination", inboundDestination) : ""}
            ${inbound ? card("IB Delivered", formatDateTime(report?.ib_delivered_at)) : ""}
            ${card("Created", formatDateTime(report?.submitted_at || report?.created_at))}
            ${card("Ready for Pickup", formatDateTime(report?.ready_for_pickup_at))}
            ${card("Assigned", formatDateTime(report?.assigned_at))}
            ${card("Picked Up", formatDateTime(report?.picked_up_at || report?.pickup_at))}
            ${card("Gate Arrival", formatDateTime(report?.gate_arrived_at))}
            ${card("Boarding Started", formatDateTime(getBoardingStartedAt(report)))}
            ${card("Passenger Boarded", formatDateTime(getBoardedAt(report)))}
            ${card("Passenger Delivered", formatDateTime(getPassengerDeliveredAt(report)))}
            ${card("Stored", formatDateTime(report?.stored_at))}
            ${card("Last Update", formatDateTime(report?.last_updated_at || report?.last_location_update_at))}
          </div>

          <div class="metrics">
            ${inbound ? `
            <div class="metric">
              <div class="section-label">CBP to Destination</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getInboundTransitMinutes(report))
              )}</div>
            </div>` : ""}
            <div class="metric">
              <div class="section-label">Counter to Gate</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getCounterToGateMinutes(report))
              )}</div>
            </div>

            <div class="metric">
              <div class="section-label">Gate to Boarding</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getGateToBoardingMinutes(report))
              )}</div>
            </div>

            <div class="metric">
              <div class="section-label">Boarding to Boarded</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getBoardingToBoardedMinutes(report))
              )}</div>
            </div>

            <div class="metric">
              <div class="section-label">Gate to Boarded / Delivered</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getGateToBoardedMinutes(report))
              )}</div>
            </div>

            <div class="metric">
              <div class="section-label">Total Passenger Service</div>
              <div class="metric-value">${escapePrintHtml(
                formatMinutes(getTotalServiceMinutes(report))
              )}</div>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Service Timeline</h2>
            <table>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Event</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>${timelineRows}</tbody>
            </table>
          </div>

          <div class="section">
            <h2 class="section-title">Service Segments</h2>
            <table>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Agent</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>${segmentRows}</tbody>
            </table>
          </div>

          <div class="print-footer">
            ${escapePrintHtml(APP_NAME)} &middot; ${escapePrintHtml(APP_SUBTITLE)}
          </div>
        </div>
      </body>
    </html>
  `;
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

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    busyAction,
    setBusyAction,
  ] = useState("");

  const [
    managerNote,
    setManagerNote,
  ] = useState("");

  const [
    storeLocation,
    setStoreLocation,
  ] = useState("Wheelchair Storage");

  const [
    lookupReportId,
    setLookupReportId,
  ] = useState("");

  // ==========================================================
  // LIVE REPORTS FOR DATE
  // ==========================================================

  useEffect(() => {
    setLoading(true);
    setError("");

    const start = Timestamp.fromDate(
      startOfDay(selectedDate)
    );

    const end = Timestamp.fromDate(
      endOfDay(selectedDate)
    );

    const reportQuery = query(
      collection(db, REPORTS_COLLECTION),
      where("submitted_at", ">=", start),
      where("submitted_at", "<=", end)
    );

    const unsubscribe = onSnapshot(
      reportQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort(
            (a, b) =>
              getMillis(a.submitted_at) -
              getMillis(b.submitted_at)
          );

        setAllDayReports(rows);
        setLoading(false);
      },
      (loadError) => {
        console.error(
          "WCHR report live listener error:",
          loadError
        );

        setAllDayReports([]);
        setLoading(false);
        setError(
          loadError?.message ||
            "Could not load WCHR reports."
        );
      }
    );

    return () => unsubscribe();
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
            ) || "\u2014";

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

  const lookupReport = useMemo(
    () =>
      allDayReports.find(
        (report) => report.id === lookupReportId
      ) || null,
    [allDayReports, lookupReportId]
  );

  const canManageService =
    user?.role === "station_manager" ||
    user?.role === "duty_manager" ||
    user?.role === "supervisor";


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
  // SERVICE MANAGEMENT ACTIONS
  // ==========================================================

  const addManagementTimelineNote = async (report, note) => {
    await addDoc(
      collection(db, TRACKING_EVENTS_COLLECTION),
      {
        report_doc_id: report.id,
        report_id: report.report_id || report.id,
        wheelchair_number: report.wheelchair_number || "",
        passenger_name: report.passenger_name || "",
        airline: report.airline || "",
        flight_number: report.flight_number || "",
        event_type: "MANAGEMENT_NOTE",
        location: report.current_location || "",
        notes: note,
        employee_id: user?.id || user?.uid || "",
        employee_name: getVisibleName(user),
        created_at: serverTimestamp(),
      }
    );
  };

  const handleAddManagementNote = async () => {
    const note = safeText(managerNote);

    if (!selectedReport || !note) {
      setError("Select a WCHR and write a note first.");
      return;
    }

    try {
      setBusyAction("note");
      setError("");
      setStatusMessage("");

      await addManagementTimelineNote(
        selectedReport,
        note
      );

      await updateDoc(
        doc(db, REPORTS_COLLECTION, selectedReport.id),
        {
          management_note: note,
          management_note_at: serverTimestamp(),
          management_note_by: getVisibleName(user),
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleName(user),
        }
      );

      setManagerNote("");
      setStatusMessage("Operational note saved to the WCHR timeline.");

      const eventSnapshot = await getDocs(
        query(
          collection(db, TRACKING_EVENTS_COLLECTION),
          where("report_doc_id", "==", selectedReport.id)
        )
      );

      setTimeline(
        eventSnapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort(
            (a, b) =>
              getMillis(a.created_at) - getMillis(b.created_at)
          )
      );
    } catch (actionError) {
      console.error("WCHR management note error:", actionError);
      setError(
        actionError?.message ||
          "Unable to save the operational note."
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleStoreWheelchair = async () => {
    if (!selectedReport || !canManageService) return;

    if (getServiceStatus(selectedReport) === "STORED") {
      setStatusMessage("This wheelchair is already stored.");
      return;
    }

    const location = safeText(storeLocation) || "Wheelchair Storage";

    const confirmed = window.confirm(
      `Mark WCHR ${selectedReport.wheelchair_number || ""} as STORED at ${location}?`
    );

    if (!confirmed) return;

    try {
      setBusyAction("store");
      setError("");
      setStatusMessage("");

      await updateDoc(
        doc(db, REPORTS_COLLECTION, selectedReport.id),
        {
          service_status: "STORED",
          tracking_status: "STORED",
          stored_location: location,
          stored_at: serverTimestamp(),
          current_location: location,
          is_active: false,
          alerts_enabled: false,
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleName(user),
          last_updated_by_id: user?.id || user?.uid || "",
        }
      );

      const inventoryId = safeText(
        selectedReport.inventory_doc_id
      );

      if (inventoryId && !isPersonalWheelchair(selectedReport)) {
        await setDoc(
          doc(db, INVENTORY_COLLECTION, inventoryId),
          {
            wheelchair_number: selectedReport.wheelchair_number || "",
            status: "AVAILABLE",
            is_available: true,
            available_for_handoff: false,
            location,
            report_doc_id: "",
            assigned_report_doc_id: "",
            report_id: "",
            assigned_report_id: "",
            passenger_name: "",
            airline: "",
            flight_number: "",
            pnr: "",
            current_agent_id: "",
            current_agent_name: "",
            stored_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await addDoc(
        collection(db, TRACKING_EVENTS_COLLECTION),
        {
          report_doc_id: selectedReport.id,
          report_id: selectedReport.report_id || selectedReport.id,
          wheelchair_number: selectedReport.wheelchair_number || "",
          passenger_name: selectedReport.passenger_name || "",
          airline: selectedReport.airline || "",
          flight_number: selectedReport.flight_number || "",
          event_type: "WCHR_STORED",
          location,
          notes: `WCHR stored at ${location} by ${getVisibleName(user)}.`,
          employee_id: user?.id || user?.uid || "",
          employee_name: getVisibleName(user),
          created_at: serverTimestamp(),
        }
      );

      setStatusMessage(
        `WCHR ${selectedReport.wheelchair_number || ""} marked as stored.`
      );
    } catch (actionError) {
      console.error("WCHR store error:", actionError);
      setError(
        actionError?.message ||
          "Unable to store the wheelchair."
      );
    } finally {
      setBusyAction("");
    }
  };

  const handleDeleteReport = async () => {
    if (!selectedReport || !canManageService) return;

    const confirmed = window.confirm(
      `Delete WCHR report ${selectedReport.report_id || selectedReport.id}? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setBusyAction("delete");
      setError("");
      setStatusMessage("");

      const [eventSnapshot, segmentSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(db, TRACKING_EVENTS_COLLECTION),
            where("report_doc_id", "==", selectedReport.id)
          )
        ),
        getDocs(
          query(
            collection(db, SERVICE_SEGMENTS_COLLECTION),
            where("report_doc_id", "==", selectedReport.id)
          )
        ),
      ]);

      await Promise.all([
        ...eventSnapshot.docs.map((item) => deleteDoc(item.ref)),
        ...segmentSnapshot.docs.map((item) => deleteDoc(item.ref)),
      ]);

      await deleteDoc(
        doc(db, REPORTS_COLLECTION, selectedReport.id)
      );

      setSelectedReportId("");
      setLookupReportId("");
      setTimeline([]);
      setSegments([]);
      setStatusMessage("WCHR report deleted.");
    } catch (actionError) {
      console.error("WCHR delete error:", actionError);
      setError(
        actionError?.message ||
          "Unable to delete the WCHR report."
      );
    } finally {
      setBusyAction("");
    }
  };



  // ==========================================================
  // PASSENGER COMPLETION TIMESTAMPS
  // ==========================================================

  const handleDeclareBoarding =
    async () => {
      if (
        !selectedReport ||
        !canManageService
      ) {
        return;
      }

      if (
        getBoardingStartedAt(
          selectedReport
        )
      ) {
        setStatusMessage(
          "Boarding start time is already recorded."
        );
        return;
      }

      try {
        setBusyAction(
          "boarding"
        );
        setError("");
        setStatusMessage("");

        await updateDoc(
          doc(
            db,
            REPORTS_COLLECTION,
            selectedReport.id
          ),
          {
            service_status:
              "BOARDING",
            tracking_status:
              "BOARDING",
            boarding_started_at:
              serverTimestamp(),
            boarding_declared_by:
              getVisibleName(
                user
              ),
            boarding_declared_by_id:
              user?.id ||
              user?.uid ||
              "",
            transport_alert_active:
              false,
            last_updated_at:
              serverTimestamp(),
            last_updated_by:
              getVisibleName(
                user
              ),
          }
        );

        await addDoc(
          collection(
            db,
            TRACKING_EVENTS_COLLECTION
          ),
          {
            report_doc_id:
              selectedReport.id,
            report_id:
              selectedReport.report_id ||
              selectedReport.id,
            wheelchair_number:
              selectedReport.wheelchair_number ||
              "",
            passenger_name:
              selectedReport.passenger_name ||
              "",
            airline:
              selectedReport.airline ||
              "",
            flight_number:
              selectedReport.flight_number ||
              "",
            event_type:
              "BOARDING_STARTED",
            location:
              selectedReport.current_location ||
              selectedReport.gate_location ||
              "",
            notes:
              `Boarding started. Declared by ${getVisibleName(
                user
              )}.`,
            employee_id:
              user?.id ||
              user?.uid ||
              "",
            employee_name:
              getVisibleName(
                user
              ),
            created_at:
              serverTimestamp(),
          }
        );

        setStatusMessage(
          "Boarding start time recorded."
        );
      } catch (actionError) {
        console.error(
          "WCHR boarding timestamp error:",
          actionError
        );
        setError(
          actionError?.message ||
            "Unable to record boarding start."
        );
      } finally {
        setBusyAction("");
      }
    };

  const handleDeclareBoarded =
    async () => {
      if (
        !selectedReport ||
        !canManageService
      ) {
        return;
      }

      if (
        getBoardedAt(
          selectedReport
        )
      ) {
        setStatusMessage(
          "Passenger boarded time is already recorded."
        );
        return;
      }

      try {
        setBusyAction(
          "boarded"
        );
        setError("");
        setStatusMessage("");

        await updateDoc(
          doc(
            db,
            REPORTS_COLLECTION,
            selectedReport.id
          ),
          {
            service_status:
              "BOARDED",
            tracking_status:
              "BOARDED",
            boarded_at:
              serverTimestamp(),
            passenger_boarded_at:
              serverTimestamp(),
            boarded_declared_by:
              getVisibleName(
                user
              ),
            boarded_declared_by_id:
              user?.id ||
              user?.uid ||
              "",
            transport_alert_active:
              false,
            alerts_enabled:
              false,
            is_active:
              false,
            last_updated_at:
              serverTimestamp(),
            last_updated_by:
              getVisibleName(
                user
              ),
          }
        );

        await addDoc(
          collection(
            db,
            TRACKING_EVENTS_COLLECTION
          ),
          {
            report_doc_id:
              selectedReport.id,
            report_id:
              selectedReport.report_id ||
              selectedReport.id,
            wheelchair_number:
              selectedReport.wheelchair_number ||
              "",
            passenger_name:
              selectedReport.passenger_name ||
              "",
            airline:
              selectedReport.airline ||
              "",
            flight_number:
              selectedReport.flight_number ||
              "",
            event_type:
              "PASSENGER_BOARDED",
            location:
              selectedReport.current_location ||
              selectedReport.gate_location ||
              "",
            notes:
              `Passenger boarded. Declared by ${getVisibleName(
                user
              )}. Passenger service timer stopped.`,
            employee_id:
              user?.id ||
              user?.uid ||
              "",
            employee_name:
              getVisibleName(
                user
              ),
            created_at:
              serverTimestamp(),
          }
        );

        setStatusMessage(
          "Passenger boarded time recorded. Service timer is complete."
        );
      } catch (actionError) {
        console.error(
          "WCHR boarded timestamp error:",
          actionError
        );
        setError(
          actionError?.message ||
            "Unable to record passenger boarded time."
        );
      } finally {
        setBusyAction("");
      }
    };

  const handleDeclareDelivered =
    async () => {
      if (
        !selectedReport ||
        !canManageService
      ) {
        return;
      }

      if (
        getPassengerDeliveredAt(
          selectedReport
        )
      ) {
        setStatusMessage(
          "Passenger delivery time is already recorded."
        );
        return;
      }

      const location =
        safeText(
          selectedReport.current_location
        ) ||
        "Main Terminal";

      try {
        setBusyAction(
          "delivered"
        );
        setError("");
        setStatusMessage("");

        await updateDoc(
          doc(
            db,
            REPORTS_COLLECTION,
            selectedReport.id
          ),
          {
            passenger_delivered:
              true,
            passenger_delivered_at:
              serverTimestamp(),
            delivered_at:
              serverTimestamp(),
            delivered_location:
              location,
            dropoff_at:
              serverTimestamp(),
            dropoff_location:
              location,
            service_status:
              "PENDING_STORAGE",
            tracking_status:
              "PENDING_STORAGE",
            transport_alert_active:
              false,
            alerts_enabled:
              false,
            is_active:
              false,
            delivered_declared_by:
              getVisibleName(
                user
              ),
            delivered_declared_by_id:
              user?.id ||
              user?.uid ||
              "",
            last_updated_at:
              serverTimestamp(),
            last_updated_by:
              getVisibleName(
                user
              ),
          }
        );

        await addDoc(
          collection(
            db,
            TRACKING_EVENTS_COLLECTION
          ),
          {
            report_doc_id:
              selectedReport.id,
            report_id:
              selectedReport.report_id ||
              selectedReport.id,
            wheelchair_number:
              selectedReport.wheelchair_number ||
              "",
            passenger_name:
              selectedReport.passenger_name ||
              "",
            airline:
              selectedReport.airline ||
              "",
            flight_number:
              selectedReport.flight_number ||
              "",
            event_type:
              "PASSENGER_DELIVERED",
            location,
            notes:
              `Passenger delivered at ${location}. Declared by ${getVisibleName(
                user
              )}. Passenger service timer stopped.`,
            employee_id:
              user?.id ||
              user?.uid ||
              "",
            employee_name:
              getVisibleName(
                user
              ),
            created_at:
              serverTimestamp(),
          }
        );

        setStatusMessage(
          "Passenger delivery time recorded. Service timer is complete."
        );
      } catch (actionError) {
        console.error(
          "WCHR passenger delivery timestamp error:",
          actionError
        );
        setError(
          actionError?.message ||
            "Unable to record passenger delivery time."
        );
      } finally {
        setBusyAction("");
      }
    };

  // ==========================================================
  // PRINT SELECTED SERVICE ONLY
  // ==========================================================

  const handlePrintSelectedReport = () => {
    if (!selectedReport) {
      return;
    }

    const html = buildWchrPrintableHtml(
      selectedReport,
      timeline,
      segments
    );

    const printWindow = window.open(
      "",
      "_blank",
      "width=1200,height=900"
    );

    if (!printWindow) {
      setStatusMessage(
        "Pop-up blocked. Please allow pop-ups to print the WCHR report."
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
    };

    window.setTimeout(triggerPrint, 500);
  };

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
                {APP_NAME} | WCHR Reports
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
                  "/wchr"
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

      {statusMessage && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              borderRadius: 14,
              padding: "11px 13px",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.5,
            }}
          >
            {statusMessage}
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
              : "repeat(auto-fit, minmax(125px, 1fr))",
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
          label="IB Waiting"
          value={summary.ibWaiting}
          tone="slate"
        />

        <MetricCard
          label="IB Accepted"
          value={summary.ibAccepted}
          tone="blue"
        />

        <MetricCard
          label="IB Transit"
          value={summary.ibInTransit}
          tone="blue"
        />

        <MetricCard
          label="IB Delivered"
          value={summary.ibDelivered}
          tone="green"
        />

        <MetricCard
          label="30+ Min"
          value={summary.alerts}
          tone="red"
        />
      </div>

      {/* LIVE WCHR LOOKUP */}

      <PageCard
        style={{
          padding: isMobile ? 15 : 19,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile || isTablet
                ? "1fr"
                : "1.2fr 1fr",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "#1769aa",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 6,
              }}
            >
              Operational Lookup
            </div>

            <SelectInput
              value={lookupReportId}
              onChange={(value) => {
                setLookupReportId(value);

                const report = allDayReports.find(
                  (item) => item.id === value
                );

                if (report) {
                  const airline = safeUpper(report.airline) || "-";
                  const flightNumber = safeUpper(report.flight_number) || "NO_FLIGHT";
                  setSelectedFlightKey(
                    `${getReportDateKey(report)}-${airline}-${flightNumber}`
                  );
                  setSelectedReportId(report.id);
                }
              }}
            >
              <option value="">Select WCHR / passenger / employee</option>
              {allDayReports.map((report) => (
                <option key={report.id} value={report.id}>
                  {`${isInboundReport(report) ? "IB" : "OB"} | WCHR ${report.wheelchair_number || "Pending"} | ${report.passenger_name || "Passenger"} | ${report.wchr_agent_name || report.assigned_wchr_agent || report.assigned_agent_name || report.employee_name || "Unassigned"}`}
                </option>
              ))}
            </SelectInput>
          </div>

          {lookupReport && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <InfoField
                label="Last Location"
                value={lookupReport.current_location || lookupReport.last_location}
              />
              <InfoField
                label="Employee"
                value={
                  lookupReport.wchr_agent_name ||
                  lookupReport.assigned_wchr_agent ||
                  lookupReport.employee_name ||
                  "Unassigned"
                }
              />
              <InfoField
                label="Status"
                value={getServiceStatusLabel(lookupReport)}
              />
              <InfoField
                label="Last Update"
                value={formatDateTime(
                  lookupReport.last_location_update_at ||
                    lookupReport.last_updated_at ||
                    lookupReport.gate_arrived_at ||
                    lookupReport.submitted_at
                )}
              />
            </div>
          )}
        </div>
      </PageCard>

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
                item.value === "IB_WAITING"
              ) {
                count = summary.ibWaiting;
              } else if (
                item.value === "IB_ACCEPTED"
              ) {
                count = summary.ibAccepted;
              } else if (
                item.value === "IB_IN_TRANSIT"
              ) {
                count = summary.ibInTransit;
              } else if (
                item.value === "IB_DELIVERED"
              ) {
                count = summary.ibDelivered;
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
                          : "\u2014"}{" "}
                        | {flight.total} passenger service
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
                      {flight.ib_waiting > 0 && (
                        <span
                          style={miniPillStyle(
                            "#f8fafc",
                            "#475569",
                            "#cbd5e1"
                          )}
                        >
                          IB Waiting {flight.ib_waiting}
                        </span>
                      )}

                      {flight.ib_accepted > 0 && (
                        <span
                          style={miniPillStyle(
                            "#eef2ff",
                            "#4338ca",
                            "#c7d2fe"
                          )}
                        >
                          IB Accepted {flight.ib_accepted}
                        </span>
                      )}

                      {flight.ib_in_transit > 0 && (
                        <span
                          style={miniPillStyle(
                            "#eff6ff",
                            "#1d4ed8",
                            "#93c5fd"
                          )}
                        >
                          IB Transit {flight.ib_in_transit}
                        </span>
                      )}

                      {flight.ib_delivered > 0 && (
                        <span
                          style={miniPillStyle(
                            "#ecfdf5",
                            "#047857",
                            "#a7f3d0"
                          )}
                        >
                          IB Delivered {flight.ib_delivered}
                        </span>
                      )}

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
                          : "\u2014")
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
        <div id="wchr-selected-service-print">
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
              onClick={
                handlePrintSelectedReport
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
                  : "\u2014")
              }
            />

            <InfoField
              label="Assigned Agent"
              value={
                selectedReport.wchr_agent_name ||
                selectedReport.assigned_wchr_agent ||
                selectedReport.assigned_agent_name ||
                selectedReport.employee_name
              }
            />

            <InfoField
              label="Service Direction"
              value={isInboundReport(selectedReport) ? "IB Arrival" : "OB Departure"}
            />

            <InfoField
              label="Current Location"
              value={
                selectedReport.current_location
              }
            />

            {isInboundReport(selectedReport) && (
              <>
                <InfoField
                  label="IB Accepted"
                  value={formatDateTime(selectedReport.ib_accepted_at)}
                />

                <InfoField
                  label="Transit Started at CBP"
                  value={formatDateTime(selectedReport.ib_transit_started_at)}
                />

                <InfoField
                  label="IB Destination"
                  value={
                    selectedReport.ib_destination ||
                    selectedReport.delivered_location ||
                    selectedReport.dropoff_location ||
                    "â"
                  }
                />

                <InfoField
                  label="IB Delivered"
                  value={formatDateTime(selectedReport.ib_delivered_at)}
                />

                <InfoField
                  label="CBP to Destination"
                  value={formatMinutes(getInboundTransitMinutes(selectedReport))}
                />
              </>
            )}

            <InfoField
              label="Created"
              value={formatDateTime(
                selectedReport.submitted_at ||
                selectedReport.created_at
              )}
            />

            {!isInboundReport(selectedReport) && (
              <>
                <InfoField
                  label="Ready for Pickup"
                  value={formatDateTime(selectedReport.ready_for_pickup_at)}
                />

                <InfoField
                  label="Assigned"
                  value={formatDateTime(selectedReport.assigned_at)}
                />

                <InfoField
                  label="Picked Up"
                  value={formatDateTime(
                    selectedReport.picked_up_at || selectedReport.pickup_at
                  )}
                />

                <InfoField
                  label="Gate Arrival"
                  value={formatDateTime(selectedReport.gate_arrived_at)}
                />

                <InfoField
                  label="Boarding Started"
                  value={formatDateTime(getBoardingStartedAt(selectedReport))}
                />

                <InfoField
                  label="Passenger Boarded"
                  value={formatDateTime(getBoardedAt(selectedReport))}
                />

                <InfoField
                  label="Passenger Delivered"
                  value={formatDateTime(getPassengerDeliveredAt(selectedReport))}
                />

                <InfoField
                  label="Stored"
                  value={formatDateTime(selectedReport.stored_at)}
                />

                <InfoField
                  label="Counter to Gate"
                  value={formatMinutes(getCounterToGateMinutes(selectedReport))}
                />

                <InfoField
                  label="Gate to Boarding"
                  value={formatMinutes(getGateToBoardingMinutes(selectedReport))}
                />

                <InfoField
                  label="Boarding to Boarded"
                  value={formatMinutes(getBoardingToBoardedMinutes(selectedReport))}
                />

                <InfoField
                  label="Gate to Boarded / Delivered"
                  value={formatMinutes(getGateToBoardedMinutes(selectedReport))}
                />
              </>
            )}

            <InfoField
              label="Total Passenger Service"
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

          {canManageService && (
            <div
              className="wchr-no-print"
              style={{
                marginTop: 16,
                padding: isMobile ? 13 : 16,
                borderRadius: 16,
                background: needs30MinuteAlert(selectedReport)
                  ? "#fff7f7"
                  : "#f8fbff",
                border: needs30MinuteAlert(selectedReport)
                  ? "1px solid #fecdd3"
                  : "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: needs30MinuteAlert(selectedReport)
                    ? "#b91c1c"
                    : "#1769aa",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                Management Controls
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                {isInboundReport(selectedReport)
                  ? needs30MinuteAlert(selectedReport)
                    ? "IB transit has exceeded 30 minutes. Review the CBP-to-destination movement and add an operational note if needed."
                    : "Inbound service is controlled by the WCHR agent. Management can review the live transit, add notes, or delete an incorrect report."
                  : needs30MinuteAlert(selectedReport)
                  ? "30+ minute alert is active. Add an operational note explaining the current status, then continue monitoring or store the wheelchair when the service is complete."
                  : "Add operational notes, confirm wheelchair storage, or delete an incorrect report."}
              </div>

              {!isInboundReport(selectedReport) && (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns:
                      isMobile
                        ? "1fr"
                        : "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  <ActionButton
                    variant="secondary"
                  disabled={
                    Boolean(busyAction) ||
                    Boolean(
                      getBoardingStartedAt(
                        selectedReport
                      )
                    )
                  }
                  onClick={
                    handleDeclareBoarding
                  }
                >
                  {busyAction === "boarding"
                    ? "Recording..."
                    : "Start Boarding"}
                </ActionButton>

                <ActionButton
                  variant="success"
                  disabled={
                    Boolean(busyAction) ||
                    Boolean(
                      getBoardedAt(
                        selectedReport
                      )
                    )
                  }
                  onClick={
                    handleDeclareBoarded
                  }
                >
                  {busyAction === "boarded"
                    ? "Recording..."
                    : "Passenger Boarded"}
                </ActionButton>

                <ActionButton
                  variant="warning"
                  disabled={
                    Boolean(busyAction) ||
                    Boolean(
                      getPassengerDeliveredAt(
                        selectedReport
                      )
                    )
                  }
                  onClick={
                    handleDeclareDelivered
                  }
                >
                  {busyAction === "delivered"
                    ? "Recording..."
                    : "Delivered Main Terminal"}
                  </ActionButton>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <TextArea
                  value={managerNote}
                  onChange={setManagerNote}
                  disabled={Boolean(busyAction)}
                  placeholder={
                    isInboundReport(selectedReport)
                      ? "Example: Passenger accepted at CBP, transit delay, elevator congestion, destination access issue..."
                      : "Example: Passenger at gate, agent checking status, TSA delay, restroom request, waiting to board..."
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "1fr auto auto auto",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                {!isInboundReport(selectedReport) ? (
                  <SelectInput
                    value={storeLocation}
                    onChange={setStoreLocation}
                    disabled={Boolean(busyAction)}
                  >
                    <option value="Wheelchair Storage">Wheelchair Storage</option>
                    <option value="Counter">Counter</option>
                    <option value="Main Terminal">Main Terminal</option>
                    <option value="Gate F87">Gate F87</option>
                    <option value="Gate F88">Gate F88</option>
                    <option value="Other">Other</option>
                  </SelectInput>
                ) : (
                  <InfoField
                    label="IB Destination"
                    value={
                      selectedReport.ib_destination ||
                      selectedReport.current_location ||
                      "Pending"
                    }
                  />
                )}

                <ActionButton
                  variant="primary"
                  disabled={Boolean(busyAction) || !safeText(managerNote)}
                  onClick={handleAddManagementNote}
                >
                  {busyAction === "note" ? "Saving Note..." : "Add Note"}
                </ActionButton>

                {!isInboundReport(selectedReport) && (
                  <ActionButton
                    variant="success"
                    disabled={
                      Boolean(busyAction) ||
                      getServiceStatus(selectedReport) === "STORED"
                    }
                    onClick={handleStoreWheelchair}
                  >
                    {busyAction === "store" ? "Storing..." : "Store WCHR"}
                  </ActionButton>
                )}

                <ActionButton
                  variant="warning"
                  disabled={Boolean(busyAction)}
                  onClick={handleDeleteReport}
                >
                  {busyAction === "delete" ? "Deleting..." : "Delete Report"}
                </ActionButton>
              </div>
            </div>
          )}

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
        </div>
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
        {APP_NAME} | {APP_SUBTITLE} | Report view for {getVisibleName(user)}
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
