// src/pages/ReportsDataManagementPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* =========================================================
   REPORTS DATA MANAGEMENT
   TPA OPS PLATFORM

   Central administrative data-management page.

   IMPORTANT:
   Only collections that have been confirmed in the existing
   application should be added to collectionName.
   ========================================================= */


/* =========================================================
   REAL MANAGEMENT OF REPORTS MODULES
   ========================================================= */

const REPORT_MODULES = [
  {
  id: "timesheet",
  label: "Timesheet Reports",
  icon: "▦",
  collectionName: "timesheet_reports",
  status: "connected",
},
  {
  id: "operational",
  label: "Operational Reports",
  icon: "▣",
  collectionName: "operational_reports",
  status: "ready",
},
  {
  id: "regulatedGarbage",
  label: "Regulated Garbage Reports",
  icon: "♻",
  collectionName: "regulated_garbage_reports",
  status: "connected",
}, 
  {
  id: "cleaningSecurity",
  label: "Cleaning & Security Reports",
  icon: "🛡",
  collectionName: "cleaning_security_reports",
  status: "connected",
},
  {
  id: "operationsRequests",
  label: "Operations Requests Reports",
  icon: "📋",
  collectionName: "supplies_uniform_ot_requests",
  status: "connected",
},
  {
    id: "wchrPoi",
    label: "WCHR POI Reports",
    icon: "♿",
    collectionName: "wchr_poi_reports",
    status: "connected",
  },

  // Confirmed from EmployeePerformanceManagementPage.jsx
  {
    id: "employeePerformance",
    label: "Employee Performance Reports",
    icon: "▰",
    collectionName: "employeePerformanceReports",
    status: "connected",
  },
  {
  id: "gateChecklist",
  label: "Gate Checklist Management",
  icon: "▥",
  collectionName: "gateChecklistReports",
  status: "active",
}, 
 {
  id: "fuelManagement",
  label: "Fuel Management",
  icon: "⛽",
  collectionName: "fuel_logs",
  status: "connected",
},
 {
  id: "cierreVueloFlights",
  label: "Cierre de Vuelo · Flights",
  icon: "✈",
  collectionName: "cierreVueloFlights",
  status: "connected",
},
{
  id: "cierreVueloFuel",
  label: "Cierre de Vuelo · Fuel",
  icon: "⛽",
  collectionName: "cierreVueloFuel",
  status: "connected",
},
{
  id: "cierreVueloMonthClosures",
  label: "Cierre de Vuelo · Month Closures",
  icon: "▣",
  collectionName: "cierreVueloMonthClosures",
  status: "connected",
}, 
];
/* =========================================================
   HELPERS
   ========================================================= */

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSearch(value) {
  return safeText(value).toLowerCase();
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    if (value instanceof Date) {
      return value.toLocaleString();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString();
  } catch {
    return "-";
  }
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Manager"
  );
}

function getRecordCreatedAt(record) {
  return (
    record?.createdAt ||
    record?.submittedAt ||
    record?.dateCreated ||
    record?.timestamp ||
    null
  );
}

function getRecordUpdatedAt(record) {
  return (
    record?.updatedAt ||
    record?.modifiedAt ||
    record?.managerReviewedAt ||
    null
  );
}

function getRecordStatus(record) {
  return (
    record?.managerStatus ||
    record?.status ||
    record?.reportStatus ||
    record?.approvalStatus ||
    "-"
  );
}

function getRecordSubmittedBy(record) {
  return (
    record?.submittedByName ||
    record?.submittedBy ||
    record?.supervisorName ||
    record?.createdByName ||
    record?.createdBy ||
    record?.employeeName ||
    "-"
  );
}

function getRecordDepartment(record) {
  return (
    record?.department ||
    record?.departmentName ||
    record?.service ||
    "-"
  );
}

function getRecordAirline(record) {
  return (
    record?.airline ||
    record?.airlineName ||
    record?.carrier ||
    "-"
  );
}

function getRecordFlight(record) {
  return (
    record?.flightNumber ||
    record?.flight ||
    record?.flightNo ||
    "-"
  );
}

function getRecordPrimaryName(record) {
  return (
    record?.employeeName ||
    record?.flightNumber ||
    record?.flight ||
    record?.reportName ||
    record?.title ||
    record?.name ||
    record?.id ||
    "Record"
  );
}


/* =========================================================
   DATA QUALITY
   ========================================================= */

function getDataQualityIssues(record, moduleId) {
  const issues = [];

  if (!record) return issues;

  if (!getRecordCreatedAt(record)) {
    issues.push("Missing creation/submission date");
  }

  if (moduleId === "employeePerformance") {
    if (!safeText(record.employeeName)) {
      issues.push("Missing employee name");
    }

    if (!safeText(record.department)) {
      issues.push("Missing department");
    }

    if (!safeText(record.supervisorName)) {
      issues.push("Missing supervisor");
    }

    if (!safeText(record.month)) {
      issues.push("Missing evaluation month");
    }

    if (
      record.score === null ||
      record.score === undefined ||
      record.score === ""
    ) {
      issues.push("Missing performance score");
    }

    if (!safeText(record.managerStatus)) {
      issues.push("Missing manager status");
    }
  }

  return issues;
}


/* =========================================================
   COMPONENTS
   ========================================================= */

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(255,255,255,0.98)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
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
        fontSize: 11,
        fontWeight: 800,
        color: "#64748b",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </label>
  );
}


function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}


function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        fontFamily: "inherit",
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
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg,#0f4c81 0%,#1769aa 55%,#5aa9e6 100%)",
      color: "#ffffff",
      border: "none",
    },

    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },

    success: {
      background: "#16a34a",
      color: "#ffffff",
      border: "none",
    },

    warning: {
      background: "#f59e0b",
      color: "#ffffff",
      border: "none",
    },

    danger: {
      background: "#dc2626",
      color: "#ffffff",
      border: "none",
    },

    dark: {
      background: "#0f172a",
      color: "#ffffff",
      border: "none",
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
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
        boxShadow:
          variant === "primary"
            ? "0 12px 24px rgba(23,105,170,0.16)"
            : "none",
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}


function InfoCard({
  label,
  value,
  tone = "default",
  subtext = "",
}) {
  const tones = {
    default: {
      background: "#f8fbff",
      border: "#dbeafe",
      value: "#0f172a",
    },

    blue: {
      background: "#edf7ff",
      border: "#cfe7fb",
      value: "#1769aa",
    },

    green: {
      background: "#ecfdf5",
      border: "#a7f3d0",
      value: "#166534",
    },

    amber: {
      background: "#fff7ed",
      border: "#fdba74",
      value: "#9a3412",
    },

    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      value: "#9f1239",
    },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.background,
        border: `1px solid ${current.border}`,
        borderRadius: 18,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 24,
          fontWeight: 900,
          color: current.value,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      {subtext ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#64748b",
          }}
        >
          {subtext}
        </div>
      ) : null}
    </div>
  );
}


function CenterToast({ message, tone = "blue" }) {
  const tones = {
    blue: {
      background: "#edf7ff",
      border: "#cfe7fb",
      color: "#1769aa",
    },

    green: {
      background: "#ecfdf5",
      border: "#a7f3d0",
      color: "#166534",
    },

    amber: {
      background: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },

    red: {
      background: "#fff1f2",
      border: "#fecdd3",
      color: "#9f1239",
    },
  };

  const current = tones[tone] || tones.blue;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          minWidth: 300,
          maxWidth: 760,
          textAlign: "center",
          background: current.background,
          border: `1px solid ${current.border}`,
          borderRadius: 18,
          padding: "14px 18px",
          color: current.color,
          fontSize: 14,
          fontWeight: 800,
          boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
        }}
      >
        {message}
      </div>
    </div>
  );
}


/* =========================================================
   MODULE CARD
   ========================================================= */

function ReportModuleCard({
  module,
  active,
  onClick,
  count,
}) {
  const connected = Boolean(module.collectionName);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: active
          ? "1px solid #93c5fd"
          : "1px solid #e2e8f0",

        background: active
          ? "linear-gradient(135deg,#edf7ff 0%,#ffffff 100%)"
          : "#ffffff",

        borderRadius: 18,
        padding: 16,
        cursor: "pointer",
        boxShadow: active
          ? "0 12px 28px rgba(23,105,170,0.10)"
          : "none",
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active ? "#dbeafe" : "#f1f5f9",
            color: "#1769aa",
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          {module.icon}
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,

            background: connected
              ? "#ecfdf5"
              : "#f8fafc",

            color: connected
              ? "#166534"
              : "#64748b",

            border: connected
              ? "1px solid #a7f3d0"
              : "1px solid #e2e8f0",
          }}
        >
          {connected ? "CONNECTED" : "PENDING"}
        </span>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 14,
          fontWeight: 900,
          color: "#0f172a",
          lineHeight: 1.35,
        }}
      >
        {module.label}
      </div>

      <div
        style={{
          marginTop: 7,
          fontSize: 12,
          color: "#64748b",
        }}
      >
        {connected
          ? `${count} loaded record(s)`
          : "Collection mapping required"}
      </div>
    </button>
  );
}


/* =========================================================
   RECORD STATUS BADGE
   ========================================================= */

function StatusBadge({ status }) {
  const value = safeText(status).toLowerCase();

  let background = "#edf7ff";
  let border = "#cfe7fb";
  let color = "#1769aa";

  if (
    value.includes("approved") ||
    value.includes("closed") ||
    value.includes("completed") ||
    value.includes("recognized")
  ) {
    background = "#ecfdf5";
    border = "#a7f3d0";
    color = "#166534";
  }

  if (
    value.includes("follow") ||
    value.includes("pending") ||
    value.includes("return")
  ) {
    background = "#fff7ed";
    border = "#fdba74";
    color = "#9a3412";
  }

  if (
    value.includes("reject") ||
    value.includes("cancel")
  ) {
    background = "#fff1f2";
    border = "#fecdd3";
    color = "#9f1239";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background,
        border: `1px solid ${border}`,
        color,
      }}
    >
      {safeText(status) || "-"}
    </span>
  );
}


/* =========================================================
   MAIN PAGE
   ========================================================= */

export default function ReportsDataManagementPage() {
  const { user } = useUser();

  /*
    This page starts as Station Manager only because it allows
    direct administrative data management.
  */

  const canAccess = user?.role === "station_manager";

  const [selectedModuleId, setSelectedModuleId] = useState(
    "employeePerformance"
  );

  const [records, setRecords] = useState([]);

  const [loading, setLoading] = useState(false);

  const [selectedRecordId, setSelectedRecordId] = useState("");

  const [searchText, setSearchText] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");

  const [qualityFilter, setQualityFilter] = useState("all");

  const [statusMessage, setStatusMessage] = useState("");

  const [statusTone, setStatusTone] = useState("blue");


  /* =======================================================
     CURRENT MODULE
     ======================================================= */

  const selectedModule = useMemo(() => {
    return (
      REPORT_MODULES.find(
        (item) => item.id === selectedModuleId
      ) || REPORT_MODULES[0]
    );
  }, [selectedModuleId]);


  /* =======================================================
     TOAST TIMER
     ======================================================= */

  useEffect(() => {
    if (!statusMessage) return undefined;

    const timer = setTimeout(() => {
      setStatusMessage("");
    }, 3500);

    return () => clearTimeout(timer);
  }, [statusMessage]);


  /* =======================================================
     LOAD MODULE DATA
     ======================================================= */

  useEffect(() => {
    if (!canAccess) return;

    async function loadRecords() {
      setSelectedRecordId("");
      setRecords([]);

      if (!selectedModule?.collectionName) {
        return;
      }

      try {
        setLoading(true);

        let snap;

        /*
          We first attempt the normal application pattern:
          createdAt descending.

          If an older collection does not contain the expected
          index/field structure, we fall back to a plain getDocs.
        */

        try {
          snap = await getDocs(
            query(
              collection(
                db,
                selectedModule.collectionName
              ),
              orderBy("createdAt", "desc"),
              limit(500)
            )
          );
        } catch (orderError) {
          console.warn(
            "Could not order collection by createdAt. Falling back.",
            orderError
          );

          snap = await getDocs(
            query(
              collection(
                db,
                selectedModule.collectionName
              ),
              limit(500)
            )
          );
        }

        const rows = snap.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setRecords(rows);
      } catch (error) {
        console.error(
          "Error loading Reports Data Management:",
          error
        );

        setStatusMessage(
          `Could not load ${selectedModule.label}.`
        );

        setStatusTone("red");
      } finally {
        setLoading(false);
      }
    }

    loadRecords();
  }, [
    canAccess,
    selectedModuleId,
    selectedModule?.collectionName,
    selectedModule?.label,
  ]);


  /* =======================================================
     SELECTED RECORD
     ======================================================= */

  const selectedRecord = useMemo(() => {
    return (
      records.find(
        (record) => record.id === selectedRecordId
      ) || null
    );
  }, [records, selectedRecordId]);


  /* =======================================================
     STATUS OPTIONS
     ======================================================= */

  const statusOptions = useMemo(() => {
    const values = new Set();

    records.forEach((record) => {
      const status = safeText(
        getRecordStatus(record)
      );

      if (status && status !== "-") {
        values.add(status);
      }
    });

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [records]);


  /* =======================================================
     FILTER RECORDS
     ======================================================= */

  const filteredRecords = useMemo(() => {
    const search = normalizeSearch(searchText);

    return records.filter((record) => {
      const status = safeText(
        getRecordStatus(record)
      );

      if (
        statusFilter !== "all" &&
        status !== statusFilter
      ) {
        return false;
      }

      const issues = getDataQualityIssues(
        record,
        selectedModuleId
      );

      if (
        qualityFilter === "issues" &&
        issues.length === 0
      ) {
        return false;
      }

      if (
        qualityFilter === "clean" &&
        issues.length > 0
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchableValues = [
        record.id,
        getRecordPrimaryName(record),
        getRecordSubmittedBy(record),
        getRecordDepartment(record),
        getRecordAirline(record),
        getRecordFlight(record),
        getRecordStatus(record),
        record?.supervisorName,
        record?.employeeName,
        record?.month,
        record?.templateLabel,
      ];

      return searchableValues.some((value) =>
        normalizeSearch(value).includes(search)
      );
    });
  }, [
    records,
    searchText,
    statusFilter,
    qualityFilter,
    selectedModuleId,
  ]);


  /* =======================================================
     DASHBOARD COUNTS
     ======================================================= */

  const totals = useMemo(() => {
    const total = records.length;

    let dataIssues = 0;
    let completed = 0;
    let followUp = 0;

    records.forEach((record) => {
      const issues = getDataQualityIssues(
        record,
        selectedModuleId
      );

      if (issues.length > 0) {
        dataIssues += 1;
      }

      const status = normalizeSearch(
        getRecordStatus(record)
      );

      if (
        status.includes("approved") ||
        status.includes("closed") ||
        status.includes("completed") ||
        status.includes("recognized")
      ) {
        completed += 1;
      }

      if (
        status.includes("follow") ||
        status.includes("pending") ||
        status.includes("return")
      ) {
        followUp += 1;
      }
    });

    return {
      total,
      dataIssues,
      completed,
      followUp,
    };
  }, [records, selectedModuleId]);


  /* =======================================================
     MODULE COUNTS

     Currently only selected/connected module is loaded.
     Later we can add lightweight count queries for every
     collection once all collection mappings are confirmed.
     ======================================================= */

  function getModuleCount(module) {
    if (module.id === selectedModuleId) {
      return records.length;
    }

    return 0;
  }


  /* =======================================================
     RESET FILTERS
     ======================================================= */

  function resetFilters() {
    setSearchText("");
    setStatusFilter("all");
    setQualityFilter("all");
  }


  /* =======================================================
     ACCESS CONTROL
     ======================================================= */

  if (!canAccess) {
    return (
      <PageCard
        style={{
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          Reports Data Management
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            color: "#64748b",
          }}
        >
          Only Station Managers can access this
          administrative page.
        </div>
      </PageCard>
    );
  }


  /* =======================================================
     PAGE
     ======================================================= */

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >

      {/* ===================================================
          HERO
          =================================================== */}

      <div
        style={{
          background:
            "linear-gradient(135deg,#0f5c91 0%,#1f7cc1 42%,#6ec6e8 100%)",
          borderRadius: 28,
          padding: 26,
          color: "#ffffff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
        }}
      >
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
          TPA OPS · Administration
        </p>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 32,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
        >
          Reports Data Management
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 980,
            fontSize: 14,
            lineHeight: 1.7,
            color: "rgba(255,255,255,0.90)",
          }}
        >
          Central administrative workspace for
          reviewing, searching, validating and managing
          report data across TPA OPS.
        </p>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "7px 11px",
              borderRadius: 999,
              background:
                "rgba(255,255,255,0.16)",
              border:
                "1px solid rgba(255,255,255,0.22)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Station Manager
          </span>

          <span
            style={{
              padding: "7px 11px",
              borderRadius: 999,
              background:
                "rgba(255,255,255,0.16)",
              border:
                "1px solid rgba(255,255,255,0.22)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {getVisibleUserName(user)}
          </span>
        </div>
      </div>


      {/* ===================================================
          STATUS MESSAGE
          =================================================== */}

      {statusMessage ? (
        <CenterToast
          message={statusMessage}
          tone={statusTone}
        />
      ) : null}


      {/* ===================================================
          DASHBOARD
          =================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(190px,1fr))",
          gap: 14,
        }}
      >
        <InfoCard
          label="Records"
          value={String(totals.total)}
          tone="blue"
          subtext={selectedModule.label}
        />

        <InfoCard
          label="Completed / Closed"
          value={String(totals.completed)}
          tone="green"
        />

        <InfoCard
          label="Follow Up / Pending"
          value={String(totals.followUp)}
          tone="amber"
        />

        <InfoCard
          label="Data Issues"
          value={String(totals.dataIssues)}
          tone={
            totals.dataIssues > 0
              ? "red"
              : "green"
          }
        />
      </div>


      {/* ===================================================
          REPORT MODULES
          =================================================== */}

      <PageCard
        style={{
          padding: 22,
        }}
      >
        <div
          style={{
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Management of Reports
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Select the report data source you want to
            manage.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
          }}
        >
          {REPORT_MODULES.map((module) => (
            <ReportModuleCard
              key={module.id}
              module={module}
              active={
                selectedModuleId === module.id
              }
              count={getModuleCount(module)}
              onClick={() => {
                setSelectedModuleId(module.id);
                setSearchText("");
                setStatusFilter("all");
                setQualityFilter("all");
                setSelectedRecordId("");

                if (!module.collectionName) {
                  setStatusMessage(
                    `${module.label}: Firestore collection mapping has not been connected yet.`
                  );

                  setStatusTone("amber");
                }
              }}
            />
          ))}
        </div>
      </PageCard>


      {/* ===================================================
          FILTERS
          =================================================== */}

      <PageCard
        style={{
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {selectedModule.label}
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {selectedModule.collectionName
                ? `Firestore: ${selectedModule.collectionName}`
                : "Firestore collection mapping pending"}
            </p>
          </div>

          <ActionButton
            variant="secondary"
            onClick={resetFilters}
          >
            Reset Filters
          </ActionButton>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(260px,2fr) repeat(2,minmax(180px,1fr))",
            gap: 12,
          }}
        >
          <div>
            <FieldLabel>Search Records</FieldLabel>

            <TextInput
              value={searchText}
              onChange={(e) =>
                setSearchText(e.target.value)
              }
              placeholder="Employee, flight, supervisor, airline, department, report ID..."
              disabled={
                !selectedModule.collectionName
              }
            />
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>

            <SelectInput
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
              disabled={
                !selectedModule.collectionName
              }
            >
              <option value="all">
                All Statuses
              </option>

              {statusOptions.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {status}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Data Quality</FieldLabel>

            <SelectInput
              value={qualityFilter}
              onChange={(e) =>
                setQualityFilter(e.target.value)
              }
              disabled={
                !selectedModule.collectionName
              }
            >
              <option value="all">
                All Records
              </option>

              <option value="issues">
                Data Issues Only
              </option>

              <option value="clean">
                No Detected Issues
              </option>
            </SelectInput>
          </div>
        </div>
      </PageCard>


      {/* ===================================================
          DATA AREA
          =================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedRecord
            ? "minmax(420px,1fr) minmax(380px,0.8fr)"
            : "1fr",
          gap: 18,
          alignItems: "start",
        }}
      >

        {/* =================================================
            RECORD LIST
            ================================================= */}

        <PageCard
          style={{
            padding: 20,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
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
                Report Data
              </h2>

              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                {filteredRecords.length} visible
                record(s)
              </div>
            </div>
          </div>


          {!selectedModule.collectionName ? (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 18,
                padding: 28,
                textAlign: "center",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                Collection mapping required
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "#64748b",
                }}
              >
                The visible module name is confirmed,
                but its actual Firestore collection
                has not been mapped yet.
              </div>
            </div>
          ) : loading ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
                fontSize: 14,
              }}
            >
              Loading report data...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
                fontSize: 14,
              }}
            >
              No records found.
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                border:
                  "1px solid #e2e8f0",
                borderRadius: 16,
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 850,
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fbff",
                    }}
                  >
                    {[
                      "Record",
                      "Department",
                      "Submitted By",
                      "Status",
                      "Created",
                      "Quality",
                    ].map((label) => (
                      <th
                        key={label}
                        style={{
                          textAlign: "left",
                          padding: "12px 14px",
                          borderBottom:
                            "1px solid #e2e8f0",
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#64748b",
                          textTransform:
                            "uppercase",
                          letterSpacing:
                            "0.06em",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map(
                    (record) => {
                      const active =
                        selectedRecordId ===
                        record.id;

                      const issues =
                        getDataQualityIssues(
                          record,
                          selectedModuleId
                        );

                      return (
                        <tr
                          key={record.id}
                          onClick={() =>
                            setSelectedRecordId(
                              record.id
                            )
                          }
                          style={{
                            cursor: "pointer",
                            background: active
                              ? "#edf7ff"
                              : "#ffffff",
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 900,
                                color:
                                  "#0f172a",
                              }}
                            >
                              {getRecordPrimaryName(
                                record
                              )}
                            </div>

                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 10,
                                color:
                                  "#94a3b8",
                                maxWidth: 220,
                                overflow:
                                  "hidden",
                                textOverflow:
                                  "ellipsis",
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {record.id}
                            </div>
                          </td>

                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              fontSize: 13,
                              color:
                                "#334155",
                            }}
                          >
                            {getRecordDepartment(
                              record
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              fontSize: 13,
                              color:
                                "#334155",
                            }}
                          >
                            {getRecordSubmittedBy(
                              record
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            <StatusBadge
                              status={getRecordStatus(
                                record
                              )}
                            />
                          </td>

                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              fontSize: 12,
                              color:
                                "#64748b",
                            }}
                          >
                            {formatDateTime(
                              getRecordCreatedAt(
                                record
                              )
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "13px 14px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            <span
                              style={{
                                display:
                                  "inline-flex",
                                padding:
                                  "5px 9px",
                                borderRadius:
                                  999,
                                fontSize: 11,
                                fontWeight:
                                  800,

                                background:
                                  issues.length >
                                  0
                                    ? "#fff1f2"
                                    : "#ecfdf5",

                                border:
                                  issues.length >
                                  0
                                    ? "1px solid #fecdd3"
                                    : "1px solid #a7f3d0",

                                color:
                                  issues.length >
                                  0
                                    ? "#9f1239"
                                    : "#166534",
                              }}
                            >
                              {issues.length > 0
                                ? `${issues.length} issue(s)`
                                : "OK"}
                            </span>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>


        {/* =================================================
            DATA INSPECTOR
            ================================================= */}

        {selectedRecord ? (
          <PageCard
            style={{
              padding: 20,
              position: "sticky",
              top: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#1769aa",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      "0.08em",
                  }}
                >
                  Data Inspector
                </div>

                <h2
                  style={{
                    margin: "5px 0 0",
                    fontSize: 21,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  {getRecordPrimaryName(
                    selectedRecord
                  )}
                </h2>
              </div>

              <ActionButton
                variant="secondary"
                onClick={() =>
                  setSelectedRecordId("")
                }
              >
                Close
              </ActionButton>
            </div>


            {/* COLLECTION INFO */}

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  border:
                    "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: 12,
                  background: "#f8fbff",
                }}
              >
                <FieldLabel>
                  Firestore Collection
                </FieldLabel>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#0f172a",
                    wordBreak: "break-all",
                  }}
                >
                  {selectedModule.collectionName}
                </div>
              </div>


              <div
                style={{
                  border:
                    "1px solid #dbeafe",
                  borderRadius: 14,
                  padding: 12,
                  background: "#f8fbff",
                }}
              >
                <FieldLabel>
                  Document ID
                </FieldLabel>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#334155",
                    wordBreak: "break-all",
                  }}
                >
                  {selectedRecord.id}
                </div>
              </div>
            </div>


            {/* BASIC INFO */}

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns:
                  "repeat(2,minmax(0,1fr))",
                gap: 10,
              }}
            >
              <InfoCard
                label="Status"
                value={getRecordStatus(
                  selectedRecord
                )}
              />

              <InfoCard
                label="Department"
                value={getRecordDepartment(
                  selectedRecord
                )}
              />

              <InfoCard
                label="Airline"
                value={getRecordAirline(
                  selectedRecord
                )}
              />

              <InfoCard
                label="Flight"
                value={getRecordFlight(
                  selectedRecord
                )}
              />
            </div>


            {/* TIMESTAMPS */}

            <div
              style={{
                marginTop: 16,
                border:
                  "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#0f172a",
                  marginBottom: 10,
                }}
              >
                Record Metadata
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  fontSize: 13,
                  color: "#475569",
                }}
              >
                <div>
                  <strong>
                    Submitted By:
                  </strong>{" "}
                  {getRecordSubmittedBy(
                    selectedRecord
                  )}
                </div>

                <div>
                  <strong>
                    Created:
                  </strong>{" "}
                  {formatDateTime(
                    getRecordCreatedAt(
                      selectedRecord
                    )
                  )}
                </div>

                <div>
                  <strong>
                    Last Updated:
                  </strong>{" "}
                  {formatDateTime(
                    getRecordUpdatedAt(
                      selectedRecord
                    )
                  )}
                </div>
              </div>
            </div>


            {/* QUALITY */}

            <div
              style={{
                marginTop: 16,
                border:
                  "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#0f172a",
                  marginBottom: 10,
                }}
              >
                Data Quality Check
              </div>

              {getDataQualityIssues(
                selectedRecord,
                selectedModuleId
              ).length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "#ecfdf5",
                    border:
                      "1px solid #a7f3d0",
                    color: "#166534",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  No data issues detected.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: 7,
                  }}
                >
                  {getDataQualityIssues(
                    selectedRecord,
                    selectedModuleId
                  ).map((issue) => (
                    <div
                      key={issue}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        background:
                          "#fff1f2",
                        border:
                          "1px solid #fecdd3",
                        color: "#9f1239",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      ⚠ {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>


            {/* RAW FIELD SUMMARY */}

            <div
              style={{
                marginTop: 16,
                border:
                  "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#0f172a",
                  marginBottom: 10,
                }}
              >
                Stored Fields
              </div>

              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  display: "grid",
                  gap: 7,
                }}
              >
                {Object.entries(
                  selectedRecord
                )
                  .filter(
                    ([key]) => key !== "id"
                  )
                  .map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(120px,0.7fr) minmax(0,1.3fr)",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#64748b",
                          wordBreak:
                            "break-word",
                        }}
                      >
                        {key}
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          color: "#334155",
                          wordBreak:
                            "break-word",
                        }}
                      >
                        {typeof value ===
                          "object" &&
                        value !== null
                          ? typeof value?.toDate ===
                            "function"
                            ? formatDateTime(
                                value
                              )
                            : Array.isArray(
                                value
                              )
                            ? `[Array: ${value.length} item(s)]`
                            : "[Object]"
                          : String(
                              value ?? "-"
                            )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>


            {/* NEXT STEP PLACEHOLDER */}

            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 16,
                background: "#edf7ff",
                border:
                  "1px solid #cfe7fb",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#1769aa",
                }}
              >
                Administrative Editing
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#475569",
                }}
              >
                Safe field editing will be enabled
                per report type. Protected Firestore
                fields will remain read-only.
              </div>
            </div>
          </PageCard>
        ) : null}
      </div>
    </div>
  );
}
