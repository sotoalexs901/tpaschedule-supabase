// src/pages/WchrDispatchPage.jsx

import React, { useEffect, useMemo, useState } from "react";

import {
  addDoc,
  collection,
  deleteDoc,
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

import {
  WCHR_AGENT_STATUS,
  WCHR_AGENT_AVAILABILITY,
  WCHR_SERVICE_STATUS,
  cleanText,
  safeUpper,
  addWchrTimelineEvent,
  formatElapsedTime,
  getElapsedSeconds,
} from "../utils/wchrOperations.js";

import {
  triggerWchrAssignmentPush,
} from "../utils/wchrAssignmentPush.js";

// ============================================================
// COLLECTIONS
// ============================================================

const DAILY_FLIGHTS_COLLECTION = "wchr_daily_flights";
const INVENTORY_COLLECTION = "wchr_inventory";

// ============================================================
// HELPERS
// ============================================================

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;
}

function normalizeFlightNumber(value) {
  return safeUpper(value).replace(/\s+/g, "");
}

function normalizeAirline(value) {
  return safeUpper(value).replace(/\s+/g, "");
}

function safeText(value) {
  return String(value || "").trim();
}

function buildDailyFlightKey(airline, flightNumber, dateKey) {
  const cleanAirline = normalizeAirline(airline);
  const cleanFlightNumber = normalizeFlightNumber(flightNumber);
  const cleanDateKey = safeText(dateKey);

  if (!cleanAirline || !cleanFlightNumber || !cleanDateKey) {
    return "";
  }

  return `${cleanDateKey}-${cleanAirline}-${cleanFlightNumber}`;
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth
      : 1280
  );

  useEffect(() => {
    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function getMillis(value) {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 0
    : date.getTime();
}

function formatDateTime(value) {
  const millis = getMillis(value);

  if (!millis) {
    return "\u2014";
  }

  return new Date(millis).toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
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

function getAgentName(agent) {
  return (
    agent?.agent_name ||
    agent?.employee_name ||
    agent?.display_name ||
    agent?.name ||
    agent?.login_username ||
    agent?.id ||
    "Unknown Agent"
  );
}

function getWheelchairTimerStart(report) {
  return (
    report?.timer_started_at ||
    report?.ready_for_pickup_at ||
    report?.submitted_at ||
    report?.created_at ||
    null
  );
}

function getServiceElapsedSeconds(report, now) {
  return getElapsedSeconds(
    getWheelchairTimerStart(report),
    now
  );
}

function getServiceMinutes(report, now) {
  return Math.floor(
    getServiceElapsedSeconds(report, now) / 60
  );
}

function isDeliveredToGate(report) {
  const serviceStatus = safeUpper(report?.service_status);
  const trackingStatus = safeUpper(report?.tracking_status);

  return Boolean(
    report?.gate_arrived_at ||
    report?.passenger_delivered_to_gate_at ||
    report?.passenger_delivered_to_gate === true ||
    ["AT_GATE", "BOARDING", "BOARDED", "PENDING_STORAGE", "STORED", "COMPLETED"].includes(serviceStatus) ||
    ["AT_GATE", "BOARDING", "BOARDED", "PENDING_STORAGE", "STORED", "COMPLETED"].includes(trackingStatus)
  );
}

function shouldShow30MinuteAlert(report, now) {
  if (isDeliveredToGate(report)) return false;
  if (report?.alerts_enabled === false) return false;
  if (report?.transport_alert_active === false) return false;

  return getServiceMinutes(report, now) >= Number(
    report?.alert_after_minutes || 30
  );
}


function isInventoryLocked(item) {
  const status = getInventoryStatus(item);

  return [
    "READY_FOR_PICKUP",
    "IN_USE",
    "AT_GATE",
    "PENDING_STORAGE",
  ].includes(status);
}


function inventoryBelongsToReport(item, report) {
  if (!item || !report?.id) return false;

  const linkedReportId =
    cleanText(
      item.report_doc_id ||
        item.assigned_report_doc_id ||
        item.active_report_id
    );

  return (
    Boolean(linkedReportId) &&
    linkedReportId ===
      cleanText(report.id)
  );
}

function getServiceStatusLabel(value) {
  const status = safeUpper(value);

  const labels = {
    READY_FOR_PICKUP: "Ready for Pickup",
    ASSIGNED: "Assigned",
    PICKED_UP: "Picked Up",
    IN_TRANSIT: "In Transit",
    AT_GATE: "At Gate",
    BOARDING: "Boarding",
    BOARDED: "Boarded",
    PENDING_STORAGE: "Pending Storage",
    STORED: "Stored",
    COMPLETED: "Completed",
  };

  return (
    labels[status] ||
    status ||
    "In Progress"
  );
}

function getAvailabilityLabel(value) {
  const status = safeUpper(value);

  if (
    status ===
    WCHR_AGENT_AVAILABILITY.AVAILABLE
  ) {
    return "Available";
  }

  if (
    status ===
    WCHR_AGENT_AVAILABILITY.BUSY
  ) {
    return "Busy";
  }

  if (
    status ===
    WCHR_AGENT_AVAILABILITY.BREAK
  ) {
    return "Break";
  }

  if (
    status ===
    WCHR_AGENT_AVAILABILITY.UNAVAILABLE
  ) {
    return "Unavailable";
  }

  return status || "Unknown";
}

function getInventoryNumber(item) {
  return safeUpper(
    item?.wheelchair_number ||
      item?.number ||
      item?.id ||
      ""
  );
}

function getInventoryStatus(item) {
  const status = safeUpper(item?.status);

  if (
    item?.maintenance === true ||
    status === "MAINTENANCE" ||
    status === "OUT_OF_SERVICE"
  ) {
    return "MAINTENANCE";
  }

  if (
    item?.available_for_handoff === true ||
    status === "AVAILABLE_HANDOFF"
  ) {
    return "AVAILABLE_HANDOFF";
  }

  if (
    status === "READY_FOR_PICKUP" ||
    item?.ready_for_pickup === true
  ) {
    return "READY_FOR_PICKUP";
  }

  if (
    status === "AT_GATE"
  ) {
    return "AT_GATE";
  }

  if (
    status === "PENDING_STORAGE"
  ) {
    return "PENDING_STORAGE";
  }

  if (
    item?.is_available === true ||
    status === "AVAILABLE" ||
    status === "STORED"
  ) {
    return "AVAILABLE";
  }

  if (
    item?.is_available === false ||
    [
      "IN_USE",
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "BOARDING",
      "BOARDED",
    ].includes(status)
  ) {
    return "IN_USE";
  }

  return status || "UNKNOWN";
}

function getInventoryStatusLabel(item) {
  const status = getInventoryStatus(item);

  const labels = {
    AVAILABLE: "Available",
    AVAILABLE_HANDOFF: "Available at Handoff",
    READY_FOR_PICKUP: "Ready for Pickup",
    IN_USE: "In Service",
    AT_GATE: "At Gate",
    PENDING_STORAGE: "Pending Storage",
    MAINTENANCE: "Maintenance",
    UNKNOWN: "Unknown",
  };

  return labels[status] || status;
}

function getInventoryTone(item) {
  const status = getInventoryStatus(item);

  if (
    status === "AVAILABLE" ||
    status === "AVAILABLE_HANDOFF"
  ) {
    return "green";
  }

  if (status === "READY_FOR_PICKUP") {
    return "blue";
  }

  if (
    status === "AT_GATE" ||
    status === "PENDING_STORAGE"
  ) {
    return "amber";
  }

  if (status === "MAINTENANCE") {
    return "red";
  }

  if (status === "IN_USE") {
    return "orange";
  }

  return "slate";
}

// ============================================================
// UI
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
        boxSizing: "border-box",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow: "0 16px 38px rgba(15,23,42,0.07)",
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
  disabled = false,
  style = {},
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#ffffff",
      border: "none",
      boxShadow:
        "0 10px 20px rgba(23,105,170,0.18)",
    },

    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
      boxShadow: "none",
    },

    success: {
      background: "#16a34a",
      color: "#ffffff",
      border: "none",
      boxShadow:
        "0 10px 20px rgba(22,163,74,0.16)",
    },

    warning: {
      background: "#f59e0b",
      color: "#ffffff",
      border: "none",
      boxShadow:
        "0 10px 20px rgba(245,158,11,0.16)",
    },

    danger: {
      background: "#dc2626",
      color: "#ffffff",
      border: "none",
      boxShadow:
        "0 10px 20px rgba(220,38,38,0.16)",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 850,
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled
          ? 0.55
          : 1,
        fontFamily: "inherit",
        boxSizing: "border-box",
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder = "",
  type = "text",
  disabled = false,
}) {
  return (
    <input
      type={type}
      value={value || ""}
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
        background: disabled
          ? "#f8fafc"
          : "#ffffff",
        color: "#0f172a",
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
      }}
    />
  );
}

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 10,
        fontWeight: 900,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
      }}
    >
      {children}
    </label>
  );
}

function StatusBadge({
  status,
}) {
  const normalized =
    safeUpper(status);

  let background =
    "#f8fafc";

  let color =
    "#334155";

  let border =
    "#e2e8f0";

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.AVAILABLE
  ) {
    background =
      "#ecfdf5";
    color =
      "#166534";
    border =
      "#bbf7d0";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.BUSY
  ) {
    background =
      "#fff7ed";
    color =
      "#9a3412";
    border =
      "#fed7aa";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.BREAK
  ) {
    background =
      "#fefce8";
    color =
      "#854d0e";
    border =
      "#fde68a";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.UNAVAILABLE
  ) {
    background =
      "#fff1f2";
    color =
      "#9f1239";
    border =
      "#fecdd3";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        padding: "6px 10px",
        background,
        color,
        border: `1px solid ${border}`,
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {getAvailabilityLabel(
        normalized
      )}
    </span>
  );
}

function InventoryStatusBadge({
  item,
}) {
  const tone =
    getInventoryTone(item);

  const tones = {
    green: {
      background: "#ecfdf5",
      color: "#166534",
      border: "#bbf7d0",
    },

    blue: {
      background: "#eff6ff",
      color: "#1769aa",
      border: "#bfdbfe",
    },

    amber: {
      background: "#fffbeb",
      color: "#92400e",
      border: "#fde68a",
    },

    orange: {
      background: "#fff7ed",
      color: "#9a3412",
      border: "#fed7aa",
    },

    red: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "#fecdd3",
    },

    slate: {
      background: "#f8fafc",
      color: "#475569",
      border: "#e2e8f0",
    },
  };

  const selected =
    tones[tone] ||
    tones.slate;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        padding: "6px 9px",
        background:
          selected.background,
        color:
          selected.color,
        border:
          `1px solid ${selected.border}`,
        fontSize: 10,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {getInventoryStatusLabel(item)}
    </span>
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
        minWidth: 0,
        background:
          selected.background,
        border:
          `1px solid ${selected.border}`,
        borderRadius: 16,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          color:
            selected.color,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
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

function InfoField({
  label,
  value,
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: "9px 10px",
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "#94a3b8",
          textTransform: "uppercase",
          fontWeight: 900,
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 3,
          fontSize: 12.5,
          color: "#0f172a",
          fontWeight: 750,
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {value || "\u2014"}
      </div>
    </div>
  );
}

// ============================================================
// DAILY FLIGHT CARD
// ============================================================

function DailyFlightCard({
  flight,
  onClose,
  onReopen,
  onDelete,
  busy,
}) {
  const status =
    safeUpper(
      flight.status || "OPEN"
    );

  const open =
    status === "OPEN";

  return (
    <div
      style={{
        border:
          open
            ? "1px solid #bbf7d0"
            : "1px solid #e2e8f0",
        background:
          open
            ? "#f7fff9"
            : "#f8fafc",
        borderRadius: 16,
        padding: 13,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 950,
              color: "#0f172a",
            }}
          >
            {flight.airline || "\u2014"}{" "}
            {flight.flight_number || "\u2014"}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {flight.service_date || flight.flight_date || "\u2014"}
          </div>
        </div>

        <span
          style={{
            display: "inline-flex",
            padding: "6px 10px",
            borderRadius: 999,
            background:
              open
                ? "#ecfdf5"
                : "#f1f5f9",
            color:
              open
                ? "#166534"
                : "#64748b",
            border:
              open
                ? "1px solid #bbf7d0"
                : "1px solid #cbd5e1",
            fontSize: 10.5,
            fontWeight: 900,
          }}
        >
          {open ? "OPEN" : "CLOSED"}
        </span>
      </div>

      {flight.gate && (
        <div
          style={{
            marginTop: 9,
            fontSize: 11.5,
            color: "#475569",
            fontWeight: 700,
          }}
        >
          Gate: {flight.gate}
        </div>
      )}

      <div
        style={{
          marginTop: 11,
          display: "flex",
          gap: 7,
          flexWrap: "wrap",
        }}
      >
        {open ? (
          <ActionButton
            variant="warning"
            disabled={busy}
            onClick={() =>
              onClose(flight)
            }
            style={{
              padding: "7px 10px",
              fontSize: 11,
            }}
          >
            Close Flight
          </ActionButton>
        ) : (
          <ActionButton
            variant="success"
            disabled={busy}
            onClick={() =>
              onReopen(flight)
            }
            style={{
              padding: "7px 10px",
              fontSize: 11,
            }}
          >
            Reopen
          </ActionButton>
        )}

        <ActionButton
          variant="danger"
          disabled={busy}
          onClick={() =>
            onDelete(flight)
          }
          style={{
            padding: "7px 10px",
            fontSize: 11,
          }}
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

// ============================================================
// INVENTORY CARD
// ============================================================

function InventoryCard({
  item,
  onEdit,
  onDelete,
  busy = false,
}) {
  const wheelchairNumber =
    getInventoryNumber(item);

  const assignedAgent =
    item.current_agent_name ||
    item.assigned_agent_name ||
    "";

  const passenger =
    item.passenger_name || "";

  const location =
    item.location ||
    item.current_location ||
    "Unknown";

  return (
    <div
      style={{
        border:
          "1px solid #e2e8f0",
        borderRadius: 15,
        padding: 12,
        background:
          "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 950,
              color: "#0f172a",
            }}
          >
            WCHR {wheelchairNumber || "\u2014"}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {location}
          </div>
        </div>

        <InventoryStatusBadge
          item={item}
        />
      </div>

      {(passenger ||
        assignedAgent) && (
        <div
          style={{
            marginTop: 9,
            display: "grid",
            gap: 5,
            fontSize: 11,
            color: "#475569",
          }}
        >
          {passenger && (
            <div>
              Passenger:{" "}
              <b>{passenger}</b>
            </div>
          )}

          {assignedAgent && (
            <div>
              Agent:{" "}
              <b>{assignedAgent}</b>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 7,
          flexWrap: "wrap",
        }}
      >
        <ActionButton
          variant="secondary"
          disabled={busy}
          onClick={() => onEdit(item)}
          style={{
            padding: "7px 10px",
            fontSize: 10.5,
          }}
        >
          Edit / Location
        </ActionButton>

        <ActionButton
          variant="danger"
          disabled={
            busy ||
            isInventoryLocked(item)
          }
          onClick={() => onDelete(item)}
          style={{
            padding: "7px 10px",
            fontSize: 10.5,
          }}
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

// ============================================================
// AGENT CARD
// ============================================================

function AgentCard({
  agent,
  selected,
  onSelect,
  isMobile,
}) {
  const punchedIn =
    safeUpper(
      agent.status
    ) ===
    WCHR_AGENT_STATUS.ACTIVE;

  const availability =
    safeUpper(
      agent.availability_status
    );

  const hasAssignment =
    Boolean(
      cleanText(
        agent.active_report_id
      )
    );

  const canReceive =
    punchedIn &&
    availability ===
      WCHR_AGENT_AVAILABILITY.AVAILABLE &&
    !hasAssignment;

  return (
    <button
      type="button"
      onClick={() => {
        if (canReceive) {
          onSelect(agent.id);
        }
      }}
      disabled={!canReceive}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        textAlign: "left",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        padding:
          isMobile
            ? 12
            : 14,
        borderRadius: 16,
        background:
          selected
            ? "#edf7ff"
            : "#ffffff",
        border:
          selected
            ? "2px solid #5aa9e6"
            : "1px solid #e2e8f0",
        cursor:
          canReceive
            ? "pointer"
            : "not-allowed",
        opacity:
          canReceive
            ? 1
            : 0.68,
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.35,
              wordBreak: "break-word",
            }}
          >
            {getAgentName(agent)}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 11.5,
              color: "#64748b",
            }}
          >
            {agent.current_location ||
              "Location not reported"}
          </div>
        </div>

        <StatusBadge
          status={availability}
        />
      </div>

      {hasAssignment && (
        <div
          style={{
            marginTop: 10,
            borderRadius: 12,
            padding: "8px 10px",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1.45,
          }}
        >
          Assigned WCHR{" "}
          {agent.active_wheelchair_number ||
            "\u2014"}
        </div>
      )}

      {canReceive && (
        <div
          style={{
            marginTop: 10,
            fontSize: 10.5,
            fontWeight: 900,
            color: "#166534",
          }}
        >
          READY FOR ASSIGNMENT
        </div>
      )}
    </button>
  );
}

// ============================================================
// READY WCHR CARD
// ============================================================

function ReadyWheelchairCard({
  report,
  now,
  selected,
  onSelect,
  isMobile,
}) {
  const elapsedSeconds =
    getServiceElapsedSeconds(
      report,
      now
    );

  const minutes =
    Math.floor(
      elapsedSeconds / 60
    );

  const alert =
    shouldShow30MinuteAlert(report, now);

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(report.id)
      }
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        textAlign: "left",
        padding:
          isMobile
            ? 12
            : 14,
        borderRadius: 16,
        background:
          alert
            ? "#fff7f8"
            : selected
            ? "#edf7ff"
            : "#ffffff",
        border:
          alert
            ? "2px solid #fca5a5"
            : selected
            ? "2px solid #5aa9e6"
            : "1px solid #e2e8f0",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 950,
              color: "#0f172a",
            }}
          >
            WCHR{" "}
            {report.wheelchair_number ||
              "\u2014"}
          </div>

          <div
            style={{
              marginTop: 3,
              fontSize: 11.5,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {report.passenger_name ||
              "Passenger"}
          </div>
        </div>

        <div
          style={{
            padding: "7px 9px",
            minWidth: 85,
            textAlign: "center",
            borderRadius: 12,
            background:
              alert
                ? "#fff1f2"
                : "#eff6ff",
            border:
              alert
                ? "1px solid #fecdd3"
                : "1px solid #bfdbfe",
          }}
        >
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color:
                alert
                  ? "#b91c1c"
                  : "#1769aa",
            }}
          >
            Waiting
          </div>

          <div
            style={{
              marginTop: 2,
              fontSize: 17,
              fontWeight: 950,
              color:
                alert
                  ? "#b91c1c"
                  : "#0f4c81",
              fontVariantNumeric:
                "tabular-nums",
            }}
          >
            {formatElapsedTime(
              elapsedSeconds
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 11,
          display: "grid",
          gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
          gap: 7,
        }}
      >
        <InfoField
          label="Flight"
          value={[
            report.airline,
            report.flight_number,
          ]
            .filter(Boolean)
            .join(" ")}
        />

        <InfoField
          label="PNR"
          value={report.pnr}
        />

        <InfoField
          label="Type"
          value={report.wch_type}
        />

        <InfoField
          label="Location"
          value={
            report.current_location ||
            report.ready_location ||
            "Counter"
          }
        />
      </div>

      {alert && (
        <div
          style={{
            marginTop: 9,
            padding: "8px 10px",
            borderRadius: 11,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            color: "#9f1239",
            fontSize: 10.5,
            lineHeight: 1.4,
            fontWeight: 900,
          }}
        >
          30+ MINUTE ALERT
        </div>
      )}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export default function WchrDispatchPage() {
  const { user } =
    useUser();

  const {
    isMobile,
    isTablet,
  } = useViewport();

  const todayKey =
    useMemo(
      () => toDateKey(new Date()),
      []
    );

  // ============================================================
  // AGENTS
  // ============================================================

  const [
    agents,
    setAgents,
  ] = useState([]);

  // ============================================================
  // READY REPORTS
  // ============================================================

  const [
    reports,
    setReports,
  ] = useState([]);

  const [
    activeReports,
    setActiveReports,
  ] = useState([]);

  const [
    bulkSelectedIds,
    setBulkSelectedIds,
  ] = useState([]);

  const [
    bulkStatus,
    setBulkStatus,
  ] = useState("");

  const [
    bulkLocation,
    setBulkLocation,
  ] = useState("");

  const [
    bulkReassignMap,
    setBulkReassignMap,
  ] = useState({});

  const [
    bulkSaving,
    setBulkSaving,
  ] = useState(false);

  // ============================================================
  // DAILY FLIGHTS
  // ============================================================

  const [
    dailyFlights,
    setDailyFlights,
  ] = useState([]);

  const [
    airlineInput,
    setAirlineInput,
  ] = useState("");

  const [
    flightNumberInput,
    setFlightNumberInput,
  ] = useState("");

  const [
    gateInput,
    setGateInput,
  ] = useState("");

  const [
    savingFlight,
    setSavingFlight,
  ] = useState(false);

  const [
    busyFlightId,
    setBusyFlightId,
  ] = useState("");

  const [
    loadingFlights,
    setLoadingFlights,
  ] = useState(true);

  // ============================================================
  // INVENTORY
  // ============================================================

  const [
    inventory,
    setInventory,
  ] = useState([]);

  const [
    loadingInventory,
    setLoadingInventory,
  ] = useState(true);

  const [
    inventoryFilter,
    setInventoryFilter,
  ] = useState("ALL");

  const [
    inventoryNumberInput,
    setInventoryNumberInput,
  ] = useState("");

  const [
    inventoryLocationInput,
    setInventoryLocationInput,
  ] = useState("Wheelchair Storage");

  const [
    busyInventoryId,
    setBusyInventoryId,
  ] = useState("");

  // ============================================================
  // SELECTION
  // ============================================================

  const [
    selectedAgentId,
    setSelectedAgentId,
  ] = useState("");

  const [
    selectedReportId,
    setSelectedReportId,
  ] = useState("");

  // ============================================================
  // LOADERS
  // ============================================================

  const [
    loadingAgents,
    setLoadingAgents,
  ] = useState(true);

  const [
    loadingReports,
    setLoadingReports,
  ] = useState(true);

  const [
    assigning,
    setAssigning,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    now,
    setNow,
  ] = useState(
    Date.now()
  );

  // ============================================================
  // TIMER
  // ============================================================

  useEffect(() => {
    const intervalId =
      window.setInterval(
        () =>
          setNow(
            Date.now()
          ),
        1000
      );

    return () =>
      window.clearInterval(
        intervalId
      );
  }, []);

  // ============================================================
  // LIVE DAILY FLIGHTS
  // ============================================================

  useEffect(() => {
    setLoadingFlights(true);

    // Read the collection live and accept both the legacy `flight_date` field
    // and the new canonical `service_date` field. This keeps Dispatch and
    // Passenger Intake on one daily-flight source without breaking older rows.
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          DAILY_FLIGHTS_COLLECTION
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .filter((flight) => {
                const flightDate =
                  safeText(
                    flight.service_date ||
                      flight.flight_date
                  );

                return flightDate === todayKey;
              })
              .sort((a, b) => {
                const airlineCompare =
                  safeUpper(
                    a.airline
                  ).localeCompare(
                    safeUpper(
                      b.airline
                    )
                  );

                if (
                  airlineCompare !== 0
                ) {
                  return airlineCompare;
                }

                return safeUpper(
                  a.flight_number
                ).localeCompare(
                  safeUpper(
                    b.flight_number
                  ),
                  undefined,
                  {
                    numeric: true,
                  }
                );
              });

          setDailyFlights(rows);
          setLoadingFlights(false);
        },
        (err) => {
          console.error(
            "Daily WCHR flights listener error:",
            err
          );

          setLoadingFlights(false);

          setError(
            "Could not load today's WCHR flights."
          );
        }
      );

    return () =>
      unsubscribe();
  }, [todayKey]);

  // ============================================================
  // LIVE INVENTORY
  // ============================================================

  useEffect(() => {
    setLoadingInventory(true);

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          INVENTORY_COLLECTION
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .sort((a, b) =>
                getInventoryNumber(a)
                  .localeCompare(
                    getInventoryNumber(b),
                    undefined,
                    {
                      numeric: true,
                      sensitivity: "base",
                    }
                  )
              );

          setInventory(rows);
          setLoadingInventory(false);
        },
        (err) => {
          console.error(
            "WCHR inventory listener error:",
            err
          );

          setInventory([]);
          setLoadingInventory(false);

          setError(
            "Could not load wheelchair inventory."
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  // ============================================================
  // LIVE AGENTS
  // ============================================================

  useEffect(() => {
    const agentsQuery =
      query(
        collection(
          db,
          "wchr_agent_shifts"
        ),
        where(
          "status",
          "==",
          WCHR_AGENT_STATUS.ACTIVE
        )
      );

    const unsubscribe =
      onSnapshot(
        agentsQuery,
        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .sort(
                (a, b) => {
                  const aAvailable =
                    safeUpper(
                      a.availability_status
                    ) ===
                      WCHR_AGENT_AVAILABILITY.AVAILABLE &&
                    !cleanText(
                      a.active_report_id
                    );

                  const bAvailable =
                    safeUpper(
                      b.availability_status
                    ) ===
                      WCHR_AGENT_AVAILABILITY.AVAILABLE &&
                    !cleanText(
                      b.active_report_id
                    );

                  if (
                    aAvailable !==
                    bAvailable
                  ) {
                    return aAvailable
                      ? -1
                      : 1;
                  }

                  return getAgentName(
                    a
                  ).localeCompare(
                    getAgentName(
                      b
                    )
                  );
                }
              );

          setAgents(rows);
          setLoadingAgents(false);
        },
        (err) => {
          console.error(
            "WCHR agents listener error:",
            err
          );

          setLoadingAgents(false);

          setError(
            "Could not load active WCHR agents."
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  // ============================================================
  // LIVE READY WCHRS
  // ============================================================

  useEffect(() => {
    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "wch_reports"
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data(),
              }))
              .filter(
                (report) => {
                  const serviceStatus =
                    safeUpper(
                      report.service_status ||
                        report.tracking_status
                    );

                  const isReady =
                    report.ready_for_pickup ===
                      true ||
                    serviceStatus ===
                      WCHR_SERVICE_STATUS.READY_FOR_PICKUP;

                  const assigned =
                    Boolean(
                      cleanText(
                        report.wchr_agent_id ||
                          report.assigned_agent_id
                      )
                    );

                  const stored =
                    serviceStatus ===
                      WCHR_SERVICE_STATUS.STORED ||
                    Boolean(
                      report.stored_at
                    );

                  return (
                    isReady &&
                    !assigned &&
                    !stored
                  );
                }
              )
              .sort(
                (a, b) =>
                  getMillis(
                    getWheelchairTimerStart(a)
                  ) -
                  getMillis(
                    getWheelchairTimerStart(b)
                  )
              );

          const allRows =
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            }));

          const activeRows =
            allRows
              .filter((report) => {
                const status =
                  safeUpper(
                    report.service_status ||
                      report.tracking_status
                  );

                const assigned =
                  Boolean(
                    cleanText(
                      report.wchr_agent_id ||
                        report.assigned_agent_id
                    )
                  );

                const finished =
                  [
                    "STORED",
                    "COMPLETED",
                  ].includes(status) ||
                  Boolean(
                    report.stored_at ||
                      report.completed_at
                  );

                return (
                  assigned &&
                  !finished
                );
              })
              .sort(
                (a, b) =>
                  getMillis(
                    getWheelchairTimerStart(a)
                  ) -
                  getMillis(
                    getWheelchairTimerStart(b)
                  )
              );

          setReports(rows);
          setActiveReports(activeRows);
          setLoadingReports(false);
        },
        (err) => {
          console.error(
            "Ready wheelchair listener error:",
            err
          );

          setLoadingReports(false);

          setError(
            "Could not load WCHRs ready for pickup."
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  // ============================================================
  // FLIGHT MANAGEMENT
  // ============================================================

  const openFlights =
    useMemo(
      () =>
        dailyFlights.filter((flight) => {
          const status =
            safeUpper(
              flight.status || "OPEN"
            );

          const active =
            flight.active !== false;

          const selectable =
            flight.selectable_for_wchr !== false;

          return (
            status === "OPEN" &&
            active &&
            selectable
          );
        }),
      [dailyFlights]
    );

  const closedFlights =
    useMemo(
      () =>
        dailyFlights.filter(
          (flight) =>
            safeUpper(
              flight.status || "OPEN"
            ) === "CLOSED"
        ),
      [dailyFlights]
    );

  const handleAddFlight =
    async () => {
      setError("");
      setMessage("");

      const airline =
        normalizeAirline(
          airlineInput
        );

      const flightNumber =
        normalizeFlightNumber(
          flightNumberInput
        );

      const gate =
        safeUpper(
          gateInput
        );

      if (!airline) {
        setError(
          "Airline is required."
        );

        return;
      }

      if (!flightNumber) {
        setError(
          "Flight number is required."
        );

        return;
      }

      const duplicate =
        dailyFlights.some(
          (flight) =>
            normalizeAirline(
              flight.airline
            ) === airline &&
            normalizeFlightNumber(
              flight.flight_number
            ) === flightNumber
        );

      if (duplicate) {
        setError(
          `${airline} ${flightNumber} is already listed for today.`
        );

        return;
      }

      try {
        setSavingFlight(true);

        const flightKey =
          buildDailyFlightKey(
            airline,
            flightNumber,
            todayKey
          );

        await addDoc(
          collection(
            db,
            DAILY_FLIGHTS_COLLECTION
          ),
          {
            // `service_date` is the canonical field used by the new WCHR flow.
            // `flight_date` remains for backwards compatibility with older pages.
            service_date:
              todayKey,

            flight_date:
              todayKey,

            flight_key:
              flightKey,

            airline,

            flight_number:
              flightNumber,

            gate,

            status:
              "OPEN",

            active:
              true,

            selectable_for_wchr:
              true,

            source:
              "WCHR_DISPATCH",

            created_at:
              serverTimestamp(),

            created_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            created_by_username:
              user?.username ||
              "",

            created_by_name:
              getVisibleName(
                user
              ),

            created_by_role:
              user?.role ||
              "",

            updated_at:
              serverTimestamp(),
          }
        );

        setAirlineInput("");
        setFlightNumberInput("");
        setGateInput("");

        setMessage(
          `${airline} ${flightNumber} added to today's WCHR operation.`
        );
      } catch (err) {
        console.error(
          "Create WCHR flight error:",
          err
        );

        const rawMessage = String(
          err?.message || ""
        );

        if (
          rawMessage
            .toLowerCase()
            .includes("missing or insufficient permissions")
        ) {
          setError(
            "Unable to add the flight because Firestore permissions are blocking wchr_daily_flights."
          );
        } else {
          setError(
            rawMessage ||
              "Unable to add the flight."
          );
        }
      } finally {
        setSavingFlight(false);
      }
    };

  const handleCloseFlight =
    async (flight) => {
      const confirmed =
        window.confirm(
          `Close ${flight.airline || ""} ${
            flight.flight_number || ""
          }?\n\nOnce closed, this flight will no longer be available for new WCHR passenger entries.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setBusyFlightId(
          flight.id
        );

        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            DAILY_FLIGHTS_COLLECTION,
            flight.id
          ),
          {
            status:
              "CLOSED",

            active:
              false,

            selectable_for_wchr:
              false,

            closed_at:
              serverTimestamp(),

            closed_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            closed_by_name:
              getVisibleName(
                user
              ),

            updated_at:
              serverTimestamp(),
          }
        );

        setMessage(
          `${flight.airline || ""} ${
            flight.flight_number || ""
          } closed.`
        );
      } catch (err) {
        console.error(
          "Close WCHR flight error:",
          err
        );

        setError(
          err?.message ||
            "Unable to close the flight."
        );
      } finally {
        setBusyFlightId("");
      }
    };

  const handleReopenFlight =
    async (flight) => {
      try {
        setBusyFlightId(
          flight.id
        );

        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            DAILY_FLIGHTS_COLLECTION,
            flight.id
          ),
          {
            status:
              "OPEN",

            active:
              true,

            selectable_for_wchr:
              true,

            reopened_at:
              serverTimestamp(),

            reopened_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            reopened_by_name:
              getVisibleName(
                user
              ),

            updated_at:
              serverTimestamp(),
          }
        );

        setMessage(
          `${flight.airline || ""} ${
            flight.flight_number || ""
          } reopened.`
        );
      } catch (err) {
        console.error(
          "Reopen WCHR flight error:",
          err
        );

        setError(
          err?.message ||
            "Unable to reopen the flight."
        );
      } finally {
        setBusyFlightId("");
      }
    };

  const handleDeleteFlight =
    async (flight) => {
      const confirmed =
        window.confirm(
          `Delete ${flight.airline || ""} ${
            flight.flight_number || ""
          } from today's WCHR flight list?\n\nExisting passenger reports will not be deleted.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setBusyFlightId(
          flight.id
        );

        setError("");
        setMessage("");

        await deleteDoc(
          doc(
            db,
            DAILY_FLIGHTS_COLLECTION,
            flight.id
          )
        );

        setMessage(
          `${flight.airline || ""} ${
            flight.flight_number || ""
          } removed from today's list.`
        );
      } catch (err) {
        console.error(
          "Delete WCHR flight error:",
          err
        );

        setError(
          err?.message ||
            "Unable to delete the flight."
        );
      } finally {
        setBusyFlightId("");
      }
    };

  // ============================================================
  // INVENTORY METRICS
  // ============================================================

  const inventorySummary =
    useMemo(() => {
      const summary = {
        total: 0,
        available: 0,
        ready: 0,
        inService: 0,
        atGate: 0,
        pendingStorage: 0,
        maintenance: 0,
      };

      inventory.forEach(
        (item) => {
          const status =
            getInventoryStatus(
              item
            );

          summary.total += 1;

          if (
            status === "AVAILABLE" ||
            status ===
              "AVAILABLE_HANDOFF"
          ) {
            summary.available += 1;
          }

          if (
            status ===
            "READY_FOR_PICKUP"
          ) {
            summary.ready += 1;
          }

          if (
            status ===
            "IN_USE"
          ) {
            summary.inService += 1;
          }

          if (
            status ===
            "AT_GATE"
          ) {
            summary.atGate += 1;
          }

          if (
            status ===
            "PENDING_STORAGE"
          ) {
            summary.pendingStorage += 1;
          }

          if (
            status ===
            "MAINTENANCE"
          ) {
            summary.maintenance += 1;
          }
        }
      );

      return summary;
    }, [inventory]);

  const filteredInventory =
    useMemo(() => {
      if (
        inventoryFilter ===
        "ALL"
      ) {
        return inventory;
      }

      if (
        inventoryFilter ===
        "AVAILABLE"
      ) {
        return inventory.filter(
          (item) => {
            const status =
              getInventoryStatus(
                item
              );

            return (
              status ===
                "AVAILABLE" ||
              status ===
                "AVAILABLE_HANDOFF"
            );
          }
        );
      }

      return inventory.filter(
        (item) =>
          getInventoryStatus(
            item
          ) === inventoryFilter
      );
    }, [
      inventory,
      inventoryFilter,
    ]);


  // ============================================================
  // INVENTORY MANAGEMENT
  // ============================================================

  const handleAddInventory =
    async () => {
      setError("");
      setMessage("");

      const wheelchairNumber =
        safeUpper(
          inventoryNumberInput
        );

      const location =
        cleanText(
          inventoryLocationInput
        ) ||
        "Wheelchair Storage";

      if (!wheelchairNumber) {
        setError(
          "Wheelchair number is required."
        );
        return;
      }

      const duplicate =
        inventory.some(
          (item) =>
            getInventoryNumber(
              item
            ) ===
            wheelchairNumber
        );

      if (duplicate) {
        setError(
          `WCHR ${wheelchairNumber} already exists in inventory.`
        );
        return;
      }

      try {
        setBusyInventoryId(
          "NEW"
        );

        await addDoc(
          collection(
            db,
            INVENTORY_COLLECTION
          ),
          {
            wheelchair_number:
              wheelchairNumber,

            number:
              wheelchairNumber,

            location,

            current_location:
              location,

            status:
              "AVAILABLE",

            is_available:
              true,

            maintenance:
              false,

            available_for_handoff:
              false,

            created_at:
              serverTimestamp(),

            created_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            created_by_name:
              getVisibleName(
                user
              ),

            updated_at:
              serverTimestamp(),
          }
        );

        setInventoryNumberInput(
          ""
        );

        setMessage(
          `WCHR ${wheelchairNumber} added to inventory.`
        );
      } catch (err) {
        console.error(
          "Add WCHR inventory error:",
          err
        );

        setError(
          err?.message ||
            "Unable to add wheelchair."
        );
      } finally {
        setBusyInventoryId(
          ""
        );
      }
    };

  const handleEditInventory =
    async (item) => {
      const currentNumber =
        getInventoryNumber(
          item
        );

      const nextNumber =
        safeUpper(
          window.prompt(
            "Wheelchair number:",
            currentNumber
          )
        );

      if (!nextNumber) {
        return;
      }

      const duplicate =
        inventory.some(
          (row) =>
            row.id !== item.id &&
            getInventoryNumber(
              row
            ) ===
              nextNumber
        );

      if (duplicate) {
        setError(
          `WCHR ${nextNumber} already exists in inventory.`
        );
        return;
      }

      const nextLocation =
        cleanText(
          window.prompt(
            "Current wheelchair location:",
            item.location ||
              item.current_location ||
              "Wheelchair Storage"
          )
        );

      if (!nextLocation) {
        return;
      }

      try {
        setBusyInventoryId(
          item.id
        );

        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            INVENTORY_COLLECTION,
            item.id
          ),
          {
            wheelchair_number:
              nextNumber,

            number:
              nextNumber,

            location:
              nextLocation,

            current_location:
              nextLocation,

            updated_at:
              serverTimestamp(),

            updated_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            updated_by_name:
              getVisibleName(
                user
              ),
          }
        );

        setMessage(
          `WCHR ${nextNumber} updated.`
        );
      } catch (err) {
        console.error(
          "Edit WCHR inventory error:",
          err
        );

        setError(
          err?.message ||
            "Unable to update wheelchair."
        );
      } finally {
        setBusyInventoryId(
          ""
        );
      }
    };

  const handleDeleteInventory =
    async (item) => {
      const wheelchairNumber =
        getInventoryNumber(
          item
        );

      if (
        isInventoryLocked(
          item
        )
      ) {
        setError(
          `WCHR ${wheelchairNumber} is linked to an active service and cannot be deleted.`
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Delete WCHR ${wheelchairNumber} from company inventory?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setBusyInventoryId(
          item.id
        );

        setError("");
        setMessage("");

        await deleteDoc(
          doc(
            db,
            INVENTORY_COLLECTION,
            item.id
          )
        );

        setMessage(
          `WCHR ${wheelchairNumber} deleted from inventory.`
        );
      } catch (err) {
        console.error(
          "Delete WCHR inventory error:",
          err
        );

        setError(
          err?.message ||
            "Unable to delete wheelchair."
        );
      } finally {
        setBusyInventoryId(
          ""
        );
      }
    };

  // ============================================================
  // SERVICE MANAGEMENT
  // ============================================================

  const releaseAgentFromReport =
    async (
      report,
      note = ""
    ) => {
      const agentId =
        cleanText(
          report?.wchr_agent_id ||
            report?.assigned_agent_id
        );

      if (!agentId) {
        return;
      }

      const agentRef =
        doc(
          db,
          "wchr_agent_shifts",
          agentId
        );

      const agentSnap =
        await getDoc(
          agentRef
        );

      if (
        !agentSnap.exists()
      ) {
        return;
      }

      const shift =
        agentSnap.data() ||
        {};

      if (
        cleanText(
          shift.active_report_id
        ) &&
        cleanText(
          shift.active_report_id
        ) !==
          cleanText(
            report.id
          )
      ) {
        return;
      }

      await updateDoc(
        agentRef,
        {
          availability_status:
            WCHR_AGENT_AVAILABILITY.AVAILABLE,

          active_report_id:
            "",

          active_wheelchair_number:
            "",

          active_passenger_name:
            "",

          active_pnr:
            "",

          active_flight_number:
            "",

          active_airline:
            "",

          active_service_status:
            "",

          last_assignment_note:
            cleanText(
              note
            ),

          updated_at:
            serverTimestamp(),
        }
      );
    };

  const handleReassignReport =
    async (report) => {
      const oldAgentId =
        cleanText(
          report.wchr_agent_id ||
            report.assigned_agent_id
        );

      const candidates =
        availableAgents.filter(
          (agent) =>
            agent.id !==
            oldAgentId
        );

      if (
        candidates.length ===
        0
      ) {
        setError(
          "No other available WCHR agent is currently available."
        );
        return;
      }

      const roster =
        candidates
          .map(
            (agent, index) =>
              `${index + 1}. ${getAgentName(
                agent
              )}`
          )
          .join("\n");

      const choice =
        Number(
          window.prompt(
            `Select the new agent number:\n\n${roster}`
          )
        );

      if (
        !Number.isInteger(
          choice
        ) ||
        choice < 1 ||
        choice >
          candidates.length
      ) {
        return;
      }

      const note =
        cleanText(
          window.prompt(
            "Reassignment reason / operational note (required):"
          )
        );

      if (!note) {
        setError(
          "A reassignment note is required."
        );
        return;
      }

      const newAgent =
        candidates[
          choice - 1
        ];

      const newAgentName =
        getAgentName(
          newAgent
        );

      const oldAgentName =
        report.wchr_agent_name ||
        report.assigned_wchr_agent ||
        "Previous Agent";

      const confirmed =
        window.confirm(
          `Reassign WCHR ${
            report.wheelchair_number ||
            ""
          } from ${oldAgentName} to ${newAgentName}?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setAssigning(true);

        setError("");
        setMessage("");

        await releaseAgentFromReport(
          report,
          note
        );

        await updateDoc(
          doc(
            db,
            "wch_reports",
            report.id
          ),
          {
            previous_agent_id:
              oldAgentId,

            previous_agent_name:
              oldAgentName,

            reassigned_from_agent_id:
              oldAgentId,

            reassigned_from_agent_name:
              oldAgentName,

            reassigned_to_agent_id:
              newAgent.id,

            reassigned_to_agent_name:
              newAgentName,

            reassignment_note:
              note,

            reassigned_at:
              serverTimestamp(),

            reassigned_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            reassigned_by_username:
              user?.username ||
              "",

            reassigned_by_name:
              getVisibleName(
                user
              ),

            wchr_agent_id:
              newAgent.id,

            assigned_agent_id:
              newAgent.id,

            wchr_agent_name:
              newAgentName,

            assigned_wchr_agent:
              newAgentName,

            assigned_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            assigned_by_username:
              user?.username ||
              "",

            assigned_by_name:
              getVisibleName(
                user
              ),

            assigned_by_role:
              user?.role ||
              "",

            assigned_at:
              serverTimestamp(),

            assignment_status:
              "ASSIGNED",

            assignmentPushStatus:
              "PENDING",

            assignmentPushError:
              "",

            service_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            tracking_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            is_active:
              true,

            alerts_enabled:
              true,

            transport_alert_active:
              true,

            last_updated_at:
              serverTimestamp(),

            last_updated_by:
              getVisibleName(
                user
              ),

            last_updated_by_id:
              user?.id ||
              user?.uid ||
              "",
          }
        );

        await updateDoc(
          doc(
            db,
            "wchr_agent_shifts",
            newAgent.id
          ),
          {
            availability_status:
              WCHR_AGENT_AVAILABILITY.BUSY,

            active_report_id:
              report.id,

            active_wheelchair_number:
              safeUpper(
                report.wheelchair_number
              ),

            active_passenger_name:
              cleanText(
                report.passenger_name
              ),

            active_pnr:
              safeUpper(
                report.pnr
              ),

            active_flight_number:
              safeUpper(
                report.flight_number
              ),

            active_airline:
              safeUpper(
                report.airline
              ),

            active_service_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            assigned_at:
              serverTimestamp(),

            current_location:
              report.current_location ||
              report.ready_location ||
              newAgent.current_location ||
              "Counter",

            updated_at:
              serverTimestamp(),
          }
        );

        const inventoryItem =
          inventory.find(
            (item) =>
              getInventoryNumber(
                item
              ) ===
              safeUpper(
                report.wheelchair_number
              )
          );

        if (inventoryItem) {
          await updateDoc(
            doc(
              db,
              INVENTORY_COLLECTION,
              inventoryItem.id
            ),
            {
              status:
                "ASSIGNED",

              is_available:
                false,

              current_agent_id:
                newAgent.id,

              current_agent_name:
                newAgentName,

              report_doc_id:
                report.id,

              assigned_report_doc_id:
                report.id,

              updated_at:
                serverTimestamp(),
            }
          );
        }

        await addWchrTimelineEvent({
          reportId:
            report.id,

          eventType:
            "WCHR_REASSIGNED",

          wheelchairNumber:
            report.wheelchair_number ||
            "",

          agentId:
            newAgent.id,

          agentName:
            newAgentName,

          location:
            report.current_location ||
            report.ready_location ||
            "Counter",

          note:
            `Reassigned from ${oldAgentName} to ${newAgentName}. Reason: ${note}`,

          user,
        });

        triggerWchrAssignmentPush(
          report.id
        ).catch(
          (pushError) => {
            console.error(
              "WCHR reassignment push error:",
              pushError
            );
          }
        );

        setMessage(
          `WCHR ${
            report.wheelchair_number ||
            ""
          } reassigned to ${newAgentName}.`
        );
      } catch (err) {
        console.error(
          "Reassign WCHR error:",
          err
        );

        setError(
          err?.message ||
            "Unable to reassign the wheelchair."
        );
      } finally {
        setAssigning(
          false
        );
      }
    };

  const handleForceComplete =
    async (report) => {
      const note =
        cleanText(
          window.prompt(
            "Supervisor completion note / reason (required):"
          )
        );

      if (!note) {
        setError(
          "A supervisor completion note is required."
        );
        return;
      }

      const finalLocation =
        cleanText(
          window.prompt(
            "Final wheelchair location:",
            report.current_location ||
              report.gate_location ||
              report.gate ||
              "Wheelchair Storage"
          )
        );

      if (!finalLocation) {
        setError(
          "Final location is required."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Complete this WCHR service manually?\n\nOnly this selected service/report will be closed. If WCHR ${
            report.wheelchair_number ||
            ""
          } is already being used by a newer active service, that current service and inventory assignment will NOT be changed.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setAssigning(
          true
        );

        setError("");
        setMessage("");

        await releaseAgentFromReport(
          report,
          note
        );

        await updateDoc(
          doc(
            db,
            "wch_reports",
            report.id
          ),
          {
            service_status:
              "COMPLETED",

            tracking_status:
              "COMPLETED",

            assignment_status:
              "COMPLETED",

            is_active:
              false,

            ready_for_pickup:
              false,

            alerts_enabled:
              false,

            transport_alert_active:
              false,

            gate_followup_enabled:
              false,

            supervisor_completed:
              true,

            supervisor_completion_note:
              note,

            supervisor_completed_at:
              serverTimestamp(),

            supervisor_completed_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            supervisor_completed_by_username:
              user?.username ||
              "",

            supervisor_completed_by_name:
              getVisibleName(
                user
              ),

            current_location:
              finalLocation,

            last_updated_at:
              serverTimestamp(),

            last_updated_by:
              getVisibleName(
                user
              ),

            last_updated_by_id:
              user?.id ||
              user?.uid ||
              "",
          }
        );

        const inventoryItem =
          inventory.find(
            (item) =>
              getInventoryNumber(
                item
              ) ===
              safeUpper(
                report.wheelchair_number
              )
          );

        if (
          inventoryItem &&
          inventoryBelongsToReport(
            inventoryItem,
            report
          )
        ) {
          await updateDoc(
            doc(
              db,
              INVENTORY_COLLECTION,
              inventoryItem.id
            ),
            {
              status:
                "AVAILABLE",

              is_available:
                true,

              available_for_handoff:
                false,

              ready_for_pickup:
                false,

              location:
                finalLocation,

              current_location:
                finalLocation,

              report_doc_id:
                "",

              assigned_report_doc_id:
                "",

              report_id:
                "",

              assigned_report_id:
                "",

              passenger_name:
                "",

              airline:
                "",

              flight_number:
                "",

              pnr:
                "",

              current_agent_id:
                "",

              current_agent_name:
                "",

              completed_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),
            }
          );
        } else if (
          inventoryItem &&
          !inventoryBelongsToReport(
            inventoryItem,
            report
          )
        ) {
          console.warn(
            `Historical WCHR service ${report.id} was completed without releasing inventory because WCHR ${
              report.wheelchair_number || ""
            } is currently linked to a different active report.`
          );
        }

        await addWchrTimelineEvent({
          reportId:
            report.id,

          eventType:
            "SUPERVISOR_FORCE_COMPLETE",

          wheelchairNumber:
            report.wheelchair_number ||
            "",

          agentId:
            report.wchr_agent_id ||
            report.assigned_agent_id ||
            "",

          agentName:
            report.wchr_agent_name ||
            report.assigned_wchr_agent ||
            "",

          location:
            finalLocation,

          note,

          user,
        });

        setMessage(
          `WCHR ${
            report.wheelchair_number ||
            ""
          } completed manually and the agent was released.`
        );
      } catch (err) {
        console.error(
          "Force complete WCHR error:",
          err
        );

        setError(
          err?.message ||
            "Unable to complete the wheelchair service."
        );
      } finally {
        setAssigning(
          false
        );
      }
    };


  // ============================================================
  // BULK WCHR CONTROL - UP TO 30 SERVICES
  // ============================================================

  const toggleBulkReport =
    (reportId) => {
      setBulkSelectedIds(
        (previous) => {
          if (
            previous.includes(
              reportId
            )
          ) {
            setBulkReassignMap(
              (current) => {
                const next = {
                  ...current,
                };

                delete next[
                  reportId
                ];

                return next;
              }
            );

            return previous.filter(
              (id) =>
                id !==
                reportId
            );
          }

          if (
            previous.length >=
            30
          ) {
            setError(
              "You can select a maximum of 30 WCHRs at one time."
            );

            return previous;
          }

          return [
            ...previous,
            reportId,
          ];
        }
      );
    };

  const clearBulkSelection =
    () => {
      setBulkSelectedIds(
        []
      );

      setBulkStatus(
        ""
      );

      setBulkLocation(
        ""
      );

      setBulkReassignMap(
        {}
      );
    };

  function getInventoryStatusFromServiceStatus(
    status
  ) {
    const normalized =
      safeUpper(
        status
      );

    if (
      normalized ===
      "READY_FOR_PICKUP"
    ) {
      return "READY_FOR_PICKUP";
    }

    if (
      [
        "ASSIGNED",
        "ACCEPTED",
        "PICKED_UP",
        "IN_TRANSIT",
      ].includes(
        normalized
      )
    ) {
      return normalized ===
        "IN_TRANSIT"
        ? "IN_SERVICE"
        : normalized;
    }

    if (
      normalized ===
      "AT_GATE"
    ) {
      return "AT_GATE";
    }

    if (
      normalized ===
      "BOARDING"
    ) {
      return "BOARDING";
    }

    if (
      normalized ===
      "BOARDED"
    ) {
      return "BOARDED";
    }

    if (
      normalized ===
      "PENDING_STORAGE"
    ) {
      return "PENDING_STORAGE";
    }

    if (
      normalized ===
        "STORED" ||
      normalized ===
        "COMPLETED"
    ) {
      return "AVAILABLE";
    }

    return normalized ||
      "AVAILABLE";
  }

  const handleBulkApply =
    async () => {
      setError("");
      setMessage("");

      const selectedRows =
        activeReports.filter(
          (report) =>
            bulkSelectedIds.includes(
              report.id
            )
        );

      if (
        selectedRows.length ===
        0
      ) {
        setError(
          "Select at least one WCHR."
        );

        return;
      }

      if (
        selectedRows.length >
        30
      ) {
        setError(
          "A maximum of 30 WCHRs can be updated at one time."
        );

        return;
      }

      const normalizedStatus =
        safeUpper(
          bulkStatus
        );

      const normalizedLocation =
        cleanText(
          bulkLocation
        );

      const reassignEntries =
        selectedRows
          .map(
            (report) => ({
              report,
              targetAgentId:
                cleanText(
                  bulkReassignMap[
                    report.id
                  ]
                ),
            })
          )
          .filter(
            (entry) =>
              entry.targetAgentId
          );

      if (
        !normalizedStatus &&
        !normalizedLocation &&
        reassignEntries.length ===
          0
      ) {
        setError(
          "Choose a Status, enter a Location, or select a new agent for at least one WCHR."
        );

        return;
      }

      // One active WCHR per agent.
      const targetIds =
        reassignEntries.map(
          (entry) =>
            entry.targetAgentId
        );

      const duplicateTarget =
        targetIds.some(
          (id, index) =>
            targetIds.indexOf(
              id
            ) !== index
        );

      if (
        duplicateTarget
      ) {
        setError(
          "The same available agent cannot receive more than one active WCHR in the same bulk update."
        );

        return;
      }

      for (
        const entry of
        reassignEntries
      ) {
        const target =
          availableAgents.find(
            (agent) =>
              agent.id ===
              entry.targetAgentId
          );

        if (!target) {
          setError(
            "One of the selected reassignment agents is no longer available. Refresh the selection and try again."
          );

          return;
        }
      }

      let managementNote =
        "";

      if (
        reassignEntries.length >
        0
      ) {
        managementNote =
          cleanText(
            window.prompt(
              "Bulk reassignment reason / operational note (required):"
            )
          );

        if (
          !managementNote
        ) {
          setError(
            "A note is required when reassigning WCHRs."
          );

          return;
        }
      }

      const confirmed =
        window.confirm(
          `Apply bulk changes to ${selectedRows.length} WCHR${
            selectedRows.length ===
            1
              ? ""
              : "s"
          }?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setBulkSaving(
          true
        );

        let updatedCount =
          0;

        for (
          const report of
          selectedRows
        ) {
          const targetAgentId =
            cleanText(
              bulkReassignMap[
                report.id
              ]
            );

          const targetAgent =
            targetAgentId
              ? availableAgents.find(
                  (agent) =>
                    agent.id ===
                    targetAgentId
                )
              : null;

          const currentAgentId =
            cleanText(
              report.wchr_agent_id ||
                report.assigned_agent_id
            );

          const currentAgentName =
            report.wchr_agent_name ||
            report.assigned_wchr_agent ||
            "";

          const finalStatus =
            normalizedStatus ||
            safeUpper(
              report.service_status ||
                report.tracking_status
            );

          const finalLocation =
            normalizedLocation ||
            cleanText(
              report.current_location ||
                report.gate_location ||
                report.ready_location ||
                "Counter"
            );

          const deliveredToGate =
            [
              "AT_GATE",
              "BOARDING",
              "BOARDED",
              "PENDING_STORAGE",
              "STORED",
              "COMPLETED",
            ].includes(
              finalStatus
            );

          const finishing =
            [
              "STORED",
              "COMPLETED",
            ].includes(
              finalStatus
            );

          if (
            targetAgent &&
            currentAgentId
          ) {
            await releaseAgentFromReport(
              report,
              managementNote
            );
          }

          if (
            finishing &&
            currentAgentId &&
            !targetAgent
          ) {
            await releaseAgentFromReport(
              report,
              `Bulk status changed to ${finalStatus}.`
            );
          }

          const reportPatch =
            {
              last_updated_at:
                serverTimestamp(),

              last_updated_by:
                getVisibleName(
                  user
                ),

              last_updated_by_id:
                user?.id ||
                user?.uid ||
                "",
            };

          if (
            normalizedLocation
          ) {
            reportPatch.current_location =
              finalLocation;

            reportPatch.last_location_update_at =
              serverTimestamp();
          }

          if (
            normalizedStatus
          ) {
            reportPatch.service_status =
              finalStatus;

            reportPatch.tracking_status =
              finalStatus;

            reportPatch.assignment_status =
              finalStatus;

            reportPatch.transport_alert_active =
              !deliveredToGate;

            if (
              deliveredToGate
            ) {
              // Transport alert is permanently disabled after Gate.
              reportPatch.alert_after_minutes =
                15;

              reportPatch.gate_monitoring_required =
                !finishing;
            }

            if (
              finalStatus ===
              "AT_GATE"
            ) {
              reportPatch.passenger_delivered_to_gate =
                true;

              reportPatch.passenger_delivered_to_gate_at =
                serverTimestamp();

              reportPatch.gate_arrived_at =
                serverTimestamp();

              reportPatch.gate_location =
                finalLocation;

              reportPatch.gate_monitoring_started_at =
                serverTimestamp();

              reportPatch.gate_check_interval_minutes =
                15;

              reportPatch.alerts_enabled =
                true;

              reportPatch.is_active =
                true;
            }

            if (
              finishing
            ) {
              reportPatch.alerts_enabled =
                false;

              reportPatch.gate_followup_enabled =
                false;

              reportPatch.gate_monitoring_required =
                false;

              reportPatch.is_active =
                false;

              reportPatch.ready_for_pickup =
                false;
            }
          }

          if (
            targetAgent
          ) {
            const newAgentName =
              getAgentName(
                targetAgent
              );

            reportPatch.previous_agent_id =
              currentAgentId;

            reportPatch.previous_agent_name =
              currentAgentName;

            reportPatch.reassigned_from_agent_id =
              currentAgentId;

            reportPatch.reassigned_from_agent_name =
              currentAgentName;

            reportPatch.reassigned_to_agent_id =
              targetAgent.id;

            reportPatch.reassigned_to_agent_name =
              newAgentName;

            reportPatch.reassignment_note =
              managementNote;

            reportPatch.reassigned_at =
              serverTimestamp();

            reportPatch.reassigned_by_user_id =
              user?.id ||
              user?.uid ||
              "";

            reportPatch.reassigned_by_name =
              getVisibleName(
                user
              );

            reportPatch.wchr_agent_id =
              targetAgent.id;

            reportPatch.assigned_agent_id =
              targetAgent.id;

            reportPatch.wchr_agent_name =
              newAgentName;

            reportPatch.assigned_wchr_agent =
              newAgentName;

            reportPatch.assigned_by_user_id =
              user?.id ||
              user?.uid ||
              "";

            reportPatch.assigned_by_username =
              user?.username ||
              "";

            reportPatch.assigned_by_name =
              getVisibleName(
                user
              );

            reportPatch.assigned_by_role =
              user?.role ||
              "";

            reportPatch.assigned_at =
              serverTimestamp();

            reportPatch.assignmentPushStatus =
              "PENDING";

            reportPatch.assignmentPushError =
              "";

            if (
              !normalizedStatus
            ) {
              reportPatch.service_status =
                WCHR_SERVICE_STATUS.ASSIGNED;

              reportPatch.tracking_status =
                WCHR_SERVICE_STATUS.ASSIGNED;

              reportPatch.assignment_status =
                "ASSIGNED";

              reportPatch.is_active =
                true;

              reportPatch.alerts_enabled =
                true;

              reportPatch.transport_alert_active =
                true;
            }
          }

          await updateDoc(
            doc(
              db,
              "wch_reports",
              report.id
            ),
            reportPatch
          );

          if (
            targetAgent
          ) {
            const newAgentName =
              getAgentName(
                targetAgent
              );

            await updateDoc(
              doc(
                db,
                "wchr_agent_shifts",
                targetAgent.id
              ),
              {
                availability_status:
                  WCHR_AGENT_AVAILABILITY.BUSY,

                active_report_id:
                  report.id,

                active_wheelchair_number:
                  safeUpper(
                    report.wheelchair_number
                  ),

                active_passenger_name:
                  cleanText(
                    report.passenger_name
                  ),

                active_pnr:
                  safeUpper(
                    report.pnr
                  ),

                active_flight_number:
                  safeUpper(
                    report.flight_number
                  ),

                active_airline:
                  safeUpper(
                    report.airline
                  ),

                active_service_status:
                  normalizedStatus ||
                  WCHR_SERVICE_STATUS.ASSIGNED,

                assigned_at:
                  serverTimestamp(),

                current_location:
                  finalLocation,

                updated_at:
                  serverTimestamp(),
              }
            );

            triggerWchrAssignmentPush(
              report.id
            ).catch(
              (pushError) => {
                console.error(
                  "Bulk WCHR reassignment push error:",
                  pushError
                );
              }
            );
          }

          const inventoryItem =
            inventory.find(
              (item) =>
                getInventoryNumber(
                  item
                ) ===
                safeUpper(
                  report.wheelchair_number
                )
            );

          if (
            inventoryItem
          ) {
            const inventoryPatch =
              {
                location:
                  finalLocation,

                current_location:
                  finalLocation,

                updated_at:
                  serverTimestamp(),
              };

            if (
              normalizedStatus
            ) {
              const inventoryStatus =
                getInventoryStatusFromServiceStatus(
                  finalStatus
                );

              inventoryPatch.status =
                inventoryStatus;

              inventoryPatch.is_available =
                inventoryStatus ===
                  "AVAILABLE";

              inventoryPatch.available_for_handoff =
                false;
            }

            if (
              targetAgent
            ) {
              inventoryPatch.current_agent_id =
                targetAgent.id;

              inventoryPatch.current_agent_name =
                getAgentName(
                  targetAgent
                );

              inventoryPatch.report_doc_id =
                report.id;

              inventoryPatch.assigned_report_doc_id =
                report.id;

              inventoryPatch.is_available =
                false;
            }

            if (
              finishing
            ) {
              if (
                inventoryBelongsToReport(
                  inventoryItem,
                  report
                )
              ) {
                inventoryPatch.status =
                  "AVAILABLE";

                inventoryPatch.is_available =
                  true;

                inventoryPatch.current_agent_id =
                  "";

                inventoryPatch.current_agent_name =
                  "";

                inventoryPatch.report_doc_id =
                  "";

                inventoryPatch.assigned_report_doc_id =
                  "";

                inventoryPatch.report_id =
                  "";

                inventoryPatch.assigned_report_id =
                  "";

                inventoryPatch.passenger_name =
                  "";

                inventoryPatch.airline =
                  "";

                inventoryPatch.flight_number =
                  "";

                inventoryPatch.pnr =
                  "";
              } else {
                // Historical service only: do not touch the current inventory assignment.
                delete inventoryPatch.status;
                delete inventoryPatch.is_available;
                delete inventoryPatch.current_agent_id;
                delete inventoryPatch.current_agent_name;
                delete inventoryPatch.report_doc_id;
                delete inventoryPatch.assigned_report_doc_id;
                delete inventoryPatch.report_id;
                delete inventoryPatch.assigned_report_id;
                delete inventoryPatch.passenger_name;
                delete inventoryPatch.airline;
                delete inventoryPatch.flight_number;
                delete inventoryPatch.pnr;
                delete inventoryPatch.location;
                delete inventoryPatch.current_location;
              }
            }

            if (
              !finishing ||
              inventoryBelongsToReport(
                inventoryItem,
                report
              )
            ) {
              await updateDoc(
                doc(
                  db,
                  INVENTORY_COLLECTION,
                  inventoryItem.id
                ),
                inventoryPatch
              );
            }
          }

          await addWchrTimelineEvent({
            reportId:
              report.id,

            eventType:
              "BULK_MANAGEMENT_UPDATE",

            wheelchairNumber:
              report.wheelchair_number ||
              "",

            agentId:
              targetAgent?.id ||
              currentAgentId ||
              "",

            agentName:
              targetAgent
                ? getAgentName(
                    targetAgent
                  )
                : currentAgentName,

            location:
              finalLocation,

            note:
              [
                normalizedStatus
                  ? `Status changed to ${finalStatus}.`
                  : "",

                normalizedLocation
                  ? `Location changed to ${finalLocation}.`
                  : "",

                targetAgent
                  ? `Reassigned to ${getAgentName(
                      targetAgent
                    )}. Reason: ${managementNote}`
                  : "",
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                ),

            user,
          });

          updatedCount +=
            1;
        }

        clearBulkSelection();

        setMessage(
          `${updatedCount} WCHR${
            updatedCount ===
            1
              ? ""
              : "s"
          } updated successfully.`
        );
      } catch (err) {
        console.error(
          "Bulk WCHR update error:",
          err
        );

        setError(
          err?.message ||
            "Unable to complete the bulk WCHR update."
        );
      } finally {
        setBulkSaving(
          false
        );
      }
    };

  // ============================================================
  // SELECTED OBJECTS
  // ============================================================

  const selectedAgent =
    useMemo(
      () =>
        agents.find(
          (agent) =>
            agent.id ===
            selectedAgentId
        ) || null,
      [
        agents,
        selectedAgentId,
      ]
    );

  const selectedReport =
    useMemo(
      () =>
        reports.find(
          (report) =>
            report.id ===
            selectedReportId
        ) || null,
      [
        reports,
        selectedReportId,
      ]
    );

  // ============================================================
  // AGENT COUNTERS
  // ============================================================

  const availableAgents =
    useMemo(
      () =>
        agents.filter(
          (agent) =>
            safeUpper(
              agent.status
            ) ===
              WCHR_AGENT_STATUS.ACTIVE &&
            safeUpper(
              agent.availability_status
            ) ===
              WCHR_AGENT_AVAILABILITY.AVAILABLE &&
            !cleanText(
              agent.active_report_id
            )
        ),
      [agents]
    );

  const busyAgents =
    useMemo(
      () =>
        agents.filter(
          (agent) =>
            safeUpper(
              agent.availability_status
            ) ===
              WCHR_AGENT_AVAILABILITY.BUSY ||
            Boolean(
              cleanText(
                agent.active_report_id
              )
            )
        ),
      [agents]
    );

  const breakAgents =
    useMemo(
      () =>
        agents.filter(
          (agent) =>
            safeUpper(
              agent.availability_status
            ) ===
            WCHR_AGENT_AVAILABILITY.BREAK
        ),
      [agents]
    );

  const delayedReadyReports =
    useMemo(
      () =>
        reports.filter(
          (report) =>
            shouldShow30MinuteAlert(
              report,
              now
            )
        ),
      [
        reports,
        now,
      ]
    );

  // ============================================================
  // VALIDATE AGENT
  // ============================================================

  function validateSelectedAgent() {
    if (!selectedAgent) {
      return {
        valid: false,
        reason:
          "Please select an available WCHR agent.",
      };
    }

    const punchedIn =
      safeUpper(
        selectedAgent.status
      ) ===
      WCHR_AGENT_STATUS.ACTIVE;

    const availability =
      safeUpper(
        selectedAgent.availability_status
      );

    const hasAssignment =
      Boolean(
        cleanText(
          selectedAgent.active_report_id
        )
      );

    if (!punchedIn) {
      return {
        valid: false,
        reason:
          "This agent is not currently punched in.",
      };
    }

    if (
      availability !==
      WCHR_AGENT_AVAILABILITY.AVAILABLE
    ) {
      return {
        valid: false,
        reason:
          "This agent is not currently available.",
      };
    }

    if (hasAssignment) {
      return {
        valid: false,
        reason:
          "This agent already has an active wheelchair assignment.",
      };
    }

    return {
      valid: true,
      reason: "",
    };
  }

  // ============================================================
  // ASSIGN
  // ============================================================

  const handleAssign =
    async () => {
      setError("");
      setMessage("");

      if (!selectedReport) {
        setError(
          "Please select a wheelchair ready for pickup."
        );

        return;
      }

      const agentValidation =
        validateSelectedAgent();

      if (
        !agentValidation.valid
      ) {
        setError(
          agentValidation.reason
        );

        return;
      }

      const agentName =
        getAgentName(
          selectedAgent
        );

      const wheelchairNumber =
        selectedReport.wheelchair_number ||
        "\u2014";

      const confirmed =
        window.confirm(
          `Assign WCHR ${wheelchairNumber} to ${agentName}?`
        );

      if (!confirmed) {
        return;
      }

      try {
        setAssigning(true);

        const reportRef =
          doc(
            db,
            "wch_reports",
            selectedReport.id
          );

        const agentRef =
          doc(
            db,
            "wchr_agent_shifts",
            selectedAgent.id
          );

        // ------------------------------------------------------
        // REPORT
        // ------------------------------------------------------

        await updateDoc(
          reportRef,
          {
            wchr_agent_id:
              selectedAgent.id,

            assigned_agent_id:
              selectedAgent.id,

            wchr_agent_name:
              agentName,

            assigned_wchr_agent:
              agentName,

            assigned_by_user_id:
              user?.id ||
              user?.uid ||
              "",

            assigned_by_username:
              user?.username ||
              "",

            assigned_by_name:
              getVisibleName(
                user
              ),

            assigned_by_role:
              user?.role ||
              "",

            assigned_at:
              serverTimestamp(),

            assignment_status:
              "ASSIGNED",

            assignmentPushStatus:
              "PENDING",

            assignmentPushError:
              "",

            ready_for_pickup:
              false,

            service_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            tracking_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            is_active:
              true,

            alerts_enabled:
              true,

            alert_after_minutes:
              Number(
                selectedReport.alert_after_minutes ||
                  30
              ),

            last_updated_at:
              serverTimestamp(),

            last_updated_by:
              getVisibleName(
                user
              ),

            last_updated_by_id:
              user?.id ||
              user?.uid ||
              "",
          }
        );

        // ------------------------------------------------------
        // INVENTORY
        // ------------------------------------------------------

        const inventoryItem =
          inventory.find(
            (item) =>
              getInventoryNumber(
                item
              ) ===
              safeUpper(
                selectedReport.wheelchair_number
              )
          );

        if (inventoryItem) {
          await updateDoc(
            doc(
              db,
              INVENTORY_COLLECTION,
              inventoryItem.id
            ),
            {
              status:
                "ASSIGNED",

              is_available:
                false,

              available_for_handoff:
                false,

              report_doc_id:
                selectedReport.id,

              assigned_report_doc_id:
                selectedReport.id,

              report_id:
                selectedReport.report_id ||
                "",

              assigned_report_id:
                selectedReport.report_id ||
                "",

              passenger_name:
                selectedReport.passenger_name ||
                "",

              airline:
                safeUpper(
                  selectedReport.airline
                ),

              flight_number:
                safeUpper(
                  selectedReport.flight_number
                ),

              pnr:
                safeUpper(
                  selectedReport.pnr
                ),

              current_agent_id:
                selectedAgent.id,

              current_agent_name:
                agentName,

              location:
                selectedReport.current_location ||
                selectedReport.ready_location ||
                "Counter",

              assigned_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),
            }
          );
        }

        // ------------------------------------------------------
        // AGENT SHIFT
        // ------------------------------------------------------

        await updateDoc(
          agentRef,
          {
            availability_status:
              WCHR_AGENT_AVAILABILITY.BUSY,

            active_report_id:
              selectedReport.id,

            active_wheelchair_number:
              safeUpper(
                selectedReport.wheelchair_number
              ),

            active_passenger_name:
              cleanText(
                selectedReport.passenger_name
              ),

            active_pnr:
              safeUpper(
                selectedReport.pnr
              ),

            active_flight_number:
              safeUpper(
                selectedReport.flight_number
              ),

            active_airline:
              safeUpper(
                selectedReport.airline
              ),

            active_service_status:
              WCHR_SERVICE_STATUS.ASSIGNED,

            assigned_at:
              serverTimestamp(),

            current_location:
              selectedReport.current_location ||
              selectedReport.ready_location ||
              "Counter",

            updated_at:
              serverTimestamp(),
          }
        );

        // ------------------------------------------------------
        // TIMELINE
        // ------------------------------------------------------

        await addWchrTimelineEvent({
          reportId:
            selectedReport.id,

          eventType:
            "AGENT_ASSIGNED",

          wheelchairNumber:
            selectedReport.wheelchair_number ||
            "",

          agentId:
            selectedAgent.id,

          agentName,

          location:
            selectedReport.current_location ||
            selectedReport.ready_location ||
            "Counter",

          note:
            `WCHR ${wheelchairNumber} assigned to ${agentName} by ${getVisibleName(
              user
            )}.`,

          user,
        });

        // ------------------------------------------------------
        // PUSH NOTIFICATION
        // ------------------------------------------------------

        triggerWchrAssignmentPush(
          selectedReport.id
        ).catch(
          (pushError) => {
            console.error(
              "WCHR assignment push error:",
              pushError
            );
          }
        );

        // ------------------------------------------------------
        // RESET
        // ------------------------------------------------------

        setSelectedAgentId("");
        setSelectedReportId("");

        setMessage(
          `WCHR ${wheelchairNumber} assigned successfully to ${agentName}.`
        );
      } catch (err) {
        console.error(
          "WCHR assignment error:",
          err
        );

        setError(
          err?.message ||
            "Unable to assign the wheelchair."
        );
      } finally {
        setAssigning(false);
      }
    };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
        display: "grid",
        gap:
          isMobile
            ? 12
            : 18,
        boxSizing: "border-box",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      {/* ====================================================== */}
      {/* HERO */}
      {/* ====================================================== */}

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
            gap: 15,
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
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                flex: "0 0 52px",
                borderRadius: 16,
                overflow: "hidden",
                background: "#ffffff",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
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
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                }}
              >
                {APP_NAME} {" | "} WCHR Dispatch
              </div>

              <h1
                style={{
                  margin: "5px 0 3px",
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
                WCHR Dispatch Center
              </h1>

              <div
                style={{
                  color:
                    "rgba(255,255,255,0.86)",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                Daily flights, wheelchair inventory, active agents and live
                assignment control.
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
              padding: "10px 13px",
              borderRadius: 14,
              background:
                "rgba(255,255,255,0.14)",
              border:
                "1px solid rgba(255,255,255,0.18)",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Dispatcher:{" "}
            {getVisibleName(user)}
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* MESSAGES */}
      {/* ====================================================== */}

      {error && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              background: "#fff1f2",
              border:
                "1px solid #fecdd3",
              borderRadius: 14,
              padding: "11px 13px",
              color: "#9f1239",
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              background: "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              borderRadius: 14,
              padding: "11px 13px",
              color: "#065f46",
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* TODAY'S FLIGHTS */}
      {/* ====================================================== */}

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
            alignItems:
              isMobile
                ? "stretch"
                : "flex-start",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "#1769aa",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Daily Operation
            </div>

            <h2
              style={{
                margin: "4px 0 3px",
                fontSize:
                  isMobile
                    ? 19
                    : 22,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              Today's Flights
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.55,
              }}
            >
              Only OPEN flights listed here are authorized for new WCHR passenger
              services. Passenger Intake must select one of these flights.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#ecfdf5",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                fontSize: 10.5,
                fontWeight: 900,
              }}
            >
              {openFlights.length} OPEN
            </span>

            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "#f8fafc",
                border:
                  "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: 10.5,
                fontWeight: 900,
              }}
            >
              {closedFlights.length} CLOSED
            </span>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding:
              isMobile
                ? 12
                : 14,
            background: "#f8fbff",
            border:
              "1px solid #dbeafe",
            borderRadius: 17,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                isMobile ||
                isTablet
                  ? "1fr"
                  : "0.7fr 1fr 0.7fr auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <FieldLabel>
                Airline *
              </FieldLabel>

              <TextInput
                value={airlineInput}
                onChange={
                  setAirlineInput
                }
                placeholder="AV"
                disabled={
                  savingFlight
                }
              />
            </div>

            <div>
              <FieldLabel>
                Flight Number *
              </FieldLabel>

              <TextInput
                value={
                  flightNumberInput
                }
                onChange={
                  setFlightNumberInput
                }
                placeholder="581"
                disabled={
                  savingFlight
                }
              />
            </div>

            <div>
              <FieldLabel>
                Gate
              </FieldLabel>

              <TextInput
                value={gateInput}
                onChange={
                  setGateInput
                }
                placeholder="F87"
                disabled={
                  savingFlight
                }
              />
            </div>

            <ActionButton
              variant="success"
              onClick={
                handleAddFlight
              }
              disabled={
                savingFlight ||
                !cleanText(
                  airlineInput
                ) ||
                !cleanText(
                  flightNumberInput
                )
              }
              style={{
                minHeight: 45,
                width:
                  isMobile ||
                  isTablet
                    ? "100%"
                    : "auto",
              }}
            >
              {savingFlight
                ? "Adding..."
                : "Add Flight"}
            </ActionButton>
          </div>
        </div>

        {loadingFlights ? (
          <div
            style={{
              marginTop: 14,
              padding: 18,
              textAlign: "center",
              borderRadius: 14,
              background: "#f8fbff",
              border:
                "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            Loading today's flights...
          </div>
        ) : dailyFlights.length === 0 ? (
          <div
            style={{
              marginTop: 14,
              padding: 18,
              textAlign: "center",
              borderRadius: 14,
              background: "#fff7ed",
              border:
                "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: 12,
              fontWeight: 750,
              lineHeight: 1.55,
            }}
          >
            No WCHR flights have been opened for today. Add the airline and
            flight number before passenger services begin.
          </div>
        ) : (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 9,
            }}
          >
            {dailyFlights.map(
              (flight) => (
                <DailyFlightCard
                  key={flight.id}
                  flight={flight}
                  busy={
                    busyFlightId ===
                    flight.id
                  }
                  onClose={
                    handleCloseFlight
                  }
                  onReopen={
                    handleReopenFlight
                  }
                  onDelete={
                    handleDeleteFlight
                  }
                />
              )
            )}
          </div>
        )}
      </PageCard>

      {/* ====================================================== */}
      {/* WCHR INVENTORY */}
      {/* ====================================================== */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#1769aa",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Equipment Control
          </div>

          <h2
            style={{
              margin: "4px 0 3px",
              fontSize:
                isMobile
                  ? 19
                  : 22,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Wheelchair Inventory
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            This inventory is the source used to prevent duplicate or
            nonexistent wheelchair numbers.
          </p>
        </div>

        <div
          style={{
            marginTop: 15,
            padding: 12,
            borderRadius: 15,
            background: "#f8fbff",
            border: "1px solid #dbeafe",
            display: "grid",
            gridTemplateColumns:
              isMobile ||
              isTablet
                ? "1fr"
                : "0.7fr 1fr auto",
            gap: 9,
            alignItems: "end",
          }}
        >
          <div>
            <FieldLabel>
              New WCHR Number
            </FieldLabel>

            <TextInput
              value={
                inventoryNumberInput
              }
              onChange={
                setInventoryNumberInput
              }
              placeholder="46"
              disabled={
                busyInventoryId ===
                "NEW"
              }
            />
          </div>

          <div>
            <FieldLabel>
              Starting Location
            </FieldLabel>

            <TextInput
              value={
                inventoryLocationInput
              }
              onChange={
                setInventoryLocationInput
              }
              placeholder="Wheelchair Storage"
              disabled={
                busyInventoryId ===
                "NEW"
              }
            />
          </div>

          <ActionButton
            variant="success"
            onClick={
              handleAddInventory
            }
            disabled={
              busyInventoryId ===
                "NEW" ||
              !cleanText(
                inventoryNumberInput
              )
            }
            style={{
              minHeight: 45,
            }}
          >
            {busyInventoryId ===
            "NEW"
              ? "Adding..."
              : "Add WCHR"}
          </ActionButton>
        </div>

        <div
          style={{
            marginTop: 15,
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(7, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <MetricCard
            label="Total"
            value={
              inventorySummary.total
            }
            tone="slate"
          />

          <MetricCard
            label="Available"
            value={
              inventorySummary.available
            }
            tone="green"
          />

          <MetricCard
            label="Ready"
            value={
              inventorySummary.ready
            }
            tone="blue"
          />

          <MetricCard
            label="In Service"
            value={
              inventorySummary.inService
            }
            tone="amber"
          />

          <MetricCard
            label="At Gate"
            value={
              inventorySummary.atGate
            }
            tone="amber"
          />

          <MetricCard
            label="Pending Storage"
            value={
              inventorySummary.pendingStorage
            }
            tone="amber"
          />

          <MetricCard
            label="Maintenance"
            value={
              inventorySummary.maintenance
            }
            tone="red"
          />
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          {[
            {
              value: "ALL",
              label: "All",
            },
            {
              value: "AVAILABLE",
              label: "Available",
            },
            {
              value: "READY_FOR_PICKUP",
              label: "Ready",
            },
            {
              value: "IN_USE",
              label: "In Service",
            },
            {
              value: "AT_GATE",
              label: "At Gate",
            },
            {
              value: "PENDING_STORAGE",
              label: "Pending Storage",
            },
            {
              value: "MAINTENANCE",
              label: "Maintenance",
            },
          ].map((filter) => (
            <ActionButton
              key={
                filter.value
              }
              variant={
                inventoryFilter ===
                filter.value
                  ? "primary"
                  : "secondary"
              }
              onClick={() =>
                setInventoryFilter(
                  filter.value
                )
              }
              style={{
                padding:
                  "7px 10px",
                fontSize: 11,
              }}
            >
              {filter.label}
            </ActionButton>
          ))}
        </div>

        {loadingInventory ? (
          <div
            style={{
              marginTop: 14,
              padding: 18,
              textAlign: "center",
              borderRadius: 14,
              background: "#f8fbff",
              border:
                "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            Loading wheelchair inventory...
          </div>
        ) : filteredInventory.length === 0 ? (
          <div
            style={{
              marginTop: 14,
              padding: 18,
              textAlign: "center",
              borderRadius: 14,
              background: "#f8fafc",
              border:
                "1px solid #e2e8f0",
              color: "#64748b",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            No wheelchairs match this inventory filter.
          </div>
        ) : (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 8,
              maxHeight:
                isMobile
                  ? "none"
                  : 430,
              overflowY:
                isMobile
                  ? "visible"
                  : "auto",
              paddingRight:
                isMobile
                  ? 0
                  : 2,
            }}
          >
            {filteredInventory.map(
              (item) => (
                <InventoryCard
                  key={item.id}
                  item={item}
                  busy={
                    busyInventoryId ===
                    item.id
                  }
                  onEdit={
                    handleEditInventory
                  }
                  onDelete={
                    handleDeleteInventory
                  }
                />
              )
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 13,
            background: "#eff6ff",
            border:
              "1px solid #bfdbfe",
            color: "#1d4ed8",
            fontSize: 11.5,
            lineHeight: 1.55,
            fontWeight: 750,
          }}
        >
          Personal wheelchairs are not part of company inventory. In the
          passenger entry page we will provide a separate{" "}
          <b>Personal WCHR</b> option so they do not consume an AeroStation
          inventory number.
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* ACTIVE SERVICE MANAGEMENT */}
      {/* ====================================================== */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#1769aa",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Supervisor Control
          </div>

          <h2
            style={{
              margin: "4px 0 3px",
              fontSize:
                isMobile
                  ? 19
                  : 22,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Active WCHR Services
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.55,
            }}
          >
            Reassign an active service with a required operational note, or
            complete it manually when the assigned agent did not finish the
            workflow.
          </p>
        </div>

        {activeReports.length > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: 13,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
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
                  }}
                >
                  Bulk Control
                </div>

                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    color: "#475569",
                    fontWeight: 750,
                  }}
                >
                  {bulkSelectedIds.length}/30 WCHRs selected
                </div>
              </div>

              <ActionButton
                variant="secondary"
                disabled={
                  bulkSaving ||
                  bulkSelectedIds.length ===
                    0
                }
                onClick={
                  clearBulkSelection
                }
                style={{
                  padding: "7px 10px",
                  fontSize: 11,
                }}
              >
                Clear Selection
              </ActionButton>
            </div>

            <div
              style={{
                marginTop: 11,
                display: "grid",
                gridTemplateColumns:
                  isMobile ||
                  isTablet
                    ? "1fr"
                    : "0.8fr 1fr auto",
                gap: 9,
                alignItems: "end",
              }}
            >
              <div>
                <FieldLabel>
                  Change Status
                </FieldLabel>

                <select
                  value={
                    bulkStatus
                  }
                  disabled={
                    bulkSaving
                  }
                  onChange={(
                    event
                  ) =>
                    setBulkStatus(
                      event.target.value
                    )
                  }
                  style={{
                    width: "100%",
                    minHeight: 44,
                    boxSizing: "border-box",
                    border: "1px solid #dbeafe",
                    borderRadius: 13,
                    padding: "10px 12px",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">
                    No Status Change
                  </option>
                  <option value="ASSIGNED">
                    Assigned
                  </option>
                  <option value="PICKED_UP">
                    Picked Up
                  </option>
                  <option value="IN_TRANSIT">
                    In Transit
                  </option>
                  <option value="AT_GATE">
                    At Gate / Delivered to Gate
                  </option>
                  <option value="BOARDING">
                    Boarding
                  </option>
                  <option value="BOARDED">
                    Boarded
                  </option>
                  <option value="PENDING_STORAGE">
                    Pending Storage
                  </option>
                  <option value="STORED">
                    Stored
                  </option>
                  <option value="COMPLETED">
                    Completed
                  </option>
                </select>
              </div>

              <div>
                <FieldLabel>
                  Change Location
                </FieldLabel>

                <TextInput
                  value={
                    bulkLocation
                  }
                  onChange={
                    setBulkLocation
                  }
                  placeholder="Example: Gate F87, Counter, Wheelchair Storage"
                  disabled={
                    bulkSaving
                  }
                />
              </div>

              <ActionButton
                variant="primary"
                disabled={
                  bulkSaving ||
                  bulkSelectedIds.length ===
                    0
                }
                onClick={
                  handleBulkApply
                }
                style={{
                  minHeight: 44,
                  width:
                    isMobile ||
                    isTablet
                      ? "100%"
                      : "auto",
                }}
              >
                {bulkSaving
                  ? "Applying..."
                  : `Apply to ${bulkSelectedIds.length || 0}`}
              </ActionButton>
            </div>

            <div
              style={{
                marginTop: 9,
                fontSize: 10.5,
                lineHeight: 1.55,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Select up to 30 WCHRs below. Status and Location apply to all
              selected WCHRs. Reassignment is selected individually for each
              WCHR so one active agent cannot accidentally receive multiple
              services.
            </div>
          </div>
        )}

        {activeReports.length ===
        0 ? (
          <div
            style={{
              marginTop: 14,
              padding: 18,
              textAlign: "center",
              borderRadius: 14,
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              color: "#166534",
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            No assigned WCHR services require supervisor management.
          </div>
        ) : (
          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr"
                  : "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 9,
            }}
          >
            {activeReports.map(
              (report) => {
                const delivered =
                  isDeliveredToGate(
                    report
                  );

                const alert =
                  shouldShow30MinuteAlert(
                    report,
                    now
                  );

                return (
                  <div
                    key={
                      report.id
                    }
                    style={{
                      border:
                        bulkSelectedIds.includes(
                          report.id
                        )
                          ? "2px solid #1769aa"
                          : alert
                          ? "2px solid #fca5a5"
                          : "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding: 13,
                      background:
                        alert
                          ? "#fff7f8"
                          : "#ffffff",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 9,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 850,
                        color: "#1769aa",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={
                          bulkSelectedIds.includes(
                            report.id
                          )
                        }
                        disabled={
                          bulkSaving ||
                          (
                            !bulkSelectedIds.includes(
                              report.id
                            ) &&
                            bulkSelectedIds.length >=
                              30
                          )
                        }
                        onChange={() =>
                          toggleBulkReport(
                            report.id
                          )
                        }
                        style={{
                          width: 16,
                          height: 16,
                        }}
                      />

                      Select for Bulk Control
                    </label>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 950,
                            color: "#0f172a",
                          }}
                        >
                          WCHR{" "}
                          {report.wheelchair_number ||
                            "\u2014"}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 11,
                            color: "#64748b",
                            fontWeight: 700,
                          }}
                        >
                          {report.passenger_name ||
                            "Passenger"}{" "}
                          {" | "}
                          {report.airline ||
                            ""}{" "}
                          {report.flight_number ||
                            ""}
                        </div>
                      </div>

                      <span
                        style={{
                          padding: "6px 9px",
                          borderRadius: 999,
                          background:
                            delivered
                              ? "#ecfdf5"
                              : "#eff6ff",
                          border:
                            delivered
                              ? "1px solid #bbf7d0"
                              : "1px solid #bfdbfe",
                          color:
                            delivered
                              ? "#166534"
                              : "#1769aa",
                          fontSize: 10,
                          fontWeight: 900,
                        }}
                      >
                        {getServiceStatusLabel(
                          report.service_status ||
                            report.tracking_status
                        )}
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "grid",
                        gridTemplateColumns:
                          "1fr 1fr",
                        gap: 7,
                      }}
                    >
                      <InfoField
                        label="Assigned Agent"
                        value={
                          report.wchr_agent_name ||
                          report.assigned_wchr_agent
                        }
                      />

                      <InfoField
                        label="Elapsed"
                        value={formatElapsedTime(
                          getServiceElapsedSeconds(
                            report,
                            now
                          )
                        )}
                      />
                    </div>

                    {alert && (
                      <div
                        style={{
                          marginTop: 9,
                          padding: "8px 10px",
                          borderRadius: 11,
                          background: "#fff1f2",
                          border: "1px solid #fecdd3",
                          color: "#9f1239",
                          fontSize: 10.5,
                          fontWeight: 900,
                        }}
                      >
                        30+ MINUTE TRANSPORT ALERT
                      </div>
                    )}

                    {delivered && (
                      <div
                        style={{
                          marginTop: 9,
                          padding: "8px 10px",
                          borderRadius: 11,
                          background: "#ecfdf5",
                          border: "1px solid #bbf7d0",
                          color: "#166534",
                          fontSize: 10.5,
                          fontWeight: 850,
                        }}
                      >
                        Delivered at Gate - 30 minute transport alert disabled.
                      </div>
                    )}

                    {bulkSelectedIds.includes(
                      report.id
                    ) && !delivered && (
                      <div
                        style={{
                          marginTop: 10,
                        }}
                      >
                        <FieldLabel>
                          Bulk Reassign To
                        </FieldLabel>

                        <select
                          value={
                            bulkReassignMap[
                              report.id
                            ] || ""
                          }
                          disabled={
                            bulkSaving
                          }
                          onChange={(
                            event
                          ) =>
                            setBulkReassignMap(
                              (previous) => ({
                                ...previous,
                                [report.id]:
                                  event.target.value,
                              })
                            )
                          }
                          style={{
                            width: "100%",
                            minHeight: 42,
                            boxSizing: "border-box",
                            border: "1px solid #dbeafe",
                            borderRadius: 12,
                            padding: "9px 11px",
                            background: "#ffffff",
                            color: "#0f172a",
                            fontSize: 12,
                            fontFamily: "inherit",
                          }}
                        >
                          <option value="">
                            Keep Current Agent
                          </option>

                          {availableAgents.map(
                            (agent) => (
                              <option
                                key={
                                  agent.id
                                }
                                value={
                                  agent.id
                                }
                              >
                                {getAgentName(
                                  agent
                                )} - {agent.current_location ||
                                  "Location not reported"}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 11,
                        display: "flex",
                        gap: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      {!delivered && (
                        <ActionButton
                          variant="warning"
                          disabled={
                            assigning
                          }
                          onClick={() =>
                            handleReassignReport(
                              report
                            )
                          }
                          style={{
                            padding: "8px 10px",
                            fontSize: 11,
                          }}
                        >
                          Reassign
                        </ActionButton>
                      )}

                      <ActionButton
                        variant="danger"
                        disabled={
                          assigning
                        }
                        onClick={() =>
                          handleForceComplete(
                            report
                          )
                        }
                        style={{
                          padding: "8px 10px",
                          fontSize: 11,
                        }}
                      >
                        Complete Manually
                      </ActionButton>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </PageCard>

      {/* ====================================================== */}
      {/* OPERATION METRICS */}
      {/* ====================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(5, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <MetricCard
          label="Punched In"
          value={agents.length}
          tone="slate"
        />

        <MetricCard
          label="Available"
          value={
            availableAgents.length
          }
          tone="green"
        />

        <MetricCard
          label="Busy"
          value={
            busyAgents.length
          }
          tone="amber"
        />

        <MetricCard
          label="Ready WCHRs"
          value={reports.length}
          tone="blue"
        />

        <MetricCard
          label="30+ Min"
          value={
            delayedReadyReports.length
          }
          tone="red"
        />
      </div>

      {/* ====================================================== */}
      {/* ASSIGNMENT CONTROL */}
      {/* ====================================================== */}

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
            display: "grid",
            gridTemplateColumns:
              isMobile ||
              isTablet
                ? "1fr"
                : "1fr 1fr auto",
            gap: 11,
            alignItems: "end",
          }}
        >
          <div>
            <div
              style={{
                marginBottom: 6,
                fontSize: 10,
                fontWeight: 900,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Selected WCHR
            </div>

            <div
              style={{
                minHeight: 46,
                display: "flex",
                alignItems: "center",
                borderRadius: 13,
                padding: "10px 12px",
                background: "#f8fbff",
                border:
                  "1px solid #dbeafe",
                fontSize: 13,
                color:
                  selectedReport
                    ? "#0f172a"
                    : "#94a3b8",
                fontWeight:
                  selectedReport
                    ? 850
                    : 650,
              }}
            >
              {selectedReport
                ? `WCHR ${
                    selectedReport.wheelchair_number ||
                    "\u2014"
                  } ${
                    selectedReport.passenger_name ||
                    "Passenger"
                  }`
                : "Select a wheelchair below"}
            </div>
          </div>

          <div>
            <div
              style={{
                marginBottom: 6,
                fontSize: 10,
                fontWeight: 900,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Selected Agent
            </div>

            <div
              style={{
                minHeight: 46,
                display: "flex",
                alignItems: "center",
                borderRadius: 13,
                padding: "10px 12px",
                background: "#f8fbff",
                border:
                  "1px solid #dbeafe",
                fontSize: 13,
                color:
                  selectedAgent
                    ? "#0f172a"
                    : "#94a3b8",
                fontWeight:
                  selectedAgent
                    ? 850
                    : 650,
              }}
            >
              {selectedAgent
                ? getAgentName(
                    selectedAgent
                  )
                : "Select an available agent below"}
            </div>
          </div>

          <ActionButton
            variant="success"
            disabled={
              !selectedReport ||
              !selectedAgent ||
              assigning
            }
            onClick={
              handleAssign
            }
            style={{
              width:
                isMobile ||
                isTablet
                  ? "100%"
                  : "auto",
              minHeight: 46,
            }}
          >
            {assigning
              ? "Assigning..."
              : "Assign WCHR"}
          </ActionButton>
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* READY WCHRS + ACTIVE AGENTS */}
      {/* ====================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile ||
            isTablet
              ? "1fr"
              : "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* ==================================================== */}
        {/* READY WCHRS */}
        {/* ==================================================== */}

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
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize:
                    isMobile
                      ? 18
                      : 20,
                  color: "#0f172a",
                  fontWeight: 900,
                }}
              >
                Ready for Pickup
              </h2>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Unassigned wheelchair services waiting at the counter or
                designated pickup location.
              </p>
            </div>

            <div
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                background: "#eff6ff",
                border:
                  "1px solid #bfdbfe",
                color: "#1769aa",
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              {reports.length}
            </div>
          </div>

          {loadingReports ? (
            <div
              style={{
                padding: 18,
                borderRadius: 14,
                background: "#f8fbff",
                border:
                  "1px solid #dbeafe",
                color: "#64748b",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 750,
              }}
            >
              Loading WCHRs...
            </div>
          ) : reports.length === 0 ? (
            <div
              style={{
                padding: 22,
                borderRadius: 16,
                background: "#ecfdf5",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                textAlign: "center",
                fontSize: 13,
                lineHeight: 1.55,
                fontWeight: 750,
              }}
            >
              No wheelchairs are currently waiting for assignment.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 9,
                maxHeight:
                  isMobile
                    ? "none"
                    : 700,
                overflowY:
                  isMobile
                    ? "visible"
                    : "auto",
                paddingRight:
                  isMobile
                    ? 0
                    : 2,
              }}
            >
              {reports.map(
                (report) => (
                  <ReadyWheelchairCard
                    key={report.id}
                    report={report}
                    now={now}
                    isMobile={isMobile}
                    selected={
                      report.id ===
                      selectedReportId
                    }
                    onSelect={
                      setSelectedReportId
                    }
                  />
                )
              )}
            </div>
          )}
        </PageCard>

        {/* ==================================================== */}
        {/* ACTIVE AGENTS */}
        {/* ==================================================== */}

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
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize:
                    isMobile
                      ? 18
                      : 20,
                  color: "#0f172a",
                  fontWeight: 900,
                }}
              >
                Active WCHR Agents
              </h2>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Only available agents without an active wheelchair can be
                selected for a new assignment.
              </p>
            </div>

            <div
              style={{
                borderRadius: 999,
                padding: "6px 10px",
                background: "#ecfdf5",
                border:
                  "1px solid #bbf7d0",
                color: "#166534",
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
              }}
            >
              {availableAgents.length} Available
            </div>
          </div>

          {loadingAgents ? (
            <div
              style={{
                padding: 18,
                borderRadius: 14,
                background: "#f8fbff",
                border:
                  "1px solid #dbeafe",
                color: "#64748b",
                textAlign: "center",
                fontSize: 12,
                fontWeight: 750,
              }}
            >
              Loading WCHR agents...
            </div>
          ) : agents.length === 0 ? (
            <div
              style={{
                padding: 22,
                borderRadius: 16,
                background: "#fff7ed",
                border:
                  "1px solid #fed7aa",
                color: "#9a3412",
                textAlign: "center",
                fontSize: 13,
                lineHeight: 1.55,
                fontWeight: 750,
              }}
            >
              No WCHR agents are currently punched in.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gap: 9,
                  maxHeight:
                    isMobile
                      ? "none"
                      : 700,
                  overflowY:
                    isMobile
                      ? "visible"
                      : "auto",
                }}
              >
                {agents.map(
                  (agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isMobile={
                        isMobile
                      }
                      selected={
                        agent.id ===
                        selectedAgentId
                      }
                      onSelect={
                        setSelectedAgentId
                      }
                    />
                  )
                )}
              </div>

              {breakAgents.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "9px 11px",
                    borderRadius: 12,
                    background: "#fefce8",
                    border:
                      "1px solid #fde68a",
                    color: "#854d0e",
                    fontSize: 11,
                    lineHeight: 1.5,
                    fontWeight: 750,
                  }}
                >
                  {breakAgents.length} active agent
                  {breakAgents.length === 1
                    ? ""
                    : "s"}{" "}
                  currently on break.
                </div>
              )}
            </>
          )}
        </PageCard>
      </div>

      {/* ====================================================== */}
      {/* SELECTED ASSIGNMENT PREVIEW */}
      {/* ====================================================== */}

      {selectedReport &&
        selectedAgent && (
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
                fontSize: 10,
                fontWeight: 900,
                color: "#1769aa",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Assignment Preview
            </div>

            <h2
              style={{
                margin: "5px 0 13px",
                fontSize:
                  isMobile
                    ? 19
                    : 22,
                color: "#0f172a",
                fontWeight: 900,
              }}
            >
              WCHR{" "}
              {selectedReport.wheelchair_number ||
                "\u2014"}{" "}
              {"\u2192"}{" "}
              {getAgentName(
                selectedAgent
              )}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  isMobile
                    ? "1fr"
                    : "repeat(4, minmax(0, 1fr))",
                gap: 9,
              }}
            >
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
                label="Pickup Location"
                value={
                  selectedReport.current_location ||
                  selectedReport.ready_location ||
                  "Counter"
                }
              />

              <InfoField
                label="Ready Since"
                value={formatDateTime(
                  getWheelchairTimerStart(
                    selectedReport
                  )
                )}
              />

              <InfoField
                label="Waiting Time"
                value={formatElapsedTime(
                  getServiceElapsedSeconds(
                    selectedReport,
                    now
                  )
                )}
              />

              <InfoField
                label="Agent Location"
                value={
                  selectedAgent.current_location ||
                  "Not reported"
                }
              />

              <InfoField
                label="Agent Status"
                value={getAvailabilityLabel(
                  selectedAgent.availability_status
                )}
              />
            </div>

            <div
              style={{
                marginTop: 13,
              }}
            >
              <ActionButton
                variant="success"
                disabled={assigning}
                onClick={
                  handleAssign
                }
                style={{
                  width:
                    isMobile
                      ? "100%"
                      : "auto",
                }}
              >
                {assigning
                  ? "Assigning..."
                  : `Assign WCHR ${
                      selectedReport.wheelchair_number ||
                      ""
                    } to ${getAgentName(
                      selectedAgent
                    )}`}
              </ActionButton>
            </div>
          </PageCard>
        )}

      {/* ====================================================== */}
      {/* FOOTER */}
      {/* ====================================================== */}

      <div
        style={{
          textAlign: "center",
          padding: "2px 8px 10px",
          fontSize: 10,
          color: "#94a3b8",
        }}
      >
        {APP_NAME} {" | "} {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WchrDispatchPage.jsx
