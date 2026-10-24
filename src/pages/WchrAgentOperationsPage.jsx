// src/pages/WchrAgentOperationsPage.jsx

import UmnrOperationsPanel from "../components/UmnrOperationsPanel.jsx";
import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { matchOperationalLocation } from "../utils/operationalGeofence.js";
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
  getVisibleUserName,
  getEmployeeIdentifier,
  punchInWchrAgent,
  punchOutWchrAgent,
  updateWchrAgentAvailability,
  updateWchrAgentLocation,
  addWchrTimelineEvent,
  getElapsedSeconds,
  formatElapsedTime,
} from "../utils/wchrOperations.js";

import {
  triggerWchrDeliveryPush,
} from "../utils/wchrAssignmentPush.js";

// ============================================================
// CONSTANTS
// ============================================================

const AGENT_LOCATIONS = [
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
  "CBP",
  "Main Terminal",
  "Rental Car",
  "First Floor Red Side",
  "First Floor Blue Side",
  "Wheelchair Storage",
  "Other",
];

const GATE_LOCATIONS = AGENT_LOCATIONS.filter((location) =>
  location.startsWith("Gate F")
);

const WCHR_INVENTORY_COLLECTION = "wchr_inventory";

const ROUTE_SAMPLES_COLLECTION = "operational_route_samples";
const ROUTE_POINT_MIN_DISTANCE_METERS = 8;
const ROUTE_POINT_MAX_GAP_MS = 30000;
const ROUTE_POINT_GOOD_ACCURACY_METERS = 80;

const IB_DESTINATIONS = [
  "Main Terminal",
  "Rental Car",
  "First Floor Red Side",
  "First Floor Blue Side",
];

const WCHR_STORAGE_LOCATIONS = [
  "Wheelchair Storage",
  "Main Terminal",
  "Rental Car",
  "First Floor Red Side",
  "First Floor Blue Side",
  "Airside F",
  "Other",
];

const IB_STATUS = {
  WAITING: "IB_WAITING",
  ACCEPTED: "IB_ACCEPTED",
  IN_TRANSIT: "IB_IN_TRANSIT",
  DELIVERED: "IB_DELIVERED",
};

const SERVICE_STATUS_ORDER = {
  READY_FOR_PICKUP: 1,
  ASSIGNED: 2,
  ACCEPTED: 3,
  PICKED_UP: 4,
  IN_TRANSIT: 5,
  AT_GATE: 6,
  BOARDING: 7,
  BOARDED: 8,
  PENDING_STORAGE: 9,
  STORED: 10,
  IB_WAITING: 1,
  IB_ACCEPTED: 2,
  IB_IN_TRANSIT: 3,
  IB_DELIVERED: 4,
};

// ============================================================
// HELPERS
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getEmployeeName(employee) {
  return (
    employee?.name ||
    employee?.fullName ||
    employee?.displayName ||
    employee?.employeeName ||
    employee?.loginUsername ||
    "Employee"
  );
}

function getTimestampMillis(value) {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? 0
    : parsed.getTime();
}

function haversineMeters(first, second) {
  if (!first || !second) return Infinity;
  const lat1 = Number(first.latitude);
  const lon1 = Number(first.longitude);
  const lat2 = Number(second.latitude);
  const lon2 = Number(second.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRouteLearningContext(report) {
  if (!report?.id) return null;
  const direction = safeUpper(report?.service_direction) === "IB" ? "IB" : "OB";
  const status = safeUpper(
    direction === "IB"
      ? report?.ib_status || report?.service_status || report?.tracking_status
      : report?.service_status || report?.tracking_status
  );

  if (direction === "IB") {
    if (status !== IB_STATUS.IN_TRANSIT) return null;
    return {
      direction,
      origin: cleanText(report?.ib_pickup_location || report?.pickup_location) || "CBP",
      originId: cleanText(report?.ib_pickup_location_id || report?.pickup_location_id),
      destination: cleanText(report?.ib_destination),
      destinationId: cleanText(report?.ib_destination_id),
    };
  }

  if (!["PICKED_UP", "IN_TRANSIT"].includes(status)) return null;
  const rawGate = cleanText(report?.gate_location || report?.gate);
  const destination = rawGate
    ? rawGate.toUpperCase().startsWith("GATE ")
      ? rawGate
      : `Gate ${rawGate}`
    : "";
  return {
    direction,
    origin: cleanText(
      report?.pickup_location ||
        report?.initial_pickup_location ||
        report?.ready_location ||
        report?.current_location
    ),
    originId: cleanText(
      report?.pickup_location_id ||
        report?.initial_pickup_location_id ||
        report?.ready_location_id
    ),
    destination,
    destinationId: cleanText(report?.gate_location_id),
  };
}

function formatTimestamp(value) {
  const millis = getTimestampMillis(value);

  if (!millis) return "\u2014";

  const date = new Date(millis);

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getAssignmentTimerStart(report) {
  if (safeUpper(report?.service_direction) === "IB") {
    return report?.ib_transit_started_at || report?.timer_started_at || null;
  }

  return (
    report?.timer_started_at ||
    report?.ready_for_pickup_at ||
    report?.submitted_at ||
    report?.created_at ||
    report?.assigned_at ||
    report?.pickup_at ||
    null
  );
}

function getAssignmentElapsedSeconds(report, now) {
  if (!report) return 0;

  return getElapsedSeconds(
    getAssignmentTimerStart(report),
    now
  );
}

function getAssignmentMinutes(report, now) {
  return Math.floor(
    getAssignmentElapsedSeconds(report, now) / 60
  );
}

function getStatusLabel(value) {
  const status = safeUpper(value);

  if (status === WCHR_AGENT_AVAILABILITY.AVAILABLE) {
    return "Available";
  }

  if (status === WCHR_AGENT_AVAILABILITY.BUSY) {
    return "Busy";
  }

  if (status === WCHR_AGENT_AVAILABILITY.BREAK) {
    return "Break";
  }

  if (status === WCHR_AGENT_AVAILABILITY.UNAVAILABLE) {
    return "Unavailable";
  }

  return status || "Unknown";
}

function getServiceStatusLabel(value) {
  const status = safeUpper(value);

  const labels = {
    READY_FOR_PICKUP: "Ready for Pickup",
    ASSIGNED: "Assigned",
    ACCEPTED: "Accepted",
    PICKED_UP: "Picked Up",
    IN_TRANSIT: "In Transit",
    AT_GATE: "At Gate",
    BOARDING: "Boarding",
    BOARDED: "Boarded",
    PENDING_STORAGE: "Pending Storage",
    STORED: "Stored",
    COMPLETED: "Passenger Delivered",
    CANCELLED: "Cancelled",
    IB_WAITING: "IB Waiting for Agent",
    IB_ACCEPTED: "IB Passenger Accepted",
    IB_IN_TRANSIT: "IB In Transit",
    IB_DELIVERED: "IB Delivered",
  };

  return labels[status] || status || "In Progress";
}

function getCurrentServiceStatus(report) {
  return safeUpper(
    report?.service_status ||
      report?.tracking_status ||
      WCHR_SERVICE_STATUS.ASSIGNED
  );
}

function statusAtLeast(currentStatus, expectedStatus) {
  const current = SERVICE_STATUS_ORDER[safeUpper(currentStatus)] || 0;
  const expected = SERVICE_STATUS_ORDER[safeUpper(expectedStatus)] || 0;

  return current >= expected;
}

function isGateLocation(location) {
  return GATE_LOCATIONS.includes(cleanText(location));
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function getInventoryWheelchairNumber(item) {
  return cleanText(
    item?.wheelchair_number ||
      item?.number ||
      item?.wchr_number ||
      item?.wheelchairNumber
  );
}

function isInventoryAvailable(item) {
  const status = safeUpper(item?.status);
  return item?.is_available === true || status === "AVAILABLE";
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

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet:
      width >= 768 &&
      width < 1100,
  };
}

// ============================================================
// SMALL UI COMPONENTS
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

function FieldLabel({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 10.5,
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

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        borderRadius: 13,
        padding: "11px 13px",
        background: props.disabled
          ? "#f8fafc"
          : "#ffffff",
        color: "#0f172a",
        fontSize: 14,
        fontFamily: "inherit",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        borderRadius: 13,
        padding: "11px 13px",
        background: props.disabled
          ? "#f8fafc"
          : "#ffffff",
        color: "#0f172a",
        fontSize: 14,
        fontFamily: "inherit",
        resize: "vertical",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  style = {},
}) {
  const variants = {
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
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 850,
        fontFamily: "inherit",
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function InfoField({ label, value }) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 14,
        padding: "10px 11px",
        background: "#f8fbff",
        border: "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#94a3b8",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 13,
          lineHeight: 1.4,
          fontWeight: 750,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value || "\u2014"}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const normalized = safeUpper(status);

  let background = "#f8fafc";
  let color = "#334155";
  let border = "#e2e8f0";

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.AVAILABLE
  ) {
    background = "#ecfdf5";
    color = "#166534";
    border = "#bbf7d0";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.BUSY
  ) {
    background = "#fff7ed";
    color = "#9a3412";
    border = "#fed7aa";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.BREAK
  ) {
    background = "#fefce8";
    color = "#854d0e";
    border = "#fde68a";
  }

  if (
    normalized ===
    WCHR_AGENT_AVAILABILITY.UNAVAILABLE
  ) {
    background = "#fff1f2";
    color = "#9f1239";
    border = "#fecdd3";
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
      {getStatusLabel(normalized)}
    </span>
  );
}

function ServiceStep({
  number,
  title,
  subtitle,
  completed,
  active,
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 11px",
        borderRadius: 14,
        background: completed
          ? "#ecfdf5"
          : active
          ? "#eff6ff"
          : "#f8fafc",
        border: completed
          ? "1px solid #bbf7d0"
          : active
          ? "1px solid #bfdbfe"
          : "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 26px",
          background: completed
            ? "#16a34a"
            : active
            ? "#1769aa"
            : "#cbd5e1",
          color: "#ffffff",
          fontSize: 11,
          fontWeight: 900,
        }}
      >
        {completed ? "OK" : number}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 900,
            color: completed
              ? "#166534"
              : active
              ? "#1769aa"
              : "#475569",
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 2,
            fontSize: 10.5,
            color: "#64748b",
            lineHeight: 1.45,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function WchrAgentOperationsPage() {
  const { user } = useUser();

  const {
    isMobile,
    isTablet,
  } = useViewport();

  const [employee, setEmployee] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(true);

  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  const [umnrCapacity, setUmnrCapacity] = useState(0);

  const [activeReport, setActiveReport] = useState(null);

  const [ibAvailablePassengers, setIbAvailablePassengers] = useState([]);
  const [ibPassengersLoading, setIbPassengersLoading] = useState(true);
  const [availableInventory, setAvailableInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [selectedIbWheelchairId, setSelectedIbWheelchairId] = useState("");
  const [selectedIbDestination, setSelectedIbDestination] = useState(
    IB_DESTINATIONS[0]
  );
  const [selectedStorageLocation, setSelectedStorageLocation] = useState(
    WCHR_STORAGE_LOCATIONS[0]
  );

  const [trackingConsent, setTrackingConsent] = useState(false);
  const [lobbyMode, setLobbyMode] = useState(null); // Explicit choice each shift
  const [lobbyPromptOpen, setLobbyPromptOpen] = useState(false);
  const [operationalZones, setOperationalZones] = useState([]);
  const [zoneLoadError, setZoneLoadError] = useState("");
  const [autoLocationStatus, setAutoLocationStatus] = useState("Waiting for GPS");
  useEffect(() => onSnapshot(collection(db, "operational_locations"), snap => {
    setOperationalZones(snap.docs.map(d => ({id:d.id,...d.data()})).filter(x=>x.active!==false));
    setZoneLoadError("");
  }, err => { setZoneLoadError("Location catalog unavailable: " + err.message); }), []);

  const [selectedLocation, setSelectedLocation] = useState("Counter");
  const [locationNote, setLocationNote] = useState("");

  const [assignmentDecisionOpen, setAssignmentDecisionOpen] = useState(false);
  const [assignmentRejectReason, setAssignmentRejectReason] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());

  // ============================================================
  // LIVE TIMER
  // ============================================================

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // ============================================================
  // FIND EMPLOYEE PROFILE
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadEmployee() {
      if (!user) {
        setEmployee(null);
        setEmployeeLoading(false);
        return;
      }

      try {
        setEmployeeLoading(true);
        setError("");

        const linkedEmployeeId = cleanText(user?.employeeId);

        if (linkedEmployeeId) {
          const snapshot = await getDoc(
            doc(db, "employees", linkedEmployeeId)
          );

          if (snapshot.exists()) {
            if (!cancelled) {
              setEmployee({
                id: snapshot.id,
                ...snapshot.data(),
              });
            }

            return;
          }
        }

        const usernames = Array.from(
          new Set(
            [user?.username, user?.loginUsername]
              .map(normalizeText)
              .filter(Boolean)
          )
        );

        for (const username of usernames) {
          const employeeQuery = query(
            collection(db, "employees"),
            where("loginUsername", "==", username)
          );

          const employeeSnapshot = await getDocs(employeeQuery);

          if (!employeeSnapshot.empty) {
            const first = employeeSnapshot.docs[0];

            if (!cancelled) {
              setEmployee({
                id: first.id,
                ...first.data(),
              });
            }

            return;
          }
        }

        if (!cancelled) {
          setEmployee(null);
          setError(
            "Your AeroStation Hub account is not linked to an employee profile."
          );
        }
      } catch (err) {
        console.error(
          "Could not resolve WCHR employee:",
          err
        );

        if (!cancelled) {
          setEmployee(null);
          setError(
            "Could not load your employee profile."
          );
        }
      } finally {
        if (!cancelled) {
          setEmployeeLoading(false);
        }
      }
    }

    loadEmployee();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.uid,
    user?.employeeId,
    user?.username,
    user?.loginUsername,
  ]);

  // ============================================================
  // AGENT ID
  // ============================================================

  const agentId = useMemo(
    () => getEmployeeIdentifier(employee, user),
    [employee, user]
  );

  // ============================================================
  // LIVE SHIFT
  // ============================================================

  useEffect(() => {
    if (!agentId) {
      setShift(null);
      setShiftLoading(false);
      return undefined;
    }

    setShiftLoading(true);

    const shiftRef = doc(
      db,
      "wchr_agent_shifts",
      agentId
    );

    const unsubscribe = onSnapshot(
      shiftRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = {
            id: snapshot.id,
            ...snapshot.data(),
          };

          setShift(data);

          if (data.current_location) {
            setSelectedLocation(data.current_location);
          }

          setTrackingConsent(
            data.live_tracking_consent === true
          );
        } else {
          setShift(null);
        }

        setShiftLoading(false);
      },
      (err) => {
        console.error(
          "Error listening WCHR agent shift:",
          err
        );

        setShiftLoading(false);
        setError("Could not load your WCHR shift.");
      }
    );

    return () => unsubscribe();
  }, [agentId]);

  // ============================================================
  // UMNR CAPACITY LOCK
  // ============================================================

  useEffect(() => {
    if (!agentId || import.meta.env.VITE_UMNR_ENABLED !== "true") {
      setUmnrCapacity(0);
      return undefined;
    }

    const capacityRef = doc(db, "umnr_agent_capacity", agentId);

    const unsubscribe = onSnapshot(
      capacityRef,
      (snapshot) => {
        const count = snapshot.exists()
          ? Number(snapshot.data()?.count || 0)
          : 0;
        setUmnrCapacity(Number.isFinite(count) ? Math.max(0, count) : 0);
      },
      (err) => {
        console.error("Error listening UMNR capacity:", err);
        // Fail closed while UMNR is enabled: do not treat an unknown lock as free.
        setUmnrCapacity(10);
      }
    );

    return () => unsubscribe();
  }, [agentId]);

  const hasActiveUmnr = umnrCapacity > 0;

  // ============================================================
  // ACTIVE REPORT LISTENER
  // ============================================================

  const activeReportId = cleanText(
    shift?.active_report_id
  );

  useEffect(() => {
    if (!activeReportId) {
      setActiveReport(null);
      return undefined;
    }

    const reportRef = doc(
      db,
      "wch_reports",
      activeReportId
    );

    const unsubscribe = onSnapshot(
      reportRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = {
            id: snapshot.id,
            ...snapshot.data(),
          };

          setActiveReport(data);

          if (data.current_location) {
            setSelectedLocation(data.current_location);
          }
        } else {
          setActiveReport(null);
        }
      },
      (err) => {
        console.error(
          "Error listening active WCHR:",
          err
        );
      }
    );

    return () => unsubscribe();
  }, [activeReportId]);

  // Open automatically when Dispatch assigns a new outbound WCHR.
  useEffect(() => {
    if (!activeReport?.id || !agentId) return;
    const assignedId = cleanText(activeReport.wchr_agent_id || activeReport.assigned_agent_id);
    const status = safeUpper(activeReport.service_status || activeReport.tracking_status);
    const pending = ["ASSIGNED", "READY_FOR_PICKUP"].includes(status) &&
      !activeReport.assignment_accepted_at &&
      safeUpper(activeReport.assignment_status) !== "ACCEPTED" &&
      safeUpper(activeReport.service_direction) !== "IB" &&
      cleanText(shift?.active_report_id) === cleanText(activeReport.id) &&
      (!assignedId || assignedId === agentId);
    if (pending) {
      setAssignmentRejectReason("");
      setAssignmentDecisionOpen(true);
    } else {
      setAssignmentDecisionOpen(false);
    }
  }, [activeReport?.id, activeReport?.assignment_status, activeReport?.assignment_accepted_at,
      activeReport?.service_status, activeReport?.tracking_status, agentId, shift?.active_report_id]);

  // ============================================================
  // LIVE IB PASSENGER LIST
  // ============================================================

  useEffect(() => {
    const ibQuery = query(
      collection(db, "wch_reports"),
      where("service_direction", "==", "IB")
    );

    setIbPassengersLoading(true);

    const unsubscribe = onSnapshot(
      ibQuery,
      (snapshot) => {
        const todayKey = getTodayKey();
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((report) => {
            const reportDate = cleanText(report.service_date || report.flight_date);
            const status = safeUpper(
              report.ib_status || report.service_status || report.tracking_status
            );

            return (
              reportDate === todayKey &&
              report.ib_passenger_available === true &&
              status === IB_STATUS.WAITING &&
              !cleanText(report.assigned_agent_id || report.wchr_agent_id)
            );
          })
          .sort((a, b) => {
            const flightCompare = cleanText(a.flight_number).localeCompare(
              cleanText(b.flight_number)
            );
            if (flightCompare !== 0) return flightCompare;
            return cleanText(a.passenger_name).localeCompare(cleanText(b.passenger_name));
          });

        setIbAvailablePassengers(rows);
        setIbPassengersLoading(false);
      },
      (err) => {
        console.error("IB passenger listener error:", err);
        setIbPassengersLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ============================================================
  // LIVE AVAILABLE WCHR INVENTORY
  // ============================================================

  useEffect(() => {
    setInventoryLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, WCHR_INVENTORY_COLLECTION),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => {
            const number = safeUpper(getInventoryWheelchairNumber(item));
            return number && number !== "PERSONAL_WCHR" && isInventoryAvailable(item);
          })
          .sort((a, b) =>
            getInventoryWheelchairNumber(a).localeCompare(
              getInventoryWheelchairNumber(b),
              undefined,
              { numeric: true, sensitivity: "base" }
            )
          );

        setAvailableInventory(rows);
        setInventoryLoading(false);
      },
      (err) => {
        console.error("WCHR inventory listener error:", err);
        setInventoryLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (safeUpper(activeReport?.service_direction) !== "IB") {
      setSelectedIbWheelchairId("");
      setSelectedIbDestination(IB_DESTINATIONS[0]);
      setSelectedStorageLocation(WCHR_STORAGE_LOCATIONS[0]);
      return;
    }

    setSelectedIbWheelchairId(
      cleanText(activeReport?.inventory_doc_id || activeReport?.inventory_id)
    );
    setSelectedIbDestination(
      cleanText(activeReport?.ib_destination) || IB_DESTINATIONS[0]
    );
  }, [
    activeReport?.id,
    activeReport?.service_direction,
    activeReport?.inventory_doc_id,
    activeReport?.inventory_id,
    activeReport?.ib_destination,
  ]);

  // ============================================================
  // DERIVED VALUES
  // ============================================================

  const isPunchedIn =
    safeUpper(shift?.status) ===
    WCHR_AGENT_STATUS.ACTIVE;

  // ============================================================
  // PASSIVE ROUTE LEARNING
  // ============================================================
  // Uses the existing consented foreground GPS watcher. It does not create
  // a second geolocation watcher. Each real WCHR journey becomes one sample.
  let routePointMemory = null;

  const savePassiveRoutePoint = async ({ report, position, zone }) => {
    const context = getRouteLearningContext(report);
    if (!context || !agentId || !position?.coords) return;

    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const nowMs = Date.now();
    const current = {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      zoneId: zone?.id || "",
      zoneName: zone?.name || "",
      recordedAtMs: nowMs,
    };

    const previous = routePointMemory;
    const movedMeters = previous ? haversineMeters(previous, current) : Infinity;
    const zoneChanged = Boolean(
      current.zoneId && current.zoneId !== (previous?.zoneId || "")
    );
    const gapMs = previous ? nowMs - previous.recordedAtMs : Infinity;

    if (
      previous &&
      movedMeters < ROUTE_POINT_MIN_DISTANCE_METERS &&
      !zoneChanged &&
      gapMs < ROUTE_POINT_MAX_GAP_MS
    ) {
      return;
    }

    const sampleRef = doc(db, ROUTE_SAMPLES_COLLECTION, report.id);
    const pointRef = doc(collection(sampleRef, "points"));
    const accuracyMeters = Number.isFinite(accuracy) ? Math.round(accuracy) : null;
    const pointQuality =
      accuracyMeters === null
        ? "UNKNOWN"
        : accuracyMeters <= 35
        ? "HIGH"
        : accuracyMeters <= ROUTE_POINT_GOOD_ACCURACY_METERS
        ? "USABLE"
        : "LOW";

    await setDoc(
      sampleRef,
      {
        sample_id: report.id,
        report_doc_id: report.id,
        report_id: report.report_id || report.id,
        service_type: "WCHR",
        service_direction: context.direction,
        airline: report.airline || "",
        flight_number: report.flight_number || "",
        service_date: report.service_date || report.flight_date || "",
        wheelchair_number: report.wheelchair_number || "",
        agent_id: agentId,
        agent_name: getEmployeeName(employee),
        origin_name: context.origin || "",
        origin_location_id: context.originId || "",
        destination_name: context.destination || "",
        destination_location_id: context.destinationId || "",
        learning_status: "RECORDING",
        source: "WCHR_LIVE_SERVICE",
        consent_source: "live_tracking_consent",
        last_point_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(pointRef, {
      latitude,
      longitude,
      accuracy_m: accuracyMeters,
      accuracy_quality: pointQuality,
      usable_for_learning:
        accuracyMeters !== null &&
        accuracyMeters <= ROUTE_POINT_GOOD_ACCURACY_METERS,
      operational_location_id: current.zoneId,
      operational_location_name: current.zoneName,
      service_status: safeUpper(
        report.service_status || report.tracking_status || report.ib_status
      ),
      recorded_at: serverTimestamp(),
      recorded_at_client_ms: nowMs,
      source: "browser_geolocation",
    });

    routePointMemory = current;
  };

  const initializePassiveRouteSample = async ({ report, origin, destination, direction }) => {
    if (!report?.id || !agentId) return;
    const nowMs = Date.now();
    await setDoc(
      doc(db, ROUTE_SAMPLES_COLLECTION, report.id),
      {
        sample_id: report.id,
        report_doc_id: report.id,
        report_id: report.report_id || report.id,
        service_type: "WCHR",
        service_direction: direction,
        airline: report.airline || "",
        flight_number: report.flight_number || "",
        service_date: report.service_date || report.flight_date || "",
        wheelchair_number: report.wheelchair_number || "",
        agent_id: agentId,
        agent_name: getEmployeeName(employee),
        origin_name: origin || "",
        destination_name: destination || "",
        learning_status: "RECORDING",
        source: "WCHR_LIVE_SERVICE",
        consent_source: "live_tracking_consent",
        started_at: serverTimestamp(),
        started_at_client_ms: nowMs,
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const finalizePassiveRouteSample = async ({ report, destination, completionType }) => {
    if (!report?.id || !agentId) return;
    try {
      const sampleRef = doc(db, ROUTE_SAMPLES_COLLECTION, report.id);
      const sampleSnapshot = await getDoc(sampleRef);
      const sample = sampleSnapshot.exists() ? sampleSnapshot.data() || {} : {};
      const completedMs = Date.now();
      const reportStartedMs = getTimestampMillis(
        safeUpper(report?.service_direction) === "IB"
          ? report?.ib_transit_started_at || report?.timer_started_at
          : report?.pickup_at || report?.picked_up_at || report?.in_transit_at
      );
      const startedMs = Number(sample.started_at_client_ms || 0) || reportStartedMs;
      const durationSeconds = startedMs
        ? Math.max(0, Math.round((completedMs - startedMs) / 1000))
        : null;
      await setDoc(
        sampleRef,
        {
          sample_id: report.id,
          report_doc_id: report.id,
          report_id: report.report_id || report.id,
          service_type: "WCHR",
          service_direction:
            safeUpper(report?.service_direction) === "IB" ? "IB" : "OB",
          agent_id: agentId,
          agent_name: getEmployeeName(employee),
          destination_name: destination || sample.destination_name || "",
          learning_status: "COMPLETED",
          completion_type: completionType,
          completed_at: serverTimestamp(),
          completed_at_client_ms: completedMs,
          duration_seconds: durationSeconds,
          duration_minutes:
            durationSeconds === null
              ? null
              : Number((durationSeconds / 60).toFixed(2)),
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (routeError) {
      console.warn("Passive route sample finalization failed:", routeError);
    }
  };

  // Geofenced operational location for both Lobby and WCHR Agents.
  // Requires explicit consent and a foreground browser with location permission.
  const [gpsState, setGpsState] = useState("inactive");
  useEffect(() => {
    if (!agentId || !isPunchedIn || shift?.live_tracking_consent !== true) {
      setGpsState("inactive"); return undefined;
    }
    if (!navigator.geolocation) { setGpsState("unsupported"); return undefined; }
    let cancelled=false, lastSaved=0, candidate="", consecutive=0;
    setGpsState("waiting");
    const watcher=navigator.geolocation.watchPosition(async position => {
      if(cancelled) return;
      const {latitude,longitude,accuracy}=position.coords;
      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)) return;
      const zone=matchOperationalLocation(position.coords,operationalZones);
      const name=zone?.name||"";
      if(name && name===candidate) consecutive++; else { candidate=name; consecutive=1; }
      const confirmed=Boolean(name && consecutive>=2);
      setGpsState("active");
      setAutoLocationStatus(confirmed?`Detected: ${name}`:name?`Verifying: ${name}`:"Location not detected (GPS uncertain or outside saved areas)");
      const nowMs=Date.now();
      if(nowMs-lastSaved<15000) return;
      lastSaved=nowMs;
      try {
        const fields={live_gps:{latitude,longitude,accuracy_m:accuracy??null,recorded_at:serverTimestamp(),source:"browser_geolocation"}};
        if(confirmed && name!==shift?.current_location) {
          fields.current_location=name;
          fields.location_source="gps_geofence";
          fields.location_id=zone.id;
          fields.location_updated_at=serverTimestamp();
        }
        await updateDoc(doc(db,"wchr_agent_shifts",agentId),fields);
        if (activeReport?.id) {
          try {
            await savePassiveRoutePoint({ report: activeReport, position, zone });
          } catch (routeError) {
            console.warn("Passive route point save failed:", routeError);
          }
        }
      } catch(err) { console.error("Geofence GPS update failed",err); setGpsState("save-error"); }
    }, err=>{setGpsState(err.code===1?"permission-denied":"unavailable");setAutoLocationStatus("GPS unavailable");},
    {enableHighAccuracy:true,maximumAge:10000,timeout:20000});
    return ()=>{cancelled=true;navigator.geolocation.clearWatch(watcher);};
  },[agentId,isPunchedIn,shift?.live_tracking_consent,shift?.current_location,operationalZones,activeReport?.id,activeReport?.service_status,activeReport?.tracking_status,activeReport?.ib_status]);

  const availability = safeUpper(
    shift?.availability_status
  );

  const isBusy =
    availability ===
      WCHR_AGENT_AVAILABILITY.BUSY ||
    Boolean(activeReportId) ||
    hasActiveUmnr;

  const shiftElapsedSeconds = isPunchedIn
    ? getElapsedSeconds(
        shift?.clock_in_at,
        now
      )
    : 0;

  const assignmentElapsedSeconds = activeReport
    ? getAssignmentElapsedSeconds(
        activeReport,
        now
      )
    : 0;

  const assignmentMinutes = activeReport
    ? getAssignmentMinutes(
        activeReport,
        now
      )
    : 0;

  const currentServiceStatus = getCurrentServiceStatus(
    activeReport
  );

  const assignmentOver30 =
    assignmentMinutes >= 30 &&
    (safeUpper(activeReport?.service_direction) !== "IB" ||
      Boolean(activeReport?.ib_transit_started_at)) &&
    ![
      "AT_GATE",
      "BOARDING",
      "BOARDED",
      "PENDING_STORAGE",
      "STORED",
      "COMPLETED",
      IB_STATUS.DELIVERED,
    ].includes(
      currentServiceStatus
    ) &&
    activeReport?.passenger_delivered_to_gate !==
      true &&
    !activeReport?.gate_arrived_at &&
    !activeReport?.passenger_delivered_to_gate_at &&
    activeReport?.transport_alert_active !==
      false;

  const hasAccepted =
    Boolean(activeReport?.assignment_accepted_at) ||
    statusAtLeast(
      currentServiceStatus,
      "ACCEPTED"
    );

  const hasPickedUp = statusAtLeast(
    currentServiceStatus,
    WCHR_SERVICE_STATUS.PICKED_UP
  );

  const isInTransit = statusAtLeast(
    currentServiceStatus,
    WCHR_SERVICE_STATUS.IN_TRANSIT
  );

  const isAtGate = statusAtLeast(
    currentServiceStatus,
    WCHR_SERVICE_STATUS.AT_GATE
  );

  const isInboundReport =
    safeUpper(activeReport?.service_direction) === "IB";

  const inboundStatus = safeUpper(
    activeReport?.ib_status || currentServiceStatus
  );

  const ibHasAccepted =
    isInboundReport &&
    (Boolean(activeReport?.ib_accepted_at) ||
      [IB_STATUS.ACCEPTED, IB_STATUS.IN_TRANSIT, IB_STATUS.DELIVERED].includes(
        inboundStatus
      ));

  const ibIsInTransit =
    isInboundReport &&
    (Boolean(activeReport?.ib_transit_started_at) ||
      [IB_STATUS.IN_TRANSIT, IB_STATUS.DELIVERED].includes(inboundStatus));

  const ibIsDelivered =
    isInboundReport &&
    (Boolean(activeReport?.ib_delivered_at) || inboundStatus === IB_STATUS.DELIVERED);

  const ibTransitElapsedSeconds =
    isInboundReport && activeReport?.ib_transit_started_at && !ibIsDelivered
      ? getElapsedSeconds(activeReport.ib_transit_started_at, now)
      : isInboundReport
      ? Number(activeReport?.ib_transit_seconds || 0)
      : 0;

  // ============================================================
  // PUNCH IN
  // ============================================================

  const handlePunchIn = async () => {
    if (!employee) {
      setError("Employee profile not found.");
      return;
    }

    try {
      setBusyAction("punch-in");
      setError("");
      setMessage("");

      let startingLocation="Location Not Detected";
      if (trackingConsent && operationalZones.length && navigator.geolocation) {
        try {
          const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));
          const match=matchOperationalLocation(position.coords,operationalZones);
          if(match) startingLocation=match.name;
        } catch(err) { console.warn("Punch In GPS unavailable",err); }
      }

      if (lobbyMode === null) {
        setError("Please choose whether you will work as a Lobby Agent today.");
        return;
      }

      await punchInWchrAgent({
        lobbyMode,
        employee,
        user,
        trackingConsent,
        startingLocation,
      });

      setLobbyPromptOpen(false);
      setMessage(`Punched In at ${startingLocation}. GPS will update the area while this page is open and permission is granted.`);
    } catch (err) {
      console.error("Punch In error:", err);

      setError(
        err?.message ||
          "Unable to Punch In."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // PUNCH OUT
  // ============================================================

  const handlePunchOut = async () => {
    if (!agentId) return;

    const confirmed = window.confirm(
      "Punch Out from WCHR operations?"
    );

    if (!confirmed) return;

    try {
      setBusyAction("punch-out");
      setError("");
      setMessage("");

      await punchOutWchrAgent({
        agentId,
        user,
      });

      setLobbyMode(null);
      setMessage("Punch Out completed.");
    } catch (err) {
      console.error("Punch Out error:", err);

      setError(
        err?.message ||
          "Unable to Punch Out."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // AVAILABILITY CHANGE
  // ============================================================

  const handleAvailability = async (value) => {
    if (!agentId || !isPunchedIn) return;

    if (isBusy) {
      setError(
        hasActiveUmnr
          ? "Availability cannot be changed while UMNR services are assigned to you."
          : "Availability cannot be changed while a wheelchair is assigned to you."
      );
      return;
    }

    try {
      setBusyAction("availability");
      setError("");
      setMessage("");

      await updateWchrAgentAvailability({
        agentId,
        availability: value,
      });

      setMessage(
        `Availability changed to ${getStatusLabel(value)}.`
      );
    } catch (err) {
      console.error("Availability error:", err);

      setError(
        err?.message ||
          "Unable to change availability."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // WCHR INVENTORY SYNC
  // ============================================================

  async function findAssignedInventoryItem(report) {
    if (!report) return null;

    const directInventoryId =
      cleanText(
        report.inventory_doc_id ||
          report.inventory_id ||
          report.wchr_inventory_id
      );

    if (directInventoryId) {
      const directRef = doc(
        db,
        WCHR_INVENTORY_COLLECTION,
        directInventoryId
      );

      const directSnapshot =
        await getDoc(directRef);

      if (directSnapshot.exists()) {
        return {
          id: directSnapshot.id,
          ref: directRef,
          ...directSnapshot.data(),
        };
      }
    }

    const wheelchairNumber =
      safeUpper(
        report.wheelchair_number ||
          shift?.active_wheelchair_number
      );

    if (
      !wheelchairNumber ||
      wheelchairNumber ===
        "PERSONAL_WCHR"
    ) {
      return null;
    }

    const inventorySnapshot =
      await getDocs(
        collection(
          db,
          WCHR_INVENTORY_COLLECTION
        )
      );

    const match =
      inventorySnapshot.docs.find(
        (item) => {
          const data =
            item.data() || {};

          return (
            safeUpper(
              data.wheelchair_number ||
                data.number ||
                data.wchr_number ||
                data.wheelchairNumber
            ) ===
            wheelchairNumber
          );
        }
      );

    if (!match) {
      return null;
    }

    return {
      id: match.id,
      ref: match.ref,
      ...match.data(),
    };
  }

  async function syncAssignedInventory({
    status,
    location,
    release = false,
  }) {
    const inventoryItem =
      await findAssignedInventoryItem(
        activeReport
      );

    if (!inventoryItem) {
      return;
    }

    const cleanLocation =
      cleanText(location) ||
      activeReport?.current_location ||
      shift?.current_location ||
      "Counter";

    const patch = {
      status,
      location: cleanLocation,
      current_location:
        cleanLocation,
      updated_at:
        serverTimestamp(),
    };

    if (release) {
      Object.assign(patch, {
        status: "AVAILABLE",
        is_available: true,
        available_for_handoff:
          false,
        ready_for_pickup:
          false,
        current_agent_id: "",
        current_agent_name: "",
        report_doc_id: "",
        assigned_report_doc_id:
          "",
        report_id: "",
        assigned_report_id: "",
        passenger_name: "",
        airline: "",
        flight_number: "",
        pnr: "",
      });
    } else {
      Object.assign(patch, {
        is_available: false,
        current_agent_id:
          agentId || "",
        current_agent_name:
          getEmployeeName(
            employee
          ),
        report_doc_id:
          activeReport?.id ||
          "",
        assigned_report_doc_id:
          activeReport?.id ||
          "",
        passenger_name:
          activeReport?.passenger_name ||
          "",
        airline:
          activeReport?.airline ||
          "",
        flight_number:
          activeReport?.flight_number ||
          "",
        pnr:
          activeReport?.pnr ||
          "",
      });
    }

    await updateDoc(
      inventoryItem.ref,
      patch
    );
  }

  // ============================================================
  // COMMON REPORT + SHIFT UPDATE
  // ============================================================

  async function updateJourneyState({
    serviceStatus,
    location,
    reportFields = {},
    shiftFields = {},
    eventType,
    eventNote,
  }) {
    if (!agentId || !activeReport?.id) {
      throw new Error(
        "No active wheelchair assignment was found."
      );
    }

    const cleanLocation =
      cleanText(location) ||
      activeReport.current_location ||
      shift?.current_location ||
      "Counter";

    const reportRef = doc(
      db,
      "wch_reports",
      activeReport.id
    );

    const shiftRef = doc(
      db,
      "wchr_agent_shifts",
      agentId
    );

    await updateDoc(reportRef, {
      current_location: cleanLocation,
      service_status: serviceStatus,
      tracking_status: serviceStatus,
      is_active: true,
      alerts_enabled: true,
      last_location_update_at: serverTimestamp(),
      last_updated_at: serverTimestamp(),
      last_updated_by: getVisibleUserName(user),
      last_updated_by_id:
        user?.id || user?.uid || "",
      ...reportFields,
    });

    await updateDoc(shiftRef, {
      current_location: cleanLocation,
      active_service_status: serviceStatus,
      updated_at: serverTimestamp(),
      ...shiftFields,
    });

    await addWchrTimelineEvent({
      reportId: activeReport.id,
      eventType,
      wheelchairNumber:
        activeReport.wheelchair_number ||
        shift?.active_wheelchair_number ||
        "",
      agentId,
      agentName: getEmployeeName(employee),
      location: cleanLocation,
      note: eventNote,
      user,
    });
  }

  // ============================================================
  // IB ARRIVAL - ACCEPT PASSENGER
  // ============================================================

  const handleAcceptInboundPassenger = async (report) => {
    if (!agentId || !employee || !isPunchedIn) {
      setError("Punch In before accepting an inbound passenger.");
      return;
    }

    if (hasActiveUmnr) {
      setError("Complete all active UMNR services before accepting a WCHR passenger.");
      return;
    }

    if (isBusy || activeReportId) {
      setError("Complete your current WCHR service before accepting another passenger.");
      return;
    }

    if (availability !== WCHR_AGENT_AVAILABILITY.AVAILABLE) {
      setError("Set your availability to Available before accepting an inbound passenger.");
      return;
    }

    const confirmed = window.confirm(
      `Accept ${report?.passenger_name || "this passenger"} from CBP?`
    );
    if (!confirmed) return;

    try {
      setBusyAction(`ib-accept:${report.id}`);
      setError("");
      setMessage("");

      const reportRef = doc(db, "wch_reports", report.id);
      const shiftRef = doc(db, "wchr_agent_shifts", agentId);
      const umnrCapacityRef = doc(db, "umnr_agent_capacity", agentId);

      await runTransaction(db, async (transaction) => {
        const reportSnap = await transaction.get(reportRef);
        const shiftSnap = await transaction.get(shiftRef);
        const umnrCapacitySnap = await transaction.get(umnrCapacityRef);

        if (!reportSnap.exists()) throw new Error("This inbound passenger is no longer available.");
        if (!shiftSnap.exists()) throw new Error("Your active WCHR shift was not found.");

        const freshReport = reportSnap.data() || {};
        const freshShift = shiftSnap.data() || {};
        const freshUmnrCount = Number(umnrCapacitySnap.exists() ? umnrCapacitySnap.data()?.count || 0 : 0);
        const freshStatus = safeUpper(freshReport.ib_status || freshReport.service_status);

        if (freshUmnrCount > 0) {
          throw new Error("You already have active UMNR services. Complete them before accepting a WCHR service.");
        }

        if (
          freshReport.ib_passenger_available !== true ||
          freshStatus !== IB_STATUS.WAITING ||
          cleanText(freshReport.assigned_agent_id || freshReport.wchr_agent_id)
        ) {
          throw new Error("Another agent already accepted this passenger. Select another passenger.");
        }

        if (safeUpper(freshShift.status) !== WCHR_AGENT_STATUS.ACTIVE) {
          throw new Error("Your WCHR shift is no longer active. Punch In again before accepting a passenger.");
        }

        if (
          cleanText(freshShift.active_report_id) ||
          safeUpper(freshShift.availability_status) !== WCHR_AGENT_AVAILABILITY.AVAILABLE
        ) {
          throw new Error("You are no longer available for a new WCHR assignment.");
        }

        transaction.update(reportRef, {
          ib_passenger_available: false,
          ib_status: IB_STATUS.ACCEPTED,
          service_status: IB_STATUS.ACCEPTED,
          tracking_status: IB_STATUS.ACCEPTED,
          assigned_agent_id: agentId,
          wchr_agent_id: agentId,
          assigned_agent_name: getEmployeeName(employee),
          assigned_wchr_agent: getEmployeeName(employee),
          wchr_agent_name: getEmployeeName(employee),
          assigned_agent_active: true,
          ib_accepted_at: serverTimestamp(),
          assignment_accepted_at: serverTimestamp(),
          assignment_status: "ACCEPTED",
          assignment_acceptance_status: "ACCEPTED",
          assignment_accepted_by_agent_id: agentId,
          assignment_accepted_by_agent_name: getEmployeeName(employee),
          current_location: "CBP",
          last_location_update_at: serverTimestamp(),
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleUserName(user),
          last_updated_by_id: user?.id || user?.uid || "",
        });

        transaction.update(shiftRef, {
          availability_status: WCHR_AGENT_AVAILABILITY.BUSY,
          active_report_id: report.id,
          active_wheelchair_number: "",
          active_passenger_name: freshReport.passenger_name || "",
          active_pnr: freshReport.pnr || "",
          active_flight_number: freshReport.flight_number || "",
          active_airline: freshReport.airline || "",
          active_service_status: IB_STATUS.ACCEPTED,
          current_location: "CBP",
          assignment_accepted_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      });

      await addWchrTimelineEvent({
        reportId: report.id,
        eventType: "IB_PASSENGER_ACCEPTED",
        wheelchairNumber: "",
        agentId,
        agentName: getEmployeeName(employee),
        location: "CBP",
        note: `${getEmployeeName(employee)} accepted ${report?.passenger_name || "the inbound passenger"} at CBP. Transit timer has not started yet.`,
        user,
      });

      setSelectedLocation("CBP");
      setSelectedIbWheelchairId("");
      setSelectedIbDestination(IB_DESTINATIONS[0]);
      setMessage(`${report?.passenger_name || "Passenger"} accepted. Select an available WCHR and destination, then press Start Transit when you physically leave CBP.`);
    } catch (err) {
      console.error("Accept inbound passenger error:", err);
      setError(err?.message || "Unable to accept this inbound passenger.");
    } finally {
      setBusyAction("");
    }
  };

  const handleStartInboundTransit = async () => {
    if (!activeReport || !agentId || !isInboundReport) {
      setError("No inbound passenger is currently accepted.");
      return;
    }
    if (!ibHasAccepted) {
      setError("Accept the inbound passenger before starting transit.");
      return;
    }
    if (ibIsInTransit) {
      setError("Inbound transit has already started.");
      return;
    }
    if (!selectedIbWheelchairId) {
      setError("Select an available WCHR number before starting transit.");
      return;
    }
    if (!selectedIbDestination) {
      setError("Select the passenger destination before starting transit.");
      return;
    }

    const selectedInventoryItem = availableInventory.find(
      (item) => item.id === selectedIbWheelchairId
    );
    const selectedWheelchairNumber = getInventoryWheelchairNumber(selectedInventoryItem);

    if (!selectedWheelchairNumber) {
      setError("The selected WCHR is no longer available. Please select another one.");
      return;
    }

    const confirmed = window.confirm(
      `Start transit for ${activeReport.passenger_name || "this passenger"}?\n\nWCHR ${selectedWheelchairNumber}\nCBP -> ${selectedIbDestination}\n\nThe service timer will start now.`
    );
    if (!confirmed) return;

    try {
      setBusyAction("ib-start-transit");
      setError("");
      setMessage("");

      const reportRef = doc(db, "wch_reports", activeReport.id);
      const shiftRef = doc(db, "wchr_agent_shifts", agentId);
      const inventoryRef = doc(db, WCHR_INVENTORY_COLLECTION, selectedIbWheelchairId);

      await runTransaction(db, async (transaction) => {
        const reportSnap = await transaction.get(reportRef);
        const shiftSnap = await transaction.get(shiftRef);
        const inventorySnap = await transaction.get(inventoryRef);

        if (!reportSnap.exists()) throw new Error("Inbound passenger report not found.");
        if (!shiftSnap.exists()) throw new Error("Your WCHR shift was not found.");
        if (!inventorySnap.exists()) throw new Error("The selected WCHR no longer exists in inventory.");

        const freshReport = reportSnap.data() || {};
        const freshInventory = inventorySnap.data() || {};

        if (cleanText(freshReport.assigned_agent_id || freshReport.wchr_agent_id) !== agentId) {
          throw new Error("This passenger is no longer assigned to you.");
        }
        if (safeUpper(freshReport.ib_status || freshReport.service_status) !== IB_STATUS.ACCEPTED) {
          throw new Error("This inbound passenger is not ready to start transit.");
        }
        if (!isInventoryAvailable(freshInventory)) {
          throw new Error("Another agent already selected this WCHR. Please choose another available WCHR.");
        }

        transaction.update(reportRef, {
          wheelchair_number: selectedWheelchairNumber,
          inventory_doc_id: selectedIbWheelchairId,
          inventory_id: selectedIbWheelchairId,
          ib_pickup_location: "CBP",
          pickup_location: "CBP",
          current_location: "CBP",
          ib_destination: selectedIbDestination,
          ib_status: IB_STATUS.IN_TRANSIT,
          service_status: IB_STATUS.IN_TRANSIT,
          tracking_status: IB_STATUS.IN_TRANSIT,
          ib_transit_started_at: serverTimestamp(),
          timer_started_at: serverTimestamp(),
          picked_up_at: serverTimestamp(),
          pickup_at: serverTimestamp(),
          in_transit_at: serverTimestamp(),
          picked_up_by_agent_id: agentId,
          picked_up_by_agent_name: getEmployeeName(employee),
          ready_for_pickup: false,
          is_active: true,
          alerts_enabled: true,
          transport_alert_active: true,
          alert_after_minutes: 30,
          last_location_update_at: serverTimestamp(),
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleUserName(user),
          last_updated_by_id: user?.id || user?.uid || "",
        });

        transaction.update(shiftRef, {
          availability_status: WCHR_AGENT_AVAILABILITY.BUSY,
          active_report_id: activeReport.id,
          active_wheelchair_number: selectedWheelchairNumber,
          active_service_status: IB_STATUS.IN_TRANSIT,
          current_location: "CBP",
          picked_up_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.update(inventoryRef, {
          status: "IN_SERVICE",
          is_available: false,
          current_location: "CBP",
          location: "CBP",
          current_agent_id: agentId,
          current_agent_name: getEmployeeName(employee),
          report_doc_id: activeReport.id,
          assigned_report_doc_id: activeReport.id,
          report_id: activeReport.id,
          assigned_report_id: activeReport.id,
          passenger_name: freshReport.passenger_name || "",
          airline: freshReport.airline || "",
          flight_number: freshReport.flight_number || "",
          pnr: freshReport.pnr || "",
          updated_at: serverTimestamp(),
        });
      });

      await addWchrTimelineEvent({
        reportId: activeReport.id,
        eventType: "IB_TRANSIT_STARTED",
        wheelchairNumber: selectedWheelchairNumber,
        agentId,
        agentName: getEmployeeName(employee),
        location: "CBP",
        note: `Inbound transit started from CBP to ${selectedIbDestination}. WCHR ${selectedWheelchairNumber}.`,
        user,
      });

      if (shift?.live_tracking_consent === true) {
        try {
          await initializePassiveRouteSample({
            report: { ...activeReport, wheelchair_number: selectedWheelchairNumber },
            origin: "CBP",
            destination: selectedIbDestination,
            direction: "IB",
          });
        } catch (routeError) {
          console.warn("Passive inbound route sample start failed:", routeError);
        }
      }

      setSelectedLocation("CBP");
      setMessage(`Transit started. Timer is now running from CBP to ${selectedIbDestination}.`);
    } catch (err) {
      console.error("Start inbound transit error:", err);
      setError(err?.message || "Unable to start inbound transit.");
    } finally {
      setBusyAction("");
    }
  };

  const handleDeliverInboundPassenger = async () => {
    if (!activeReport || !agentId || !isInboundReport) {
      setError("No inbound passenger is currently active.");
      return;
    }
    if (!ibIsInTransit) {
      setError("Start Transit before marking the passenger as Delivered.");
      return;
    }
    if (ibIsDelivered) {
      setError("This inbound passenger has already been delivered.");
      return;
    }

    const destination =
      cleanText(activeReport.ib_destination) ||
      cleanText(selectedIbDestination);

    if (!IB_DESTINATIONS.includes(destination)) {
      setError("Select a valid passenger destination before delivery.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm ${activeReport.passenger_name || "passenger"} delivered to ${destination}?\n\nThis will stop the passenger transit timer. WCHR ${activeReport.wheelchair_number || ""} will remain assigned to you until you store it and press Store WCHR.`
    );
    if (!confirmed) return;

    const startedMillis = getTimestampMillis(activeReport.ib_transit_started_at);
    const elapsedSeconds = startedMillis
      ? Math.max(0, Math.floor((Date.now() - startedMillis) / 1000))
      : 0;

    try {
      setBusyAction("ib-delivered");
      setError("");
      setMessage("");

      const reportRef = doc(db, "wch_reports", activeReport.id);
      const shiftRef = doc(db, "wchr_agent_shifts", agentId);
      const inventoryId = cleanText(
        activeReport.inventory_doc_id || activeReport.inventory_id
      );
      const inventoryRef = inventoryId
        ? doc(db, WCHR_INVENTORY_COLLECTION, inventoryId)
        : null;

      await runTransaction(db, async (transaction) => {
        const reportSnap = await transaction.get(reportRef);
        const shiftSnap = await transaction.get(shiftRef);
        const inventorySnap = inventoryRef
          ? await transaction.get(inventoryRef)
          : null;

        if (!reportSnap.exists()) {
          throw new Error("Inbound passenger report not found.");
        }
        if (!shiftSnap.exists()) {
          throw new Error("Your WCHR shift was not found.");
        }

        const freshReport = reportSnap.data() || {};

        if (
          safeUpper(freshReport.ib_status || freshReport.service_status) !==
          IB_STATUS.IN_TRANSIT
        ) {
          throw new Error("This inbound service is no longer in transit.");
        }

        transaction.update(reportRef, {
          // Passenger journey is complete, but the WCHR journey is not.
          ib_status: IB_STATUS.DELIVERED,
          service_status: "PENDING_STORAGE",
          tracking_status: "PENDING_STORAGE",
          ib_destination: destination,
          current_location: destination,

          ib_delivered_at: serverTimestamp(),
          delivered_at: serverTimestamp(),
          ib_transit_seconds: elapsedSeconds,
          ib_transit_minutes: Number((elapsedSeconds / 60).toFixed(2)),
          passenger_delivered: true,

          // Keep the assignment active until the wheelchair is stored.
          assigned_agent_active: true,
          agent_transport_completed: true,
          agent_transport_completed_at: serverTimestamp(),
          ib_passenger_available: false,
          pending_storage: true,
          storage_required: true,
          is_active: true,

          alerts_enabled: false,
          transport_alert_active: false,

          last_location_update_at: serverTimestamp(),
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleUserName(user),
          last_updated_by_id: user?.id || user?.uid || "",
        });

        transaction.update(shiftRef, {
          availability_status: WCHR_AGENT_AVAILABILITY.BUSY,
          current_location: destination,
          active_report_id: activeReport.id,
          active_wheelchair_number: activeReport.wheelchair_number || "",
          active_passenger_name: "",
          active_pnr: "",
          active_flight_number: "",
          active_airline: "",
          active_service_status: "PENDING_STORAGE",
          updated_at: serverTimestamp(),
        });

        if (inventoryRef && inventorySnap?.exists()) {
          transaction.update(inventoryRef, {
            status: "PENDING_STORAGE",
            is_available: false,
            available_for_handoff: false,
            ready_for_pickup: false,
            location: destination,
            current_location: destination,
            current_agent_id: agentId,
            current_agent_name: getEmployeeName(employee),
            report_doc_id: activeReport.id,
            assigned_report_doc_id: activeReport.id,
            report_id: activeReport.id,
            assigned_report_id: activeReport.id,
            passenger_name: "",
            updated_at: serverTimestamp(),
          });
        }
      });

      await addWchrTimelineEvent({
        reportId: activeReport.id,
        eventType: "IB_PASSENGER_DELIVERED",
        wheelchairNumber: activeReport.wheelchair_number || "",
        agentId,
        agentName: getEmployeeName(employee),
        location: destination,
        note: `Inbound passenger delivered from CBP to ${destination}. Transit time: ${formatElapsedTime(elapsedSeconds)}. WCHR remains assigned pending storage.`,
        user,
      });

      await finalizePassiveRouteSample({
        report: activeReport,
        destination,
        completionType: "IB_PASSENGER_DELIVERED",
      });

      setSelectedLocation(destination);
      setSelectedStorageLocation(WCHR_STORAGE_LOCATIONS[0]);
      setLocationNote("");
      setMessage(
        `Passenger delivered to ${destination}. Transit completed in ${formatElapsedTime(elapsedSeconds)}. WCHR ${activeReport.wheelchair_number || ""} is still assigned to you. Select the storage location and press Store WCHR when the chair is physically stored.`
      );
    } catch (err) {
      console.error("Deliver inbound passenger error:", err);
      setError(err?.message || "Unable to complete inbound delivery.");
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // IB ARRIVAL - STORE WCHR + RELEASE AGENT
  // ============================================================

  const handleStoreInboundWheelchair = async () => {
    if (!activeReport || !agentId || !isInboundReport) {
      setError("No inbound WCHR is currently assigned.");
      return;
    }

    if (!ibIsDelivered) {
      setError("Deliver the passenger before storing the WCHR.");
      return;
    }

    if (safeUpper(currentServiceStatus) === "STORED") {
      setError("This WCHR has already been stored.");
      return;
    }

    const storageLocation = cleanText(selectedStorageLocation);

    if (!storageLocation) {
      setError("Select the WCHR storage location.");
      return;
    }

    const wheelchairNumber =
      cleanText(activeReport.wheelchair_number) ||
      cleanText(shift?.active_wheelchair_number);

    const confirmed = window.confirm(
      `Confirm WCHR ${wheelchairNumber || ""} is physically stored at ${storageLocation}?\n\nThe wheelchair will become AVAILABLE in inventory and you will become AVAILABLE for another service.`
    );
    if (!confirmed) return;

    try {
      setBusyAction("ib-store-wchr");
      setError("");
      setMessage("");

      const reportRef = doc(db, "wch_reports", activeReport.id);
      const shiftRef = doc(db, "wchr_agent_shifts", agentId);
      const inventoryId = cleanText(
        activeReport.inventory_doc_id || activeReport.inventory_id
      );
      const inventoryRef = inventoryId
        ? doc(db, WCHR_INVENTORY_COLLECTION, inventoryId)
        : null;

      await runTransaction(db, async (transaction) => {
        const reportSnap = await transaction.get(reportRef);
        const shiftSnap = await transaction.get(shiftRef);
        const inventorySnap = inventoryRef
          ? await transaction.get(inventoryRef)
          : null;

        if (!reportSnap.exists()) {
          throw new Error("Inbound passenger report not found.");
        }
        if (!shiftSnap.exists()) {
          throw new Error("Your WCHR shift was not found.");
        }

        const freshReport = reportSnap.data() || {};

        if (!freshReport.ib_delivered_at) {
          throw new Error("The passenger must be delivered before the WCHR can be stored.");
        }

        if (
          cleanText(freshReport.assigned_agent_id || freshReport.wchr_agent_id) !==
          agentId
        ) {
          throw new Error("This WCHR service is no longer assigned to you.");
        }

        if (safeUpper(freshReport.service_status) === "STORED") {
          throw new Error("This WCHR has already been stored.");
        }

        transaction.update(reportRef, {
          ib_status: IB_STATUS.DELIVERED,
          service_status: "STORED",
          tracking_status: "STORED",
          current_location: storageLocation,
          stored_location: storageLocation,
          storage_location: storageLocation,
          stored_at: serverTimestamp(),
          storage_completed_at: serverTimestamp(),
          stored_by_agent_id: agentId,
          stored_by_agent_name: getEmployeeName(employee),
          pending_storage: false,
          storage_required: false,
          assigned_agent_active: false,
          is_active: false,
          completed_at: serverTimestamp(),
          alerts_enabled: false,
          transport_alert_active: false,
          last_location_update_at: serverTimestamp(),
          last_updated_at: serverTimestamp(),
          last_updated_by: getVisibleUserName(user),
          last_updated_by_id: user?.id || user?.uid || "",
        });

        transaction.update(shiftRef, {
          availability_status: WCHR_AGENT_AVAILABILITY.AVAILABLE,
          current_location: storageLocation,

          active_report_id: "",
          active_wheelchair_number: "",
          active_passenger_name: "",
          active_pnr: "",
          active_flight_number: "",
          active_airline: "",
          active_service_status: "",

          last_assignment_report_id: activeReport.id,
          last_assignment_wheelchair_number: wheelchairNumber || "",
          last_assignment_completed_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        if (inventoryRef && inventorySnap?.exists()) {
          transaction.update(inventoryRef, {
            status: "AVAILABLE",
            is_available: true,
            available_for_handoff: false,
            ready_for_pickup: false,
            location: storageLocation,
            current_location: storageLocation,
            stored_location: storageLocation,
            stored_at: serverTimestamp(),
            last_stored_by_agent_id: agentId,
            last_stored_by_agent_name: getEmployeeName(employee),

            current_agent_id: "",
            current_agent_name: "",
            report_doc_id: "",
            assigned_report_doc_id: "",
            report_id: "",
            assigned_report_id: "",
            passenger_name: "",
            airline: "",
            flight_number: "",
            pnr: "",
            updated_at: serverTimestamp(),
          });
        }
      });

      await addWchrTimelineEvent({
        reportId: activeReport.id,
        eventType: "WCHR_STORED",
        wheelchairNumber: wheelchairNumber || "",
        agentId,
        agentName: getEmployeeName(employee),
        location: storageLocation,
        note: `WCHR ${wheelchairNumber || ""} stored at ${storageLocation}. Wheelchair and agent released for the next service.`,
        user,
      });

      setSelectedLocation(storageLocation);
      setSelectedIbWheelchairId("");
      setSelectedIbDestination(IB_DESTINATIONS[0]);
      setSelectedStorageLocation(WCHR_STORAGE_LOCATIONS[0]);
      setLocationNote("");
      setMessage(
        `WCHR ${wheelchairNumber || ""} stored at ${storageLocation}. The wheelchair is AVAILABLE in inventory and you are AVAILABLE for another service.`
      );
    } catch (err) {
      console.error("Store inbound WCHR error:", err);
      setError(err?.message || "Unable to store and release the WCHR.");
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // LOCATION UPDATE
  // ============================================================

  const handleUpdateLocation = async () => {
    if (!agentId || !isPunchedIn) {
      setError("Punch In before updating your location.");
      return;
    }

    const location = cleanText(selectedLocation);

    if (!location) {
      setError("Please select a location.");
      return;
    }

    try {
      setBusyAction("location");
      setError("");
      setMessage("");

      await updateWchrAgentLocation({
        agentId,
        location,
      });

      if (activeReport?.id) {
        await updateDoc(
          doc(db, "wch_reports", activeReport.id),
          {
            current_location: location,
            last_location_update_at: serverTimestamp(),
            last_updated_at: serverTimestamp(),
            last_updated_by: getVisibleUserName(user),
            last_updated_by_id:
              user?.id || user?.uid || "",
          }
        );

        await syncAssignedInventory({
          status:
            safeUpper(activeReport?.service_direction) === "IB"
              ? "IN_SERVICE"
              : safeUpper(
                  activeReport.service_status ||
                    activeReport.tracking_status
                ) === WCHR_SERVICE_STATUS.IN_TRANSIT
              ? "IN_SERVICE"
              : safeUpper(
                  activeReport.service_status ||
                    activeReport.tracking_status ||
                    "ASSIGNED"
                ),
          location,
        });

        await addWchrTimelineEvent({
          reportId: activeReport.id,
          eventType: "LOCATION_UPDATE",
          wheelchairNumber:
            activeReport.wheelchair_number ||
            shift?.active_wheelchair_number ||
            "",
          agentId,
          agentName: getEmployeeName(employee),
          location,
          note:
            cleanText(locationNote) ||
            `Agent location updated to ${location}.`,
          user,
        });

      }

      setLocationNote("");
      setMessage(
        `Location updated to ${location}.`
      );
    } catch (err) {
      console.error(
        "Location update error:",
        err
      );

      setError(
        err?.message ||
          "Unable to update location."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // ADD COMMENT
  // ============================================================

  const handleAddComment = async () => {
    const note = cleanText(locationNote);

    if (!activeReport) {
      setError("No wheelchair is assigned.");
      return;
    }

    if (!note) {
      setError("Please write a comment first.");
      return;
    }

    try {
      setBusyAction("comment");
      setError("");
      setMessage("");

      await addWchrTimelineEvent({
        reportId: activeReport.id,
        eventType: "COMMENT",
        wheelchairNumber:
          activeReport.wheelchair_number || "",
        agentId,
        agentName: getEmployeeName(employee),
        location:
          selectedLocation ||
          activeReport.current_location ||
          "",
        note,
        user,
      });

      setLocationNote("");
      setMessage("Comment saved.");
    } catch (err) {
      console.error("WCHR comment error:", err);

      setError(
        err?.message ||
          "Unable to save comment."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // ACCEPT ASSIGNMENT
  // ============================================================

  const handleAcceptAssignment = async () => {
    if (!activeReport || !agentId) {
      setError("No wheelchair is assigned.");
      return;
    }

    if (hasAccepted) {
      setError("This WCHR assignment has already been accepted.");
      return;
    }

    if (hasActiveUmnr) {
      setError("Complete all active UMNR services before accepting this WCHR assignment.");
      return;
    }

    const location =
      cleanText(activeReport.current_location) ||
      cleanText(shift?.current_location) ||
      "Counter";

    try {
      setBusyAction("accept");
      setError("");
      setMessage("");

      const capacitySnapshot = await getDoc(doc(db, "umnr_agent_capacity", agentId));
      const activeUmnrCount = Number(capacitySnapshot.exists() ? capacitySnapshot.data()?.count || 0 : 0);
      if (activeUmnrCount > 0) {
        throw new Error("You already have active UMNR services. Complete them before accepting a WCHR service.");
      }

      await updateJourneyState({
        serviceStatus: "ACCEPTED",
        location,
        reportFields: {
          assignment_accepted_at: serverTimestamp(),
          assignment_accepted_by_agent_id: agentId,
          assignment_accepted_by_agent_name:
            getEmployeeName(employee),
        },
        shiftFields: {
          availability_status:
            WCHR_AGENT_AVAILABILITY.BUSY,
          assignment_accepted_at: serverTimestamp(),
        },
        eventType: "ASSIGNMENT_ACCEPTED",
        eventNote: `WCHR ${
          activeReport.wheelchair_number || ""
        } assignment accepted by ${getEmployeeName(employee)}.`,
      });

      setMessage(
        `WCHR ${
          activeReport.wheelchair_number || ""
        } accepted. Proceed to the pickup location and confirm Picked Up once you physically receive the wheelchair/passenger.`
      );
      setAssignmentDecisionOpen(false);
    } catch (err) {
      console.error("Accept WCHR assignment error:", err);
      setError(
        err?.message ||
          "Unable to accept the WCHR assignment."
      );
    } finally {
      setBusyAction("");
    }
  };

  // Reject only a pending, not-yet-accepted assignment. Never release inventory or cancel the WCHR.
  const handleRejectAssignment = async () => {
    const reason = cleanText(assignmentRejectReason);
    if (!reason) { setError("Please provide a reason for rejecting this assignment."); return; }
    if (!activeReport?.id || !agentId || hasAccepted) {
      setError("This assignment can no longer be rejected."); return;
    }
    const reportId = activeReport.id;
    const agentName = getEmployeeName(employee);
    try {
      setBusyAction("reject"); setError(""); setMessage("");
      await runTransaction(db, async (transaction) => {
        const reportRef = doc(db, "wch_reports", reportId);
        const shiftRef = doc(db, "wchr_agent_shifts", agentId);
        const reportSnap = await transaction.get(reportRef);
        const shiftSnap = await transaction.get(shiftRef);
        if (!reportSnap.exists() || !shiftSnap.exists()) throw new Error("Assignment or active shift not found.");
        const report = reportSnap.data();
        const agentShift = shiftSnap.data();
        if (cleanText(agentShift.active_report_id) !== reportId ||
            cleanText(report.wchr_agent_id || report.assigned_agent_id) !== agentId) {
          throw new Error("This assignment has changed. Refresh before rejecting.");
        }
        if (report.assignment_accepted_at || report.picked_up_at || report.pickup_at ||
            !["ASSIGNED", "NEW", "READY_FOR_PICKUP"].includes(safeUpper(report.service_status))) {
          throw new Error("This service has already started and cannot be rejected.");
        }
        transaction.update(reportRef, {
          wchr_agent_id: "", assigned_agent_id: "", wchr_agent_name: "", assigned_wchr_agent: "", assigned_agent_name: "", assigned_agent_active: false,
          assignment_status: "UNASSIGNED", assignment_acceptance_status: "REJECTED", assignment_accepted_at: null,
          service_status: "READY_FOR_PICKUP", tracking_status: "READY_FOR_PICKUP",
          ready_for_pickup: true, is_active: true,
          assignment_rejected_at: serverTimestamp(),
          assignment_rejected_by_agent_id: agentId,
          assignment_rejected_by_agent_name: agentName,
          assignment_rejection_reason: reason,
          dispatch_attention_required: true,
          dispatch_attention_type: "ASSIGNMENT_REJECTED",
          last_updated_at: serverTimestamp(),
        });
        transaction.update(shiftRef, {
          active_report_id: "", active_wheelchair_number: "", active_passenger_name: "", active_pnr: "", active_flight_number: "", active_airline: "",
          active_service_status: "", availability_status: WCHR_AGENT_AVAILABILITY.AVAILABLE,
          assignment_accepted_at: null,
          last_updated_at: serverTimestamp(),
        });
      });
      try {
        await addWchrTimelineEvent({
          reportId, eventType: "ASSIGNMENT_REJECTED",
          wheelchairNumber: activeReport.wheelchair_number || "",
          agentId, agentName,
          location: cleanText(shift?.current_location) || "Counter",
          note: `Assignment rejected by ${agentName}. Reason: ${reason}`,
          user,
        });
      } catch (timelineError) {
        console.error("Rejection saved, but timeline entry failed:", timelineError);
      }
      setAssignmentDecisionOpen(false); setAssignmentRejectReason("");
      setMessage("Assignment declined. Dispatch can now reassign this WCHR. The service and wheelchair reservation remain active.");
    } catch (err) {
      console.error("Reject WCHR assignment error:", err);
      setError(err?.message || "Unable to reject the assignment.");
    } finally { setBusyAction(""); }
  };

  // ============================================================
  // MARK PICKED UP
  // ============================================================

  const handleMarkPickedUp = async () => {
    if (!activeReport) {
      setError("No wheelchair is assigned.");
      return;
    }

    if (!hasAccepted) {
      setError(
        "Accept the WCHR assignment before marking it as Picked Up."
      );
      return;
    }

    if (hasPickedUp) {
      setError(
        "This wheelchair has already been marked as picked up."
      );
      return;
    }

    const location =
      cleanText(selectedLocation) ||
      activeReport.current_location ||
      "Counter";

    const confirmed = window.confirm(
      `Confirm pickup of WCHR ${
        activeReport.wheelchair_number || ""
      } at ${location}?`
    );

    if (!confirmed) return;

    try {
      setBusyAction("pickup");
      setError("");
      setMessage("");

      await updateJourneyState({
        serviceStatus: WCHR_SERVICE_STATUS.PICKED_UP,
        location,
        reportFields: {
          picked_up_at: serverTimestamp(),
          pickup_at: serverTimestamp(),
          pickup_location: location,
          picked_up_by_agent_id: agentId,
          picked_up_by_agent_name:
            getEmployeeName(employee),
        },
        shiftFields: {
          availability_status:
            WCHR_AGENT_AVAILABILITY.BUSY,
          picked_up_at: serverTimestamp(),
        },
        eventType: "PICKED_UP",
        eventNote:
          cleanText(locationNote) ||
          `WCHR ${
            activeReport.wheelchair_number || ""
          } picked up at ${location}.`,
      });

      await syncAssignedInventory({
        status: "PICKED_UP",
        location,
      });

      if (shift?.live_tracking_consent === true) {
        try {
          const rawGate = cleanText(activeReport.gate_location || activeReport.gate);
          const destination = rawGate
            ? rawGate.toUpperCase().startsWith("GATE ")
              ? rawGate
              : `Gate ${rawGate}`
            : "";
          await initializePassiveRouteSample({
            report: activeReport,
            origin: location,
            destination,
            direction: "OB",
          });
        } catch (routeError) {
          console.warn("Passive outbound route sample start failed:", routeError);
        }
      }

      setLocationNote("");
      setMessage(
        `WCHR ${
          activeReport.wheelchair_number || ""
        } marked as Picked Up.`
      );
    } catch (err) {
      console.error("Mark picked up error:", err);
      setError(
        err?.message ||
          "Unable to mark WCHR as picked up."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // MARK IN TRANSIT
  // ============================================================

  const handleMarkInTransit = async () => {
    if (!activeReport) {
      setError("No wheelchair is assigned.");
      return;
    }

    if (!hasPickedUp) {
      setError(
        "Mark the wheelchair as Picked Up before starting transit."
      );
      return;
    }

    if (isInTransit) {
      setError(
        "This wheelchair is already in transit or has progressed beyond transit."
      );
      return;
    }

    const location =
      cleanText(selectedLocation) ||
      activeReport.current_location ||
      "Main Terminal";

    try {
      setBusyAction("transit");
      setError("");
      setMessage("");

      await updateJourneyState({
        serviceStatus: WCHR_SERVICE_STATUS.IN_TRANSIT,
        location,
        reportFields: {
          in_transit_at: serverTimestamp(),
        },
        shiftFields: {
          availability_status:
            WCHR_AGENT_AVAILABILITY.BUSY,
        },
        eventType: "IN_TRANSIT",
        eventNote:
          cleanText(locationNote) ||
          `Passenger and WCHR are in transit. Current location: ${location}.`,
      });

      await syncAssignedInventory({
        status: "IN_SERVICE",
        location,
      });

      setLocationNote("");
      setMessage(
        "WCHR service marked as In Transit."
      );
    } catch (err) {
      console.error("Mark in transit error:", err);
      setError(
        err?.message ||
          "Unable to mark WCHR as In Transit."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // ARRIVE AT GATE + RELEASE AGENT
  // ============================================================

  const handleArriveAtGate = async () => {
    if (!activeReport || !agentId) {
      setError("No wheelchair is assigned.");
      return;
    }

    if (!hasPickedUp) {
      setError(
        "Mark the wheelchair as Picked Up before arriving at the gate."
      );
      return;
    }

    const gateLocation = cleanText(selectedLocation);

    if (!isGateLocation(gateLocation)) {
      setError(
        "Please select the passenger's Gate F78-F90 before marking arrival at gate."
      );
      return;
    }

    const confirmed = window.confirm(
      `Confirm WCHR ${
        activeReport.wheelchair_number || ""
      } arrived at ${gateLocation}?\n\nThe passenger will move to Supervisor gate monitoring and you will become available for another WCHR.`
    );

    if (!confirmed) return;

    try {
      setBusyAction("gate");
      setError("");
      setMessage("");

      const reportRef = doc(
        db,
        "wch_reports",
        activeReport.id
      );

      const shiftRef = doc(
        db,
        "wchr_agent_shifts",
        agentId
      );

      const nextGateCheckDueAt = new Date(
        Date.now() + 15 * 60 * 1000
      );

      await updateDoc(reportRef, {
        service_status: WCHR_SERVICE_STATUS.AT_GATE,
        tracking_status: WCHR_SERVICE_STATUS.AT_GATE,

        current_location: gateLocation,
        gate_location: gateLocation,
        gate_arrived_at: serverTimestamp(),

        passenger_delivered_to_gate: true,
        passenger_delivered_to_gate_at: serverTimestamp(),

        gate_monitoring_required: true,
        gate_monitoring_started_at: serverTimestamp(),
        gate_check_interval_minutes: 15,
        next_gate_check_due_at: nextGateCheckDueAt,
        last_gate_check_at: null,
        gate_check_count: 0,

        assigned_agent_active: false,
        agent_transport_completed: true,
        agent_transport_completed_at: serverTimestamp(),

        is_active: true,

        // The 30-minute transport alert ends permanently at Gate.
        // Supervisor gate monitoring continues separately every 15 minutes.
        alerts_enabled: true,
        transport_alert_active: false,
        alert_after_minutes: 15,

        last_location_update_at: serverTimestamp(),
        last_updated_at: serverTimestamp(),
        last_updated_by: getVisibleUserName(user),
        last_updated_by_id:
          user?.id || user?.uid || "",
      });

      await syncAssignedInventory({
        status: "AT_GATE",
        location: gateLocation,
      });

      await addWchrTimelineEvent({
        reportId: activeReport.id,
        eventType: "AT_GATE",
        wheelchairNumber:
          activeReport.wheelchair_number ||
          shift?.active_wheelchair_number ||
          "",
        agentId,
        agentName: getEmployeeName(employee),
        location: gateLocation,
        note:
          cleanText(locationNote) ||
          `Passenger and WCHR arrived at ${gateLocation}. Supervisor 15-minute gate monitoring started.`,
        user,
      });

      await finalizePassiveRouteSample({
        report: activeReport,
        destination: gateLocation,
        completionType: "AT_GATE",
      });

      await updateDoc(shiftRef, {
        availability_status:
          WCHR_AGENT_AVAILABILITY.AVAILABLE,

        current_location: gateLocation,

        active_report_id: "",
        active_wheelchair_number: "",
        active_passenger_name: "",
        active_pnr: "",
        active_flight_number: "",
        active_airline: "",
        active_service_status: "",

        last_assignment_report_id:
          activeReport.id,
        last_assignment_wheelchair_number:
          activeReport.wheelchair_number || "",
        last_assignment_completed_at:
          serverTimestamp(),

        updated_at: serverTimestamp(),
      });

      // Push is intentionally fire-and-forget.
      // A notification failure must never block the WCHR operation.
      triggerWchrDeliveryPush(
        activeReport.id
      ).catch((pushError) => {
        console.warn(
          "WCHR delivery push failed:",
          pushError
        );
      });

      setLocationNote("");
      setMessage(
        `Passenger delivered to ${gateLocation}. You are now AVAILABLE for another WCHR assignment. Supervisor gate monitoring has started.`
      );
    } catch (err) {
      console.error("Gate arrival error:", err);
      setError(
        err?.message ||
          "Unable to complete gate arrival."
      );
    } finally {
      setBusyAction("");
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gap: isMobile ? 12 : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >

      {hasActiveUmnr && (
        <PageCard style={{ padding: 14, border: "1px solid #fed7aa", background: "#fff7ed" }}>
          <div style={{ color: "#9a3412", fontSize: 12.5, lineHeight: 1.55, fontWeight: 800 }}>
            UMNR lock active: {umnrCapacity} active UMNR service{umnrCapacity === 1 ? "" : "s"}. WCHR acceptance and new WCHR service actions are blocked until all UMNR services are completed, cancelled, or reassigned.
          </div>
        </PageCard>
      )}
      {assignmentDecisionOpen && activeReport && !hasAccepted && (
        <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(3, 18, 38, 0.76)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label="WCHR assignment decision" style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 25px 70px rgba(0,0,0,.3)" }}>
            <h2 style={{ margin: "0 0 8px", color: "#0f172a" }}>New WCHR Assignment</h2>
            <p style={{ color: "#334155", lineHeight: 1.5 }}>WCHR <b>{activeReport.wheelchair_number || "Personal"}</b> — {activeReport.passenger_name || "Passenger"}</p>
            <p style={{ fontSize: 13, color: "#64748b" }}>Accept to begin service, or reject with a reason so Dispatch can reassign it.</p>
            <label htmlFor="wchr-rejection-reason" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Reason for rejection (required only if rejecting)</label>
            <textarea id="wchr-rejection-reason" value={assignmentRejectReason} onChange={(e) => setAssignmentRejectReason(e.target.value)} rows={3} placeholder="Explain why you cannot take this service..." style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, font: "inherit", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}>
              <button type="button" disabled={Boolean(busyAction) || hasActiveUmnr} onClick={handleAcceptAssignment} style={{ flex: 1, background: "#15803d", color: "white", padding: 12, border: 0, borderRadius: 10, fontWeight: 800 }}>{busyAction === "accept" ? "Accepting..." : "Accept"}</button>
              <button type="button" disabled={Boolean(busyAction) || !cleanText(assignmentRejectReason)} onClick={handleRejectAssignment} style={{ flex: 1, background: "#b91c1c", color: "white", padding: 12, border: 0, borderRadius: 10, fontWeight: 800, opacity: !cleanText(assignmentRejectReason) ? 0.55 : 1 }}>{busyAction === "reject" ? "Rejecting..." : "Reject"}</button>
              <button type="button" disabled={Boolean(busyAction)} onClick={() => setAssignmentDecisionOpen(false)} style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, background: "white" }}>Later</button>
            </div>
          </div>
        </div>
      )}
      {/* HERO */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 17 : 23,
          color: "#ffffff",
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
            right: -70,
            top: -90,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: isMobile
              ? "column"
              : "row",
            alignItems: isMobile
              ? "flex-start"
              : "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 13,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                flex: "0 0 52px",
                borderRadius: 16,
                background: "#ffffff",
                overflow: "hidden",
                border:
                  "1px solid rgba(255,255,255,0.9)",
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

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color:
                    "rgba(255,255,255,0.72)",
                }}
              >
                {APP_NAME} {" | "} WCHR Operations
              </div>

              <h1
                style={{
                  margin: "5px 0 3px",
                  fontSize: isMobile ? 23 : 28,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  letterSpacing: "-0.035em",
                }}
              >
                WCHR Agent Operations
              </h1>

              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color:
                    "rgba(255,255,255,0.85)",
                }}
              >
                Punch In, manage availability, complete outbound WCHR journeys and accept inbound CBP passengers for delivery to the terminal.
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.67)",
                  fontWeight: 700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          {isPunchedIn && (
            <div
              style={{
                padding: "10px 13px",
                borderRadius: 14,
                border:
                  "1px solid rgba(255,255,255,0.2)",
                background:
                  "rgba(255,255,255,0.14)",
                minWidth: isMobile
                  ? "100%"
                  : 150,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 850,
                  color:
                    "rgba(255,255,255,0.74)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Shift Time
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 24,
                  lineHeight: 1,
                  fontWeight: 900,
                }}
              >
                {formatElapsedTime(
                  shiftElapsedSeconds
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MESSAGES */}
      {error && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "11px 13px",
              borderRadius: 14,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 750,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "11px 13px",
              borderRadius: 14,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#065f46",
              fontSize: 13,
              lineHeight: 1.55,
              fontWeight: 750,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* EMPLOYEE */}
      <PageCard
        style={{
          padding: isMobile ? 15 : 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isMobile
              ? "column"
              : "row",
            justifyContent: "space-between",
            alignItems: isMobile
              ? "stretch"
              : "center",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                color: "#1769aa",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              WCHR Agent
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: isMobile ? 18 : 21,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {employeeLoading
                ? "Loading employee..."
                : employee
                ? getEmployeeName(employee)
                : getVisibleUserName(user)}
            </div>

            {employee && (
              <div
                style={{
                  marginTop: 3,
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                {[
                  employee.position,
                  employee.department,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </div>
            )}
          </div>

          {!employeeLoading && employee && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <StatusBadge
                status={
                  isPunchedIn
                    ? availability ||
                      WCHR_AGENT_AVAILABILITY.AVAILABLE
                    : WCHR_AGENT_AVAILABILITY.UNAVAILABLE
                }
              />

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 900,
                  background: isPunchedIn
                    ? "#ecfdf5"
                    : "#f8fafc",
                  color: isPunchedIn
                    ? "#166534"
                    : "#64748b",
                  border: isPunchedIn
                    ? "1px solid #bbf7d0"
                    : "1px solid #e2e8f0",
                }}
              >
                {isPunchedIn
                  ? "Punched In"
                  : "Off Duty"}
              </span>
            </div>
          )}
        </div>
      </PageCard>

      {isPunchedIn && (
        <PageCard style={{ padding: 14, marginBottom: 12 }}>
          <strong>Live GPS Tracking</strong>
          <p style={{ fontSize: 12, margin: "7px 0", color: "#475569" }}>
            {shift?.live_tracking_consent === true
              ? `GPS status: ${gpsState}. Location updates automatically while this page is open and your device allows location access.`
              : "GPS tracking not authorized for this shift. Location is not tracked automatically."}
          </p>
          <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
            GPS is approximate indoors. Punch Out stops GPS collection on this page.
          </p>
        </PageCard>
      )}

      {isPunchedIn && <PageCard style={{padding:15,marginBottom:12}}>
        <h3 style={{margin:"0 0 7px"}}>Automatic Location</h3>
        <p style={{margin:0}}>Current area: <strong>{shift?.current_location || "Location Not Detected"}</strong></p>
        <p style={{fontSize:12,color:"#64748b"}}>{autoLocationStatus} · GPS: {gpsState}</p>
        {zoneLoadError && <p role="alert">{zoneLoadError}</p>}
      </PageCard>}

      {/* PUNCH IN */}
      {!isPunchedIn && (
        <PageCard
          style={{
            padding: isMobile ? 16 : 21,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              color: "#0f172a",
              fontWeight: 900,
            }}
          >
            Start WCHR Shift
          </h2>

          <p
            style={{
              margin: "5px 0 15px",
              fontSize: 12.5,
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            Punch In to become visible to WCHR Supervisors as an active agent.
          </p>

          <div style={{marginBottom:14,padding:12,background:"#f8fafc",borderRadius:10}}>
            <strong>Automatic starting location</strong>
            <p style={{fontSize:12,margin:"5px 0"}}>When you confirm Punch In, the app checks the saved Duty Manager zones. If GPS cannot reliably match a zone, it records Location Not Detected.</p>
            {zoneLoadError && <p role="alert">{zoneLoadError}</p>}
          </div>

          <div
            style={{
              padding: "13px 14px",
              borderRadius: 15,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              marginBottom: 14,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={trackingConsent}
                onChange={(event) =>
                  setTrackingConsent(
                    event.target.checked
                  )
                }
                style={{
                  marginTop: 3,
                  width: 17,
                  height: 17,
                }}
              />

              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 850,
                    color: "#0f172a",
                  }}
                >
                  Allow automatic location detection during my shift
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: "#64748b",
                  }}
                >
                  This allows AeroStation Hub to associate your operational location updates with your active wheelchair assignment while you are punched in.
                </div>
              </div>
            </label>
          </div>

          <ActionButton
            variant="success"
            disabled={
              employeeLoading ||
              !employee ||
              busyAction === "punch-in"
            }
            onClick={() => { setLobbyMode(null); setLobbyPromptOpen(true); setError(""); }}
            style={{
              width: isMobile ? "100%" : "auto",
            }}
          >
            {busyAction === "punch-in"
              ? "Punching In..."
              : "Punch In"}
          </ActionButton>
        </PageCard>
      )}

      {lobbyPromptOpen && !isPunchedIn && (
        <div
          role="presentation"
          style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15, 23, 42, 0.58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="lobby-shift-title" style={{ width: "100%", maxWidth: 490, background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 24px 65px rgba(0,0,0,0.25)" }}>
            <h2 id="lobby-shift-title" style={{ margin: "0 0 8px", fontSize: 21, color: "#0f172a" }}>Will you be working as a Lobby Agent today?</h2>
            <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>Select your assignment for this shift. You will be asked again at your next Punch In.</p>
            <label style={{ display: "flex", gap: 10, padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, marginBottom: 10, cursor: "pointer" }}>
              <input type="radio" name="lobby-shift-modal" checked={lobbyMode === true} onChange={() => setLobbyMode(true)} />
              <span><strong>Yes — Lobby Agent</strong><span style={{ display: "block", color: "#64748b", fontSize: 12 }}>Create WCHR and UMNR services. Not available for regular Dispatch assignments.</span></span>
            </label>
            <label style={{ display: "flex", gap: 10, padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, cursor: "pointer" }}>
              <input type="radio" name="lobby-shift-modal" checked={lobbyMode === false} onChange={() => setLobbyMode(false)} />
              <span><strong>No — WCHR Agent</strong><span style={{ display: "block", color: "#64748b", fontSize: 12 }}>Receive regular Dispatch assignments.</span></span>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
              <button type="button" disabled={busyAction === "punch-in"} onClick={() => { setLobbyPromptOpen(false); setLobbyMode(null); }} style={{ padding: "10px 18px", border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", cursor: "pointer" }}>Cancel</button>
              <button type="button" disabled={lobbyMode === null || busyAction === "punch-in"} onClick={async () => { await handlePunchIn(); }} style={{ padding: "10px 18px", border: 0, borderRadius: 10, background: lobbyMode === null ? "#94a3b8" : "#15803d", color: "#fff", fontWeight: 700, cursor: lobbyMode === null ? "not-allowed" : "pointer" }}>{busyAction === "punch-in" ? "Punching In..." : "Confirm Punch In"}</button>
            </div>
            {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 12 }}>{error}</p>}
          </div>
        </div>
      )}

      {isPunchedIn && shift?.shift_mode === "LOBBY_AGENT" && (
        <PageCard style={{ padding: 18, background: "#eff6ff" }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>LOBBY AGENT — Active Shift</div>
          <p style={{ marginTop: 0 }}>Create WCHR or UMNR passenger services. Dispatch will assign an available agent.</p>
          <a href="/wchr/intake" style={{ display: "inline-block", padding: "11px 16px", background: "#1769aa", borderRadius: 10, color: "white", textDecoration: "none", fontWeight: 800 }}>+ New Passenger Service</a>
        </PageCard>
      )}

      {/* ACTIVE SHIFT */}
      {isPunchedIn && (
        <>
          <PageCard
            style={{
              padding: isMobile ? 16 : 20,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: isMobile
                  ? "column"
                  : "row",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: isMobile ? 18 : 20,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Current Shift
                </h2>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                  }}
                >
                  Your status is visible to the WCHR Supervisor dispatch page.
                </p>
              </div>

              <ActionButton
                variant="danger"
                onClick={handlePunchOut}
                disabled={
                  busyAction === "punch-out" ||
                  isBusy
                }
                style={{
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {busyAction === "punch-out"
                  ? "Punching Out..."
                  : isBusy
                  ? "Complete WCHR Before Punch Out"
                  : "Punch Out"}
              </ActionButton>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <InfoField
                label="Punch In"
                value={formatTimestamp(
                  shift?.clock_in_at
                )}
              />

              <InfoField
                label="Shift Time"
                value={formatElapsedTime(
                  shiftElapsedSeconds
                )}
              />

              <InfoField
                label="Availability"
                value={getStatusLabel(
                  availability
                )}
              />

              <InfoField
                label="Current Location"
                value={
                  shift?.current_location ||
                  "Not reported"
                }
              />
            </div>

            {!isBusy && (
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                  gap: 9,
                }}
              >
                <ActionButton
                  variant="success"
                  disabled={
                    busyAction === "availability"
                  }
                  onClick={() =>
                    handleAvailability(
                      WCHR_AGENT_AVAILABILITY.AVAILABLE
                    )
                  }
                >
                  Available
                </ActionButton>

                <ActionButton
                  variant="warning"
                  disabled={
                    busyAction === "availability"
                  }
                  onClick={() =>
                    handleAvailability(
                      WCHR_AGENT_AVAILABILITY.BREAK
                    )
                  }
                >
                  Break
                </ActionButton>

                <ActionButton
                  variant="secondary"
                  disabled={
                    busyAction === "availability"
                  }
                  onClick={() =>
                    handleAvailability(
                      WCHR_AGENT_AVAILABILITY.UNAVAILABLE
                    )
                  }
                >
                  Temporarily Unavailable
                </ActionButton>
              </div>
            )}
          </PageCard>

          {/* AVAILABLE INBOUND PASSENGERS */}
          {!activeReport && (
            <PageCard style={{ padding: isMobile ? 16 : 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#1769aa", textTransform: "uppercase", letterSpacing: "0.08em" }}>IB Arrival</div>
                  <h2 style={{ margin: "4px 0 0", color: "#0f172a", fontSize: isMobile ? 18 : 20, fontWeight: 900 }}>Available CBP Passengers</h2>
                  <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12.5, lineHeight: 1.55, maxWidth: 700 }}>
                    Select a passenger already entered by the supervisor. Accept Pax reserves that passenger to you. The transit timer does not start until you press Start Transit.
                  </p>
                </div>
                <span style={{ display: "inline-flex", padding: "7px 11px", borderRadius: 999, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 11, fontWeight: 900 }}>
                  {ibPassengersLoading ? "Loading..." : `${ibAvailablePassengers.length} available`}
                </span>
              </div>

              {ibPassengersLoading ? (
                <div style={{ padding: 14, borderRadius: 14, background: "#f8fbff", border: "1px solid #dbeafe", color: "#64748b", fontSize: 12.5, fontWeight: 750 }}>Loading inbound passenger list...</div>
              ) : ibAvailablePassengers.length === 0 ? (
                <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 12.5, fontWeight: 750 }}>No inbound passengers are waiting at CBP right now.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
                  {ibAvailablePassengers.map((report) => (
                    <div key={report.id} style={{ padding: 14, borderRadius: 16, background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)", border: "1px solid #bfdbfe", minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", wordBreak: "break-word" }}>{report.passenger_name || "Passenger"}</div>
                      <div style={{ marginTop: 7, display: "grid", gap: 4, color: "#475569", fontSize: 12, fontWeight: 700 }}>
                        <div>Flight: {[report.airline, report.flight_number].filter(Boolean).join(" ") || "Ã¢ÂÂ"}</div>
                        <div>PNR: {report.pnr || "Ã¢ÂÂ"}</div>
                        <div>Type: {report.wch_type || "WCHR"}</div>
                        <div>Pickup: CBP</div>
                      </div>
                      <ActionButton variant="success" onClick={() => handleAcceptInboundPassenger(report)} disabled={Boolean(busyAction) || hasActiveUmnr || availability !== WCHR_AGENT_AVAILABILITY.AVAILABLE} style={{ marginTop: 12, width: "100%" }}>
                        {busyAction === `ib-accept:${report.id}` ? "Accepting Pax..." : "Accept Pax"}
                      </ActionButton>
                    </div>
                  ))}
                </div>
              )}
            </PageCard>
          )}

          {/* NO ASSIGNMENT */}
          {!activeReport && (
            <PageCard
              style={{
                padding: isMobile ? 18 : 24,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: isMobile
                    ? "10px 4px"
                    : "16px 10px",
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    margin: "0 auto 12px",
                    borderRadius: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ecfdf5",
                    border: "1px solid #bbf7d0",
                    fontSize: 13,
                    fontWeight: 900,
                    color: "#166534",
                  }}
                >
                  WCHR
                </div>

                <h2
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: 20,
                    fontWeight: 900,
                  }}
                >
                  No WCHR Assigned
                </h2>

                <p
                  style={{
                    margin: "7px auto 0",
                    maxWidth: 520,
                    color: "#64748b",
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  You are active and ready for the next service. Outbound WCHR may be assigned by a Supervisor, while inbound CBP passengers can be accepted from the list above.
                </p>

                {availability ===
                  WCHR_AGENT_AVAILABILITY.AVAILABLE && !hasActiveUmnr && (
                  <div
                    style={{
                      margin: "13px auto 0",
                      display: "inline-flex",
                      padding: "7px 11px",
                      borderRadius: 999,
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      color: "#166534",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    READY FOR ASSIGNMENT
                  </div>
                )}
              </div>
            </PageCard>
          )}

          {/* ACTIVE ASSIGNMENT */}
          {activeReport && (
            <PageCard
              style={{
                padding: isMobile ? 16 : 21,
                border: assignmentOver30
                  ? "2px solid #fca5a5"
                  : "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection:
                    isMobile || isTablet
                      ? "column"
                      : "row",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: assignmentOver30
                        ? "#b91c1c"
                        : "#1769aa",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {isInboundReport ? "Active IB Arrival Service" : "Active WCHR Assignment"}
                  </div>

                  <h2
                    style={{
                      margin: "5px 0 0",
                      fontSize: isMobile ? 22 : 26,
                      color: "#0f172a",
                      fontWeight: 900,
                    }}
                  >
                    {isInboundReport
                      ? activeReport.passenger_name || "Inbound Passenger"
                      : `Wheelchair ${
                          activeReport.wheelchair_number ||
                          shift?.active_wheelchair_number ||
                          "Ã¢ÂÂ"
                        }`}
                  </h2>

                  <div
                    style={{
                      marginTop: 7,
                      display: "flex",
                      gap: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <StatusBadge
                      status={
                        WCHR_AGENT_AVAILABILITY.BUSY
                      }
                    />

                    <span
                      style={{
                        display: "inline-flex",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#1d4ed8",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {getServiceStatusLabel(
                        currentServiceStatus
                      )}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 18,
                    padding: "13px 16px",
                    minWidth: isMobile
                      ? "100%"
                      : 185,
                    boxSizing: "border-box",
                    background: assignmentOver30
                      ? "#fff1f2"
                      : "#edf7ff",
                    border: assignmentOver30
                      ? "1px solid #fecdd3"
                      : "1px solid #cfe7fb",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: assignmentOver30
                        ? "#b91c1c"
                        : "#1769aa",
                    }}
                  >
                    {isInboundReport ? "CBP Transit Timer" : "Service Timer"}
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 29,
                      lineHeight: 1,
                      fontWeight: 950,
                      color: assignmentOver30
                        ? "#b91c1c"
                        : "#0f4c81",
                      fontVariantNumeric:
                        "tabular-nums",
                    }}
                  >
                    {formatElapsedTime(
                      isInboundReport ? ibTransitElapsedSeconds : assignmentElapsedSeconds
                    )}
                  </div>

                  {assignmentOver30 && (
                    <div
                      style={{
                        marginTop: 7,
                        fontSize: 10.5,
                        color: "#b91c1c",
                        fontWeight: 900,
                      }}
                    >
                      30+ MINUTE SERVICE ALERT
                    </div>
                  )}
                </div>
              </div>

              {assignmentOver30 && (
                <div
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    padding: "11px 13px",
                    background: "#fff1f2",
                    border: "1px solid #fecdd3",
                    color: "#9f1239",
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1.55,
                  }}
                >
                  This wheelchair service has been active for more than 30 minutes. Please update your location or add an operational note.
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <InfoField
                  label="Passenger"
                  value={activeReport.passenger_name}
                />

                <InfoField
                  label="Flight"
                  value={[
                    activeReport.airline,
                    activeReport.flight_number,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />

                <InfoField
                  label="PNR"
                  value={activeReport.pnr}
                />

                <InfoField
                  label="WCHR Type"
                  value={activeReport.wch_type}
                />

                <InfoField
                  label="Pickup Location"
                  value={
                    activeReport.pickup_location ||
                    activeReport.ready_location ||
                    "Counter"
                  }
                />

                <InfoField
                  label="Current Location"
                  value={
                    activeReport.current_location ||
                    shift?.current_location ||
                    "\u2014"
                  }
                />

                <InfoField
                  label="Created"
                  value={formatTimestamp(
                    activeReport.submitted_at ||
                      activeReport.created_at
                  )}
                />

                <InfoField
                  label="Ready for Pickup"
                  value={formatTimestamp(
                    activeReport.ready_for_pickup_at
                  )}
                />

                <InfoField
                  label="Assigned"
                  value={formatTimestamp(
                    activeReport.assigned_at
                  )}
                />

                <InfoField
                  label="Accepted"
                  value={formatTimestamp(
                    isInboundReport
                      ? activeReport.ib_accepted_at || activeReport.assignment_accepted_at
                      : activeReport.assignment_accepted_at
                  )}
                />

                {isInboundReport && (
                  <>
                    <InfoField label="Destination" value={activeReport.ib_destination || selectedIbDestination || "Not selected"} />
                    <InfoField label="Transit Started" value={formatTimestamp(activeReport.ib_transit_started_at)} />
                  </>
                )}
              </div>

              {/* SERVICE FLOW */}
              {isInboundReport ? (
                <div style={{ marginTop: 18, padding: isMobile ? 13 : 16, borderRadius: 17, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#0f172a" }}>IB Arrival Service Progress</h3>
                  <p style={{ margin: "4px 0 13px", color: "#64748b", fontSize: 12, lineHeight: 1.55 }}>
                    Passenger accepted at CBP. Select an available wheelchair and destination. Start Transit only when you physically leave CBP with the passenger. After delivery, the WCHR remains assigned to you until it is physically stored.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))", gap: 9 }}>
                    <ServiceStep number="1" title="Accept Pax" subtitle="Passenger selected from the supervisor's IB list and reserved to you." completed={ibHasAccepted} active={!ibHasAccepted} />
                    <ServiceStep number="2" title="Select WCHR" subtitle="Choose the wheelchair number from available inventory. No manual entry." completed={Boolean(activeReport.wheelchair_number)} active={ibHasAccepted && !ibIsInTransit} />
                    <ServiceStep number="3" title="Start Transit" subtitle="Starts the real CBP-to-destination service timer." completed={ibIsInTransit} active={ibHasAccepted && !ibIsInTransit} />
                    <ServiceStep number="4" title="Delivered" subtitle="Stops the CBP transit timer. The WCHR remains assigned pending storage." completed={ibIsDelivered} active={ibIsInTransit && !ibIsDelivered} />
                    <ServiceStep number="5" title="Store WCHR" subtitle="Select the storage location, physically store the chair, then release it to inventory." completed={safeUpper(currentServiceStatus) === "STORED"} active={ibIsDelivered && safeUpper(currentServiceStatus) !== "STORED"} />
                  </div>

                  {!ibIsInTransit && (
                    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 11 }}>
                      <div>
                        <FieldLabel>WCHR Number</FieldLabel>
                        <SelectInput value={selectedIbWheelchairId} disabled={Boolean(busyAction) || inventoryLoading} onChange={(event) => setSelectedIbWheelchairId(event.target.value)}>
                          <option value="">{inventoryLoading ? "Loading available WCHR..." : "Select available WCHR"}</option>
                          {availableInventory.map((item) => (
                            <option key={item.id} value={item.id}>
                              {getInventoryWheelchairNumber(item)}{item.current_location || item.location ? ` - ${item.current_location || item.location}` : ""}
                            </option>
                          ))}
                        </SelectInput>
                        <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>Only wheelchairs currently marked AVAILABLE appear here.</div>
                      </div>
                      <div>
                        <FieldLabel>Passenger Destination</FieldLabel>
                        <SelectInput value={selectedIbDestination} disabled={Boolean(busyAction)} onChange={(event) => setSelectedIbDestination(event.target.value)}>
                          {IB_DESTINATIONS.map((destination) => (<option key={destination} value={destination}>{destination}</option>))}
                        </SelectInput>
                      </div>
                    </div>
                  )}

                  {ibIsInTransit && !ibIsDelivered && (
                    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                      <InfoField label="WCHR" value={activeReport.wheelchair_number || "Ã¢ÂÂ"} />
                      <InfoField label="From" value="CBP" />
                      <InfoField label="Destination" value={activeReport.ib_destination || selectedIbDestination} />
                    </div>
                  )}

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 9 }}>
                    <ActionButton variant="primary" disabled={Boolean(busyAction) || !ibHasAccepted || ibIsInTransit || !selectedIbWheelchairId || !selectedIbDestination} onClick={handleStartInboundTransit}>
                      {busyAction === "ib-start-transit" ? "Starting Transit..." : ibIsInTransit ? "Transit Started" : "Start Transit"}
                    </ActionButton>
                    <ActionButton variant="success" disabled={Boolean(busyAction) || !ibIsInTransit || ibIsDelivered} onClick={handleDeliverInboundPassenger}>
                      {busyAction === "ib-delivered" ? "Completing Delivery..." : ibIsDelivered ? "Passenger Delivered" : `Delivered to ${activeReport.ib_destination || selectedIbDestination}`}
                    </ActionButton>
                  </div>

                  {ibIsDelivered && safeUpper(currentServiceStatus) !== "STORED" && (
                    <div style={{ marginTop: 14, padding: isMobile ? 13 : 15, borderRadius: 15, background: "#fff7ed", border: "1px solid #fed7aa" }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        WCHR Pending Storage
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 850, color: "#7c2d12", lineHeight: 1.5 }}>
                        Passenger delivery is complete. WCHR {activeReport.wheelchair_number || "â"} remains assigned to you and is NOT available for another service until storage is confirmed.
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <FieldLabel>WCHR Storage Location</FieldLabel>
                        <SelectInput
                          value={selectedStorageLocation}
                          disabled={Boolean(busyAction)}
                          onChange={(event) => setSelectedStorageLocation(event.target.value)}
                        >
                          {WCHR_STORAGE_LOCATIONS.map((location) => (
                            <option key={location} value={location}>
                              {location}
                            </option>
                          ))}
                        </SelectInput>
                      </div>

                      <ActionButton
                        variant="warning"
                        disabled={Boolean(busyAction) || !selectedStorageLocation}
                        onClick={handleStoreInboundWheelchair}
                        style={{ marginTop: 11, width: "100%" }}
                      >
                        {busyAction === "ib-store-wchr"
                          ? "Storing WCHR..."
                          : `Store WCHR ${activeReport.wheelchair_number || ""}`}
                      </ActionButton>
                    </div>
                  )}

                  {!ibIsInTransit && (
                    <div style={{ marginTop: 11, padding: "10px 12px", borderRadius: 12, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 11.5, fontWeight: 800, lineHeight: 1.55 }}>
                      Accept Pax does not start service time. Selecting a WCHR also does not start service time. The KPI begins only when Start Transit is pressed at CBP.
                    </div>
                  )}
                </div>
              ) : (
              <div
                style={{
                  marginTop: 18,
                  padding: isMobile ? 13 : 16,
                  borderRadius: 17,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Service Progress
                </h3>

                <p
                  style={{
                    margin: "4px 0 13px",
                    color: "#64748b",
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  Follow the steps in order. Arrival at gate releases you for another WCHR and transfers the passenger to Supervisor gate monitoring.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(4, minmax(0, 1fr))",
                    gap: 9,
                  }}
                >
                  <ServiceStep
                    number="1"
                    title="Accept Assignment"
                    subtitle="Confirm you received and accepted the WCHR assignment from Dispatch."
                    completed={hasAccepted}
                    active={!hasAccepted}
                  />

                  <ServiceStep
                    number="2"
                    title="Pick Up WCHR"
                    subtitle="Confirm you physically received the assigned wheelchair/passenger."
                    completed={hasPickedUp}
                    active={hasAccepted && !hasPickedUp}
                  />

                  <ServiceStep
                    number="3"
                    title="In Transit"
                    subtitle="Confirm the passenger journey from counter toward the airside/gate."
                    completed={isInTransit}
                    active={hasPickedUp && !isInTransit}
                  />

                  <ServiceStep
                    number="4"
                    title="Arrive at Gate"
                    subtitle="Transfer the passenger to Supervisor gate monitoring and become available."
                    completed={isAtGate}
                    active={isInTransit && !isAtGate}
                  />
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "repeat(4, minmax(0, 1fr))",
                    gap: 9,
                  }}
                >
                  <ActionButton
                    variant="success"
                    disabled={Boolean(busyAction) || hasAccepted || hasActiveUmnr}
                    onClick={() => setAssignmentDecisionOpen(true)}
                  >
                    {busyAction === "accept"
                      ? "Accepting..."
                      : hasAccepted
                      ? "Assignment Accepted"
                      : "Accept WCHR"}
                  </ActionButton>

                  <ActionButton
                    variant="success"
                    disabled={
                      Boolean(busyAction) ||
                      !hasAccepted ||
                      hasPickedUp
                    }
                    onClick={handleMarkPickedUp}
                  >
                    {busyAction === "pickup"
                      ? "Saving Pickup..."
                      : hasPickedUp
                      ? "Picked Up"
                      : "Mark Picked Up"}
                  </ActionButton>

                  <ActionButton
                    variant="primary"
                    disabled={
                      Boolean(busyAction) ||
                      !hasPickedUp ||
                      isInTransit
                    }
                    onClick={handleMarkInTransit}
                  >
                    {busyAction === "transit"
                      ? "Starting Transit..."
                      : isInTransit
                      ? "In Transit"
                      : "Start Transit"}
                  </ActionButton>

                  <ActionButton
                    variant="warning"
                    disabled={
                      Boolean(busyAction) ||
                      !isInTransit ||
                      isAtGate
                    }
                    onClick={handleArriveAtGate}
                  >
                    {busyAction === "gate"
                      ? "Saving Gate Arrival..."
                      : isAtGate
                      ? "At Gate"
                      : "Arrived at Gate"}
                  </ActionButton>
                </div>
              </div>

              )}

              {/* LOCATION + NOTES */}
              <div
                style={{
                  marginTop: 18,
                  padding: isMobile ? 13 : 16,
                  borderRadius: 17,
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Update Journey
                </h3>

                <p
                  style={{
                    margin: "4px 0 13px",
                    color: "#64748b",
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  Update where you and the passenger are during the service. The same location is now saved on both your active shift and the WCHR report.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr"
                      : "minmax(180px, 0.75fr) minmax(240px, 1.25fr)",
                    gap: 11,
                  }}
                >
                  <div>
                    <FieldLabel>
                      Current Location
                    </FieldLabel>

                    <SelectInput
                      value={selectedLocation}
                      disabled={
                        busyAction === "location" ||
                        busyAction === "gate"
                      }
                      onChange={(event) =>
                        setSelectedLocation(
                          event.target.value
                        )
                      }
                    >
                      {AGENT_LOCATIONS.map(
                        (location) => (
                          <option
                            key={location}
                            value={location}
                          >
                            {location}
                          </option>
                        )
                      )}
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>
                      Operational Note
                    </FieldLabel>

                    <TextArea
                      rows={3}
                      value={locationNote}
                      disabled={
                        busyAction === "location" ||
                        busyAction === "comment" ||
                        busyAction === "pickup" ||
                        busyAction === "transit" ||
                        busyAction === "gate"
                      }
                      onChange={(event) =>
                        setLocationNote(
                          event.target.value
                        )
                      }
                      placeholder="Example: Passing TSA checkpoint, passenger requested restroom, waiting for train..."
                    />
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 11,
                    display: "flex",
                    flexDirection: isMobile
                      ? "column"
                      : "row",
                    gap: 8,
                  }}
                >
                  <ActionButton
                    variant="primary"
                    disabled={
                      Boolean(busyAction)
                    }
                    onClick={handleUpdateLocation}
                    style={{
                      width: isMobile
                        ? "100%"
                        : "auto",
                    }}
                  >
                    {busyAction === "location"
                      ? "Updating..."
                      : "Update Location"}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    disabled={
                      Boolean(busyAction) ||
                      !cleanText(locationNote)
                    }
                    onClick={handleAddComment}
                    style={{
                      width: isMobile
                        ? "100%"
                        : "auto",
                    }}
                  >
                    {busyAction === "comment"
                      ? "Saving..."
                      : "Add Note Only"}
                  </ActionButton>
                </div>

                {!isInboundReport && hasPickedUp && !isAtGate && (
                  <div
                    style={{
                      marginTop: 11,
                      padding: "9px 11px",
                      borderRadius: 12,
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1.5,
                    }}
                  >
                    When you reach the passenger's gate, select the correct Gate F78-F90 above before pressing <b>Arrived at Gate</b>.
                  </div>
                )}
              </div>

              {/* AGENT RESTRICTIONS */}
              <div
                style={{
                  marginTop: 14,
                  padding: "11px 13px",
                  borderRadius: 14,
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#9a3412",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  fontWeight: 750,
                }}
              >
                {isInboundReport
                  ? ibIsDelivered
                    ? "Passenger delivery is complete, but the WCHR is still assigned to you. You cannot accept another passenger or Punch Out until the wheelchair is physically stored and Store WCHR is confirmed."
                    : "You currently have an active inbound passenger. You cannot accept another passenger or Punch Out until the passenger is delivered and the assigned WCHR is stored, or WCHR Management releases the service."
                  : "You currently have an active wheelchair assignment. You cannot accept another WCHR or Punch Out until the passenger reaches the gate or WCHR Management releases the assignment. New assignments must be accepted before pickup begins."}
              </div>
            </PageCard>
          )}
        </>
      )}

      {/* LOADING */}
      {(employeeLoading || shiftLoading) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              textAlign: "center",
              color: "#64748b",
              fontSize: 12.5,
              fontWeight: 750,
            }}
          >
            Loading WCHR operational profile...
          </div>
        </PageCard>
      )}

      {/* UMNR operational tools are below the main WCHR workflow. */}
      <section aria-label="UMNR operations" style={{ margin: "16px 0", border: "1px solid #bfdbfe", borderRadius: 14, padding: 16, background: "#f8fbff", color: "#0f172a" }}>
        {import.meta.env.VITE_UMNR_ENABLED === "true" ? (
          <UmnrOperationsPanel mode="agent" employeeId={agentId} />
        ) : (
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>UMNR · My Services</h2>
            <p style={{ margin: 0, color: "#475569" }}>Module in preparation. UMNR service creation, assignments and custody actions are disabled until authorization, capacity controls and Firebase security are completed.</p>
          </div>
        )}
      </section>

      {/* FOOTER */}
      <div
        style={{
          textAlign: "center",
          padding: "2px 8px 10px",
          color: "#94a3b8",
          fontSize: 10,
        }}
      >
        {APP_NAME} {" | "} {APP_SUBTITLE}
      </div>
    </div>
  );
}
