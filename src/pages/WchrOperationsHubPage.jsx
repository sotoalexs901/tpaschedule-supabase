// src/pages/WchrOperationsHubPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
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
} from "../utils/wchrOperations.js";

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

// ============================================================
// HELPERS
// ============================================================

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeDepartment(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Team Member"
  );
}

function getServiceStatus(report) {
  const status = safeUpper(
    report?.service_status ||
      report?.tracking_status
  );

  if (
    status === WCHR_SERVICE_STATUS.STORED ||
    status === "STORED" ||
    Boolean(report?.stored_at)
  ) {
    return "STORED";
  }

  if (
    status === WCHR_SERVICE_STATUS.BOARDED ||
    status === "BOARDED" ||
    Boolean(report?.boarded_at)
  ) {
    return "BOARDED";
  }

  if (
    status === WCHR_SERVICE_STATUS.AT_GATE ||
    status === "AT_GATE" ||
    Boolean(report?.gate_arrived_at)
  ) {
    return "AT_GATE";
  }

  if (
    status === WCHR_SERVICE_STATUS.PENDING_STORAGE ||
    status === "PENDING_STORAGE"
  ) {
    return "PENDING_STORAGE";
  }

  if (
    report?.passenger_delivered === true ||
    status === "COMPLETED" ||
    Boolean(report?.delivered_at) ||
    Boolean(report?.dropoff_at)
  ) {
    return "PENDING_STORAGE";
  }

  return "ACTIVE";
}

function getMillis(value) {
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

function minutesSince(value) {
  const millis = getMillis(value);

  if (!millis) return 0;

  return Math.max(
    0,
    Math.floor((Date.now() - millis) / 60000)
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

  const threshold =
    Number(report?.alert_after_minutes || 30) || 30;

  const reference =
    report?.last_location_update_at ||
    report?.last_updated_at ||
    report?.assigned_at ||
    report?.ready_for_pickup_at ||
    report?.submitted_at ||
    report?.created_at;

  return minutesSince(reference) >= threshold;
}

function getStepTone(step, activeStep) {
  if (step.number < activeStep) {
    return {
      background: "#ecfdf5",
      border: "#bbf7d0",
      color: "#166534",
      badge: "#16a34a",
    };
  }

  if (step.number === activeStep) {
    return {
      background: "#eff6ff",
      border: "#bfdbfe",
      color: "#1769aa",
      badge: "#1769aa",
    };
  }

  return {
    background: "#f8fafc",
    border: "#e2e8f0",
    color: "#64748b",
    badge: "#94a3b8",
  };
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
    tones[tone] || tones.blue;

  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 16,
        padding: "12px 14px",
        background: selected.background,
        border: `1px solid ${selected.border}`,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          color: selected.color,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 5,
          fontSize: 25,
          lineHeight: 1,
          fontWeight: 950,
          color: selected.color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ModuleCard({
  icon,
  title,
  description,
  badge,
  badgeTone = "blue",
  onClick,
  disabled = false,
}) {
  const badgeTones = {
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

  const badgeStyle =
    badgeTones[badgeTone] ||
    badgeTones.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        minWidth: 0,
        textAlign: "left",
        boxSizing: "border-box",
        borderRadius: 18,
        padding: 15,
        background: disabled ? "#f8fafc" : "#ffffff",
        border: disabled
          ? "1px solid #e2e8f0"
          : "1px solid #dbeafe",
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled ? 0.58 : 1,
        fontFamily: "inherit",
        boxShadow: disabled
          ? "none"
          : "0 10px 24px rgba(15,23,42,0.04)",
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
            display: "flex",
            gap: 11,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              flex: "0 0 40px",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              fontSize: 20,
            }}
          >
            {icon}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: "#0f172a",
                lineHeight: 1.35,
              }}
            >
              {title}
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 11.5,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          </div>
        </div>

        {badge ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "5px 8px",
              background: badgeStyle.background,
              border: `1px solid ${badgeStyle.border}`,
              color: badgeStyle.color,
              fontSize: 10,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function WorkflowStep({
  step,
  activeStep,
  isMobile,
}) {
  const tone =
    getStepTone(step, activeStep);

  return (
    <div
      style={{
        minWidth: 0,
        display: "grid",
        gridTemplateColumns:
          isMobile
            ? "auto 1fr"
            : "1fr",
        gap: 8,
        alignItems:
          isMobile
            ? "center"
            : "stretch",
        padding: 12,
        borderRadius: 15,
        background: tone.background,
        border: `1px solid ${tone.border}`,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: isMobile
            ? 0
            : "0 auto",
          background: tone.badge,
          color: "#ffffff",
          fontSize: 11,
          fontWeight: 950,
        }}
      >
        {step.number}
      </div>

      <div
        style={{
          textAlign:
            isMobile
              ? "left"
              : "center",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 900,
            color: tone.color,
            lineHeight: 1.3,
          }}
        >
          {step.title}
        </div>

        <div
          style={{
            marginTop: 3,
            fontSize: 10,
            color: "#64748b",
            lineHeight: 1.35,
          }}
        >
          {step.subtitle}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================

export default function WchrOperationsHubPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [agents, setAgents] = useState([]);
  const [reports, setReports] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);

  const role = normalizeRole(user?.role);
  const department =
    normalizeDepartment(user?.department);

  const isCabinService =
    department.includes("dl cabin") ||
    department.includes("cabin service");

  const canUseWchr =
    !isCabinService &&
    [
      "agent",
      "supervisor",
      "duty_manager",
      "station_manager",
    ].includes(role);

  const isAgent =
    role === "agent";

  const isSupervisorOrAbove =
    [
      "supervisor",
      "duty_manager",
      "station_manager",
    ].includes(role);

  const isDutyOrStation =
    [
      "duty_manager",
      "station_manager",
    ].includes(role);

  // ==========================================================
  // LIVE AGENTS
  // ==========================================================

  useEffect(() => {
    if (!canUseWchr) {
      setAgents([]);
      setLoadingAgents(false);
      return undefined;
    }

    const agentQuery = query(
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

    const unsubscribe = onSnapshot(
      agentQuery,
      (snapshot) => {
        setAgents(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );

        setLoadingAgents(false);
      },
      (error) => {
        console.error(
          "WCHR Hub agent listener error:",
          error
        );

        setLoadingAgents(false);
      }
    );

    return () => unsubscribe();
  }, [canUseWchr]);

  // ==========================================================
  // LIVE WCHR SERVICES
  // ==========================================================

  useEffect(() => {
    if (!canUseWchr) {
      setReports([]);
      setLoadingReports(false);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      collection(
        db,
        "wch_reports"
      ),
      (snapshot) => {
        setReports(
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          )
        );

        setLoadingReports(false);
      },
      (error) => {
        console.error(
          "WCHR Hub report listener error:",
          error
        );

        setLoadingReports(false);
      }
    );

    return () => unsubscribe();
  }, [canUseWchr]);

  // ==========================================================
  // METRICS
  // ==========================================================

  const availableAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
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

  const activeServices = useMemo(
    () =>
      reports.filter(
        (report) =>
          getServiceStatus(report) ===
          "ACTIVE"
      ),
    [reports]
  );

  const atGateServices = useMemo(
    () =>
      reports.filter(
        (report) =>
          getServiceStatus(report) ===
          "AT_GATE"
      ),
    [reports]
  );

  const pendingStorage = useMemo(
    () =>
      reports.filter(
        (report) =>
          getServiceStatus(report) ===
          "PENDING_STORAGE"
      ),
    [reports]
  );

  const alertServices = useMemo(
    () =>
      reports.filter(
        (report) =>
          needs30MinuteAlert(report)
      ),
    [reports]
  );

  // ==========================================================
  // CURRENT USER SHIFT
  // ==========================================================

  const currentUserShift = useMemo(() => {
    const candidates = [
      user?.id,
      user?.uid,
      user?.employeeId,
      user?.username,
      user?.loginUsername,
    ]
      .map((value) =>
        safeText(value)
      )
      .filter(Boolean);

    return (
      agents.find((agent) => {
        const agentCandidates = [
          agent.id,
          agent.agent_id,
          agent.employee_id,
          agent.login_username,
          agent.username,
        ]
          .map((value) =>
            safeText(value)
          )
          .filter(Boolean);

        return agentCandidates.some(
          (value) =>
            candidates.includes(value)
        );
      }) || null
    );
  }, [agents, user]);

  const currentUserHasAssignment =
    Boolean(
      cleanText(
        currentUserShift?.active_report_id
      )
    );

  const currentUserPunchedIn =
    Boolean(currentUserShift);

  // ==========================================================
  // WORKFLOW
  // ==========================================================

  const activeWorkflowStep = useMemo(() => {
    if (!currentUserPunchedIn) {
      return 1;
    }

    if (!currentUserHasAssignment) {
      return 2;
    }

    const assignedReport =
      reports.find(
        (report) =>
          report.id ===
          currentUserShift?.active_report_id
      );

    if (!assignedReport) {
      return 3;
    }

    const status =
      getServiceStatus(
        assignedReport
      );

    if (status === "AT_GATE") {
      return 4;
    }

    if (
      status === "BOARDED" ||
      status === "PENDING_STORAGE" ||
      status === "STORED"
    ) {
      return 5;
    }

    return 3;
  }, [
    currentUserPunchedIn,
    currentUserHasAssignment,
    currentUserShift,
    reports,
  ]);

  const workflowSteps = [
    {
      number: 1,
      title: "Punch In",
      subtitle:
        "Become active for WCHR operations.",
    },
    {
      number: 2,
      title: "Wait for Assignment",
      subtitle:
        "Remain available for Dispatch.",
    },
    {
      number: 3,
      title: "Service Journey",
      subtitle:
        "Move passenger and update locations.",
    },
    {
      number: 4,
      title: "Gate / Passenger",
      subtitle:
        "Arrival, checks and boarding support.",
    },
    {
      number: 5,
      title: "Complete Service",
      subtitle:
        "Board passenger and return wheelchair.",
    },
  ];

  // ==========================================================
  // MODULES
  // ==========================================================

  const modules = useMemo(() => {
    const list = [];

    list.push({
      icon: "ð¢",
      title: "WCHR Agent Operations",
      description:
        "Punch In, manage availability, follow your assignment and update the journey.",
      route:
        "/wchr/agent-operations",
      badge:
        currentUserPunchedIn
          ? currentUserHasAssignment
            ? "ACTIVE ASSIGNMENT"
            : "PUNCHED IN"
          : "START HERE",
      badgeTone:
        currentUserHasAssignment
          ? "amber"
          : currentUserPunchedIn
          ? "green"
          : "blue",
      visible: true,
    });

    list.push({
      icon: "â",
      title: "New WCHR Service",
      description:
        "Create a passenger wheelchair service from approved daily flights and available inventory.",
      route: "/wchr/intake",
      badge: "INTAKE",
      badgeTone: "blue",
      visible:
        isSupervisorOrAbove,
    });

    list.push({
      icon: "ðï¸",
      title: "WCHR Dispatch Center",
      description:
        "Assign ready wheelchair services to punched-in and available WCHR agents.",
      route: "/wchr/dispatch",
      badge:
        activeServices.length > 0
          ? `${activeServices.length} ACTIVE`
          : "DISPATCH",
      badgeTone:
        activeServices.length > 0
          ? "amber"
          : "blue",
      visible:
        isSupervisorOrAbove,
    });

    list.push({
      icon: "ð",
      title: "My WCHR Reports",
      description:
        "Review wheelchair services associated with your AeroStation Hub profile.",
      route:
        "/wchr/my-reports",
      badge: "MY REPORTS",
      badgeTone: "slate",
      visible: true,
    });

    list.push({
      icon: "ð",
      title: "WCHR Flight Reports",
      description:
        "Review passenger service history, flight summaries, employee performance and billing records.",
      route:
        "/wchr/admin/flights",
      badge:
        alertServices.length > 0
          ? `${alertServices.length} ALERTS`
          : "REPORTS",
      badgeTone:
        alertServices.length > 0
          ? "red"
          : "blue",
      visible:
        isSupervisorOrAbove,
    });

    list.push({
      icon: "ð¨",
      title: "WCHR Duty Follow-Up",
      description:
        "Review operational exceptions, pending actions and supervisor follow-up items.",
      route:
        "/wchr/duty-follow-up",
      badge:
        alertServices.length > 0
          ? `${alertServices.length} ALERTS`
          : "FOLLOW-UP",
      badgeTone:
        alertServices.length > 0
          ? "red"
          : "amber",
      visible:
        isDutyOrStation,
    });

    list.push({
      icon: "ð",
      title: "WCHR Billing & Monthly Close",
      description:
        "Review monthly WCHR activity, billing records and operational close information.",
      route:
        "/wchr/monthly-close",
      badge: "MANAGEMENT",
      badgeTone: "green",
      visible:
        isDutyOrStation,
    });

    return list.filter(
      (item) =>
        item.visible
    );
  }, [
    currentUserHasAssignment,
    currentUserPunchedIn,
    isDutyOrStation,
    isSupervisorOrAbove,
    activeServices.length,
    alertServices.length,
  ]);

  // ==========================================================
  // ACCESS MESSAGE
  // ==========================================================

  if (!canUseWchr) {
    return (
      <PageCard
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: 22,
        }}
      >
        <div
          style={{
            color: "#64748b",
            fontSize: 13.5,
            lineHeight: 1.6,
            fontWeight: 700,
          }}
        >
          WCHR Operations is not available for this department or role.
        </div>
      </PageCard>
    );
  }

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
        boxSizing: "border-box",
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
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
            width: 230,
            height: 230,
            borderRadius: 999,
            background:
              "rgba(255,255,255,0.07)",
            right: -65,
            top: -100,
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
            alignItems:
              isMobile
                ? "flex-start"
                : "center",
            gap: 16,
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
                width: 56,
                height: 56,
                flex: "0 0 56px",
                borderRadius: 17,
                background: "#ffffff",
                overflow: "hidden",
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
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.14em",
                  color:
                    "rgba(255,255,255,0.72)",
                }}
              >
                {APP_NAME} Â· WCHR Operations
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",
                  fontSize:
                    isMobile
                      ? 24
                      : 30,
                  fontWeight: 900,
                  lineHeight: 1.08,
                  letterSpacing:
                    "-0.035em",
                }}
              >
                WCHR Operations Hub
              </h1>

              <div
                style={{
                  maxWidth: 760,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color:
                    "rgba(255,255,255,0.87)",
                }}
              >
                One place for WCHR agents, supervisors and Management to
                manage the full wheelchair service workflow.
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
              minWidth:
                isMobile
                  ? "100%"
                  : 190,
              boxSizing:
                "border-box",
              padding:
                "11px 13px",
              borderRadius: 14,
              background:
                "rgba(255,255,255,0.14)",
              border:
                "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.07em",
                color:
                  "rgba(255,255,255,0.72)",
                fontWeight: 850,
              }}
            >
              Signed In
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {getVisibleName(user)}
            </div>

            <div
              style={{
                marginTop: 2,
                fontSize: 10.5,
                color:
                  "rgba(255,255,255,0.75)",
                textTransform:
                  "capitalize",
              }}
            >
              {role.replaceAll("_", " ")}
            </div>
          </div>
        </div>
      </div>

      {/* METRICS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile
              ? "repeat(2, minmax(0, 1fr))"
              : isTablet
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(6, minmax(0, 1fr))",
          gap: 9,
        }}
      >
        <MetricCard
          label="Agents Active"
          value={
            loadingAgents
              ? "â"
              : agents.length
          }
          tone="slate"
        />

        <MetricCard
          label="Available"
          value={
            loadingAgents
              ? "â"
              : availableAgents.length
          }
          tone="green"
        />

        <MetricCard
          label="Active Services"
          value={
            loadingReports
              ? "â"
              : activeServices.length
          }
          tone="blue"
        />

        <MetricCard
          label="At Gate"
          value={
            loadingReports
              ? "â"
              : atGateServices.length
          }
          tone="amber"
        />

        <MetricCard
          label="Pending Storage"
          value={
            loadingReports
              ? "â"
              : pendingStorage.length
          }
          tone="amber"
        />

        <MetricCard
          label="30+ Min Alerts"
          value={
            loadingReports
              ? "â"
              : alertServices.length
          }
          tone="red"
        />
      </div>

      {/* AGENT WORKFLOW */}

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
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#1769aa",
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
            }}
          >
            Today's Workflow
          </div>

          <h2
            style={{
              margin:
                "4px 0 0",
              fontSize:
                isMobile
                  ? 18
                  : 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            WCHR Service Step by Step
          </h2>

          <p
            style={{
              margin:
                "5px 0 0",
              color: "#64748b",
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            Agents follow the service from Punch In through passenger
            completion and wheelchair return.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(5, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {workflowSteps.map(
            (step) => (
              <WorkflowStep
                key={step.number}
                step={step}
                activeStep={
                  activeWorkflowStep
                }
                isMobile={
                  isMobile
                }
              />
            )
          )}
        </div>
      </PageCard>

      {/* QUICK ACTION FOR AGENT */}

      {isAgent && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 15
                : 19,
            border:
              currentUserHasAssignment
                ? "1px solid #fed7aa"
                : currentUserPunchedIn
                ? "1px solid #bbf7d0"
                : "1px solid #bfdbfe",
            background:
              currentUserHasAssignment
                ? "#fffaf3"
                : currentUserPunchedIn
                ? "#f6fff9"
                : "#f8fbff",
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
                    currentUserHasAssignment
                      ? "#9a3412"
                      : currentUserPunchedIn
                      ? "#166534"
                      : "#1769aa",
                }}
              >
                Your WCHR Status
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 17,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                {currentUserHasAssignment
                  ? `Active WCHR ${
                      currentUserShift?.active_wheelchair_number ||
                      ""
                    }`
                  : currentUserPunchedIn
                  ? "Punched In and Ready"
                  : "Start Your WCHR Shift"}
              </div>

              <div
                style={{
                  marginTop: 3,
                  color: "#64748b",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                }}
              >
                {currentUserHasAssignment
                  ? "Open Agent Operations to continue your passenger service."
                  : currentUserPunchedIn
                  ? "Remain available while Dispatch assigns your next passenger."
                  : "Punch In before receiving a wheelchair assignment."}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/wchr/agent-operations"
                )
              }
              style={{
                border: "none",
                borderRadius: 12,
                padding:
                  "11px 15px",
                background:
                  "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                color: "#ffffff",
                fontFamily:
                  "inherit",
                fontSize: 12.5,
                fontWeight: 900,
                cursor: "pointer",
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              Open Agent Operations
            </button>
          </div>
        </PageCard>
      )}

      {/* MODULES */}

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
              color: "#0f172a",
              fontWeight: 900,
            }}
          >
            WCHR Modules
          </h2>

          <p
            style={{
              margin:
                "4px 0 0",
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            Your role determines which WCHR operational tools are available.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              isMobile
                ? "1fr"
                : isTablet
                ? "repeat(2, minmax(0, 1fr))"
                : "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {modules.map(
            (module) => (
              <ModuleCard
                key={module.route}
                icon={module.icon}
                title={module.title}
                description={
                  module.description
                }
                badge={
                  module.badge
                }
                badgeTone={
                  module.badgeTone
                }
                onClick={() =>
                  navigate(
                    module.route
                  )
                }
              />
            )
          )}
        </div>
      </PageCard>

      {/* SUPERVISOR NOTE */}

      {isSupervisorOrAbove && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 14
                : 17,
            background:
              "#f8fbff",
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              color: "#475569",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            <b>Supervisor workflow:</b> create the passenger service in
            <b> New WCHR Service</b>, then assign it from
            <b> WCHR Dispatch Center</b>. The agent continues the journey from
            <b> WCHR Agent Operations</b>, while reports and follow-up remain
            available from this Hub.
          </div>
        </PageCard>
      )}

      {/* FOOTER */}

      <div
        style={{
          textAlign: "center",
          padding:
            "2px 8px 10px",
          fontSize: 10,
          color: "#94a3b8",
        }}
      >
        {APP_NAME} Â· {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WchrOperationsHubPage.jsx
