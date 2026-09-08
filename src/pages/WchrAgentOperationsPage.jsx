// src/pages/WchrAgentOperationsPage.jsx

import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
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
  "Main Terminal",
  "Wheelchair Storage",
  "Other",
];

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

function formatTimestamp(value) {
  const millis = getTimestampMillis(value);

  if (!millis) return "—";

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
  return (
    report?.timer_started_at ||
    report?.ready_for_pickup_at ||
    report?.assigned_at ||
    report?.pickup_at ||
    report?.submitted_at ||
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
    PICKED_UP: "Picked Up",
    IN_TRANSIT: "In Transit",
    AT_GATE: "At Gate",
    BOARDING: "Boarding",
    BOARDED: "Boarded",
    PENDING_STORAGE: "Pending Storage",
    STORED: "Stored",
    COMPLETED: "Passenger Delivered",
    CANCELLED: "Cancelled",
  };

  return labels[status] || status || "In Progress";
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

function FieldLabel({
  children,
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 900,
        color: "#64748b",
        textTransform:
          "uppercase",
        letterSpacing:
          "0.07em",
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
        boxSizing:
          "border-box",
        border:
          "1px solid #dbeafe",
        borderRadius: 13,
        padding:
          "11px 13px",
        background:
          props.disabled
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
        boxSizing:
          "border-box",
        border:
          "1px solid #dbeafe",
        borderRadius: 13,
        padding:
          "11px 13px",
        background:
          props.disabled
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
      border:
        "1px solid #cfe7fb",
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
        padding:
          "10px 14px",
        fontSize: 13,
        fontWeight: 850,
        fontFamily: "inherit",
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled
          ? 0.55
          : 1,
        whiteSpace: "nowrap",
        boxSizing:
          "border-box",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
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
        borderRadius: 14,
        padding:
          "10px 11px",
        background:
          "#f8fbff",
        border:
          "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.06em",
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
          wordBreak:
            "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
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
        display:
          "inline-flex",
        alignItems:
          "center",
        justifyContent:
          "center",
        borderRadius: 999,
        padding:
          "6px 10px",
        background,
        color,
        border:
          `1px solid ${border}`,
        fontSize: 11,
        fontWeight: 900,
        whiteSpace:
          "nowrap",
      }}
    >
      {getStatusLabel(
        normalized
      )}
    </span>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function WchrAgentOperationsPage() {
  const { user } =
    useUser();

  const {
    isMobile,
    isTablet,
  } = useViewport();

  const [employee, setEmployee] =
    useState(null);

  const [
    employeeLoading,
    setEmployeeLoading,
  ] = useState(true);

  const [
    shift,
    setShift,
  ] = useState(null);

  const [
    shiftLoading,
    setShiftLoading,
  ] = useState(true);

  const [
    activeReport,
    setActiveReport,
  ] = useState(null);

  const [
    trackingConsent,
    setTrackingConsent,
  ] = useState(false);

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState("Counter");

  const [
    locationNote,
    setLocationNote,
  ] = useState("");

  const [
    busyAction,
    setBusyAction,
  ] = useState("");

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
  // LIVE TIMER
  // ============================================================

  useEffect(() => {
    const intervalId =
      window.setInterval(
        () => {
          setNow(
            Date.now()
          );
        },
        1000
      );

    return () => {
      window.clearInterval(
        intervalId
      );
    };
  }, []);

  // ============================================================
  // FIND EMPLOYEE PROFILE
  // ============================================================

  useEffect(() => {
    let cancelled =
      false;

    async function loadEmployee() {
      if (!user) {
        setEmployee(null);
        setEmployeeLoading(false);
        return;
      }

      try {
        setEmployeeLoading(true);
        setError("");

        const linkedEmployeeId =
          cleanText(
            user?.employeeId
          );

        if (
          linkedEmployeeId
        ) {
          const snapshot =
            await getDoc(
              doc(
                db,
                "employees",
                linkedEmployeeId
              )
            );

          if (
            snapshot.exists()
          ) {
            if (
              !cancelled
            ) {
              setEmployee({
                id:
                  snapshot.id,
                ...snapshot.data(),
              });
            }

            return;
          }
        }

        const usernames =
          Array.from(
            new Set(
              [
                user?.username,
                user?.loginUsername,
              ]
                .map(
                  normalizeText
                )
                .filter(
                  Boolean
                )
            )
          );

        for (
          const username
          of usernames
        ) {
          const employeeQuery =
            query(
              collection(
                db,
                "employees"
              ),
              where(
                "loginUsername",
                "==",
                username
              )
            );

          const employeeSnapshot =
            await getDocs(
              employeeQuery
            );

          if (
            !employeeSnapshot.empty
          ) {
            const first =
              employeeSnapshot
                .docs[0];

            if (
              !cancelled
            ) {
              setEmployee({
                id: first.id,
                ...first.data(),
              });
            }

            return;
          }
        }

        if (
          !cancelled
        ) {
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

        if (
          !cancelled
        ) {
          setEmployee(null);

          setError(
            "Could not load your employee profile."
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setEmployeeLoading(
            false
          );
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

  const agentId =
    useMemo(
      () =>
        getEmployeeIdentifier(
          employee,
          user
        ),
      [
        employee,
        user,
      ]
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

    const shiftRef =
      doc(
        db,
        "wchr_agent_shifts",
        agentId
      );

    const unsubscribe =
      onSnapshot(
        shiftRef,
        (snapshot) => {
          if (
            snapshot.exists()
          ) {
            const data = {
              id:
                snapshot.id,
              ...snapshot.data(),
            };

            setShift(
              data
            );

            if (
              data.current_location
            ) {
              setSelectedLocation(
                data.current_location
              );
            }

            setTrackingConsent(
              data.live_tracking_consent ===
                true
            );
          } else {
            setShift(
              null
            );
          }

          setShiftLoading(
            false
          );
        },
        (err) => {
          console.error(
            "Error listening WCHR agent shift:",
            err
          );

          setShiftLoading(
            false
          );

          setError(
            "Could not load your WCHR shift."
          );
        }
      );

    return () =>
      unsubscribe();
  }, [agentId]);

  // ============================================================
  // ACTIVE REPORT LISTENER
  // ============================================================

  const activeReportId =
    cleanText(
      shift?.active_report_id
    );

  useEffect(() => {
    if (
      !activeReportId
    ) {
      setActiveReport(
        null
      );

      return undefined;
    }

    const reportRef =
      doc(
        db,
        "wch_reports",
        activeReportId
      );

    const unsubscribe =
      onSnapshot(
        reportRef,
        (snapshot) => {
          if (
            snapshot.exists()
          ) {
            setActiveReport({
              id:
                snapshot.id,
              ...snapshot.data(),
            });
          } else {
            setActiveReport(
              null
            );
          }
        },
        (err) => {
          console.error(
            "Error listening active WCHR:",
            err
          );
        }
      );

    return () =>
      unsubscribe();
  }, [
    activeReportId,
  ]);

  // ============================================================
  // DERIVED VALUES
  // ============================================================

  const isPunchedIn =
    safeUpper(
      shift?.status
    ) ===
    WCHR_AGENT_STATUS.ACTIVE;

  const availability =
    safeUpper(
      shift?.availability_status
    );

  const isBusy =
    availability ===
      WCHR_AGENT_AVAILABILITY.BUSY ||
    Boolean(
      activeReportId
    );

  const shiftElapsedSeconds =
    isPunchedIn
      ? getElapsedSeconds(
          shift?.clock_in_at,
          now
        )
      : 0;

  const assignmentElapsedSeconds =
    activeReport
      ? getAssignmentElapsedSeconds(
          activeReport,
          now
        )
      : 0;

  const assignmentMinutes =
    activeReport
      ? getAssignmentMinutes(
          activeReport,
          now
        )
      : 0;

  const assignmentOver30 =
    assignmentMinutes >= 30 &&
    safeUpper(
      activeReport?.tracking_status
    ) !==
      WCHR_SERVICE_STATUS.STORED;

  // ============================================================
  // PUNCH IN
  // ============================================================

  const handlePunchIn =
    async () => {
      if (
        !employee
      ) {
        setError(
          "Employee profile not found."
        );

        return;
      }

      try {
        setBusyAction(
          "punch-in"
        );

        setError("");
        setMessage("");

        await punchInWchrAgent({
          employee,
          user,
          trackingConsent,
        });

        setMessage(
          "Punch In completed. You are now active in WCHR operations."
        );
      } catch (err) {
        console.error(
          "Punch In error:",
          err
        );

        setError(
          err?.message ||
            "Unable to Punch In."
        );
      } finally {
        setBusyAction(
          ""
        );
      }
    };

  // ============================================================
  // PUNCH OUT
  // ============================================================

  const handlePunchOut =
    async () => {
      if (
        !agentId
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Punch Out from WCHR operations?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setBusyAction(
          "punch-out"
        );

        setError("");
        setMessage("");

        await punchOutWchrAgent({
          agentId,
          user,
        });

        setMessage(
          "Punch Out completed."
        );
      } catch (err) {
        console.error(
          "Punch Out error:",
          err
        );

        setError(
          err?.message ||
            "Unable to Punch Out."
        );
      } finally {
        setBusyAction(
          ""
        );
      }
    };

  // ============================================================
  // AVAILABILITY CHANGE
  // ============================================================

  const handleAvailability =
    async (
      value
    ) => {
      if (
        !agentId ||
        !isPunchedIn
      ) {
        return;
      }

      if (
        isBusy
      ) {
        setError(
          "Availability cannot be changed while a wheelchair is assigned to you."
        );

        return;
      }

      try {
        setBusyAction(
          "availability"
        );

        setError("");
        setMessage("");

        await updateWchrAgentAvailability({
          agentId,
          availability:
            value,
        });

        setMessage(
          `Availability changed to ${getStatusLabel(
            value
          )}.`
        );
      } catch (err) {
        console.error(
          "Availability error:",
          err
        );

        setError(
          err?.message ||
            "Unable to change availability."
        );
      } finally {
        setBusyAction(
          ""
        );
      }
    };

  // ============================================================
  // LOCATION UPDATE
  // ============================================================

  const handleUpdateLocation =
    async () => {
      if (
        !agentId ||
        !activeReport
      ) {
        setError(
          "No wheelchair is currently assigned."
        );

        return;
      }

      const location =
        cleanText(
          selectedLocation
        );

      if (
        !location
      ) {
        setError(
          "Please select a location."
        );

        return;
      }

      try {
        setBusyAction(
          "location"
        );

        setError("");
        setMessage("");

        await updateWchrAgentLocation({
          agentId,
          location,
        });

        await addWchrTimelineEvent({
          reportId:
            activeReport.id,

          eventType:
            "LOCATION_UPDATE",

          wheelchairNumber:
            activeReport.wheelchair_number ||
            shift?.active_wheelchair_number ||
            "",

          agentId,

          agentName:
            getEmployeeName(
              employee
            ),

          location,

          note:
            cleanText(
              locationNote
            ) ||
            `Agent location updated to ${location}.`,

          user,
        });

        setLocationNote(
          ""
        );

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
        setBusyAction(
          ""
        );
      }
    };

  // ============================================================
  // ADD COMMENT
  // ============================================================

  const handleAddComment =
    async () => {
      const note =
        cleanText(
          locationNote
        );

      if (
        !activeReport
      ) {
        setError(
          "No wheelchair is assigned."
        );

        return;
      }

      if (
        !note
      ) {
        setError(
          "Please write a comment first."
        );

        return;
      }

      try {
        setBusyAction(
          "comment"
        );

        setError("");
        setMessage("");

        await addWchrTimelineEvent({
          reportId:
            activeReport.id,

          eventType:
            "COMMENT",

          wheelchairNumber:
            activeReport.wheelchair_number ||
            "",

          agentId,

          agentName:
            getEmployeeName(
              employee
            ),

          location:
            selectedLocation ||
            activeReport.current_location ||
            "",

          note,

          user,
        });

        setLocationNote(
          ""
        );

        setMessage(
          "Comment saved."
        );
      } catch (err) {
        console.error(
          "WCHR comment error:",
          err
        );

        setError(
          err?.message ||
            "Unable to save comment."
        );
      } finally {
        setBusyAction(
          ""
        );
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
        gap: isMobile
          ? 12
          : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        boxSizing:
          "border-box",
      }}
    >
      {/* ====================================================== */}
      {/* HERO */}
      {/* ====================================================== */}

      <div
        style={{
          position:
            "relative",
          overflow:
            "hidden",
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius:
            isMobile
              ? 20
              : 28,
          padding:
            isMobile
              ? 17
              : 23,
          color:
            "#ffffff",
          boxShadow:
            "0 22px 55px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width: 220,
            height: 220,
            borderRadius:
              999,
            background:
              "rgba(255,255,255,0.07)",
            right: -70,
            top: -90,
          }}
        />

        <div
          style={{
            position:
              "relative",
            display:
              "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            alignItems:
              isMobile
                ? "flex-start"
                : "center",
            justifyContent:
              "space-between",
            gap: 16,
          }}
        >
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap: 13,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                flex:
                  "0 0 52px",
                borderRadius:
                  16,
                background:
                  "#ffffff",
                overflow:
                  "hidden",
                border:
                  "1px solid rgba(255,255,255,0.9)",
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
              <div
                style={{
                  fontSize:
                    9.5,
                  fontWeight:
                    900,
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.14em",
                  color:
                    "rgba(255,255,255,0.72)",
                }}
              >
                {APP_NAME} · WCHR Operations
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",
                  fontSize:
                    isMobile
                      ? 23
                      : 28,
                  fontWeight:
                    900,
                  lineHeight:
                    1.08,
                  letterSpacing:
                    "-0.035em",
                }}
              >
                WCHR Agent Operations
              </h1>

              <div
                style={{
                  fontSize:
                    12,
                  lineHeight:
                    1.5,
                  color:
                    "rgba(255,255,255,0.85)",
                }}
              >
                Punch In, manage your availability and follow your assigned
                wheelchair service.
              </div>

              <div
                style={{
                  marginTop:
                    3,
                  fontSize:
                    10,
                  color:
                    "rgba(255,255,255,0.67)",
                  fontWeight:
                    700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          {isPunchedIn && (
            <div
              style={{
                padding:
                  "10px 13px",
                borderRadius:
                  14,
                border:
                  "1px solid rgba(255,255,255,0.2)",
                background:
                  "rgba(255,255,255,0.14)",
                minWidth:
                  isMobile
                    ? "100%"
                    : 150,
                boxSizing:
                  "border-box",
              }}
            >
              <div
                style={{
                  fontSize:
                    9.5,
                  fontWeight:
                    850,
                  color:
                    "rgba(255,255,255,0.74)",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.08em",
                }}
              >
                Shift Time
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize:
                    24,
                  lineHeight: 1,
                  fontWeight:
                    900,
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
              padding:
                "11px 13px",
              borderRadius:
                14,
              background:
                "#fff1f2",
              border:
                "1px solid #fecdd3",
              color:
                "#9f1239",
              fontSize:
                13,
              lineHeight:
                1.55,
              fontWeight:
                750,
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
              padding:
                "11px 13px",
              borderRadius:
                14,
              background:
                "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              color:
                "#065f46",
              fontSize:
                13,
              lineHeight:
                1.55,
              fontWeight:
                750,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* EMPLOYEE */}
      {/* ====================================================== */}

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
            display:
              "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            justifyContent:
              "space-between",
            alignItems:
              isMobile
                ? "stretch"
                : "center",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  10,
                fontWeight:
                  900,
                color:
                  "#1769aa",
                letterSpacing:
                  "0.08em",
                textTransform:
                  "uppercase",
              }}
            >
              WCHR Agent
            </div>

            <div
              style={{
                marginTop:
                  4,
                fontSize:
                  isMobile
                    ? 18
                    : 21,
                fontWeight:
                  900,
                color:
                  "#0f172a",
              }}
            >
              {employeeLoading
                ? "Loading employee..."
                : employee
                ? getEmployeeName(
                    employee
                  )
                : getVisibleUserName(
                    user
                  )}
            </div>

            {employee && (
              <div
                style={{
                  marginTop:
                    3,
                  color:
                    "#64748b",
                  fontSize:
                    12,
                }}
              >
                {[
                  employee.position,
                  employee.department,
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " · "
                  )}
              </div>
            )}
          </div>

          {!employeeLoading &&
            employee && (
              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                  flexWrap:
                    "wrap",
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
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    padding:
                      "6px 10px",
                    borderRadius:
                      999,
                    fontSize:
                      11,
                    fontWeight:
                      900,
                    background:
                      isPunchedIn
                        ? "#ecfdf5"
                        : "#f8fafc",
                    color:
                      isPunchedIn
                        ? "#166534"
                        : "#64748b",
                    border:
                      isPunchedIn
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

      {/* ====================================================== */}
      {/* PUNCH IN */}
      {/* ====================================================== */}

      {!isPunchedIn && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 16
                : 21,
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
              fontWeight:
                900,
            }}
          >
            Start WCHR Shift
          </h2>

          <p
            style={{
              margin:
                "5px 0 15px",
              fontSize:
                12.5,
              lineHeight:
                1.6,
              color:
                "#64748b",
            }}
          >
            Punch In to become visible to WCHR Supervisors as an active agent.
          </p>

          <div
            style={{
              padding:
                "13px 14px",
              borderRadius:
                15,
              background:
                "#f8fbff",
              border:
                "1px solid #dbeafe",
              marginBottom:
                14,
            }}
          >
            <label
              style={{
                display:
                  "flex",
                alignItems:
                  "flex-start",
                gap: 10,
                cursor:
                  "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={
                  trackingConsent
                }
                onChange={(
                  event
                ) =>
                  setTrackingConsent(
                    event.target.checked
                  )
                }
                style={{
                  marginTop:
                    3,
                  width: 17,
                  height: 17,
                }}
              />

              <div>
                <div
                  style={{
                    fontSize:
                      13,
                    fontWeight:
                      850,
                    color:
                      "#0f172a",
                  }}
                >
                  Allow live operational tracking during my WCHR shift
                </div>

                <div
                  style={{
                    marginTop:
                      4,
                    fontSize:
                      11.5,
                    lineHeight:
                      1.55,
                    color:
                      "#64748b",
                  }}
                >
                  This allows AeroStation Hub to associate your operational
                  location updates with your active wheelchair assignment while
                  you are punched in.
                </div>
              </div>
            </label>
          </div>

          <ActionButton
            variant="success"
            disabled={
              employeeLoading ||
              !employee ||
              busyAction ===
                "punch-in"
            }
            onClick={
              handlePunchIn
            }
            style={{
              width:
                isMobile
                  ? "100%"
                  : "auto",
            }}
          >
            {busyAction ===
            "punch-in"
              ? "Punching In..."
              : "Punch In"}
          </ActionButton>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* ACTIVE SHIFT */}
      {/* ====================================================== */}

      {isPunchedIn && (
        <>
          <PageCard
            style={{
              padding:
                isMobile
                  ? 16
                  : 20,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                flexDirection:
                  isMobile
                    ? "column"
                    : "row",
                justifyContent:
                  "space-between",
                gap: 14,
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
                    fontWeight:
                      900,
                    color:
                      "#0f172a",
                  }}
                >
                  Current Shift
                </h2>

                <p
                  style={{
                    margin:
                      "4px 0 0",
                    color:
                      "#64748b",
                    fontSize:
                      12.5,
                    lineHeight:
                      1.55,
                  }}
                >
                  Your status is visible to the WCHR Supervisor dispatch page.
                </p>
              </div>

              <ActionButton
                variant="danger"
                onClick={
                  handlePunchOut
                }
                disabled={
                  busyAction ===
                    "punch-out" ||
                  isBusy
                }
                style={{
                  width:
                    isMobile
                      ? "100%"
                      : "auto",
                }}
              >
                {busyAction ===
                "punch-out"
                  ? "Punching Out..."
                  : isBusy
                  ? "Complete WCHR Before Punch Out"
                  : "Punch Out"}
              </ActionButton>
            </div>

            <div
              style={{
                marginTop:
                  16,
                display:
                  "grid",
                gridTemplateColumns:
                  isMobile
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
                  marginTop:
                    16,
                  display:
                    "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "repeat(3, minmax(0, 1fr))",
                  gap: 9,
                }}
              >
                <ActionButton
                  variant="success"
                  disabled={
                    busyAction ===
                    "availability"
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
                    busyAction ===
                    "availability"
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
                    busyAction ===
                    "availability"
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

          {/* ================================================== */}
          {/* NO ASSIGNMENT */}
          {/* ================================================== */}

          {!activeReport && (
            <PageCard
              style={{
                padding:
                  isMobile
                    ? 18
                    : 24,
              }}
            >
              <div
                style={{
                  textAlign:
                    "center",
                  padding:
                    isMobile
                      ? "10px 4px"
                      : "16px 10px",
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    margin:
                      "0 auto 12px",
                    borderRadius:
                      18,
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    background:
                      "#ecfdf5",
                    border:
                      "1px solid #bbf7d0",
                    fontSize:
                      27,
                  }}
                >
                  ♿
                </div>

                <h2
                  style={{
                    margin: 0,
                    color:
                      "#0f172a",
                    fontSize:
                      20,
                    fontWeight:
                      900,
                  }}
                >
                  No WCHR Assigned
                </h2>

                <p
                  style={{
                    margin:
                      "7px auto 0",
                    maxWidth:
                      520,
                    color:
                      "#64748b",
                    fontSize:
                      13,
                    lineHeight:
                      1.6,
                  }}
                >
                  You are active and waiting for a WCHR Supervisor to assign
                  your next passenger.
                </p>

                {availability ===
                  WCHR_AGENT_AVAILABILITY.AVAILABLE && (
                  <div
                    style={{
                      margin:
                        "13px auto 0",
                      display:
                        "inline-flex",
                      padding:
                        "7px 11px",
                      borderRadius:
                        999,
                      background:
                        "#ecfdf5",
                      border:
                        "1px solid #a7f3d0",
                      color:
                        "#166534",
                      fontSize:
                        11,
                      fontWeight:
                        900,
                    }}
                  >
                    READY FOR ASSIGNMENT
                  </div>
                )}
              </div>
            </PageCard>
          )}

          {/* ================================================== */}
          {/* ACTIVE ASSIGNMENT */}
          {/* ================================================== */}

          {activeReport && (
            <PageCard
              style={{
                padding:
                  isMobile
                    ? 16
                    : 21,
                border:
                  assignmentOver30
                    ? "2px solid #fca5a5"
                    : "1px solid #dbeafe",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  flexDirection:
                    isMobile ||
                    isTablet
                      ? "column"
                      : "row",
                  justifyContent:
                    "space-between",
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize:
                        10,
                      fontWeight:
                        900,
                      color:
                        assignmentOver30
                          ? "#b91c1c"
                          : "#1769aa",
                      textTransform:
                        "uppercase",
                      letterSpacing:
                        "0.08em",
                    }}
                  >
                    Active WCHR Assignment
                  </div>

                  <h2
                    style={{
                      margin:
                        "5px 0 0",
                      fontSize:
                        isMobile
                          ? 22
                          : 26,
                      color:
                        "#0f172a",
                      fontWeight:
                        900,
                    }}
                  >
                    Wheelchair{" "}
                    {activeReport.wheelchair_number ||
                      shift?.active_wheelchair_number ||
                      "—"}
                  </h2>

                  <div
                    style={{
                      marginTop:
                        7,
                      display:
                        "flex",
                      gap: 7,
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <StatusBadge
                      status={
                        WCHR_AGENT_AVAILABILITY.BUSY
                      }
                    />

                    <span
                      style={{
                        display:
                          "inline-flex",
                        padding:
                          "6px 10px",
                        borderRadius:
                          999,
                        background:
                          "#eff6ff",
                        border:
                          "1px solid #bfdbfe",
                        color:
                          "#1d4ed8",
                        fontSize:
                          11,
                        fontWeight:
                          900,
                      }}
                    >
                      {getServiceStatusLabel(
                        activeReport.tracking_status
                      )}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    borderRadius:
                      18,
                    padding:
                      "13px 16px",
                    minWidth:
                      isMobile
                        ? "100%"
                        : 185,
                    boxSizing:
                      "border-box",
                    background:
                      assignmentOver30
                        ? "#fff1f2"
                        : "#edf7ff",
                    border:
                      assignmentOver30
                        ? "1px solid #fecdd3"
                        : "1px solid #cfe7fb",
                  }}
                >
                  <div
                    style={{
                      fontSize:
                        9.5,
                      fontWeight:
                        900,
                      textTransform:
                        "uppercase",
                      letterSpacing:
                        "0.07em",
                      color:
                        assignmentOver30
                          ? "#b91c1c"
                          : "#1769aa",
                    }}
                  >
                    Service Timer
                  </div>

                  <div
                    style={{
                      marginTop:
                        4,
                      fontSize:
                        29,
                      lineHeight:
                        1,
                      fontWeight:
                        950,
                      color:
                        assignmentOver30
                          ? "#b91c1c"
                          : "#0f4c81",
                      fontVariantNumeric:
                        "tabular-nums",
                    }}
                  >
                    {formatElapsedTime(
                      assignmentElapsedSeconds
                    )}
                  </div>

                  {assignmentOver30 && (
                    <div
                      style={{
                        marginTop:
                          7,
                        fontSize:
                          10.5,
                        color:
                          "#b91c1c",
                        fontWeight:
                          900,
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
                    marginTop:
                      14,
                    borderRadius:
                      14,
                    padding:
                      "11px 13px",
                    background:
                      "#fff1f2",
                    border:
                      "1px solid #fecdd3",
                    color:
                      "#9f1239",
                    fontSize:
                      12,
                    fontWeight:
                      800,
                    lineHeight:
                      1.55,
                  }}
                >
                  This wheelchair service has been active for more than 30
                  minutes. Please update your location or add an operational
                  note.
                </div>
              )}

              <div
                style={{
                  marginTop:
                    16,
                  display:
                    "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <InfoField
                  label="Passenger"
                  value={
                    activeReport.passenger_name
                  }
                />

                <InfoField
                  label="Flight"
                  value={[
                    activeReport.airline,
                    activeReport.flight_number,
                  ]
                    .filter(
                      Boolean
                    )
                    .join(
                      " "
                    )}
                />

                <InfoField
                  label="PNR"
                  value={
                    activeReport.pnr
                  }
                />

                <InfoField
                  label="WCHR Type"
                  value={
                    activeReport.wch_type
                  }
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
                    "—"
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
              </div>

              {/* ============================================== */}
              {/* LOCATION + NOTES */}
              {/* ============================================== */}

              <div
                style={{
                  marginTop:
                    18,
                  padding:
                    isMobile
                      ? 13
                      : 16,
                  borderRadius:
                    17,
                  background:
                    "#f8fbff",
                  border:
                    "1px solid #dbeafe",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      16,
                    fontWeight:
                      900,
                    color:
                      "#0f172a",
                  }}
                >
                  Update Journey
                </h3>

                <p
                  style={{
                    margin:
                      "4px 0 13px",
                    color:
                      "#64748b",
                    fontSize:
                      12,
                    lineHeight:
                      1.55,
                  }}
                >
                  Update where you and the passenger are during the service.
                </p>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      isMobile
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
                      value={
                        selectedLocation
                      }
                      disabled={
                        busyAction ===
                        "location"
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedLocation(
                          event.target.value
                        )
                      }
                    >
                      {AGENT_LOCATIONS.map(
                        (
                          location
                        ) => (
                          <option
                            key={
                              location
                            }
                            value={
                              location
                            }
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
                      value={
                        locationNote
                      }
                      disabled={
                        busyAction ===
                          "location" ||
                        busyAction ===
                          "comment"
                      }
                      onChange={(
                        event
                      ) =>
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
                    marginTop:
                      11,
                    display:
                      "flex",
                    flexDirection:
                      isMobile
                        ? "column"
                        : "row",
                    gap: 8,
                  }}
                >
                  <ActionButton
                    variant="primary"
                    disabled={
                      busyAction ===
                      "location"
                    }
                    onClick={
                      handleUpdateLocation
                    }
                    style={{
                      width:
                        isMobile
                          ? "100%"
                          : "auto",
                    }}
                  >
                    {busyAction ===
                    "location"
                      ? "Updating..."
                      : "Update Location"}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    disabled={
                      busyAction ===
                        "comment" ||
                      !cleanText(
                        locationNote
                      )
                    }
                    onClick={
                      handleAddComment
                    }
                    style={{
                      width:
                        isMobile
                          ? "100%"
                          : "auto",
                    }}
                  >
                    {busyAction ===
                    "comment"
                      ? "Saving..."
                      : "Add Note Only"}
                  </ActionButton>
                </div>
              </div>

              {/* ============================================== */}
              {/* AGENT RESTRICTIONS */}
              {/* ============================================== */}

              <div
                style={{
                  marginTop:
                    14,
                  padding:
                    "11px 13px",
                  borderRadius:
                    14,
                  background:
                    "#fff7ed",
                  border:
                    "1px solid #fed7aa",
                  color:
                    "#9a3412",
                  fontSize:
                    11.5,
                  lineHeight:
                    1.6,
                  fontWeight:
                    750,
                }}
              >
                You currently have an active wheelchair assignment. You cannot
                accept another WCHR or Punch Out until this assignment is
                completed or released by WCHR Management.
              </div>
            </PageCard>
          )}
        </>
      )}

      {/* ====================================================== */}
      {/* LOADING */}
      {/* ====================================================== */}

      {(employeeLoading ||
        shiftLoading) && (
        <PageCard
          style={{
            padding:
              16,
          }}
        >
          <div
            style={{
              textAlign:
                "center",
              color:
                "#64748b",
              fontSize:
                12.5,
              fontWeight:
                750,
            }}
          >
            Loading WCHR operational profile...
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* FOOTER */}
      {/* ====================================================== */}

      <div
        style={{
          textAlign:
            "center",
          padding:
            "2px 8px 10px",
          color:
            "#94a3b8",
          fontSize:
            10,
        }}
      >
        {APP_NAME} · {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WchrAgentOperationsPage.jsx
