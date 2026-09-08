// src/pages/WchrDispatchPage.jsx

import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
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
// HELPERS
// ============================================================

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

function getMillis(value) {
  if (!value) return 0;

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? 0
    : date.getTime();
}

function formatDateTime(value) {
  const millis =
    getMillis(value);

  if (!millis) {
    return "—";
  }

  return new Date(
    millis
  ).toLocaleString(
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

function getServiceElapsedSeconds(
  report,
  now
) {
  return getElapsedSeconds(
    getWheelchairTimerStart(
      report
    ),
    now
  );
}

function getServiceMinutes(
  report,
  now
) {
  return Math.floor(
    getServiceElapsedSeconds(
      report,
      now
    ) / 60
  );
}

function getServiceStatusLabel(
  value
) {
  const status =
    safeUpper(value);

  const labels = {
    READY_FOR_PICKUP:
      "Ready for Pickup",

    ASSIGNED:
      "Assigned",

    PICKED_UP:
      "Picked Up",

    IN_TRANSIT:
      "In Transit",

    AT_GATE:
      "At Gate",

    BOARDING:
      "Boarding",

    BOARDED:
      "Boarded",

    PENDING_STORAGE:
      "Pending Storage",

    STORED:
      "Stored",

    COMPLETED:
      "Completed",
  };

  return (
    labels[status] ||
    status ||
    "In Progress"
  );
}

function getAvailabilityLabel(
  value
) {
  const status =
    safeUpper(value);

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
      background:
        "#ffffff",
      color:
        "#1769aa",
      border:
        "1px solid #cfe7fb",
      boxShadow:
        "none",
    },

    success: {
      background:
        "#16a34a",
      color:
        "#ffffff",
      border:
        "none",
      boxShadow:
        "0 10px 20px rgba(22,163,74,0.16)",
    },

    warning: {
      background:
        "#f59e0b",
      color:
        "#ffffff",
      border:
        "none",
      boxShadow:
        "0 10px 20px rgba(245,158,11,0.16)",
    },

    danger: {
      background:
        "#dc2626",
      color:
        "#ffffff",
      border:
        "none",
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
        padding:
          "10px 14px",
        fontSize: 13,
        fontWeight: 850,
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled
          ? 0.55
          : 1,
        fontFamily:
          "inherit",
        boxSizing:
          "border-box",
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
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
        borderRadius:
          999,
        padding:
          "6px 10px",
        background,
        color,
        border:
          `1px solid ${border}`,
        fontSize:
          11,
        fontWeight:
          900,
        whiteSpace:
          "nowrap",
      }}
    >
      {getAvailabilityLabel(
        normalized
      )}
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
      background:
        "#eff6ff",
      border:
        "#bfdbfe",
      color:
        "#1769aa",
    },

    green: {
      background:
        "#ecfdf5",
      border:
        "#bbf7d0",
      color:
        "#166534",
    },

    amber: {
      background:
        "#fff7ed",
      border:
        "#fed7aa",
      color:
        "#9a3412",
    },

    red: {
      background:
        "#fff1f2",
      border:
        "#fecdd3",
      color:
        "#b91c1c",
    },

    slate: {
      background:
        "#f8fafc",
      border:
        "#e2e8f0",
      color:
        "#334155",
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
        borderRadius:
          16,
        padding:
          "12px 14px",
      }}
    >
      <div
        style={{
          fontSize:
            9.5,
          fontWeight:
            900,
          color:
            selected.color,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.07em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 25,
          fontWeight:
            950,
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
        padding:
          "9px 10px",
        background:
          "#f8fbff",
        border:
          "1px solid #dbeafe",
        borderRadius:
          12,
      }}
    >
      <div
        style={{
          fontSize:
            9,
          color:
            "#94a3b8",
          textTransform:
            "uppercase",
          fontWeight:
            900,
          letterSpacing:
            "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 3,
          fontSize:
            12.5,
          color:
            "#0f172a",
          fontWeight:
            750,
          lineHeight:
            1.4,
          wordBreak:
            "break-word",
        }}
      >
        {value || "—"}
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
          onSelect(
            agent.id
          );
        }
      }}
      disabled={
        !canReceive
      }
      style={{
        appearance:
          "none",
        WebkitAppearance:
          "none",
        textAlign:
          "left",
        width:
          "100%",
        minWidth: 0,
        boxSizing:
          "border-box",
        padding:
          isMobile
            ? 12
            : 14,
        borderRadius:
          16,
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
        fontFamily:
          "inherit",
      }}
    >
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          gap: 10,
          alignItems:
            "flex-start",
        }}
      >
        <div
          style={{
            minWidth: 0,
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
              lineHeight:
                1.35,
              wordBreak:
                "break-word",
            }}
          >
            {getAgentName(
              agent
            )}
          </div>

          <div
            style={{
              marginTop:
                3,
              fontSize:
                11.5,
              color:
                "#64748b",
            }}
          >
            {agent.current_location ||
              "Location not reported"}
          </div>
        </div>

        <StatusBadge
          status={
            availability
          }
        />
      </div>

      {hasAssignment && (
        <div
          style={{
            marginTop:
              10,
            borderRadius:
              12,
            padding:
              "8px 10px",
            background:
              "#fff7ed",
            border:
              "1px solid #fed7aa",
            color:
              "#9a3412",
            fontSize:
              11,
            fontWeight:
              800,
            lineHeight:
              1.45,
          }}
        >
          Assigned WCHR{" "}
          {agent.active_wheelchair_number ||
            "—"}
        </div>
      )}

      {canReceive && (
        <div
          style={{
            marginTop:
              10,
            fontSize:
              10.5,
            fontWeight:
              900,
            color:
              "#166534",
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
    minutes >= 30;

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(
          report.id
        )
      }
      style={{
        appearance:
          "none",
        WebkitAppearance:
          "none",
        width:
          "100%",
        minWidth:
          0,
        boxSizing:
          "border-box",
        textAlign:
          "left",
        padding:
          isMobile
            ? 12
            : 14,
        borderRadius:
          16,
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
        cursor:
          "pointer",
        fontFamily:
          "inherit",
      }}
    >
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "flex-start",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize:
                16,
              fontWeight:
                950,
              color:
                "#0f172a",
            }}
          >
            WCHR{" "}
            {report.wheelchair_number ||
              "—"}
          </div>

          <div
            style={{
              marginTop:
                3,
              fontSize:
                11.5,
              color:
                "#64748b",
              fontWeight:
                700,
            }}
          >
            {report.passenger_name ||
              "Passenger"}
          </div>
        </div>

        <div
          style={{
            padding:
              "7px 9px",
            minWidth:
              85,
            textAlign:
              "center",
            borderRadius:
              12,
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
              fontSize:
                8.5,
              fontWeight:
                900,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.05em",
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
              marginTop:
                2,
              fontSize:
                17,
              fontWeight:
                950,
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
          marginTop:
            11,
          display:
            "grid",
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
          value={
            report.pnr
          }
        />

        <InfoField
          label="Type"
          value={
            report.wch_type
          }
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
            marginTop:
              9,
            padding:
              "8px 10px",
            borderRadius:
              11,
            background:
              "#fff1f2",
            border:
              "1px solid #fecdd3",
            color:
              "#9f1239",
            fontSize:
              10.5,
            lineHeight:
              1.4,
            fontWeight:
              900,
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

  const [
    agents,
    setAgents,
  ] = useState([]);

  const [
    reports,
    setReports,
  ] = useState([]);

  const [
    selectedAgentId,
    setSelectedAgentId,
  ] = useState("");

  const [
    selectedReportId,
    setSelectedReportId,
  ] = useState("");

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
                id:
                  item.id,
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

          setAgents(
            rows
          );

          setLoadingAgents(
            false
          );
        },
        (err) => {
          console.error(
            "WCHR agents listener error:",
            err
          );

          setLoadingAgents(
            false
          );

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
                id:
                  item.id,
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
                    getWheelchairTimerStart(
                      a
                    )
                  ) -
                  getMillis(
                    getWheelchairTimerStart(
                      b
                    )
                  )
              );

          setReports(
            rows
          );

          setLoadingReports(
            false
          );
        },
        (err) => {
          console.error(
            "Ready wheelchair listener error:",
            err
          );

          setLoadingReports(
            false
          );

          setError(
            "Could not load WCHRs ready for pickup."
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

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
  // COUNTERS
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
            getServiceMinutes(
              report,
              now
            ) >= 30
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
    if (
      !selectedAgent
    ) {
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

    if (
      !punchedIn
    ) {
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

    if (
      hasAssignment
    ) {
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

      if (
        !selectedReport
      ) {
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
        "—";

      const confirmed =
        window.confirm(
          `Assign WCHR ${wheelchairNumber} to ${agentName}?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      try {
        setAssigning(
          true
        );

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
        // PUSH NOTIFICATION TO ASSIGNED AGENT
        // ------------------------------------------------------

        triggerWchrAssignmentPush(
          selectedReport.id
        ).catch((pushError) => {
          console.error(
            "WCHR assignment push error:",
            pushError
          );
        });

        // ------------------------------------------------------
        // LOCAL SELECTION
        // ------------------------------------------------------

        setSelectedAgentId(
          ""
        );

        setSelectedReportId(
          ""
        );

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
        setAssigning(
          false
        );
      }
    };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        width:
          "100%",
        maxWidth:
          1500,
        margin:
          "0 auto",
        display:
          "grid",
        gap:
          isMobile
            ? 12
            : 18,
        boxSizing:
          "border-box",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
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
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          boxShadow:
            "0 22px 55px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width:
              220,
            height:
              220,
            borderRadius:
              999,
            background:
              "rgba(255,255,255,0.07)",
            right:
              -65,
            top:
              -95,
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
            justifyContent:
              "space-between",
            gap:
              15,
            alignItems:
              isMobile
                ? "flex-start"
                : "center",
          }}
        >
          <div
            style={{
              display:
                "flex",
              gap:
                13,
              alignItems:
                "center",
              minWidth:
                0,
            }}
          >
            <div
              style={{
                width:
                  52,
                height:
                  52,
                flex:
                  "0 0 52px",
                borderRadius:
                  16,
                overflow:
                  "hidden",
                background:
                  "#ffffff",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={
                  APP_NAME
                }
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

            <div>
              <div
                style={{
                  fontSize:
                    9.5,
                  fontWeight:
                    900,
                  color:
                    "rgba(255,255,255,0.72)",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.14em",
                }}
              >
                {APP_NAME} · WCHR Dispatch
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",
                  fontSize:
                    isMobile
                      ? 23
                      : 29,
                  lineHeight:
                    1.08,
                  fontWeight:
                    900,
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
                  fontSize:
                    12.5,
                  lineHeight:
                    1.5,
                }}
              >
                Assign wheelchairs ready for pickup to active and available
                WCHR agents.
              </div>

              <div
                style={{
                  marginTop:
                    3,
                  fontSize:
                    10,
                  color:
                    "rgba(255,255,255,0.66)",
                  fontWeight:
                    700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          <div
            style={{
              padding:
                "10px 13px",
              borderRadius:
                14,
              background:
                "rgba(255,255,255,0.14)",
              border:
                "1px solid rgba(255,255,255,0.18)",
              fontSize:
                11,
              fontWeight:
                800,
            }}
          >
            Dispatcher:{" "}
            {getVisibleName(
              user
            )}
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* MESSAGES */}
      {/* ====================================================== */}

      {error && (
        <PageCard
          style={{
            padding:
              14,
          }}
        >
          <div
            style={{
              background:
                "#fff1f2",
              border:
                "1px solid #fecdd3",
              borderRadius:
                14,
              padding:
                "11px 13px",
              color:
                "#9f1239",
              fontSize:
                13,
              lineHeight:
                1.55,
              fontWeight:
                800,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard
          style={{
            padding:
              14,
          }}
        >
          <div
            style={{
              background:
                "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              borderRadius:
                14,
              padding:
                "11px 13px",
              color:
                "#065f46",
              fontSize:
                13,
              lineHeight:
                1.55,
              fontWeight:
                800,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* METRICS */}
      {/* ====================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(5, minmax(0, 1fr))",
          gap:
            10,
        }}
      >
        <MetricCard
          label="Punched In"
          value={
            agents.length
          }
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
          value={
            reports.length
          }
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
            display:
              "grid",
            gridTemplateColumns:
              isMobile ||
              isTablet
                ? "1fr"
                : "1fr 1fr auto",
            gap:
              11,
            alignItems:
              "end",
          }}
        >
          <div>
            <div
              style={{
                marginBottom:
                  6,
                fontSize:
                  10,
                fontWeight:
                  900,
                color:
                  "#64748b",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.06em",
              }}
            >
              Selected WCHR
            </div>

            <div
              style={{
                minHeight:
                  46,
                display:
                  "flex",
                alignItems:
                  "center",
                borderRadius:
                  13,
                padding:
                  "10px 12px",
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                fontSize:
                  13,
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
                    "—"
                  } · ${
                    selectedReport.passenger_name ||
                    "Passenger"
                  }`
                : "Select a wheelchair below"}
            </div>
          </div>

          <div>
            <div
              style={{
                marginBottom:
                  6,
                fontSize:
                  10,
                fontWeight:
                  900,
                color:
                  "#64748b",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.06em",
              }}
            >
              Selected Agent
            </div>

            <div
              style={{
                minHeight:
                  46,
                display:
                  "flex",
                alignItems:
                  "center",
                borderRadius:
                  13,
                padding:
                  "10px 12px",
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                fontSize:
                  13,
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
              minHeight:
                46,
            }}
          >
            {assigning
              ? "Assigning..."
              : "Assign WCHR"}
          </ActionButton>
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* MAIN TWO COLUMNS */}
      {/* ====================================================== */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            isMobile ||
            isTablet
              ? "1fr"
              : "1fr 1fr",
          gap:
            16,
          alignItems:
            "start",
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
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "flex-start",
              gap:
                10,
              marginBottom:
                14,
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    0,
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
                Ready for Pickup
              </h2>

              <p
                style={{
                  margin:
                    "4px 0 0",
                  fontSize:
                    12,
                  color:
                    "#64748b",
                  lineHeight:
                    1.5,
                }}
              >
                Unassigned wheelchair services waiting at the counter or
                designated pickup location.
              </p>
            </div>

            <div
              style={{
                borderRadius:
                  999,
                padding:
                  "6px 10px",
                background:
                  "#eff6ff",
                border:
                  "1px solid #bfdbfe",
                color:
                  "#1769aa",
                fontSize:
                  11,
                fontWeight:
                  900,
                whiteSpace:
                  "nowrap",
              }}
            >
              {reports.length}
            </div>
          </div>

          {loadingReports ? (
            <div
              style={{
                padding:
                  18,
                borderRadius:
                  14,
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                color:
                  "#64748b",
                textAlign:
                  "center",
                fontSize:
                  12,
                fontWeight:
                  750,
              }}
            >
              Loading WCHRs...
            </div>
          ) : reports.length ===
            0 ? (
            <div
              style={{
                padding:
                  22,
                borderRadius:
                  16,
                background:
                  "#ecfdf5",
                border:
                  "1px solid #bbf7d0",
                color:
                  "#166534",
                textAlign:
                  "center",
                fontSize:
                  13,
                lineHeight:
                  1.55,
                fontWeight:
                  750,
              }}
            >
              No wheelchairs are currently waiting for assignment.
            </div>
          ) : (
            <div
              style={{
                display:
                  "grid",
                gap:
                  9,
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
                    key={
                      report.id
                    }
                    report={
                      report
                    }
                    now={
                      now
                    }
                    isMobile={
                      isMobile
                    }
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
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "flex-start",
              gap:
                10,
              marginBottom:
                14,
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    0,
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
                Active WCHR Agents
              </h2>

              <p
                style={{
                  margin:
                    "4px 0 0",
                  fontSize:
                    12,
                  color:
                    "#64748b",
                  lineHeight:
                    1.5,
                }}
              >
                Only available agents without an active wheelchair can be
                selected for a new assignment.
              </p>
            </div>

            <div
              style={{
                borderRadius:
                  999,
                padding:
                  "6px 10px",
                background:
                  "#ecfdf5",
                border:
                  "1px solid #bbf7d0",
                color:
                  "#166534",
                fontSize:
                  11,
                fontWeight:
                  900,
                whiteSpace:
                  "nowrap",
              }}
            >
              {
                availableAgents.length
              }{" "}
              Available
            </div>
          </div>

          {loadingAgents ? (
            <div
              style={{
                padding:
                  18,
                borderRadius:
                  14,
                background:
                  "#f8fbff",
                border:
                  "1px solid #dbeafe",
                color:
                  "#64748b",
                textAlign:
                  "center",
                fontSize:
                  12,
                fontWeight:
                  750,
              }}
            >
              Loading WCHR agents...
            </div>
          ) : agents.length ===
            0 ? (
            <div
              style={{
                padding:
                  22,
                borderRadius:
                  16,
                background:
                  "#fff7ed",
                border:
                  "1px solid #fed7aa",
                color:
                  "#9a3412",
                textAlign:
                  "center",
                fontSize:
                  13,
                lineHeight:
                  1.55,
                fontWeight:
                  750,
              }}
            >
              No WCHR agents are currently punched in.
            </div>
          ) : (
            <>
              <div
                style={{
                  display:
                    "grid",
                  gap:
                    9,
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
                      key={
                        agent.id
                      }
                      agent={
                        agent
                      }
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

              {breakAgents.length >
                0 && (
                <div
                  style={{
                    marginTop:
                      12,
                    padding:
                      "9px 11px",
                    borderRadius:
                      12,
                    background:
                      "#fefce8",
                    border:
                      "1px solid #fde68a",
                    color:
                      "#854d0e",
                    fontSize:
                      11,
                    lineHeight:
                      1.5,
                    fontWeight:
                      750,
                  }}
                >
                  {
                    breakAgents.length
                  }{" "}
                  active agent
                  {breakAgents.length ===
                  1
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
              fontSize:
                10,
              fontWeight:
                900,
              color:
                "#1769aa",
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
            }}
          >
            Assignment Preview
          </div>

          <h2
            style={{
              margin:
                "5px 0 13px",
              fontSize:
                isMobile
                  ? 19
                  : 22,
              color:
                "#0f172a",
              fontWeight:
                900,
            }}
          >
            WCHR{" "}
            {selectedReport.wheelchair_number ||
              "—"}{" "}
            →{" "}
            {getAgentName(
              selectedAgent
            )}
          </h2>

          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr"
                  : "repeat(4, minmax(0, 1fr))",
              gap:
                9,
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
              marginTop:
                13,
            }}
          >
            <ActionButton
              variant="success"
              disabled={
                assigning
              }
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
          textAlign:
            "center",
          padding:
            "2px 8px 10px",
          fontSize:
            10,
          color:
            "#94a3b8",
        }}
      >
        {APP_NAME} ·{" "}
        {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WchrDispatchPage.jsx
