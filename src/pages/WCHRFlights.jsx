import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const WCHR_LOCATIONS = [
  "Counter",
  "TSA",
  "Security",
  "Train",
  "Airside F",
  "Gate F78",
  "Gate F79",
  "Gate F80",
  "Gate F81",
  "Gate F82",
  "Gate F83",
  "Gate F84",
  "Gate F85",
  "Gate F86",
  "Gate F87",
  "Gate F88",
  "Gate F89",
  "Gate F90",
  "Jet Bridge",
  "Aircraft",
  "Baggage Claim",
  "Customs",
  "CBP",
  "Main Terminal",
  "Wheelchair Storage",
  "Maintenance",
  "Other",
];

const GATE_LOCATIONS = [
  "Gate F78",
  "Gate F79",
  "Gate F80",
  "Gate F81",
  "Gate F82",
  "Gate F83",
  "Gate F84",
  "Gate F85",
  "Gate F86",
  "Gate F87",
  "Gate F88",
  "Gate F89",
  "Gate F90",
];

const WCHR_OPERATIONAL_FILTERS = [
  {
    value: "ALL",
    label: "All Wheelchairs",
  },
  {
    value: "ACTIVE",
    label: "Active / In Use",
  },
  {
    value: "PENDING_DELIVERY",
    label: "Pending Delivery",
  },
  {
    value: "PENDING_STORAGE",
    label: "Pending Storage",
  },
  {
    value: "STORED",
    label: "Stored / Not In Use",
  },
  {
    value: "ALERT",
    label: "30+ Minute Alerts",
  },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYYYYMMDD(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}`;
}

function toMMDDYYYY(dateObj) {
  return `${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}-${dateObj.getFullYear()}`;
}

function startOfDay(d) {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  );
}

function endOfDay(d) {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999
  );
}

function tsToDate(val) {
  if (!val) return null;

  if (typeof val?.toDate === "function") {
    return val.toDate();
  }

  const date = new Date(val);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function safeText(value) {
  return String(value || "").trim();
}

function isGateLocation(value) {
  return GATE_LOCATIONS.includes(safeText(value));
}

function getReportDate(report) {
  return (
    tsToDate(report.submitted_at) ||
    tsToDate(report.billing_date) ||
    tsToDate(report.flight_date)
  );
}

function getReportDateKey(report) {
  const date = getReportDate(report);
  return date ? toYYYYMMDD(date) : "NO_DATE";
}

function getMillis(value) {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  const date = tsToDate(value);
  return date ? date.getTime() : 0;
}

function formatDateTimeValue(value) {
  const date = tsToDate(value);

  if (!date) return "—";

  return `${toMMDDYYYY(date)} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
}

function minutesBetween(startValue, endValue) {
  const start = getMillis(startValue);
  const end = getMillis(endValue);

  if (!start || !end || end < start) return null;

  return Math.round((end - start) / 60000);
}

function formatMinutes(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "—";
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function minutesSince(value) {
  const milliseconds = getMillis(value);

  if (!milliseconds) return 0;

  return Math.floor((Date.now() - milliseconds) / 60000);
}

function getCounterToGateMinutes(report) {
  return minutesBetween(
    report.pickup_at || report.submitted_at,
    report.gate_arrived_at
  );
}

function getGateToDeliveredMinutes(report) {
  return minutesBetween(
    report.gate_arrived_at,
    report.delivered_at || report.dropoff_at
  );
}

function getTotalDeliveredMinutes(report) {
  return minutesBetween(
    report.pickup_at || report.submitted_at,
    report.delivered_at || report.dropoff_at
  );
}

function isPassengerDelivered(report) {
  const trackingStatus = safeUpper(
    report.tracking_status || "IN_PROGRESS"
  );

  return (
    report.passenger_delivered === true ||
    trackingStatus === "COMPLETED" ||
    Boolean(report.delivered_at) ||
    Boolean(report.dropoff_at)
  );
}

function isWheelchairStored(report) {
  const trackingStatus = safeUpper(
    report.tracking_status || "IN_PROGRESS"
  );

  return (
    trackingStatus === "STORED" ||
    Boolean(report.stored_at) ||
    (
      report.is_active === false &&
      safeText(report.current_location) === "Wheelchair Storage"
    )
  );
}

function getWheelchairOperationalStatus(report) {
  if (isWheelchairStored(report)) {
    return "STORED";
  }

  if (isPassengerDelivered(report)) {
    return "PENDING_STORAGE";
  }

  return "PENDING_DELIVERY";
}

function isWheelchairActive(report) {
  const operationalStatus = getWheelchairOperationalStatus(report);

  return (
    operationalStatus === "PENDING_DELIVERY" ||
    operationalStatus === "PENDING_STORAGE"
  );
}

function needsLocationAlert(report) {
  const operationalStatus = getWheelchairOperationalStatus(report);
  const alertsEnabled = report.alerts_enabled !== false;
  const limit = Number(report.alert_after_minutes || 30);

  const minutesWithoutUpdate = minutesSince(
    report.last_location_update_at ||
      report.last_updated_at ||
      report.submitted_at
  );

  return (
    alertsEnabled &&
    operationalStatus !== "STORED" &&
    minutesWithoutUpdate >= limit
  );
}

function reportMatchesOperationalFilter(report, filter) {
  const normalizedFilter = safeUpper(filter || "ALL");
  const operationalStatus = getWheelchairOperationalStatus(report);

  if (normalizedFilter === "ALL") {
    return true;
  }

  if (normalizedFilter === "ACTIVE") {
    return isWheelchairActive(report);
  }

  if (normalizedFilter === "ALERT") {
    return needsLocationAlert(report);
  }

  return operationalStatus === normalizedFilter;
}

function buildOperationalSummary(rows) {
  return rows.reduce(
    (summary, report) => {
      const operationalStatus =
        getWheelchairOperationalStatus(report);

      summary.all += 1;

      if (isWheelchairActive(report)) {
        summary.active += 1;
      }

      if (operationalStatus === "PENDING_DELIVERY") {
        summary.pending_delivery += 1;
      }

      if (operationalStatus === "PENDING_STORAGE") {
        summary.pending_storage += 1;
      }

      if (operationalStatus === "STORED") {
        summary.stored += 1;
      }

      if (needsLocationAlert(report)) {
        summary.alert += 1;
      }

      return summary;
    },
    {
      all: 0,
      active: 0,
      pending_delivery: 0,
      pending_storage: 0,
      stored: 0,
      alert: 0,
    }
  );
}

function getOperationalStatusLabel(report) {
  const status = getWheelchairOperationalStatus(report);

  if (status === "PENDING_DELIVERY") {
    return "Pending Delivery";
  }

  if (status === "PENDING_STORAGE") {
    return "Pending Storage";
  }

  return "Stored / Not In Use";
}

function normalizeLoginKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[./#[\]$]/g, "_");
}

function getAgentSessionId(report) {
  return safeText(
    report.wchr_agent_id ||
      report.employee_id ||
      report.employee_login
  );
}

function statsDateKey(dateLike) {
  const date = tsToDate(dateLike) || new Date(dateLike);

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;
}

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

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

async function decrementDailyWchrStats(report) {
  const dateKey = statsDateKey(
    report.submitted_at || report.billing_date
  );

  if (!dateKey) return;

  const airline = safeUpper(report.airline) || "UNKNOWN";

  const loginKey = normalizeLoginKey(
    report.employee_login ||
      report.employee_name ||
      "unknown"
  );

  const wheelchairNumber = safeUpper(
    report.wheelchair_number || ""
  );

  const submitted = tsToDate(report.submitted_at);
  const hour = submitted ? submitted.getHours() : null;

  const statsRef = doc(
    db,
    "wch_stats_daily",
    dateKey
  );

  const snapshot = await getDoc(statsRef);

  if (!snapshot.exists()) return;

  const payload = {
    updated_at: Timestamp.now(),
    total_reports: increment(-1),
    [`by_airline.${airline}`]: increment(-1),
    [`by_employee.${loginKey}`]: increment(-1),
  };

  if (hour !== null && hour >= 0 && hour <= 23) {
    payload[`by_hour.${hour}`] = increment(-1);
  }

  if (wheelchairNumber) {
    payload[
      `wheelchair_by_airline.${airline}.${wheelchairNumber}`
    ] = increment(-1);
  }

  await updateDoc(statsRef, payload);
}

function downloadCSV(filename, rows) {
  const headers = [
    "Report ID",
    "Submitted By",
    "Employee Role",
    "Passenger",
    "Airline",
    "Flight",
    "Report Date",
    "PNR",
    "WCHR Type",
    "Wheelchair #",
    "Current Location",
    "Operational Status",
    "Tracking Status",
    "Passenger Delivered",
    "Counter to Gate",
    "Gate to Delivered",
    "Total Delivered Time",
    "Last Location Update",
    "Stored At",
    "Billing Status",
    "Last Edited By",
    "Last Edited At",
  ];

  const csvLines = [
    headers.join(","),

    ...rows.map((report) => {
      const reportDate = getReportDate(report);

      const columns = [
        report.report_id || "",
        report.employee_name || "",
        report.employee_role || "",
        report.passenger_name || "",
        report.airline || "",
        report.flight_number || "",
        reportDate ? toMMDDYYYY(reportDate) : "",
        report.pnr || "",
        report.wch_type || "",
        report.wheelchair_number || "",
        report.current_location || "",
        getOperationalStatusLabel(report),
        report.tracking_status || "",
        isPassengerDelivered(report) ? "Yes" : "No",
        formatMinutes(getCounterToGateMinutes(report)),
        formatMinutes(getGateToDeliveredMinutes(report)),
        formatMinutes(getTotalDeliveredMinutes(report)),
        report.last_location_update_at
          ? formatDateTimeValue(
              report.last_location_update_at
            )
          : "",
        report.stored_at
          ? formatDateTimeValue(report.stored_at)
          : "",
        report.status || "",
        report.last_edited_by_name || "",
        report.last_edited_at
          ? formatDateTimeValue(report.last_edited_at)
          : "",
      ].map(
        (value) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
      );

      return columns.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvLines], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function downloadBillingCSV(filename, rows) {
  const headers = [
    "Passenger Name",
    "Date",
    "WCHR Number",
    "Flight Number",
    "PNR",
    "Agent Name",
  ];

  const csvLines = [
    headers.join(","),

    ...rows.map((report) => {
      const reportDate = getReportDate(report);

      const columns = [
        report.passenger_name || "",
        reportDate ? toMMDDYYYY(reportDate) : "",
        report.wheelchair_number || "",
        report.flight_number || "",
        report.pnr || "",
        report.wchr_agent_name ||
          report.employee_name ||
          "",
      ].map(
        (value) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
      );

      return columns.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvLines], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function buildFlightsFromRows(rows) {
  const map = new Map();

  for (const report of rows) {
    const flightNumber =
      safeUpper(report.flight_number) || "NO_FLIGHT";

    const dateKey = getReportDateKey(report);
    const groupKey = `${dateKey}-${flightNumber}`;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        flight_key: groupKey,
        flight_number: flightNumber,
        report_date: getReportDate(report),

        total_reports: 0,
        new_reports: 0,
        late_reports: 0,

        active_reports: 0,
        pending_delivery_reports: 0,
        pending_storage_reports: 0,
        stored_reports: 0,
        alert_reports: 0,

        wheelchair_numbers: new Set(),
      });
    }

    const item = map.get(groupKey);
    const operationalStatus =
      getWheelchairOperationalStatus(report);

    item.total_reports += 1;

    const wheelchairNumber = safeUpper(
      report.wheelchair_number
    );

    if (wheelchairNumber) {
      item.wheelchair_numbers.add(wheelchairNumber);
    }

    if (safeUpper(report.status) === "LATE") {
      item.late_reports += 1;
    } else {
      item.new_reports += 1;
    }

    if (isWheelchairActive(report)) {
      item.active_reports += 1;
    }

    if (operationalStatus === "PENDING_DELIVERY") {
      item.pending_delivery_reports += 1;
    }

    if (operationalStatus === "PENDING_STORAGE") {
      item.pending_storage_reports += 1;
    }

    if (operationalStatus === "STORED") {
      item.stored_reports += 1;
    }

    if (needsLocationAlert(report)) {
      item.alert_reports += 1;
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      wheelchair_numbers: Array.from(
        item.wheelchair_numbers
      ).sort(),
    }))
    .sort((a, b) => {
      const dateA = a.report_date
        ? a.report_date.getTime()
        : 0;

      const dateB = b.report_date
        ? b.report_date.getTime()
        : 0;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return a.flight_number.localeCompare(
        b.flight_number
      );
    });
}

function buildEmployeeStats(rows) {
  const map = new Map();

  for (const report of rows) {
    const agentName =
      safeText(report.wchr_agent_name) ||
      safeText(report.assigned_wchr_agent) ||
      safeText(report.employee_name) ||
      "Unknown";

    const agentId =
      safeText(report.wchr_agent_id) ||
      safeText(report.employee_id) ||
      agentName;

    const key = `${agentId}-${agentName}`;

    if (!map.has(key)) {
      map.set(key, {
        agent_id: agentId,
        agent_name: agentName,
        served_count: 0,
        completed_count: 0,

        counter_to_gate_total: 0,
        counter_to_gate_count: 0,

        gate_to_delivered_total: 0,
        gate_to_delivered_count: 0,

        total_delivered_total: 0,
        total_delivered_count: 0,
      });
    }

    const item = map.get(key);

    item.served_count += 1;

    const totalDelivered =
      getTotalDeliveredMinutes(report);

    const counterToGate =
      getCounterToGateMinutes(report);

    const gateToDelivered =
      getGateToDeliveredMinutes(report);

    if (totalDelivered !== null) {
      item.completed_count += 1;
      item.total_delivered_total += totalDelivered;
      item.total_delivered_count += 1;
    }

    if (counterToGate !== null) {
      item.counter_to_gate_total += counterToGate;
      item.counter_to_gate_count += 1;
    }

    if (gateToDelivered !== null) {
      item.gate_to_delivered_total +=
        gateToDelivered;

      item.gate_to_delivered_count += 1;
    }
  }

  return Array.from(map.values())
    .map((item) => {
      const averageCounterToGate =
        item.counter_to_gate_count > 0
          ? Math.round(
              item.counter_to_gate_total /
                item.counter_to_gate_count
            )
          : null;

      const averageGateToDelivered =
        item.gate_to_delivered_count > 0
          ? Math.round(
              item.gate_to_delivered_total /
                item.gate_to_delivered_count
            )
          : null;

      const averageTotal =
        item.total_delivered_count > 0
          ? Math.round(
              item.total_delivered_total /
                item.total_delivered_count
            )
          : null;

      return {
        ...item,
        avg_counter_to_gate: averageCounterToGate,
        avg_gate_to_delivered:
          averageGateToDelivered,
        avg_total_delivered: averageTotal,
      };
    })
    .sort((a, b) => {
      const averageA =
        a.avg_total_delivered ?? 999999;

      const averageB =
        b.avg_total_delivered ?? 999999;

      if (averageA !== averageB) {
        return averageA - averageB;
      }

      return b.served_count - a.served_count;
    })
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}
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
  style = {},
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
      background: "#16a34a",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.55 : 1,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function statusBadge(kind) {
  const normalized = safeUpper(kind);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  if (normalized === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (
    normalized === "IN_PROGRESS" ||
    normalized === "ACTIVE"
  ) {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (
    normalized === "PENDING_DELIVERY" ||
    normalized === "PENDING DELIVERY"
  ) {
    return {
      ...base,
      background: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fdba74",
    };
  }

  if (
    normalized === "PENDING_STORAGE" ||
    normalized === "PENDING STORAGE" ||
    normalized === "COMPLETED"
  ) {
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

  if (normalized === "ALERT") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  if (normalized === "NEW") {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function DetailField({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 14,
          color: "#0f172a",
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function EditInput({
  value,
  onChange,
  placeholder = "",
  type = "text",
}) {
  return (
    <input
      type={type}
      value={value || ""}
      onChange={(event) =>
        onChange(event.target.value)
      }
      placeholder={placeholder}
      style={editInputStyle}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options = [],
}) {
  return (
    <select
      value={value || ""}
      onChange={(event) =>
        onChange(event.target.value)
      }
      style={editInputStyle}
    >
      {options.map((item) => (
        <option
          key={
            typeof item === "string"
              ? item
              : item.value
          }
          value={
            typeof item === "string"
              ? item
              : item.value
          }
        >
          {typeof item === "string"
            ? item
            : item.label}
        </option>
      ))}
    </select>
  );
}

function OperationalFilterButton({
  label,
  count,
  active,
  onClick,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background: active
        ? "#1769aa"
        : "#eff6ff",
      color: active
        ? "#ffffff"
        : "#1d4ed8",
      border: active
        ? "1px solid #1769aa"
        : "1px solid #bfdbfe",
    },

    amber: {
      background: active
        ? "#d97706"
        : "#fffbeb",
      color: active
        ? "#ffffff"
        : "#92400e",
      border: active
        ? "1px solid #d97706"
        : "1px solid #fde68a",
    },

    orange: {
      background: active
        ? "#c2410c"
        : "#fff7ed",
      color: active
        ? "#ffffff"
        : "#9a3412",
      border: active
        ? "1px solid #c2410c"
        : "1px solid #fdba74",
    },

    green: {
      background: active
        ? "#15803d"
        : "#ecfdf5",
      color: active
        ? "#ffffff"
        : "#166534",
      border: active
        ? "1px solid #15803d"
        : "1px solid #bbf7d0",
    },

    red: {
      background: active
        ? "#be123c"
        : "#fff1f2",
      color: active
        ? "#ffffff"
        : "#be123c",
      border: active
        ? "1px solid #be123c"
        : "1px solid #fecdd3",
    },

    slate: {
      background: active
        ? "#334155"
        : "#f8fafc",
      color: active
        ? "#ffffff"
        : "#334155",
      border: active
        ? "1px solid #334155"
        : "1px solid #e2e8f0",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 16,
        padding: "11px 14px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        minWidth: 160,
        ...tones[tone],
      }}
    >
      <span>{label}</span>

      <span
        style={{
          minWidth: 28,
          height: 28,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 7px",
          background: active
            ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.85)",
          color: active
            ? "#ffffff"
            : "inherit",
          border: active
            ? "1px solid rgba(255,255,255,0.24)"
            : "1px solid rgba(148,163,184,0.22)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function OperationalFilters({
  selectedFilter,
  onChange,
  summary,
  isMobile,
}) {
  const filterButtons = [
    {
      value: "ALL",
      label: "All Wheelchairs",
      count: summary.all,
      tone: "slate",
    },
    {
      value: "ACTIVE",
      label: "Active / In Use",
      count: summary.active,
      tone: "blue",
    },
    {
      value: "PENDING_DELIVERY",
      label: "Pending Delivery",
      count: summary.pending_delivery,
      tone: "orange",
    },
    {
      value: "PENDING_STORAGE",
      label: "Pending Storage",
      count: summary.pending_storage,
      tone: "amber",
    },
    {
      value: "STORED",
      label: "Stored / Not In Use",
      count: summary.stored,
      tone: "green",
    },
    {
      value: "ALERT",
      label: "30+ Minute Alerts",
      count: summary.alert,
      tone: "red",
    },
  ];

  return (
    <PageCard
      style={{
        padding: isMobile ? 16 : 20,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: isMobile ? 18 : 20,
            color: "#0f172a",
            fontWeight: 800,
          }}
        >
          Wheelchair Operational Status
        </h2>

        <p
          style={{
            margin: "5px 0 0",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          Filter wheelchairs that are currently in use,
          waiting for passenger delivery, waiting to be
          stored, or already available.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        {filterButtons.map((filter) => (
          <OperationalFilterButton
            key={filter.value}
            label={filter.label}
            count={filter.count}
            tone={filter.tone}
            active={
              selectedFilter === filter.value
            }
            onClick={() =>
              onChange(filter.value)
            }
          />
        ))}
      </div>
    </PageCard>
  );
}

function OperationalStatusCard({
  report,
}) {
  const operationalStatus =
    getWheelchairOperationalStatus(report);

  const alert = needsLocationAlert(report);

  const statusLabel =
    operationalStatus === "PENDING_DELIVERY"
      ? "Pending Delivery"
      : operationalStatus === "PENDING_STORAGE"
      ? "Pending Storage"
      : "Stored / Not In Use";

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        borderRadius: 16,
        padding: 12,
        background:
          operationalStatus === "PENDING_DELIVERY"
            ? "#fff7ed"
            : operationalStatus === "PENDING_STORAGE"
            ? "#fefce8"
            : "#ecfdf5",
        border:
          operationalStatus === "PENDING_DELIVERY"
            ? "1px solid #fdba74"
            : operationalStatus === "PENDING_STORAGE"
            ? "1px solid #fde68a"
            : "1px solid #bbf7d0",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={statusBadge(
            operationalStatus
          )}
        >
          {statusLabel}
        </span>

        {alert && (
          <span style={statusBadge("ALERT")}>
            30+ MIN ALERT
          </span>
        )}
      </div>

      {operationalStatus ===
        "PENDING_DELIVERY" && (
        <div
          style={{
            color: "#9a3412",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Passenger has not been marked as delivered.
        </div>
      )}

      {operationalStatus ===
        "PENDING_STORAGE" && (
        <div
          style={{
            color: "#854d0e",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Passenger was delivered, but the wheelchair
          still needs to be stored.
        </div>
      )}

      {operationalStatus === "STORED" && (
        <div
          style={{
            color: "#166534",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.5,
          }}
        >
          Wheelchair is stored and available for another
          service.
        </div>
      )}
    </div>
  );
}

function TrackingSummary({ report }) {
  const alert = needsLocationAlert(report);

  const minutesWithoutUpdate = minutesSince(
    report.last_location_update_at ||
      report.last_updated_at ||
      report.submitted_at
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        borderRadius: 16,
        border: alert
          ? "1px solid #fecdd3"
          : "1px solid #dbeafe",
        background: alert
          ? "#fff1f2"
          : "#f8fbff",
      }}
    >
      <OperationalStatusCard report={report} />

      <DetailField
        label="Current Location"
        value={report.current_location || "—"}
      />

      <DetailField
        label="Tracking Status"
        value={safeUpper(
          report.tracking_status ||
            "IN_PROGRESS"
        )}
      />

      <DetailField
        label="Passenger Delivered"
        value={
          isPassengerDelivered(report)
            ? "Yes"
            : "No"
        }
      />

      <DetailField
        label="Counter → Gate"
        value={formatMinutes(
          getCounterToGateMinutes(report)
        )}
      />

      <DetailField
        label="Gate → Delivered"
        value={formatMinutes(
          getGateToDeliveredMinutes(report)
        )}
      />

      <DetailField
        label="Total Delivered Time"
        value={formatMinutes(
          getTotalDeliveredMinutes(report)
        )}
      />

      <DetailField
        label="Last Location Update"
        value={
          report.last_location_update_at ||
          report.last_updated_at
            ? `${formatDateTimeValue(
                report.last_location_update_at ||
                  report.last_updated_at
              )} · ${minutesWithoutUpdate} min ago`
            : "—"
        }
      />

      {isPassengerDelivered(report) && (
        <DetailField
          label="Delivered At"
          value={
            report.delivered_location ||
            report.dropoff_location ||
            report.current_location ||
            "—"
          }
        />
      )}

      {isWheelchairStored(report) && (
        <DetailField
          label="Stored At"
          value={
            report.stored_at
              ? formatDateTimeValue(
                  report.stored_at
                )
              : "—"
          }
        />
      )}
    </div>
  );
}

function EmployeeLeaderboard({
  employeeStats,
  isMobile,
}) {
  if (!employeeStats.length) {
    return (
      <PageCard style={{ padding: 18 }}>
        <div style={infoBoxStyle}>
          No employee performance data for this date.
        </div>
      </PageCard>
    );
  }

  return (
    <PageCard
      style={{
        padding: isMobile ? 16 : 20,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: isMobile ? 18 : 20,
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          Employee WCHR Performance
        </h2>

        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          Ranking is based on the fastest average
          delivered time. Stored / Not In Use is not
          included in the time calculation.
        </p>
      </div>

      <div
        style={{
          overflowX: "auto",
          borderRadius: 18,
          border: "1px solid #e2e8f0",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            minWidth: isMobile ? 760 : 980,
            background: "#fff",
          }}
        >
          <thead>
            <tr style={{ background: "#f8fbff" }}>
              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Rank
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Agent
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                WCHRs Served
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Completed
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Avg Counter → Gate
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Avg Gate → Delivered
              </th>

              <th
                style={thStyle({
                  textAlign: "left",
                })}
              >
                Avg Total
              </th>
            </tr>
          </thead>

          <tbody>
            {employeeStats.map(
              (item, index) => (
                <tr
                  key={`${item.agent_id}-${item.agent_name}`}
                  style={{
                    background:
                      index % 2 === 0
                        ? "#ffffff"
                        : "#fbfdff",
                  }}
                >
                  <td style={tdStyle}>
                    <b>#{item.rank}</b>
                  </td>

                  <td style={tdStyle}>
                    <b>{item.agent_name}</b>
                  </td>

                  <td style={tdStyle}>
                    {item.served_count}
                  </td>

                  <td style={tdStyle}>
                    {item.completed_count}
                  </td>

                  <td style={tdStyle}>
                    {formatMinutes(
                      item.avg_counter_to_gate
                    )}
                  </td>

                  <td style={tdStyle}>
                    {formatMinutes(
                      item.avg_gate_to_delivered
                    )}
                  </td>

                  <td style={tdStyle}>
                    <b>
                      {formatMinutes(
                        item.avg_total_delivered
                      )}
                    </b>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </PageCard>
  );
}

function buildAgentSessionPayload(
  report,
  payload
) {
  return {
    agent_id: getAgentSessionId(report),

    agent_name:
      report.wchr_agent_name ||
      report.employee_name ||
      "",

    report_doc_id: report.id,
    active_report_id: report.id,
    report_id: report.report_id || "",

    wheelchair_number: safeUpper(
      payload.wheelchair_number ||
        report.wheelchair_number
    ),

    passenger_name: safeText(
      payload.passenger_name ||
        report.passenger_name
    ),

    pnr: safeUpper(
      payload.pnr || report.pnr
    ),

    flight_number: safeUpper(
      payload.flight_number ||
        report.flight_number
    ),

    current_location:
      payload.current_location ||
      report.current_location ||
      "",

    tracking_status:
      payload.tracking_status ||
      report.tracking_status ||
      "IN_PROGRESS",

    passenger_delivered:
      payload.passenger_delivered === true ||
      report.passenger_delivered === true,

    is_active:
      payload.is_active !== false,

    alerts_enabled:
      payload.alerts_enabled !== false,

    alert_after_minutes: Number(
      report.alert_after_minutes || 30
    ),

    started_at:
      report.pickup_at ||
      report.submitted_at ||
      null,

    last_location_update_at:
      payload.last_location_update_at ||
      serverTimestamp(),

    updated_at: serverTimestamp(),
  };
}

async function updateAgentSession(
  report,
  payload
) {
  const sessionId = getAgentSessionId(report);

  if (!sessionId) return;

  await setDoc(
    doc(
      db,
      "wchr_agent_sessions",
      sessionId
    ),
    buildAgentSessionPayload(
      report,
      payload
    ),
    {
      merge: true,
    }
  );
}

async function closeAgentSession(
  report,
  deliveredLocation
) {
  const sessionId = getAgentSessionId(report);

  if (!sessionId) return;

  await setDoc(
    doc(
      db,
      "wchr_agent_sessions",
      sessionId
    ),
    {
      is_active: false,
      tracking_status: "COMPLETED",
      passenger_delivered: true,

      current_location:
        deliveredLocation ||
        report.current_location ||
        "",

      delivered_location:
        deliveredLocation ||
        report.delivered_location ||
        report.dropoff_location ||
        "",

      active_report_id: "",
      report_doc_id: "",

      completed_at: serverTimestamp(),
      delivered_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    {
      merge: true,
    }
  );
}
export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);

  const [allDayReports, setAllDayReports] = useState([]);
  const [flights, setFlights] = useState([]);
  const [reports, setReports] = useState([]);

  const [selectedFlightKey, setSelectedFlightKey] = useState("");
  const [operationalFilter, setOperationalFilter] = useState("ALL");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [deletingId, setDeletingId] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [trackingEditId, setTrackingEditId] = useState("");
  const [trackingLocation, setTrackingLocation] = useState("");
  const [savingTrackingId, setSavingTrackingId] = useState("");

  const currentUserId =
    user?.id ||
    user?.uid ||
    user?.username ||
    "";

  const currentUserName =
    user?.fullName ||
    user?.displayName ||
    user?.name ||
    user?.username ||
    "";

  useEffect(() => {
    let mounted = true;

    async function loadReportsForDate() {
      setError("");
      setMessage("");
      setLoading(true);

      try {
        const start = Timestamp.fromDate(
          startOfDay(selectedDate)
        );

        const end = Timestamp.fromDate(
          endOfDay(selectedDate)
        );

        const reportsQuery = query(
          collection(db, "wch_reports"),
          where("submitted_at", ">=", start),
          where("submitted_at", "<=", end)
        );

        const snapshot = await getDocs(reportsQuery);

        const rows = snapshot.docs
          .map((reportDoc) => ({
            id: reportDoc.id,
            ...reportDoc.data(),
          }))
          .sort(
            (a, b) =>
              getMillis(b.submitted_at) -
              getMillis(a.submitted_at)
          );

        if (!mounted) return;

        setAllDayReports(rows);
      } catch (loadError) {
        console.error(
          "Failed to load WCHR reports:",
          loadError
        );

        if (mounted) {
          setError(
            loadError?.message ||
              "Failed to load wheelchair reports."
          );

          setAllDayReports([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadReportsForDate();

    return () => {
      mounted = false;
    };
  }, [selectedDate]);

  const operationalSummary = useMemo(() => {
    return buildOperationalSummary(
      allDayReports
    );
  }, [allDayReports]);

  const filteredDayReports = useMemo(() => {
    return allDayReports.filter((report) =>
      reportMatchesOperationalFilter(
        report,
        operationalFilter
      )
    );
  }, [allDayReports, operationalFilter]);

  useEffect(() => {
    const filteredFlights =
      buildFlightsFromRows(filteredDayReports);

    setFlights(filteredFlights);

    const selectedFlightStillExists =
      filteredFlights.some(
        (flight) =>
          flight.flight_key ===
          selectedFlightKey
      );

    if (!selectedFlightStillExists) {
      setSelectedFlightKey("");
      setReports([]);
    }
  }, [
    filteredDayReports,
    selectedFlightKey,
  ]);

  useEffect(() => {
    let mounted = true;

    async function loadReportsForSelectedFlight() {
      setError("");

      if (!selectedFlightKey) {
        setReports([]);
        return;
      }

      setReportsLoading(true);

      try {
        const flightRows =
          filteredDayReports
            .filter((report) => {
              const flightNumber =
                safeUpper(
                  report.flight_number
                ) || "NO_FLIGHT";

              const dateKey =
                getReportDateKey(report);

              return (
                `${dateKey}-${flightNumber}` ===
                selectedFlightKey
              );
            })
            .map((report) => ({
              ...report,

              airline: safeUpper(
                report.airline
              ),

              flight_number: safeUpper(
                report.flight_number
              ),

              pnr: safeUpper(
                report.pnr
              ),

              employee_login: safeText(
                report.employee_login
              ),

              employee_role: safeText(
                report.employee_role
              ),

              wheelchair_number:
                safeUpper(
                  report.wheelchair_number
                ),

              current_location: safeText(
                report.current_location
              ),

              tracking_status:
                safeUpper(
                  report.tracking_status ||
                    "IN_PROGRESS"
                ),

              operational_status:
                getWheelchairOperationalStatus(
                  report
                ),
            }))
            .sort(
              (a, b) =>
                getMillis(a.submitted_at) -
                getMillis(b.submitted_at)
            );

        if (mounted) {
          setReports(flightRows);
        }
      } catch (loadError) {
        console.error(
          "Failed to load reports for flight:",
          loadError
        );

        if (mounted) {
          setError(
            loadError?.message ||
              "Failed to load reports for this flight."
          );
        }
      } finally {
        if (mounted) {
          setReportsLoading(false);
        }
      }
    }

    loadReportsForSelectedFlight();

    return () => {
      mounted = false;
    };
  }, [
    selectedFlightKey,
    filteredDayReports,
  ]);

  const selectedFlight = useMemo(() => {
    return (
      flights.find(
        (flight) =>
          flight.flight_key ===
          selectedFlightKey
      ) || null
    );
  }, [flights, selectedFlightKey]);

  const unresolvedReports = useMemo(() => {
    return allDayReports.filter(
      (report) =>
        getWheelchairOperationalStatus(
          report
        ) !== "STORED"
    );
  }, [allDayReports]);

  const pendingDeliveryReports =
    useMemo(() => {
      return allDayReports.filter(
        (report) =>
          getWheelchairOperationalStatus(
            report
          ) === "PENDING_DELIVERY"
      );
    }, [allDayReports]);

  const pendingStorageReports =
    useMemo(() => {
      return allDayReports.filter(
        (report) =>
          getWheelchairOperationalStatus(
            report
          ) === "PENDING_STORAGE"
      );
    }, [allDayReports]);

  const employeeStats = useMemo(() => {
    return buildEmployeeStats(
      allDayReports
    );
  }, [allDayReports]);

  const selectedFilterLabel = useMemo(() => {
    return (
      WCHR_OPERATIONAL_FILTERS.find(
        (filter) =>
          filter.value ===
          operationalFilter
      )?.label || "All Wheelchairs"
    );
  }, [operationalFilter]);

  const handleFilterChange = (
    newFilter
  ) => {
    setOperationalFilter(newFilter);
    setSelectedFlightKey("");
    setReports([]);
    setError("");
    setMessage("");
  };

  const applyReportUpdateLocally = (
    reportId,
    payload
  ) => {
    setAllDayReports((previousRows) =>
      previousRows.map((report) =>
        report.id === reportId
          ? {
              ...report,
              ...payload,
            }
          : report
      )
    );

    setReports((previousRows) =>
      previousRows.map((report) =>
        report.id === reportId
          ? {
              ...report,
              ...payload,
              operational_status:
                getWheelchairOperationalStatus({
                  ...report,
                  ...payload,
                }),
            }
          : report
      )
    );
  };

  const handleDeleteReport = async (
    report
  ) => {
    const confirmed = window.confirm(
      `Delete report ${
        report.report_id || report.id
      }?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(report.id);
      setError("");
      setMessage("");

      await decrementDailyWchrStats(
        report
      );

      await deleteDoc(
        doc(
          db,
          "wch_reports",
          report.id
        )
      );

      setAllDayReports((previousRows) =>
        previousRows.filter(
          (row) => row.id !== report.id
        )
      );

      setReports((previousRows) =>
        previousRows.filter(
          (row) => row.id !== report.id
        )
      );

      setMessage(
        "Report deleted successfully."
      );
    } catch (deleteError) {
      console.error(
        "Failed to delete WCHR report:",
        deleteError
      );

      setError(
        deleteError?.message ||
          "Failed to delete the report."
      );
    } finally {
      setDeletingId("");
    }
  };

  const handleStartEdit = (report) => {
    setError("");
    setMessage("");
    setEditingId(report.id);

    setEditForm({
      passenger_name:
        report.passenger_name || "",

      airline:
        report.airline || "",

      flight_number:
        report.flight_number || "",

      pnr:
        report.pnr || "",

      wch_type:
        report.wch_type || "",

      wheelchair_number:
        report.wheelchair_number || "",

      status:
        safeUpper(
          report.status || "NEW"
        ),
    });
  };

  const handleCancelEdit = () => {
    setEditingId("");
    setEditForm({});
  };

  const handleEditChange = (
    field,
    value
  ) => {
    setEditForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveEdit = async (
    report
  ) => {
    try {
      setSavingEdit(true);
      setError("");
      setMessage("");

      const nowTimestamp =
        Timestamp.now();

      const payload = {
        passenger_name: safeText(
          editForm.passenger_name
        ),

        airline: safeUpper(
          editForm.airline
        ),

        flight_number: safeUpper(
          editForm.flight_number
        ),

        pnr: safeUpper(
          editForm.pnr
        ),

        wch_type: safeUpper(
          editForm.wch_type
        ),

        wheelchair_number: safeUpper(
          editForm.wheelchair_number
        ),

        status: safeUpper(
          editForm.status || "NEW"
        ),

        last_edited_at:
          nowTimestamp,

        last_edited_by_id:
          currentUserId,

        last_edited_by_name:
          currentUserName,
      };

      await updateDoc(
        doc(
          db,
          "wch_reports",
          report.id
        ),
        {
          ...payload,

          edit_history: arrayUnion({
            edited_at:
              nowTimestamp,

            edited_by_id:
              currentUserId,

            edited_by_name:
              currentUserName,

            previous_airline:
              report.airline || "",

            previous_flight_number:
              report.flight_number || "",

            previous_passenger_name:
              report.passenger_name || "",

            previous_pnr:
              report.pnr || "",

            previous_wch_type:
              report.wch_type || "",

            previous_wheelchair_number:
              report.wheelchair_number || "",

            previous_status:
              report.status || "",
          }),
        }
      );

      applyReportUpdateLocally(
        report.id,
        payload
      );

      if (
        getAgentSessionId(report) &&
        isWheelchairActive(report)
      ) {
        await updateAgentSession(
          {
            ...report,
            ...payload,
          },
          payload
        );
      }

      setEditingId("");
      setEditForm({});

      setMessage(
        "Report updated successfully."
      );
    } catch (saveError) {
      console.error(
        "Failed to update WCHR report:",
        saveError
      );

      setError(
        saveError?.message ||
          "Failed to update the report."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartTrackingEdit = (
    report
  ) => {
    setError("");
    setMessage("");

    setTrackingEditId(report.id);

    setTrackingLocation(
      report.current_location ||
        "Counter"
    );
  };

  const handleCancelTrackingEdit =
    () => {
      setTrackingEditId("");
      setTrackingLocation("");
    };
    const handleUpdateLocation = async (report) => {
    const newLocation = safeText(trackingLocation);

    if (!newLocation) {
      setError("Please select a location.");
      return;
    }

    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const previousLocation =
        report.current_location || "";

      const locationIsGate =
        isGateLocation(newLocation);

      const alreadyHasGateTime =
        Boolean(report.gate_arrived_at);

      const payload = {
        current_location: newLocation,
        last_location: previousLocation,

        tracking_status: isPassengerDelivered(report)
          ? "COMPLETED"
          : "IN_PROGRESS",

        passenger_delivered:
          isPassengerDelivered(report),

        is_active: !isWheelchairStored(report),

        alerts_enabled:
          !isWheelchairStored(report),

        last_location_update_at:
          serverTimestamp(),

        last_updated_at:
          serverTimestamp(),

        last_updated_by:
          currentUserName,

        last_updated_by_id:
          currentUserId,
      };

      if (
        locationIsGate &&
        !alreadyHasGateTime
      ) {
        payload.gate_arrived_at =
          serverTimestamp();

        payload.gate_location =
          newLocation;
      }

      await updateDoc(
        doc(
          db,
          "wch_reports",
          report.id
        ),
        payload
      );

      await addDoc(
        collection(
          db,
          "wch_tracking_events"
        ),
        {
          report_doc_id: report.id,
          report_id:
            report.report_id || "",

          wheelchair_number:
            report.wheelchair_number || "",

          passenger_name:
            report.passenger_name || "",

          pnr:
            report.pnr || "",

          flight_number:
            report.flight_number || "",

          event_type: locationIsGate
            ? "GATE_ARRIVAL"
            : "LOCATION_UPDATE",

          location: newLocation,

          previous_location:
            previousLocation,

          notes: locationIsGate
            ? `Wheelchair arrived at ${newLocation}`
            : `Wheelchair location updated to ${newLocation}`,

          tracking_status:
            payload.tracking_status,

          passenger_delivered:
            payload.passenger_delivered,

          is_active:
            payload.is_active,

          alerts_enabled:
            payload.alerts_enabled,

          employee_id:
            currentUserId,

          employee_name:
            currentUserName,

          created_at:
            serverTimestamp(),
        }
      );

      if (
        getAgentSessionId(report) &&
        !isPassengerDelivered(report) &&
        !isWheelchairStored(report)
      ) {
        await updateAgentSession(
          report,
          {
            ...payload,
            current_location:
              newLocation,

            tracking_status:
              "IN_PROGRESS",

            passenger_delivered:
              false,

            is_active:
              true,

            alerts_enabled:
              true,

            last_location_update_at:
              serverTimestamp(),
          }
        );
      }

      const localTimestamp =
        Timestamp.now();

      applyReportUpdateLocally(
        report.id,
        {
          ...payload,

          current_location:
            newLocation,

          last_location:
            previousLocation,

          last_location_update_at:
            localTimestamp,

          last_updated_at:
            localTimestamp,

          ...(locationIsGate &&
          !alreadyHasGateTime
            ? {
                gate_arrived_at:
                  localTimestamp,

                gate_location:
                  newLocation,
              }
            : {}),
        }
      );

      setTrackingEditId("");
      setTrackingLocation("");

      setMessage(
        locationIsGate
          ? "Gate arrival saved successfully."
          : "Location updated successfully."
      );
    } catch (updateError) {
      console.error(
        "Failed to update wheelchair location:",
        updateError
      );

      setError(
        updateError?.message ||
          "Failed to update the location."
      );
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleMarkCompleted = async (
    report
  ) => {
    if (isPassengerDelivered(report)) {
      setError(
        "This passenger has already been marked as delivered."
      );
      return;
    }

    const location =
      safeText(
        report.current_location
      ) || "Main Terminal";

    const confirmed = window.confirm(
      `Mark the passenger using wheelchair ${
        report.wheelchair_number || ""
      } as delivered at ${location}?`
    );

    if (!confirmed) return;

    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const localTimestamp =
        Timestamp.now();

      const locationIsGate =
        isGateLocation(location);

      const payload = {
        tracking_status:
          "COMPLETED",

        passenger_delivered:
          true,

        current_location:
          location,

        delivered_location:
          location,

        delivered_at:
          serverTimestamp(),

        dropoff_location:
          location,

        dropoff_at:
          serverTimestamp(),

        is_active:
          true,

        alerts_enabled:
          true,

        last_location_update_at:
          serverTimestamp(),

        last_updated_at:
          serverTimestamp(),

        last_updated_by:
          currentUserName,

        last_updated_by_id:
          currentUserId,
      };

      if (
        locationIsGate &&
        !report.gate_arrived_at
      ) {
        payload.gate_location =
          location;

        payload.gate_arrived_at =
          serverTimestamp();
      }

      await updateDoc(
        doc(
          db,
          "wch_reports",
          report.id
        ),
        payload
      );

      await addDoc(
        collection(
          db,
          "wch_tracking_events"
        ),
        {
          report_doc_id:
            report.id,

          report_id:
            report.report_id || "",

          wheelchair_number:
            report.wheelchair_number || "",

          passenger_name:
            report.passenger_name || "",

          pnr:
            report.pnr || "",

          flight_number:
            report.flight_number || "",

          event_type:
            "PASSENGER_DELIVERED",

          location,

          previous_location:
            report.current_location || "",

          notes:
            "Passenger delivered. Wheelchair still needs to be stored.",

          tracking_status:
            "COMPLETED",

          passenger_delivered:
            true,

          is_active:
            true,

          alerts_enabled:
            true,

          employee_id:
            currentUserId,

          employee_name:
            currentUserName,

          created_at:
            serverTimestamp(),
        }
      );

      await closeAgentSession(
        report,
        location
      );

      applyReportUpdateLocally(
        report.id,
        {
          ...payload,

          tracking_status:
            "COMPLETED",

          passenger_delivered:
            true,

          current_location:
            location,

          delivered_location:
            location,

          delivered_at:
            localTimestamp,

          dropoff_location:
            location,

          dropoff_at:
            localTimestamp,

          is_active:
            true,

          alerts_enabled:
            true,

          last_location_update_at:
            localTimestamp,

          last_updated_at:
            localTimestamp,

          ...(locationIsGate &&
          !report.gate_arrived_at
            ? {
                gate_location:
                  location,

                gate_arrived_at:
                  localTimestamp,
              }
            : {}),
        }
      );

      setMessage(
        "Passenger marked as delivered. The wheelchair is now pending storage."
      );
    } catch (completeError) {
      console.error(
        "Failed to mark passenger delivered:",
        completeError
      );

      setError(
        completeError?.message ||
          "Failed to mark the passenger as delivered."
      );
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleMarkStored = async (
    report
  ) => {
    if (!isPassengerDelivered(report)) {
      setError(
        `Wheelchair ${
          report.wheelchair_number || ""
        } cannot be stored yet. Mark the passenger as delivered first.`
      );
      return;
    }

    if (isWheelchairStored(report)) {
      setError(
        "This wheelchair is already stored."
      );
      return;
    }

    const confirmed = window.confirm(
      `Mark ${
        report.wheelchair_number ||
        "this wheelchair"
      } as Stored / Not In Use?`
    );

    if (!confirmed) return;

    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const previousLocation =
        report.current_location || "";

      const localTimestamp =
        Timestamp.now();

      const payload = {
        tracking_status:
          "STORED",

        passenger_delivered:
          true,

        current_location:
          "Wheelchair Storage",

        last_location:
          previousLocation,

        stored_location:
          "Wheelchair Storage",

        stored_at:
          serverTimestamp(),

        is_active:
          false,

        alerts_enabled:
          false,

        last_location_update_at:
          serverTimestamp(),

        last_updated_at:
          serverTimestamp(),

        last_updated_by:
          currentUserName,

        last_updated_by_id:
          currentUserId,
      };

      await updateDoc(
        doc(
          db,
          "wch_reports",
          report.id
        ),
        payload
      );

      await addDoc(
        collection(
          db,
          "wch_tracking_events"
        ),
        {
          report_doc_id:
            report.id,

          report_id:
            report.report_id || "",

          wheelchair_number:
            report.wheelchair_number || "",

          passenger_name:
            report.passenger_name || "",

          pnr:
            report.pnr || "",

          flight_number:
            report.flight_number || "",

          event_type:
            "STORED",

          location:
            "Wheelchair Storage",

          previous_location:
            previousLocation,

          notes:
            "Wheelchair stored and marked Not In Use",

          tracking_status:
            "STORED",

          passenger_delivered:
            true,

          is_active:
            false,

          alerts_enabled:
            false,

          employee_id:
            currentUserId,

          employee_name:
            currentUserName,

          created_at:
            serverTimestamp(),
        }
      );

      const sessionId =
        getAgentSessionId(report);

      if (sessionId) {
        await setDoc(
          doc(
            db,
            "wchr_agent_sessions",
            sessionId
          ),
          {
            is_active: false,

            tracking_status:
              "STORED",

            passenger_delivered:
              true,

            current_location:
              "Wheelchair Storage",

            stored_location:
              "Wheelchair Storage",

            active_report_id:
              "",

            report_doc_id:
              "",

            stored_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),
          },
          {
            merge: true,
          }
        );
      }

      applyReportUpdateLocally(
        report.id,
        {
          ...payload,

          tracking_status:
            "STORED",

          passenger_delivered:
            true,

          current_location:
            "Wheelchair Storage",

          last_location:
            previousLocation,

          stored_location:
            "Wheelchair Storage",

          stored_at:
            localTimestamp,

          is_active:
            false,

          alerts_enabled:
            false,

          last_location_update_at:
            localTimestamp,

          last_updated_at:
            localTimestamp,
        }
      );

      setMessage(
        "Wheelchair marked as Stored / Not In Use."
      );
    } catch (storeError) {
      console.error(
        "Failed to mark wheelchair stored:",
        storeError
      );

      setError(
        storeError?.message ||
          "Failed to mark the wheelchair as stored."
      );
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleValidateCloseOperation =
    () => {
      if (!unresolvedReports.length) {
        setError("");

        setMessage(
          "Operation can be closed. All wheelchairs are Stored / Not In Use."
        );

        return;
      }

      const firstPendingDelivery =
        pendingDeliveryReports[0];

      const firstPendingStorage =
        pendingStorageReports[0];

      setMessage("");

      if (firstPendingDelivery) {
        setError(
          `Cannot close operation. Wheelchair ${
            firstPendingDelivery.wheelchair_number ||
            "—"
          } is still pending passenger delivery. Last location: ${
            firstPendingDelivery.current_location ||
            "Unknown"
          }. Agent: ${
            firstPendingDelivery.wchr_agent_name ||
            firstPendingDelivery.employee_name ||
            "Unknown"
          }.`
        );

        setOperationalFilter(
          "PENDING_DELIVERY"
        );

        return;
      }

      if (firstPendingStorage) {
        setError(
          `Cannot close operation. Wheelchair ${
            firstPendingStorage.wheelchair_number ||
            "—"
          } was delivered but has not been stored. Last location: ${
            firstPendingStorage.current_location ||
            firstPendingStorage.delivered_location ||
            "Unknown"
          }.`
        );

        setOperationalFilter(
          "PENDING_STORAGE"
        );

        return;
      }

      const firstUnresolved =
        unresolvedReports[0];

      setError(
        `Cannot close operation. Wheelchair ${
          firstUnresolved?.wheelchair_number ||
          "—"
        } is not stored.`
      );
    };

  const handleExportFullDay = () => {
    if (!allDayReports.length) return;

    const filename =
      `WCHR_FULL_DAY_${toYYYYMMDD(
        selectedDate
      )}.csv`;

    downloadCSV(
      filename,
      allDayReports
    );
  };

  const handleExportFiltered = () => {
    if (!filteredDayReports.length) return;

    const safeFilterName =
      operationalFilter
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");

    const filename =
      `WCHR_${safeFilterName}_${toYYYYMMDD(
        selectedDate
      )}.csv`;

    downloadCSV(
      filename,
      filteredDayReports
    );
  };

  const handleExportBilling = () => {
    if (!allDayReports.length) return;

    const filename =
      `WCHR_BILLING_${toYYYYMMDD(
        selectedDate
      )}.csv`;

    downloadBillingCSV(
      filename,
      allDayReports
    );
  };

  const handleExportCurrentFlight =
    () => {
      if (
        !selectedFlight ||
        !reports.length
      ) {
        return;
      }

      const filename =
        `WCHR_FLIGHT_${
          selectedFlight.flight_number
        }_${toYYYYMMDD(
          selectedFlight.report_date ||
            new Date()
        )}.csv`;

      downloadCSV(
        filename,
        reports
      );
    };
    return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1380,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 16 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            position: "relative",
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
              TPA OPS · WCHR TRACKING
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: isMobile ? 26 : 32,
                lineHeight: 1.05,
                fontWeight: 800,
              }}
            >
              WCHR Flight Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 780,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Track active wheelchairs, pending passenger delivery, pending
              storage, billing records and employee performance.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <ActionButton
              onClick={() => navigate("/wchr/my-reports")}
              variant="secondary"
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              My Reports
            </ActionButton>

            <ActionButton
              onClick={() => navigate("/dashboard")}
              variant="secondary"
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error ? "#fff1f2" : "#ecfdf5",
              border: `1px solid ${
                error ? "#fecdd3" : "#a7f3d0"
              }`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error ? "#9f1239" : "#065f46",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard
        style={{
          padding: isMobile ? 16 : 20,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <div
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
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
                Report Date
              </label>

              <input
                type="date"
                value={toYYYYMMDD(selectedDate)}
                onChange={(event) =>
                  setSelectedDate(
                    new Date(
                      `${event.target.value}T00:00:00`
                    )
                  )
                }
                style={{
                  border: "1px solid #dbeafe",
                  background: "#ffffff",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 14,
                  color: "#0f172a",
                  outline: "none",
                  width: isMobile
                    ? "100%"
                    : "auto",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "12px 14px",
                fontSize: 13,
                color: "#334155",
                width: isMobile
                  ? "100%"
                  : "auto",
                boxSizing: "border-box",
              }}
            >
              Showing reports submitted on:{" "}
              <b>{toMMDDYYYY(selectedDate)}</b>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <ActionButton
              onClick={handleValidateCloseOperation}
              variant={
                unresolvedReports.length
                  ? "warning"
                  : "success"
              }
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              Validate Close Operation
            </ActionButton>

            <ActionButton
              onClick={handleExportBilling}
              variant="success"
              disabled={!allDayReports.length}
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              Export Billing
            </ActionButton>

            <ActionButton
              onClick={handleExportFiltered}
              variant="secondary"
              disabled={!filteredDayReports.length}
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              Export Filtered
            </ActionButton>

            <ActionButton
              onClick={handleExportFullDay}
              variant="secondary"
              disabled={!allDayReports.length}
              style={{
                width: isMobile ? "100%" : "auto",
              }}
            >
              Export Full Day
            </ActionButton>
          </div>
        </div>
      </PageCard>

      <OperationalFilters
        selectedFilter={operationalFilter}
        onChange={handleFilterChange}
        summary={operationalSummary}
        isMobile={isMobile}
      />

      {operationalFilter !== "ALL" && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "13px 14px",
              color: "#334155",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Active filter:{" "}
            <b>{selectedFilterLabel}</b> · Showing{" "}
            <b>{filteredDayReports.length}</b> wheelchair
            record
            {filteredDayReports.length === 1 ? "" : "s"}.
          </div>
        </PageCard>
      )}

      <EmployeeLeaderboard
        employeeStats={employeeStats}
        isMobile={isMobile}
      />

      <PageCard
        style={{
          padding: isMobile ? 16 : 20,
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Flight Summary
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Flights shown below follow the selected
            wheelchair operational filter.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>
            Loading reports...
          </div>
        ) : flights.length === 0 ? (
          <div style={infoBoxStyle}>
            No wheelchair reports match this filter.
          </div>
        ) : isMobile ? (
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {flights.map((flight) => (
              <div
                key={flight.flight_key}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 14,
                  background:
                    selectedFlightKey ===
                    flight.flight_key
                      ? "#edf7ff"
                      : "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      Flight {flight.flight_number}
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 700,
                      }}
                    >
                      {flight.report_date
                        ? toMMDDYYYY(
                            flight.report_date
                          )
                        : "—"}
                    </div>
                  </div>

                  {flight.alert_reports > 0 && (
                    <span style={statusBadge("ALERT")}>
                      {flight.alert_reports} ALERT
                    </span>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <DetailField
                    label="Wheelchairs"
                    value={
                      (
                        flight.wheelchair_numbers ||
                        []
                      ).join(", ") || "—"
                    }
                  />

                  <DetailField
                    label="Total Reports"
                    value={flight.total_reports}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={statusBadge(
                        "PENDING_DELIVERY"
                      )}
                    >
                      Delivery{" "}
                      {
                        flight.pending_delivery_reports
                      }
                    </span>

                    <span
                      style={statusBadge(
                        "PENDING_STORAGE"
                      )}
                    >
                      Storage{" "}
                      {
                        flight.pending_storage_reports
                      }
                    </span>

                    <span
                      style={statusBadge("STORED")}
                    >
                      Stored {flight.stored_reports}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <ActionButton
                    onClick={() =>
                      setSelectedFlightKey(
                        flight.flight_key
                      )
                    }
                    variant="primary"
                    style={{ width: "100%" }}
                  >
                    View Details
                  </ActionButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1180,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Flight Number
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Date
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Wheelchairs
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Reports
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Pending Delivery
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Pending Storage
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Stored
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "left",
                    })}
                  >
                    Alerts
                  </th>

                  <th
                    style={thStyle({
                      textAlign: "center",
                    })}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {flights.map((flight, index) => (
                  <tr
                    key={flight.flight_key}
                    style={{
                      background:
                        selectedFlightKey ===
                        flight.flight_key
                          ? "#edf7ff"
                          : index % 2 === 0
                          ? "#ffffff"
                          : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFlightKey(
                            flight.flight_key
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: "#1769aa",
                          cursor: "pointer",
                          fontWeight:
                            selectedFlightKey ===
                            flight.flight_key
                              ? 900
                              : 700,
                          fontSize: 14,
                        }}
                      >
                        Flight {flight.flight_number}
                      </button>
                    </td>

                    <td style={tdStyle}>
                      {flight.report_date
                        ? toMMDDYYYY(
                            flight.report_date
                          )
                        : "—"}
                    </td>

                    <td style={tdStyle}>
                      {(
                        flight.wheelchair_numbers ||
                        []
                      ).join(", ") || "—"}
                    </td>

                    <td style={tdStyle}>
                      <div style={{ fontWeight: 800 }}>
                        Total: {flight.total_reports}
                      </div>

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        NEW: {flight.new_reports} ·
                        LATE: {flight.late_reports}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      <span
                        style={statusBadge(
                          "PENDING_DELIVERY"
                        )}
                      >
                        {
                          flight.pending_delivery_reports
                        }
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <span
                        style={statusBadge(
                          "PENDING_STORAGE"
                        )}
                      >
                        {
                          flight.pending_storage_reports
                        }
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <span style={statusBadge("STORED")}>
                        {flight.stored_reports}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      {flight.alert_reports > 0 ? (
                        <span style={statusBadge("ALERT")}>
                          {flight.alert_reports}
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "center",
                      }}
                    >
                      <ActionButton
                        onClick={() =>
                          setSelectedFlightKey(
                            flight.flight_key
                          )
                        }
                        variant="primary"
                        style={{
                          padding: "8px 12px",
                          fontSize: 12,
                        }}
                      >
                        View Details
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard
        style={{
          padding: isMobile ? 16 : 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 18 : 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Flight Details
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              {selectedFlight ? (
                <>
                  Showing{" "}
                  <b>{selectedFilterLabel}</b> for{" "}
                  <b>
                    Flight{" "}
                    {selectedFlight.flight_number}
                  </b>{" "}
                  ·{" "}
                  <b>
                    {selectedFlight.report_date
                      ? toMMDDYYYY(
                          selectedFlight.report_date
                        )
                      : "—"}
                  </b>
                </>
              ) : (
                "Select a flight row above to view details."
              )}
            </p>
          </div>

          {selectedFlight && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                width: isMobile
                  ? "100%"
                  : "auto",
              }}
            >
              <ActionButton
                onClick={() => window.print()}
                variant="secondary"
                style={{
                  width: isMobile
                    ? "100%"
                    : "auto",
                }}
              >
                Print
              </ActionButton>

              <ActionButton
                onClick={handleExportCurrentFlight}
                variant="secondary"
                disabled={!reports.length}
                style={{
                  width: isMobile
                    ? "100%"
                    : "auto",
                }}
              >
                Export CSV
              </ActionButton>
            </div>
          )}
        </div>

        {reportsLoading ? (
          <div style={infoBoxStyle}>
            Loading reports...
          </div>
        ) : !selectedFlight ? (
          <div style={infoBoxStyle}>
            No flight selected.
          </div>
        ) : reports.length === 0 ? (
          <div style={infoBoxStyle}>
            No wheelchair reports match the selected
            filter for this flight.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 12,
            }}
          >
            {reports.map((report) => {
              const isEditing =
                editingId === report.id;

              const isTrackingEditing =
                trackingEditId === report.id;

              const alert =
                needsLocationAlert(report);

              const operationalStatus =
                getWheelchairOperationalStatus(
                  report
                );

              const delivered =
                isPassengerDelivered(report);

              const stored =
                isWheelchairStored(report);

              return (
                <div
                  key={report.id}
                  style={{
                    border: alert
                      ? "1px solid #fecdd3"
                      : operationalStatus ===
                        "PENDING_STORAGE"
                      ? "1px solid #fde68a"
                      : operationalStatus ===
                        "STORED"
                      ? "1px solid #bbf7d0"
                      : "1px solid #e2e8f0",

                    borderRadius: 18,
                    padding: 14,

                    background: alert
                      ? "#fff7f8"
                      : operationalStatus ===
                        "PENDING_STORAGE"
                      ? "#fffef5"
                      : operationalStatus ===
                        "STORED"
                      ? "#f7fff9"
                      : "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        isMobile || isTablet
                          ? "1fr"
                          : "2fr 1.2fr",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 900,
                              color: "#0f172a",
                            }}
                          >
                            Wheelchair{" "}
                            {report.wheelchair_number ||
                              "—"}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 12,
                              color: "#64748b",
                              fontWeight: 700,
                            }}
                          >
                            {report.report_id ||
                              report.id}
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={statusBadge(
                                report.status || "NEW"
                              )}
                            >
                              {safeUpper(
                                report.status || "NEW"
                              )}
                            </span>

                            <span
                              style={statusBadge(
                                operationalStatus
                              )}
                            >
                              {getOperationalStatusLabel(
                                report
                              )}
                            </span>

                            {alert && (
                              <span
                                style={statusBadge(
                                  "ALERT"
                                )}
                              >
                                UPDATE LOCATION
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 700,
                          }}
                        >
                          {report.last_edited_at
                            ? `Edited ${formatDateTimeValue(
                                report.last_edited_at
                              )}`
                            : "No edits"}
                        </div>
                      </div>

                      {isEditing ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              isMobile || isTablet
                                ? "1fr"
                                : "repeat(3, minmax(160px, 1fr))",
                            gap: 10,
                          }}
                        >
                          <EditInput
                            value={
                              editForm.passenger_name
                            }
                            onChange={(value) =>
                              handleEditChange(
                                "passenger_name",
                                value
                              )
                            }
                            placeholder="Passenger"
                          />

                          <EditInput
                            value={editForm.airline}
                            onChange={(value) =>
                              handleEditChange(
                                "airline",
                                value
                              )
                            }
                            placeholder="Airline"
                          />

                          <EditInput
                            value={
                              editForm.flight_number
                            }
                            onChange={(value) =>
                              handleEditChange(
                                "flight_number",
                                value
                              )
                            }
                            placeholder="Flight"
                          />

                          <EditInput
                            value={editForm.pnr}
                            onChange={(value) =>
                              handleEditChange(
                                "pnr",
                                value
                              )
                            }
                            placeholder="PNR"
                          />

                          <EditInput
                            value={editForm.wch_type}
                            onChange={(value) =>
                              handleEditChange(
                                "wch_type",
                                value
                              )
                            }
                            placeholder="WCHR Type"
                          />

                          <EditInput
                            value={
                              editForm.wheelchair_number
                            }
                            onChange={(value) =>
                              handleEditChange(
                                "wheelchair_number",
                                value
                              )
                            }
                            placeholder="Wheelchair #"
                          />

                          <SelectInput
                            value={
                              editForm.status || "NEW"
                            }
                            onChange={(value) =>
                              handleEditChange(
                                "status",
                                value
                              )
                            }
                            options={["NEW", "LATE"]}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              isMobile || isTablet
                                ? "1fr"
                                : "repeat(3, minmax(160px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <DetailField
                            label="Passenger"
                            value={
                              report.passenger_name
                            }
                          />

                          <DetailField
                            label="Flight"
                            value={`${
                              report.airline || "—"
                            } ${
                              report.flight_number ||
                              "—"
                            }`}
                          />

                          <DetailField
                            label="PNR"
                            value={report.pnr}
                          />

                          <DetailField
                            label="WCHR Type"
                            value={report.wch_type}
                          />

                          <DetailField
                            label="Wheelchair #"
                            value={
                              report.wheelchair_number
                            }
                          />

                          <DetailField
                            label="Agent"
                            value={
                              report.wchr_agent_name ||
                              report.employee_name
                            }
                          />

                          <DetailField
                            label="Report Date"
                            value={
                              getReportDate(report)
                                ? toMMDDYYYY(
                                    getReportDate(
                                      report
                                    )
                                  )
                                : "—"
                            }
                          />

                          <DetailField
                            label="Current Location"
                            value={
                              report.current_location
                            }
                          />

                          <DetailField
                            label="Passenger Delivered"
                            value={
                              delivered ? "Yes" : "No"
                            }
                          />

                          <DetailField
                            label="Billing"
                            value={
                              report.billing_ready
                                ? "Ready"
                                : "Not Ready"
                            }
                          />

                          <DetailField
                            label="Counter → Gate"
                            value={formatMinutes(
                              getCounterToGateMinutes(
                                report
                              )
                            )}
                          />

                          <DetailField
                            label="Gate → Delivered"
                            value={formatMinutes(
                              getGateToDeliveredMinutes(
                                report
                              )
                            )}
                          />

                          <DetailField
                            label="Total Delivered Time"
                            value={formatMinutes(
                              getTotalDeliveredMinutes(
                                report
                              )
                            )}
                          />

                          <DetailField
                            label="Last Edited By"
                            value={
                              report.last_edited_by_name
                            }
                          />
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {isEditing ? (
                          <>
                            <ActionButton
                              variant="success"
                              onClick={() =>
                                handleSaveEdit(report)
                              }
                              disabled={savingEdit}
                            >
                              {savingEdit
                                ? "Saving..."
                                : "Save"}
                            </ActionButton>

                            <ActionButton
                              variant="secondary"
                              onClick={handleCancelEdit}
                              disabled={savingEdit}
                            >
                              Cancel
                            </ActionButton>
                          </>
                        ) : (
                          <>
                            <ActionButton
                              variant="secondary"
                              onClick={() =>
                                handleStartEdit(
                                  report
                                )
                              }
                            >
                              Edit
                            </ActionButton>

                            <ActionButton
                              variant="danger"
                              onClick={() =>
                                handleDeleteReport(
                                  report
                                )
                              }
                              disabled={
                                deletingId ===
                                report.id
                              }
                            >
                              {deletingId ===
                              report.id
                                ? "Deleting..."
                                : "Delete"}
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <TrackingSummary
                        report={report}
                      />

                      {isTrackingEditing && (
                        <SelectInput
                          value={trackingLocation}
                          onChange={
                            setTrackingLocation
                          }
                          options={WCHR_LOCATIONS}
                        />
                      )}

                      <div
                        style={{
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        {isTrackingEditing ? (
                          <>
                            <ActionButton
                              variant="success"
                              onClick={() =>
                                handleUpdateLocation(
                                  report
                                )
                              }
                              disabled={
                                savingTrackingId ===
                                report.id
                              }
                              style={{
                                width: "100%",
                              }}
                            >
                              {savingTrackingId ===
                              report.id
                                ? "Updating..."
                                : "Save Location"}
                            </ActionButton>

                            <ActionButton
                              variant="secondary"
                              onClick={
                                handleCancelTrackingEdit
                              }
                              disabled={
                                savingTrackingId ===
                                report.id
                              }
                              style={{
                                width: "100%",
                              }}
                            >
                              Cancel
                            </ActionButton>
                          </>
                        ) : (
                          <ActionButton
                            variant={
                              alert
                                ? "warning"
                                : "secondary"
                            }
                            onClick={() =>
                              handleStartTrackingEdit(
                                report
                              )
                            }
                            disabled={stored}
                            style={{
                              width: "100%",
                            }}
                          >
                            Update Location
                          </ActionButton>
                        )}

                        <ActionButton
                          variant="warning"
                          onClick={() =>
                            handleMarkCompleted(
                              report
                            )
                          }
                          disabled={
                            savingTrackingId ===
                              report.id ||
                            delivered ||
                            stored
                          }
                          style={{
                            width: "100%",
                          }}
                        >
                          {delivered
                            ? "Passenger Delivered"
                            : "Mark Passenger Delivered"}
                        </ActionButton>

                        <ActionButton
                          variant="success"
                          onClick={() =>
                            handleMarkStored(report)
                          }
                          disabled={
                            savingTrackingId ===
                              report.id ||
                            !delivered ||
                            stored
                          }
                          style={{
                            width: "100%",
                          }}
                        >
                          {stored
                            ? "Stored / Not In Use"
                            : "Mark Stored / Not In Use"}
                        </ActionButton>

                        {!delivered && !stored && (
                          <div
                            style={{
                              background: "#fff7ed",
                              border:
                                "1px solid #fdba74",
                              color: "#9a3412",
                              borderRadius: 14,
                              padding: "10px 12px",
                              fontSize: 12,
                              fontWeight: 800,
                              lineHeight: 1.5,
                            }}
                          >
                            Passenger delivery is still
                            pending.
                          </div>
                        )}

                        {delivered && !stored && (
                          <div
                            style={{
                              background: "#fefce8",
                              border:
                                "1px solid #fde68a",
                              color: "#854d0e",
                              borderRadius: 14,
                              padding: "10px 12px",
                              fontSize: 12,
                              fontWeight: 800,
                              lineHeight: 1.5,
                            }}
                          >
                            Passenger delivered. Return
                            the wheelchair to storage.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Total matching reports:{" "}
              <b>{reports.length}</b>
            </div>
          </div>
        )}
      </PageCard>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};

const editInputStyle = {
  width: "100%",
  minWidth: 90,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
};

const infoBoxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
};
