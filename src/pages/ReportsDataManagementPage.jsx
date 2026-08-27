import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* =========================================================
   REPORTS DATA MANAGEMENT V2
   TPA OPS PLATFORM

   Central administrative workspace for:
   - Report review
   - Data quality
   - Administrative corrections
   - Audit trail
   - Archiving
   - Cross-module filtering
   ========================================================= */


/* =========================================================
   REPORT MODULES
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
    status: "connected",
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
    status: "connected",
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
   MANAGEMENT CONFIGURATION

   IMPORTANT:
   We intentionally DO NOT attempt to normalize the Firestore
   schemas. Each report module keeps its existing structure.
   ========================================================= */

const MODULE_CONFIG = {
  timesheet: {
    editableFields: [
      "date",
      "department",
      "airline",
      "flightNumber",
      "supervisorName",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "reportDate"],
        label: "report date",
      },
      {
        keys: ["department", "departmentName"],
        label: "department",
      },
    ],
  },

  operational: {
    editableFields: [
      "date",
      "reportDate",
      "department",
      "airline",
      "flightNumber",
      "shift",
      "supervisorName",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "reportDate"],
        label: "report date",
      },
      {
        keys: ["department", "departmentName"],
        label: "department",
      },
      {
        keys: [
          "supervisorName",
          "submittedByName",
          "submittedBy",
        ],
        label: "supervisor / submitted by",
      },
    ],
  },

  regulatedGarbage: {
    editableFields: [
      "date",
      "department",
      "airline",
      "flightNumber",
      "supervisorName",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "reportDate"],
        label: "report date",
      },
      {
        keys: ["airline", "airlineName"],
        label: "airline",
      },
      {
        keys: ["flightNumber", "flight"],
        label: "flight",
      },
    ],
  },

  cleaningSecurity: {
    editableFields: [
      "date",
      "department",
      "airline",
      "flightNumber",
      "supervisorName",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "reportDate"],
        label: "report date",
      },
      {
        keys: ["airline", "airlineName"],
        label: "airline",
      },
      {
        keys: ["flightNumber", "flight"],
        label: "flight",
      },
    ],
  },

  operationsRequests: {
    editableFields: [
      "date",
      "department",
      "airline",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "createdAt", "submittedAt"],
        label: "submission date",
      },
      {
        keys: ["department", "departmentName"],
        label: "department",
      },
    ],
  },

  wchrPoi: {
    editableFields: [
      "date",
      "airline",
      "flightNumber",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "flightDate"],
        label: "date",
      },
      {
        keys: ["airline", "airlineName"],
        label: "airline",
      },
      {
        keys: ["flightNumber", "flight"],
        label: "flight",
      },
    ],
  },

  employeePerformance: {
    editableFields: [
      "employeeName",
      "department",
      "supervisorName",
      "month",
      "score",
      "managerStatus",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["employeeName"],
        label: "employee name",
      },
      {
        keys: ["department"],
        label: "department",
      },
      {
        keys: ["supervisorName"],
        label: "supervisor",
      },
      {
        keys: ["month"],
        label: "evaluation month",
      },
      {
        keys: ["score"],
        label: "performance score",
        allowZero: true,
      },
      {
        keys: ["managerStatus"],
        label: "manager status",
      },
    ],
  },

  gateChecklist: {
    editableFields: [
      "date",
      "airline",
      "flightNumber",
      "gate",
      "supervisorName",
      "status",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date", "reportDate"],
        label: "date",
      },
      {
        keys: ["airline", "airlineName"],
        label: "airline",
      },
      {
        keys: ["flightNumber", "flight"],
        label: "flight",
      },
    ],
  },

  fuelManagement: {
    editableFields: [
      "date",
      "airline",
      "flightNumber",
      "ticketNumber",
      "gallons",
      "agent",
      "supervisor",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date"],
        label: "date",
      },
      {
        keys: ["airline"],
        label: "airline",
      },
      {
        keys: ["gallons"],
        label: "fuel amount",
        allowZero: true,
      },
    ],
  },

  cierreVueloFlights: {
    editableFields: [
      "date",
      "airline",
      "flightNumber",
      "pax",
      "bags",
      "supervisor",
      "closingAgent",
    ],

    qualityFields: [
      {
        keys: ["date"],
        label: "date",
      },
      {
        keys: ["airline"],
        label: "airline",
      },
      {
        keys: ["flightNumber"],
        label: "flight",
      },
    ],
  },

  cierreVueloFuel: {
    editableFields: [
      "date",
      "airline",
      "ticketNumber",
      "gallons",
      "agent",
      "supervisor",
      "flightNumber",
      "notes",
    ],

    qualityFields: [
      {
        keys: ["date"],
        label: "date",
      },
      {
        keys: ["airline"],
        label: "airline",
      },
      {
        keys: ["ticketNumber"],
        label: "ticket number",
      },
      {
        keys: ["gallons"],
        label: "fuel gallons",
        allowZero: true,
      },
    ],
  },

  cierreVueloMonthClosures: {
    editableFields: [
      "airline",
      "monthKey",
      "status",
    ],

    qualityFields: [
      {
        keys: ["airline"],
        label: "airline",
      },
      {
        keys: ["monthKey"],
        label: "month",
      },
      {
        keys: ["status"],
        label: "status",
      },
    ],
  },
};


/* =========================================================
   PROTECTED FIRESTORE FIELDS

   These fields must NEVER be directly changed through the
   administrative editor.
   ========================================================= */

const PROTECTED_FIELDS = new Set([
  "id",

  "createdAt",
  "createdBy",
  "createdById",
  "createdByName",

  "submittedAt",
  "submittedBy",
  "submittedById",
  "submittedByName",

  "updatedAt",
  "updatedBy",
  "updatedById",

  "archivedAt",
  "archivedBy",
  "archivedById",

  "lastManagementEditAt",
  "lastManagementEditBy",
  "lastManagementEditById",
]);


const REPORT_AUDIT_COLLECTION = "reports_management_audit";

function getTimestampMilliseconds(value) {
  if (!value) return 0;

  try {
    if (typeof value?.toMillis === "function") {
      return value.toMillis();
    }

    if (typeof value?.toDate === "function") {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  } catch {
    return 0;
  }
}

function valuesAreEqual(a, b) {
  if (a === b) return true;

  if (a === null || a === undefined) {
    return b === null || b === undefined || b === "";
  }

  if (typeof a === "number") {
    return a === Number(b);
  }

  if (typeof a === "boolean") {
    return a === (b === true || b === "true" || b === "yes" || b === "1");
  }

  return String(a) === String(b ?? "");
}

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function safeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}


function normalizeSearch(value) {
  return safeText(value).toLowerCase();
}


function formatDateTime(value) {
  if (!value) {
    return "-";
  }

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


function getVisibleUserId(user) {
  return (
    user?.id ||
    user?.uid ||
    user?.userId ||
    ""
  );
}


/* =========================================================
   RECORD FIELD HELPERS
   ========================================================= */

function getRecordCreatedAt(record) {
  return (
    record?.createdAt ||
    record?.submittedAt ||
    record?.dateCreated ||
    record?.timestamp ||
    record?.date ||
    record?.reportDate ||
    null
  );
}


function getRecordUpdatedAt(record) {
  return (
    record?.lastManagementEditAt ||
    record?.updatedAt ||
    record?.modifiedAt ||
    record?.managerReviewedAt ||
    null
  );
}


function getRecordStatus(record) {
  if (record?.archived === true) {
    return "ARCHIVED";
  }

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
    record?.supervisor ||
    record?.createdByName ||
    record?.createdBy ||
    record?.employeeName ||
    record?.agent ||
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
    record?.ticketNumber ||
    record?.name ||
    record?.id ||
    "Record"
  );
}


/* =========================================================
   FIELD PRESENCE
   ========================================================= */

function hasValue(record, keys, allowZero = false) {
  return keys.some((key) => {
    const value = record?.[key];

    if (allowZero && value === 0) {
      return true;
    }

    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim() !== "";
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  });
}


/* =========================================================
   DATA QUALITY V2
   ========================================================= */

function getDataQualityIssues(record, moduleId) {
  const issues = [];

  if (!record) {
    return issues;
  }

  const config = MODULE_CONFIG[moduleId];

  /*
    Creation/submission timestamp is checked independently
    because this is important for report traceability.
  */

  if (!getRecordCreatedAt(record)) {
    issues.push(
      "Missing creation / submission date"
    );
  }

  if (!config?.qualityFields) {
    return issues;
  }

  config.qualityFields.forEach((rule) => {
    const exists = hasValue(
      record,
      rule.keys,
      Boolean(rule.allowZero)
    );

    if (!exists) {
      issues.push(
        `Missing ${rule.label}`
      );
    }
  });

  return Array.from(new Set(issues));
}


/* =========================================================
   EDITABLE FIELDS
   ========================================================= */

function getEditableFields(moduleId, record) {
  const config = MODULE_CONFIG[moduleId];

  if (!config) {
    return [];
  }

  return (config.editableFields || []).filter(
    (field) => {
      if (PROTECTED_FIELDS.has(field)) {
        return false;
      }

      /*
        Only expose configured fields.

        A field does not have to already exist because some
        older records may legitimately be missing it and the
        Station Manager may need to repair that data.
      */

      return true;
    }
  );
}


/* =========================================================
   VALUE DISPLAY
   ========================================================= */

function displayStoredValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "-";
  }

  if (
    typeof value?.toDate === "function"
  ) {
    return formatDateTime(value);
  }

  if (Array.isArray(value)) {
    return `[Array: ${value.length} item(s)]`;
  }

  if (
    typeof value === "object"
  ) {
    return "[Object]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}


/* =========================================================
   FILTER DATE HELPER
   ========================================================= */

function getRecordDateValue(record) {
  const raw =
    record?.date ||
    record?.reportDate ||
    record?.flightDate ||
    record?.createdAt ||
    record?.submittedAt ||
    null;

  if (!raw) {
    return null;
  }

  try {
    if (
      typeof raw?.toDate === "function"
    ) {
      return raw.toDate();
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  } catch {
    return null;
  }
}


/* =========================================================
   EDIT VALUE CONVERSION

   Preserve obvious numeric/boolean types when an
   administrative correction is saved.
   ========================================================= */

function convertEditedValue(originalValue, editedValue) {
  if (typeof originalValue === "number") {
    const parsed = Number(editedValue);

    return Number.isNaN(parsed)
      ? originalValue
      : parsed;
  }

  if (typeof originalValue === "boolean") {
    const normalized =
      safeText(editedValue).toLowerCase();

    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "1"
    );
  }

  return editedValue;
}


/* =========================================================
   AUDIT HELPERS
   ========================================================= */

function buildAuditDocumentId() {
  return `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}


function buildAuditChanges(
  originalRecord,
  editedValues
) {
  const changes = {};

  Object.entries(editedValues).forEach(
    ([field, newValue]) => {
      const oldValue =
        originalRecord?.[field];

      const normalizedNewValue =
        convertEditedValue(
          oldValue,
          newValue
        );

      if (
        JSON.stringify(oldValue) !==
        JSON.stringify(normalizedNewValue)
      ) {
        changes[field] = {
          from:
            oldValue === undefined
              ? null
              : oldValue,

          to: normalizedNewValue,
        };
      }
    }
  );
  

  return changes;
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


/* =========================================================
   FIELD LABEL
   ========================================================= */

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


/* =========================================================
   TEXT INPUT
   ========================================================= */

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled
          ? "#f8fafc"
          : "#ffffff",
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


/* =========================================================
   SELECT INPUT
   ========================================================= */

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled
          ? "#f8fafc"
          : "#ffffff",
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


/* =========================================================
   TEXT AREA
   ========================================================= */

function TextAreaInput(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 90,
        resize: "vertical",
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: props.disabled
          ? "#f8fafc"
          : "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        lineHeight: 1.5,
        color: "#0f172a",
        outline: "none",
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}


/* =========================================================
   ACTION BUTTON
   ========================================================= */

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  title = "",
  style = {},
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
      title={title}
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        boxShadow:
          variant === "primary"
            ? "0 12px 24px rgba(23,105,170,0.16)"
            : "none",
        ...(styles[variant] || styles.primary),
        ...style,
      }}
    >
      {children}
    </button>
  );
}


/* =========================================================
   INFO CARD
   ========================================================= */

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

    slate: {
      background: "#f8fafc",
      border: "#e2e8f0",
      value: "#334155",
    },
  };

  const current =
    tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.background,
        border: `1px solid ${current.border}`,
        borderRadius: 18,
        padding: "16px 18px",
        minWidth: 0,
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
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>

      {subtext ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#64748b",
          }}
        >
          {subtext}
        </div>
      ) : null}
    </div>
  );
}


/* =========================================================
   CENTER TOAST
   ========================================================= */

function CenterToast({
  message,
  tone = "blue",
}) {
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

  const current =
    tones[tone] || tones.blue;

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
          boxShadow:
            "0 18px 42px rgba(15,23,42,0.08)",
        }}
      >
        {message}
      </div>
    </div>
  );
}


/* =========================================================
   STATUS BADGE
   ========================================================= */

function StatusBadge({ status }) {
  const value =
    safeText(status).toLowerCase();

  let background = "#edf7ff";
  let border = "#cfe7fb";
  let color = "#1769aa";

  if (
    value.includes("approved") ||
    value.includes("closed") ||
    value.includes("completed") ||
    value.includes("recognized") ||
    value.includes("complete")
  ) {
    background = "#ecfdf5";
    border = "#a7f3d0";
    color = "#166534";
  }

  if (
    value.includes("follow") ||
    value.includes("pending") ||
    value.includes("return") ||
    value.includes("open")
  ) {
    background = "#fff7ed";
    border = "#fdba74";
    color = "#9a3412";
  }

  if (
    value.includes("reject") ||
    value.includes("cancel") ||
    value.includes("failed")
  ) {
    background = "#fff1f2";
    border = "#fecdd3";
    color = "#9f1239";
  }

  if (value.includes("archived")) {
    background = "#f1f5f9";
    border = "#cbd5e1";
    color = "#475569";
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
   QUALITY BADGE
   ========================================================= */

function QualityBadge({ issues }) {
  const hasIssues =
    Array.isArray(issues) &&
    issues.length > 0;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,

        background: hasIssues
          ? "#fff1f2"
          : "#ecfdf5",

        border: hasIssues
          ? "1px solid #fecdd3"
          : "1px solid #a7f3d0",

        color: hasIssues
          ? "#9f1239"
          : "#166534",
      }}
    >
      {hasIssues
        ? `${issues.length} issue(s)`
        : "OK"}
    </span>
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
  loadingCount = false,
}) {
  const connected =
    Boolean(module.collectionName);

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
            flexShrink: 0,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active
              ? "#dbeafe"
              : "#f1f5f9",
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
          {connected
            ? "CONNECTED"
            : "PENDING"}
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
        {!connected
          ? "Collection mapping required"
          : loadingCount
          ? "Loading records..."
          : `${Number(count || 0).toLocaleString()} record(s)`}
      </div>
    </button>
  );
}


/* =========================================================
   EMPTY STATE
   ========================================================= */

function EmptyState({
  title,
  message,
}) {
  return (
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
        {title}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          lineHeight: 1.6,
          color: "#64748b",
        }}
      >
        {message}
      </div>
    </div>
  );
}


/* =========================================================
   OBJECT / ARRAY VIEWER

   Recursive read-only viewer for nested Firestore data.
   ========================================================= */

function StructuredValueViewer({
  value,
  depth = 0,
}) {
  const [expanded, setExpanded] =
    useState(depth < 1);

  /*
    Firestore Timestamp
  */

  if (
    value &&
    typeof value?.toDate === "function"
  ) {
    return (
      <span
        style={{
          color: "#334155",
        }}
      >
        {formatDateTime(value)}
      </span>
    );
  }

  /*
    Primitive / null
  */

  if (
    value === null ||
    value === undefined ||
    typeof value !== "object"
  ) {
    return (
      <span
        style={{
          color:
            value === null ||
            value === undefined
              ? "#94a3b8"
              : "#334155",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {displayStoredValue(value)}
      </span>
    );
  }

  const isArray =
    Array.isArray(value);

  const entries = isArray
    ? value.map((item, index) => [
        String(index),
        item,
      ])
    : Object.entries(value);

  const title = isArray
    ? `Array · ${entries.length} item(s)`
    : `Object · ${entries.length} field(s)`;

  if (entries.length === 0) {
    return (
      <span
        style={{
          color: "#94a3b8",
        }}
      >
        {isArray
          ? "Empty Array"
          : "Empty Object"}
      </span>
    );
  }

  return (
    <div
      style={{
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={() =>
          setExpanded((prev) => !prev)
        }
        style={{
          border: "none",
          padding: 0,
          background: "transparent",
          color: "#1769aa",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {expanded ? "▼" : "▶"} {title}
      </button>

      {expanded ? (
        <div
          style={{
            marginTop: 8,
            marginLeft:
              depth === 0 ? 0 : 8,
            paddingLeft:
              depth === 0 ? 0 : 10,
            borderLeft:
              depth === 0
                ? "none"
                : "2px solid #e2e8f0",
            display: "grid",
            gap: 7,
          }}
        >
          {entries.map(
            ([key, childValue]) => (
              <div
                key={`${key}-${depth}`}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(90px,0.55fr) minmax(0,1.45fr)",
                  gap: 10,
                  alignItems: "start",
                  padding: "8px 10px",
                  borderRadius: 10,
                  background:
                    depth % 2 === 0
                      ? "#f8fafc"
                      : "#ffffff",
                  border:
                    "1px solid #f1f5f9",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: "#64748b",
                    wordBreak: "break-word",
                  }}
                >
                  {isArray
                    ? `#${Number(key) + 1}`
                    : key}
                </div>

                <div
                  style={{
                    minWidth: 0,
                    fontSize: 11,
                    color: "#334155",
                    wordBreak: "break-word",
                  }}
                >
                  <StructuredValueViewer
                    value={childValue}
                    depth={depth + 1}
                  />
                </div>
              </div>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}


/* =========================================================
   STORED FIELD ROW
   ========================================================= */

function StoredFieldRow({
  fieldName,
  value,
  protectedField = false,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(130px,0.65fr) minmax(0,1.35fr)",
        gap: 10,
        padding: "10px 11px",
        borderRadius: 12,

        background: protectedField
          ? "#f8fafc"
          : "#ffffff",

        border: protectedField
          ? "1px solid #e2e8f0"
          : "1px solid #f1f5f9",
      }}
    >
      <div
        style={{
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            color: "#64748b",
            wordBreak: "break-word",
          }}
        >
          {fieldName}
        </div>

        {protectedField ? (
          <div
            style={{
              marginTop: 4,
              display: "inline-flex",
              padding: "3px 6px",
              borderRadius: 999,
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              fontSize: 9,
              fontWeight: 900,
            }}
          >
            PROTECTED
          </div>
        ) : null}
      </div>

      <div
        style={{
          minWidth: 0,
          fontSize: 11,
          color: "#334155",
          wordBreak: "break-word",
        }}
      >
        <StructuredValueViewer
          value={value}
        />
      </div>
    </div>
  );
}


/* =========================================================
   EDIT FIELD

   Administrative editor intentionally supports primitives.
   Nested arrays / objects remain protected from generic
   editing because each module can store them differently.
   ========================================================= */

function AdministrativeEditField({
  field,
  originalValue,
  value,
  onChange,
}) {
  const isLongText =
    field.toLowerCase().includes("notes") ||
    field.toLowerCase().includes("comment") ||
    field.toLowerCase().includes("description");

  const originalType =
    typeof originalValue;

  const inputType =
    originalType === "number"
      ? "number"
      : field.toLowerCase().includes("date") &&
        typeof originalValue !== "object"
      ? "date"
      : "text";

  return (
    <div>
      <FieldLabel>
        {field}
      </FieldLabel>

      {isLongText ? (
        <TextAreaInput
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              field,
              e.target.value
            )
          }
        />
      ) : originalType === "boolean" ? (
        <SelectInput
          value={String(value)}
          onChange={(e) =>
            onChange(
              field,
              e.target.value
            )
          }
        >
          <option value="true">
            Yes / True
          </option>

          <option value="false">
            No / False
          </option>
        </SelectInput>
      ) : (
        <TextInput
          type={inputType}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              field,
              e.target.value
            )
          }
        />
      )}
    </div>
  );
}


/* =========================================================
   ADMINISTRATIVE EDITOR
   ========================================================= */

function AdministrativeEditor({
  moduleId,
  record,
  values,
  onChange,
  onSave,
  onCancel,
  saving,
}) {
  const fields =
    getEditableFields(
      moduleId,
      record
    );

  if (fields.length === 0) {
    return (
      <EmptyState
        title="No editable fields"
        message="This report type does not currently expose any fields for administrative correction."
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          background: "#fff7ed",
          border: "1px solid #fdba74",
          color: "#9a3412",
          fontSize: 12,
          lineHeight: 1.6,
          fontWeight: 700,
        }}
      >
        Administrative changes are
        recorded in the audit trail.
        Protected Firestore metadata and
        nested report structures cannot be
        changed from this editor.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 12,
        }}
      >
        {fields.map((field) => {
          const originalValue =
            record?.[field];

          /*
            We intentionally prevent generic editing
            of nested Firestore structures.
          */

          if (
            originalValue &&
            typeof originalValue ===
              "object"
          ) {
            return (
              <div
                key={field}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border:
                    "1px solid #e2e8f0",
                  background: "#f8fafc",
                }}
              >
                <FieldLabel>
                  {field}
                </FieldLabel>

                <div
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  Nested field — read only
                  from the generic editor.
                </div>
              </div>
            );
          }

          return (
            <AdministrativeEditField
              key={field}
              field={field}
              originalValue={
                originalValue
              }
              value={values[field]}
              onChange={onChange}
            />
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
          paddingTop: 4,
        }}
      >
        <ActionButton
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </ActionButton>

        <ActionButton
          variant="success"
          onClick={onSave}
          disabled={saving}
        >
          {saving
            ? "Saving..."
            : "Save Changes"}
        </ActionButton>
      </div>
    </div>
  );
}


/* =========================================================
   QUALITY ISSUES PANEL
   ========================================================= */

function QualityIssuesPanel({
  record,
  moduleId,
}) {
  const issues =
    getDataQualityIssues(
      record,
      moduleId
    );

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
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

      {issues.length === 0 ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#166534",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          ✓ No data issues detected.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 7,
          }}
        >
          {issues.map((issue) => (
            <div
              key={issue}
              style={{
                padding: 10,
                borderRadius: 10,
                background: "#fff1f2",
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
  );
}


/* =========================================================
   ARCHIVE BADGE
   ========================================================= */

function ArchiveBadge({
  archived,
}) {
  if (!archived) {
    return null;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: 999,
        background: "#f1f5f9",
        border: "1px solid #cbd5e1",
        color: "#475569",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: "0.04em",
      }}
    >
      ARCHIVED
    </span>
  );
}


/* =========================================================
   SECTION HEADER
   ========================================================= */

function SectionHeader({
  title,
  subtitle = "",
  right = null,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
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
          {title}
        </h2>

        {subtitle ? (
          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#64748b",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {right}
    </div>
  );
}


/* =========================================================
   FILTER CHIP
   ========================================================= */

function FilterChip({
  children,
  onRemove,
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 9px",
        borderRadius: 999,
        background: "#edf7ff",
        border: "1px solid #cfe7fb",
        color: "#1769aa",
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {children}

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: "none",
            background:
              "transparent",
            color: "#1769aa",
            cursor: "pointer",
            fontWeight: 900,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}


/* =========================================================
   RECORD METADATA
   ========================================================= */

function RecordMetadata({
  record,
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
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
          gap: 9,
          fontSize: 13,
          color: "#475569",
        }}
      >
        <div>
          <strong>
            Submitted By:
          </strong>{" "}
          {getRecordSubmittedBy(
            record
          )}
        </div>

        <div>
          <strong>
            Created:
          </strong>{" "}
          {formatDateTime(
            getRecordCreatedAt(
              record
            )
          )}
        </div>

        <div>
          <strong>
            Last Updated:
          </strong>{" "}
          {formatDateTime(
            getRecordUpdatedAt(
              record
            )
          )}
        </div>

        {record?.lastManagementEditBy ? (
          <div>
            <strong>
              Last Management Edit:
            </strong>{" "}
            {record.lastManagementEditBy}
          </div>
        ) : null}

        {record?.archived === true ? (
          <>
            <div>
              <strong>
                Archived By:
              </strong>{" "}
              {record?.archivedBy ||
                "-"}
            </div>

            <div>
              <strong>
                Archived:
              </strong>{" "}
              {formatDateTime(
                record?.archivedAt
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}


/* =========================================================
   STORED FIELDS VIEWER
   ========================================================= */

function StoredFieldsViewer({
  record,
}) {
  const entries =
    Object.entries(record || {})
      .filter(
        ([key]) => key !== "id"
      )
      .sort(([a], [b]) => {
        /*
          Protected metadata is intentionally moved
          toward the bottom of the viewer.
        */

        const aProtected =
          PROTECTED_FIELDS.has(a);

        const bProtected =
          PROTECTED_FIELDS.has(b);

        if (
          aProtected !== bProtected
        ) {
          return aProtected ? 1 : -1;
        }

        return a.localeCompare(b);
      });

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          Stored Fields
        </div>

        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#64748b",
          }}
        >
          {entries.length} field(s)
        </div>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "#64748b",
          }}
        >
          No stored fields found.
        </div>
      ) : (
        <div
          style={{
            maxHeight: 520,
            overflowY: "auto",
            display: "grid",
            gap: 7,
            paddingRight: 3,
          }}
        >
          {entries.map(
            ([key, value]) => (
              <StoredFieldRow
                key={key}
                fieldName={key}
                value={value}
                protectedField={
                  PROTECTED_FIELDS.has(
                    key
                  )
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
/* =========================================================
   MAIN PAGE
   ========================================================= */

export default function ReportsDataManagementPage() {
  const { user } = useUser();

  /*
    This page is restricted to Station Managers because it
    provides direct administrative access to report data.
  */

  const canAccess =
    user?.role === "station_manager";

  /* =======================================================
     MAIN STATE
     ======================================================= */

  const [selectedModuleId, setSelectedModuleId] =
    useState("employeePerformance");

  const [records, setRecords] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [
    selectedRecordId,
    setSelectedRecordId,
  ] = useState("");

  /*
    Module counts are independent from the selected module.

    Example:
    {
      timesheet: 120,
      operational: 42,
      regulatedGarbage: 18,
      ...
    }
  */

  const [
    moduleCounts,
    setModuleCounts,
  ] = useState({});

  const [
    loadingModuleCounts,
    setLoadingModuleCounts,
  ] = useState(false);

  /* =======================================================
     FILTER STATE
     ======================================================= */

  const [searchText, setSearchText] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [
    qualityFilter,
    setQualityFilter,
  ] = useState("all");

  const [
    departmentFilter,
    setDepartmentFilter,
  ] = useState("all");

  const [
    airlineFilter,
    setAirlineFilter,
  ] = useState("all");

  const [
    archiveFilter,
    setArchiveFilter,
  ] = useState("active");

  const [monthFilter, setMonthFilter] = useState("all");

  /* =======================================================
     EDITOR STATE
     ======================================================= */

  const [
    editMode,
    setEditMode,
  ] = useState(false);

  const [
    editValues,
    setEditValues,
  ] = useState({});

  const [
    saving,
    setSaving,
  ] = useState(false);

  /* =======================================================
     UI STATUS
     ======================================================= */

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    statusTone,
    setStatusTone,
  ] = useState("blue");


  /* =======================================================
     CURRENT MODULE
     ======================================================= */

  const selectedModule =
    useMemo(() => {
      return (
        REPORT_MODULES.find(
          (item) =>
            item.id ===
            selectedModuleId
        ) || REPORT_MODULES[0]
      );
    }, [selectedModuleId]);


  /* =======================================================
     TOAST TIMER
     ======================================================= */

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timer =
      setTimeout(() => {
        setStatusMessage("");
      }, 3500);

    return () =>
      clearTimeout(timer);
  }, [statusMessage]);


  /* =======================================================
     LOAD COUNTS FOR ALL CONNECTED MODULES
     ======================================================= */

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    let cancelled = false;

    async function loadModuleCounts() {
      try {
        setLoadingModuleCounts(true);

        const connectedModules =
          REPORT_MODULES.filter(
            (module) =>
              Boolean(
                module.collectionName
              )
          );

        /*
          We intentionally use the same 500-document
          safety limit as the data viewer.

          This avoids loading unlimited report history
          into the browser.

          Later, if needed, this can be upgraded to
          Firestore getCountFromServer().
        */

        const results =
          await Promise.all(
            connectedModules.map(
              async (module) => {
                try {
                  const snap =
                    await getDocs(
                      query(
                        collection(
                          db,
                          module.collectionName
                        ),
                        limit(500)
                      )
                    );

                  return [
                    module.id,
                    snap.size,
                  ];
                } catch (error) {
                  console.error(
                    `Error counting ${module.label}:`,
                    error
                  );

                  return [
                    module.id,
                    null,
                  ];
                }
              }
            )
          );

        if (cancelled) {
          return;
        }

        const nextCounts = {};

        results.forEach(
          ([moduleId, count]) => {
            nextCounts[moduleId] =
              count;
          }
        );

        setModuleCounts(
          nextCounts
        );
      } catch (error) {
        console.error(
          "Error loading report module counts:",
          error
        );
      } finally {
        if (!cancelled) {
          setLoadingModuleCounts(
            false
          );
        }
      }
    }

    loadModuleCounts();

    return () => {
      cancelled = true;
    };
  }, [canAccess]);


  /* =======================================================
     LOAD SELECTED MODULE DATA
     ======================================================= */

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    let cancelled = false;

    async function loadRecords() {
      setSelectedRecordId("");
      setRecords([]);
      setEditMode(false);
      setEditValues({});

      if (
        !selectedModule?.collectionName
      ) {
        return;
      }

      try {
        setLoading(true);

        let snap;

        /*
          First attempt:
          order newest records by createdAt.

          Some older collections may not use createdAt.
          In that case we safely fall back to a normal
          collection query.
        */

        try {
          snap = await getDocs(
            query(
              collection(
                db,
                selectedModule.collectionName
              ),
              orderBy(
                "createdAt",
                "desc"
              ),
              limit(500)
            )
          );
        } catch (orderError) {
          console.warn(
            `Could not order ${selectedModule.collectionName} by createdAt. Falling back.`,
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

        if (cancelled) {
          return;
        }

        const rows =
          snap.docs.map(
            (document) => ({
              id: document.id,
              ...document.data(),
            })
          );

        /*
          Client-side fallback sorting.

          This is useful for collections using:
          submittedAt
          timestamp
          dateCreated
          etc.
        */

        rows.sort((a, b) => {
          const aTime =
            getTimestampMilliseconds(
              getRecordCreatedAt(a)
            );

          const bTime =
            getTimestampMilliseconds(
              getRecordCreatedAt(b)
            );

          return bTime - aTime;
        });

        setRecords(rows);

        /*
          Keep the selected module count synchronized
          with the actual loaded data.
        */

        setModuleCounts(
          (prev) => ({
            ...prev,
            [selectedModule.id]:
              rows.length,
          })
        );
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, [
    canAccess,
    selectedModuleId,
    selectedModule?.id,
    selectedModule?.collectionName,
    selectedModule?.label,
  ]);


  /* =======================================================
     SELECTED RECORD
     ======================================================= */

  const selectedRecord =
    useMemo(() => {
      return (
        records.find(
          (record) =>
            record.id ===
            selectedRecordId
        ) || null
      );
    }, [
      records,
      selectedRecordId,
    ]);


  /* =======================================================
     AVAILABLE STATUS OPTIONS
     ======================================================= */

  const statusOptions =
    useMemo(() => {
      const values =
        new Set();

      records.forEach(
        (record) => {
          const status =
            safeText(
              getRecordStatus(
                record
              )
            );

          if (
            status &&
            status !== "-"
          ) {
            values.add(status);
          }
        }
      );

      return Array.from(
        values
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [records]);


  /* =======================================================
     AVAILABLE DEPARTMENTS
     ======================================================= */

  const departmentOptions =
    useMemo(() => {
      const values =
        new Set();

      records.forEach(
        (record) => {
          const department =
            safeText(
              getRecordDepartment(
                record
              )
            );

          if (
            department &&
            department !== "-"
          ) {
            values.add(
              department
            );
          }
        }
      );

      return Array.from(
        values
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [records]);


  /* =======================================================
     AVAILABLE AIRLINES
     ======================================================= */

  const airlineOptions =
    useMemo(() => {
      const values =
        new Set();

      records.forEach(
        (record) => {
          const airline =
            safeText(
              getRecordAirline(
                record
              )
            );

          if (
            airline &&
            airline !== "-"
          ) {
            values.add(
              airline
            );
          }
        }
      );

      return Array.from(
        values
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [records]);


  /* =======================================================
     AVAILABLE MONTHS
     ======================================================= */

  const monthOptions = useMemo(() => {
    const values = new Set();
    records.forEach((record) => {
      const date = getRecordDateValue(record);
      if (!date) return;
      values.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(values).sort((a, b) => b.localeCompare(a));
  }, [records]);

  /* =======================================================
     FILTERED RECORDS
     ======================================================= */

  const filteredRecords =
    useMemo(() => {
      const search =
        normalizeSearch(
          searchText
        );

      return records.filter(
        (record) => {
          const status =
            safeText(
              getRecordStatus(
                record
              )
            );

          const department =
            safeText(
              getRecordDepartment(
                record
              )
            );

          const airline =
            safeText(
              getRecordAirline(
                record
              )
            );

          /* STATUS */

          if (
            statusFilter !==
              "all" &&
            status !==
              statusFilter
          ) {
            return false;
          }

          /* DEPARTMENT */

          if (
            departmentFilter !==
              "all" &&
            department !==
              departmentFilter
          ) {
            return false;
          }

          /* AIRLINE */

          if (
            airlineFilter !==
              "all" &&
            airline !==
              airlineFilter
          ) {
            return false;
          }

          /* ARCHIVE */

          const archived =
            record?.archived ===
            true;

          if (
            archiveFilter ===
              "active" &&
            archived
          ) {
            return false;
          }

          if (
            archiveFilter ===
              "archived" &&
            !archived
          ) {
            return false;
          }

          /* MONTH */

          if (monthFilter !== "all") {
            const recordDate = getRecordDateValue(record);
            if (!recordDate) return false;
            const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}`;
            if (recordMonth !== monthFilter) return false;
          }

          /* QUALITY */

          const issues =
            getDataQualityIssues(
              record,
              selectedModuleId
            );

          if (
            qualityFilter ===
              "issues" &&
            issues.length === 0
          ) {
            return false;
          }

          if (
            qualityFilter ===
              "clean" &&
            issues.length > 0
          ) {
            return false;
          }

          /* SEARCH */

          if (!search) {
            return true;
          }

          const searchableValues =
            [
              record.id,

              getRecordPrimaryName(
                record
              ),

              getRecordSubmittedBy(
                record
              ),

              getRecordDepartment(
                record
              ),

              getRecordAirline(
                record
              ),

              getRecordFlight(
                record
              ),

              getRecordStatus(
                record
              ),

              record?.supervisorName,
              record?.employeeName,
              record?.month,
              record?.templateLabel,
              record?.reportName,
              record?.ticketNumber,
              record?.date,
              record?.monthKey,
              record?.closingAgent,
              record?.agent,
              record?.notes,
            ];

          return searchableValues.some(
            (value) =>
              normalizeSearch(
                value
              ).includes(search)
          );
        }
      );
    }, [
      records,
      searchText,
      statusFilter,
      qualityFilter,
      departmentFilter,
      airlineFilter,
      archiveFilter,
      monthFilter,
      selectedModuleId,
    ]);


  const selectedMonthRecordCount = useMemo(() => {
    if (monthFilter === "all") return 0;

    return records.filter((record) => {
      const date = getRecordDateValue(record);
      if (!date) return false;

      const recordMonth = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      return recordMonth === monthFilter;
    }).length;
  }, [records, monthFilter]);


  /* =======================================================
     DASHBOARD COUNTS
     ======================================================= */

  const totals =
    useMemo(() => {
      const total =
        records.length;

      let dataIssues = 0;
      let completed = 0;
      let followUp = 0;
      let archived = 0;

      records.forEach(
        (record) => {
          const issues =
            getDataQualityIssues(
              record,
              selectedModuleId
            );

          if (
            issues.length > 0
          ) {
            dataIssues += 1;
          }

          const status =
            normalizeSearch(
              getRecordStatus(
                record
              )
            );

          if (
            status.includes(
              "approved"
            ) ||
            status.includes(
              "closed"
            ) ||
            status.includes(
              "completed"
            ) ||
            status.includes(
              "recognized"
            ) ||
            status.includes(
              "complete"
            )
          ) {
            completed += 1;
          }

          if (
            status.includes(
              "follow"
            ) ||
            status.includes(
              "pending"
            ) ||
            status.includes(
              "return"
            ) ||
            status.includes(
              "open"
            )
          ) {
            followUp += 1;
          }

          if (
            record?.archived ===
            true
          ) {
            archived += 1;
          }
        }
      );

      return {
        total,
        dataIssues,
        completed,
        followUp,
        archived,
      };
    }, [
      records,
      selectedModuleId,
    ]);


  /* =======================================================
     MODULE COUNT
     ======================================================= */

  function getModuleCount(
    module
  ) {
    const count =
      moduleCounts[
        module.id
      ];

    if (
      count === null ||
      count === undefined
    ) {
      return 0;
    }

    return count;
  }


  /* =======================================================
     RESET FILTERS
     ======================================================= */

  function resetFilters() {
    setSearchText("");
    setStatusFilter("all");
    setQualityFilter("all");
    setDepartmentFilter("all");
    setAirlineFilter("all");
    setArchiveFilter("active");
    setMonthFilter("all");
  }


  /* =======================================================
     SELECT MODULE
     ======================================================= */

  function handleSelectModule(
    module
  ) {
    setSelectedModuleId(
      module.id
    );

    setSearchText("");
    setStatusFilter("all");
    setQualityFilter("all");
    setDepartmentFilter("all");
    setAirlineFilter("all");
    setArchiveFilter("active");
    setMonthFilter("all");

    setSelectedRecordId("");

    setEditMode(false);
    setEditValues({});

    if (
      !module.collectionName
    ) {
      setStatusMessage(
        `${module.label}: Firestore collection mapping has not been connected yet.`
      );

      setStatusTone(
        "amber"
      );
    }
  }


  /* =======================================================
     SELECT RECORD
     ======================================================= */

  function handleSelectRecord(
    recordId
  ) {
    setSelectedRecordId(
      recordId
    );

    setEditMode(false);
    setEditValues({});
  }


  /* =======================================================
     START EDITING
     ======================================================= */

  function beginEdit() {
    if (!selectedRecord) {
      return;
    }

    const editableFields =
      getEditableFields(
        selectedModuleId,
        selectedRecord
      );

    const nextValues = {};

    editableFields.forEach(
      (field) => {
        const value =
          selectedRecord[
            field
          ];

        /*
          Generic editor only prepares primitive fields.
          Objects, arrays and Firestore timestamps stay
          untouched.
        */

        if (
          value === null ||
          value === undefined
        ) {
          nextValues[field] =
            "";
          return;
        }

        if (
          typeof value ===
          "object"
        ) {
          return;
        }

        nextValues[field] =
          String(value);
      }
    );

    setEditValues(
      nextValues
    );

    setEditMode(true);
  }


  /* =======================================================
     CANCEL EDIT
     ======================================================= */

  function cancelEdit() {
    setEditMode(false);
    setEditValues({});
  }


  /* =======================================================
     UPDATE EDIT VALUE
     ======================================================= */

  function handleEditChange(
    field,
    value
  ) {
    setEditValues(
      (prev) => ({
        ...prev,
        [field]: value,
      })
    );
  }


  /* =======================================================
     SAVE ADMINISTRATIVE EDIT
     ======================================================= */

  async function saveEdit() {
    if (
      !selectedRecord ||
      !selectedModule
        ?.collectionName
    ) {
      return;
    }

    const editableFields =
      getEditableFields(
        selectedModuleId,
        selectedRecord
      );

    const updates = {};

    editableFields.forEach(
      (field) => {
        if (
          !Object.prototype.hasOwnProperty.call(
            editValues,
            field
          )
        ) {
          return;
        }

        const originalValue =
          selectedRecord[
            field
          ];

        /*
          Nested structures are intentionally excluded.
        */

        if (
          originalValue &&
          typeof originalValue ===
            "object"
        ) {
          return;
        }

        const convertedValue =
          convertEditedValue(
            originalValue,
            editValues[field]
          );

        if (
          !valuesAreEqual(
            originalValue,
            convertedValue
          )
        ) {
          updates[field] =
            convertedValue;
        }
      }
    );

    if (
      Object.keys(updates)
        .length === 0
    ) {
      setStatusMessage(
        "No changes detected."
      );

      setStatusTone(
        "amber"
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Save administrative changes to this ${selectedModule.label} record?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      const recordRef =
        doc(
          db,
          selectedModule
            .collectionName,
          selectedRecord.id
        );

      const managerName =
        getVisibleUserName(
          user
        );

      const changes =
        buildAuditChanges(
          selectedRecord,
          updates
        );

      /*
        Update original report.
      */

      await updateDoc(
        recordRef,
        {
          ...updates,

          updatedAt:
            serverTimestamp(),

          lastManagementEditAt:
            serverTimestamp(),

          lastManagementEditBy:
            managerName,

          lastManagementEditById:
            user?.id ||
            user?.uid ||
            "",
        }
      );

      /*
        Write audit record.

        IMPORTANT:
        REPORT_AUDIT_COLLECTION is defined in Part 1.
      */

      const auditRef =
        doc(
          collection(
            db,
            REPORT_AUDIT_COLLECTION
          )
        );

      await setDoc(
        auditRef,
        {
          action:
            "ADMIN_EDIT",

          moduleId:
            selectedModule.id,

          moduleLabel:
            selectedModule.label,

          sourceCollection:
            selectedModule
              .collectionName,

          sourceDocumentId:
            selectedRecord.id,

          recordName:
            getRecordPrimaryName(
              selectedRecord
            ),

          changes,

          performedBy:
            managerName,

          performedById:
            user?.id ||
            user?.uid ||
            "",

          createdAt:
            serverTimestamp(),
        }
      );

      /*
        Update local state immediately so the manager
        does not need to reload the page.
      */

      setRecords(
        (prev) =>
          prev.map(
            (record) =>
              record.id ===
              selectedRecord.id
                ? {
                    ...record,
                    ...updates,

                    lastManagementEditBy:
                      managerName,

                    /*
                      We cannot reproduce serverTimestamp()
                      locally, so use a temporary Date for
                      immediate UI feedback.
                    */

                    updatedAt:
                      new Date(),

                    lastManagementEditAt:
                      new Date(),
                  }
                : record
          )
      );

      setEditMode(false);
      setEditValues({});

      setStatusMessage(
        "Administrative changes saved and audit trail recorded."
      );

      setStatusTone(
        "green"
      );
    } catch (error) {
      console.error(
        "Error saving administrative report edit:",
        error
      );

      setStatusMessage(
        "Could not save the administrative changes."
      );

      setStatusTone(
        "red"
      );
    } finally {
      setSaving(false);
    }
  }


  /* =======================================================
     ARCHIVE RECORD
     ======================================================= */

  async function archiveRecord() {
    if (
      !selectedRecord ||
      !selectedModule
        ?.collectionName
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Archive "${getRecordPrimaryName(
          selectedRecord
        )}"?\n\nThe Firestore document will NOT be deleted.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      const managerName =
        getVisibleUserName(
          user
        );

      await updateDoc(
        doc(
          db,
          selectedModule
            .collectionName,
          selectedRecord.id
        ),
        {
          archived: true,

          archivedAt:
            serverTimestamp(),

          archivedBy:
            managerName,

          archivedById:
            user?.id ||
            user?.uid ||
            "",

          updatedAt:
            serverTimestamp(),
        }
      );

      const auditRef =
        doc(
          collection(
            db,
            REPORT_AUDIT_COLLECTION
          )
        );

      await setDoc(
        auditRef,
        {
          action:
            "ARCHIVE",

          moduleId:
            selectedModule.id,

          moduleLabel:
            selectedModule.label,

          sourceCollection:
            selectedModule
              .collectionName,

          sourceDocumentId:
            selectedRecord.id,

          recordName:
            getRecordPrimaryName(
              selectedRecord
            ),

          performedBy:
            managerName,

          performedById:
            user?.id ||
            user?.uid ||
            "",

          createdAt:
            serverTimestamp(),
        }
      );

      setRecords(
        (prev) =>
          prev.map(
            (record) =>
              record.id ===
              selectedRecord.id
                ? {
                    ...record,
                    archived: true,
                    archivedBy:
                      managerName,
                    archivedAt:
                      new Date(),
                    updatedAt:
                      new Date(),
                  }
                : record
          )
      );

      setStatusMessage(
        "Record archived successfully."
      );

      setStatusTone(
        "green"
      );
    } catch (error) {
      console.error(
        "Error archiving record:",
        error
      );

      setStatusMessage(
        "Could not archive the record."
      );

      setStatusTone(
        "red"
      );
    } finally {
      setSaving(false);
    }
  }


  /* =======================================================
     RESTORE ARCHIVED RECORD
     ======================================================= */

  async function restoreRecord() {
    if (
      !selectedRecord ||
      !selectedModule
        ?.collectionName
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Restore "${getRecordPrimaryName(
          selectedRecord
        )}" to active reports?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);

      const managerName =
        getVisibleUserName(
          user
        );

      await updateDoc(
        doc(
          db,
          selectedModule
            .collectionName,
          selectedRecord.id
        ),
        {
          archived: false,

          restoredAt:
            serverTimestamp(),

          restoredBy:
            managerName,

          restoredById:
            user?.id ||
            user?.uid ||
            "",

          updatedAt:
            serverTimestamp(),
        }
      );

      const auditRef =
        doc(
          collection(
            db,
            REPORT_AUDIT_COLLECTION
          )
        );

      await setDoc(
        auditRef,
        {
          action:
            "RESTORE",

          moduleId:
            selectedModule.id,

          moduleLabel:
            selectedModule.label,

          sourceCollection:
            selectedModule
              .collectionName,

          sourceDocumentId:
            selectedRecord.id,

          recordName:
            getRecordPrimaryName(
              selectedRecord
            ),

          performedBy:
            managerName,

          performedById:
            user?.id ||
            user?.uid ||
            "",

          createdAt:
            serverTimestamp(),
        }
      );

      setRecords(
        (prev) =>
          prev.map(
            (record) =>
              record.id ===
              selectedRecord.id
                ? {
                    ...record,
                    archived: false,
                    restoredBy:
                      managerName,
                    restoredAt:
                      new Date(),
                    updatedAt:
                      new Date(),
                  }
                : record
          )
      );

      setStatusMessage(
        "Record restored successfully."
      );

      setStatusTone(
        "green"
      );
    } catch (error) {
      console.error(
        "Error restoring record:",
        error
      );

      setStatusMessage(
        "Could not restore the record."
      );

      setStatusTone(
        "red"
      );
    } finally {
      setSaving(false);
    }
  }


  /* =======================================================
     PERMANENT DELETE ACTIONS
     ======================================================= */

  async function deleteSelectedRecord() {
    if (!selectedRecord || !selectedModule?.collectionName) return;
    const name = getRecordPrimaryName(selectedRecord);
    if (!window.confirm(`PERMANENTLY delete "${name}"?\n\nThis cannot be undone.`)) return;
    if (!window.confirm(`Final confirmation: delete this record from ${selectedModule.collectionName}?`)) return;

    try {
      setSaving(true);
      const managerName = getVisibleUserName(user);
      const managerId = getVisibleUserId(user);
      await setDoc(doc(collection(db, REPORT_AUDIT_COLLECTION)), {
        action: "DELETE_RECORD",
        moduleId: selectedModule.id,
        moduleLabel: selectedModule.label,
        sourceCollection: selectedModule.collectionName,
        sourceDocumentId: selectedRecord.id,
        recordName: name,
        performedBy: managerName,
        performedById: managerId,
        createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, selectedModule.collectionName, selectedRecord.id));
      setRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
      setModuleCounts((prev) => ({ ...prev, [selectedModule.id]: Math.max(0, Number(prev[selectedModule.id] || records.length) - 1) }));
      setSelectedRecordId("");
      setEditMode(false);
      setEditValues({});
      setStatusMessage("Record permanently deleted.");
      setStatusTone("green");
    } catch (error) {
      console.error("Error deleting record:", error);
      setStatusMessage("Could not delete the record. Check Firestore permissions.");
      setStatusTone("red");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFilteredMonth() {
    if (monthFilter === "all" || !selectedModule?.collectionName) {
      setStatusMessage("Select a month before using monthly delete.");
      setStatusTone("amber");
      return;
    }

    const monthRecords = records.filter((record) => {
      const recordDate = getRecordDateValue(record);
      if (!recordDate) return false;

      const recordMonth = `${recordDate.getFullYear()}-${String(
        recordDate.getMonth() + 1
      ).padStart(2, "0")}`;

      return recordMonth === monthFilter;
    });

    if (monthRecords.length === 0) {
      setStatusMessage(`No loaded records exist for ${monthFilter}.`);
      setStatusTone("amber");
      return;
    }

    if (
      !window.confirm(
        `PERMANENTLY delete ALL ${monthRecords.length} loaded record(s) for ${monthFilter}?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    const typed = window.prompt(`Type DELETE ${monthFilter} to confirm:`);

    if (typed !== `DELETE ${monthFilter}`) {
      setStatusMessage("Monthly delete cancelled: confirmation text did not match.");
      setStatusTone("amber");
      return;
    }

    try {
      setSaving(true);

      const managerName = getVisibleUserName(user);
      const managerId = getVisibleUserId(user);
      const deletedIds = [];
      const failedIds = [];

      for (const record of monthRecords) {
        try {
          await deleteDoc(
            doc(db, selectedModule.collectionName, record.id)
          );
          deletedIds.push(record.id);
        } catch (deleteError) {
          console.error(`Could not delete ${record.id}:`, deleteError);
          failedIds.push(record.id);
        }
      }

      if (deletedIds.length > 0) {
        try {
          await setDoc(doc(collection(db, REPORT_AUDIT_COLLECTION)), {
            action: "DELETE_MONTH",
            moduleId: selectedModule.id,
            moduleLabel: selectedModule.label,
            sourceCollection: selectedModule.collectionName,
            month: monthFilter,
            requestedCount: monthRecords.length,
            deletedCount: deletedIds.length,
            failedCount: failedIds.length,
            sourceDocumentIds: deletedIds,
            failedDocumentIds: failedIds,
            performedBy: managerName,
            performedById: managerId,
            createdAt: serverTimestamp(),
          });
        } catch (auditError) {
          console.error(
            "Monthly deletion completed, but audit logging failed:",
            auditError
          );
        }
      }

      const deletedIdSet = new Set(deletedIds);

      setRecords((prev) =>
        prev.filter((record) => !deletedIdSet.has(record.id))
      );

      setModuleCounts((prev) => ({
        ...prev,
        [selectedModule.id]: Math.max(
          0,
          Number(prev[selectedModule.id] ?? records.length) - deletedIds.length
        ),
      }));

      if (deletedIdSet.has(selectedRecordId)) {
        setSelectedRecordId("");
        setEditMode(false);
        setEditValues({});
      }

      if (deletedIds.length === monthRecords.length) {
        setStatusMessage(
          `${deletedIds.length} record(s) permanently deleted for ${monthFilter}.`
        );
        setStatusTone("green");
      } else if (deletedIds.length > 0) {
        setStatusMessage(
          `${deletedIds.length} record(s) deleted; ${failedIds.length} could not be deleted.`
        );
        setStatusTone("amber");
      } else {
        setStatusMessage(
          `No records could be deleted for ${monthFilter}. Check Firestore permissions.`
        );
        setStatusTone("red");
      }
    } catch (error) {
      console.error("Error deleting month records:", error);
      setStatusMessage(
        "Monthly delete did not complete. Check Firestore permissions."
      );
      setStatusTone("red");
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     ACTIVE FILTER CHIPS
     ======================================================= */

  const activeFilterCount =
    [
      searchText
        ? true
        : false,

      statusFilter !==
        "all",

      qualityFilter !==
        "all",

      departmentFilter !==
        "all",

      airlineFilter !==
        "all",

      archiveFilter !==
        "active",

      monthFilter !== "all",
    ].filter(Boolean).length;


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
          Only Station Managers can
          access this administrative
          page.
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
      <ReportsManagementGlobalStyles />

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
            textTransform:
              "uppercase",
            letterSpacing:
              "0.22em",
            color:
              "rgba(255,255,255,0.78)",
            fontWeight: 700,
          }}
        >
          TPA OPS · Administration
        </p>

        <h1
          style={{
            margin:
              "10px 0 6px",
            fontSize: 32,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing:
              "-0.04em",
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
            color:
              "rgba(255,255,255,0.90)",
          }}
        >
          Central administrative
          workspace for reviewing,
          searching, validating,
          correcting and managing report
          data across TPA OPS.
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
              padding:
                "7px 11px",
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
              padding:
                "7px 11px",
              borderRadius: 999,

              background:
                "rgba(255,255,255,0.16)",

              border:
                "1px solid rgba(255,255,255,0.22)",

              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {getVisibleUserName(
              user
            )}
          </span>

          <span
            style={{
              padding:
                "7px 11px",
              borderRadius: 999,

              background:
                "rgba(255,255,255,0.16)",

              border:
                "1px solid rgba(255,255,255,0.22)",

              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {
              REPORT_MODULES.filter(
                (module) =>
                  module.collectionName
              ).length
            }{" "}
            Data Sources
          </span>
        </div>
      </div>


      {/* ===================================================
          STATUS MESSAGE
          =================================================== */}

      {statusMessage ? (
        <CenterToast
          message={
            statusMessage
          }
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
            "repeat(auto-fit,minmax(170px,1fr))",

          gap: 14,
        }}
      >
        <InfoCard
          label="Records"
          value={String(
            totals.total
          )}
          tone="blue"
          subtext={
            selectedModule.label
          }
        />

        <InfoCard
          label="Completed / Closed"
          value={String(
            totals.completed
          )}
          tone="green"
        />

        <InfoCard
          label="Follow Up / Pending"
          value={String(
            totals.followUp
          )}
          tone="amber"
        />

        <InfoCard
          label="Data Issues"
          value={String(
            totals.dataIssues
          )}
          tone={
            totals.dataIssues > 0
              ? "red"
              : "green"
          }
        />

        <InfoCard
          label="Archived"
          value={String(
            totals.archived
          )}
          tone="slate"
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
        <SectionHeader
          title="Management of Reports"
          subtitle="Select the report data source you want to manage."
        />

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit,minmax(210px,1fr))",

            gap: 12,
          }}
        >
          {REPORT_MODULES.map(
            (module) => (
              <ReportModuleCard
                key={module.id}
                module={module}

                active={
                  selectedModuleId ===
                  module.id
                }

                count={getModuleCount(
                  module
                )}

                loadingCount={
                  loadingModuleCounts
                }

                onClick={() =>
                  handleSelectModule(
                    module
                  )
                }
              />
            )
          )}
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
        <SectionHeader
          title={
            selectedModule.label
          }

          subtitle={
            selectedModule.collectionName
              ? `Firestore: ${selectedModule.collectionName}`
              : "Firestore collection mapping pending"
          }

          right={
            <ActionButton
              variant="secondary"
              onClick={
                resetFilters
              }
            >
              Reset Filters
            </ActionButton>
          }
        />

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit,minmax(190px,1fr))",

            gap: 12,
          }}
        >
          <div
            style={{
              gridColumn:
                "span 2",
              minWidth: 0,
            }}
          >
            <FieldLabel>
              Search Records
            </FieldLabel>

            <TextInput
              value={
                searchText
              }

              onChange={(e) =>
                setSearchText(
                  e.target.value
                )
              }

              placeholder="Employee, flight, supervisor, airline, department, ticket, report ID..."

              disabled={
                !selectedModule
                  .collectionName
              }
            />
          </div>

          <div>
            <FieldLabel>
              Status
            </FieldLabel>

            <SelectInput
              value={
                statusFilter
              }

              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }

              disabled={
                !selectedModule
                  .collectionName
              }
            >
              <option value="all">
                All Statuses
              </option>

              {statusOptions.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Department
            </FieldLabel>

            <SelectInput
              value={
                departmentFilter
              }

              onChange={(e) =>
                setDepartmentFilter(
                  e.target.value
                )
              }

              disabled={
                !selectedModule
                  .collectionName
              }
            >
              <option value="all">
                All Departments
              </option>

              {departmentOptions.map(
                (department) => (
                  <option
                    key={
                      department
                    }
                    value={
                      department
                    }
                  >
                    {department}
                  </option>
                )
              )}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Airline
            </FieldLabel>

            <SelectInput
              value={
                airlineFilter
              }

              onChange={(e) =>
                setAirlineFilter(
                  e.target.value
                )
              }

              disabled={
                !selectedModule
                  .collectionName
              }
            >
              <option value="all">
                All Airlines
              </option>

              {airlineOptions.map(
                (airline) => (
                  <option
                    key={airline}
                    value={airline}
                  >
                    {airline}
                  </option>
                )
              )}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Month
            </FieldLabel>

            <SelectInput
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              disabled={!selectedModule.collectionName}
            >
              <option value="all">All Months</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Data Quality
            </FieldLabel>

            <SelectInput
              value={
                qualityFilter
              }

              onChange={(e) =>
                setQualityFilter(
                  e.target.value
                )
              }

              disabled={
                !selectedModule
                  .collectionName
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

          <div>
            <FieldLabel>
              Record Visibility
            </FieldLabel>

            <SelectInput
              value={
                archiveFilter
              }

              onChange={(e) =>
                setArchiveFilter(
                  e.target.value
                )
              }

              disabled={
                !selectedModule
                  .collectionName
              }
            >
              <option value="active">
                Active Records
              </option>

              <option value="archived">
                Archived Records
              </option>

              <option value="all">
                Active + Archived
              </option>
            </SelectInput>
          </div>
        </div>


        {/* ACTIVE FILTER CHIPS */}

        {activeFilterCount > 0 ? (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 7,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "#64748b",
                fontWeight: 800,
              }}
            >
              Active Filters:
            </span>

            {searchText ? (
              <FilterChip
                onRemove={() =>
                  setSearchText("")
                }
              >
                Search: {searchText}
              </FilterChip>
            ) : null}

            {statusFilter !==
            "all" ? (
              <FilterChip
                onRemove={() =>
                  setStatusFilter(
                    "all"
                  )
                }
              >
                Status:{" "}
                {statusFilter}
              </FilterChip>
            ) : null}

            {departmentFilter !==
            "all" ? (
              <FilterChip
                onRemove={() =>
                  setDepartmentFilter(
                    "all"
                  )
                }
              >
                Department:{" "}
                {departmentFilter}
              </FilterChip>
            ) : null}

            {airlineFilter !==
            "all" ? (
              <FilterChip
                onRemove={() =>
                  setAirlineFilter(
                    "all"
                  )
                }
              >
                Airline:{" "}
                {airlineFilter}
              </FilterChip>
            ) : null}

            {monthFilter !== "all" ? (
              <FilterChip onRemove={() => setMonthFilter("all")}>
                Month: {monthFilter}
              </FilterChip>
            ) : null}

            {qualityFilter !==
            "all" ? (
              <FilterChip
                onRemove={() =>
                  setQualityFilter(
                    "all"
                  )
                }
              >
                Quality:{" "}
                {qualityFilter}
              </FilterChip>
            ) : null}

            {archiveFilter !==
            "active" ? (
              <FilterChip
                onRemove={() =>
                  setArchiveFilter(
                    "active"
                  )
                }
              >
                Visibility:{" "}
                {archiveFilter}
              </FilterChip>
            ) : null}
          </div>
        ) : null}
      </PageCard>
            {/* ===================================================
          DATA AREA
          =================================================== */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedRecord
            ? "minmax(520px,1fr) minmax(390px,0.78fr)"
            : "1fr",
          gap: 18,
          alignItems: "start",
          minWidth: 0,
        }}
      >

        {/* =================================================
            REPORT DATA TABLE
            ================================================= */}

        <PageCard
          style={{
            padding: 20,
            minWidth: 0,
          }}
        >
          <SectionHeader
            title="Report Data"
            subtitle={
              loading
                ? "Loading report data..."
                : `${filteredRecords.length} visible record(s) · ${records.length} loaded`
            }
            right={
              monthFilter !== "all" ? (
                <ActionButton
                  variant="danger"
                  onClick={deleteFilteredMonth}
                  disabled={saving || loading || selectedMonthRecordCount === 0}
                  title="Permanently delete all loaded records for the selected month"
                >
                  {saving ? "Working..." : `Delete Month (${selectedMonthRecordCount})`}
                </ActionButton>
              ) : null
            }
          />

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
                  width: 52,
                  height: 52,
                  margin: "0 auto",
                  borderRadius: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e2e8f0",
                  color: "#64748b",
                  fontSize: 22,
                  fontWeight: 900,
                }}
              >
                ?
              </div>

              <div
                style={{
                  marginTop: 14,
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
                This report module does not have a Firestore
                collection connected yet.
              </div>
            </div>
          ) : loading ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  margin: "0 auto",
                  borderRadius: "50%",
                  border: "4px solid #dbeafe",
                  borderTopColor: "#1769aa",
                  animation: "spin 0.8s linear infinite",
                }}
              />

              <div
                style={{
                  marginTop: 14,
                  color: "#64748b",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Loading {selectedModule.label}...
              </div>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div
              style={{
                padding: 36,
                textAlign: "center",
                border: "1px dashed #cbd5e1",
                borderRadius: 18,
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                No records found
              </div>

              <div
                style={{
                  marginTop: 7,
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Try changing the current filters or search.
              </div>

              {activeFilterCount > 0 ? (
                <div
                  style={{
                    marginTop: 14,
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={resetFilters}
                  >
                    Reset Filters
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth: 940,
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
                      "Airline / Flight",
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
                          borderBottom: "1px solid #e2e8f0",
                          fontSize: 11,
                          fontWeight: 900,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => {
                    const active =
                      selectedRecordId === record.id;

                    const issues = getDataQualityIssues(
                      record,
                      selectedModuleId
                    );

                    const archived =
                      record?.archived === true;

                    const airline =
                      getRecordAirline(record);

                    const flight =
                      getRecordFlight(record);

                    return (
                      <tr
                        key={record.id}
                        onClick={() =>
                          handleSelectRecord(record.id)
                        }
                        style={{
                          cursor: "pointer",
                          background: active
                            ? "#edf7ff"
                            : archived
                            ? "#f8fafc"
                            : "#ffffff",
                          opacity: archived ? 0.76 : 1,
                        }}
                      >
                        {/* RECORD */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                            minWidth: 190,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 900,
                                color: "#0f172a",
                              }}
                            >
                              {getRecordPrimaryName(record)}
                            </div>

                            {archived ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  padding: "3px 6px",
                                  borderRadius: 999,
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  color: "#64748b",
                                  fontSize: 9,
                                  fontWeight: 900,
                                }}
                              >
                                ARCHIVED
                              </span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              maxWidth: 220,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: 10,
                              color: "#94a3b8",
                            }}
                          >
                            {record.id}
                          </div>
                        </td>

                        {/* DEPARTMENT */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                            fontSize: 13,
                            color: "#334155",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getRecordDepartment(record)}
                        </td>

                        {/* AIRLINE / FLIGHT */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: "#334155",
                            }}
                          >
                            {airline}
                          </div>

                          {flight !== "-" ? (
                            <div
                              style={{
                                marginTop: 3,
                                fontSize: 11,
                                color: "#64748b",
                              }}
                            >
                              Flight {flight}
                            </div>
                          ) : null}
                        </td>

                        {/* SUBMITTED BY */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                            fontSize: 13,
                            color: "#334155",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getRecordSubmittedBy(record)}
                        </td>

                        {/* STATUS */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <StatusBadge
                            status={getRecordStatus(record)}
                          />
                        </td>

                        {/* CREATED */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                            fontSize: 12,
                            color: "#64748b",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDateTime(
                            getRecordCreatedAt(record)
                          )}
                        </td>

                        {/* QUALITY */}

                        <td
                          style={{
                            padding: "13px 14px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "5px 9px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 800,

                              background:
                                issues.length > 0
                                  ? "#fff1f2"
                                  : "#ecfdf5",

                              border:
                                issues.length > 0
                                  ? "1px solid #fecdd3"
                                  : "1px solid #a7f3d0",

                              color:
                                issues.length > 0
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
                  })}
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
              minWidth: 0,
            }}
          >
            {/* HEADER */}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#1769aa",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
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
                    wordBreak: "break-word",
                  }}
                >
                  {getRecordPrimaryName(selectedRecord)}
                </h2>

                {selectedRecord.archived === true ? (
                  <div
                    style={{
                      marginTop: 7,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "5px 9px",
                        borderRadius: 999,
                        background: "#f1f5f9",
                        border: "1px solid #cbd5e1",
                        color: "#475569",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      ARCHIVED RECORD
                    </span>
                  </div>
                ) : null}
              </div>

              <ActionButton
                variant="secondary"
                onClick={() => {
                  setSelectedRecordId("");
                  setEditMode(false);
                  setEditValues({});
                }}
              >
                Close
              </ActionButton>
            </div>


            {/* =================================================
                ADMIN ACTIONS
                ================================================= */}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {!editMode ? (
                <ActionButton
                  variant="primary"
                  onClick={beginEdit}
                  disabled={
                    saving ||
                    selectedRecord.archived === true
                  }
                >
                  Edit Record
                </ActionButton>
              ) : (
                <>
                  <ActionButton
                    variant="success"
                    onClick={saveEdit}
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : "Save Changes"}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Cancel
                  </ActionButton>
                </>
              )}

              {!editMode &&
              selectedRecord.archived !== true ? (
                <ActionButton
                  variant="warning"
                  onClick={archiveRecord}
                  disabled={saving}
                >
                  Archive
                </ActionButton>
              ) : null}

              {!editMode &&
              selectedRecord.archived === true ? (
                <ActionButton
                  variant="success"
                  onClick={restoreRecord}
                  disabled={saving}
                >
                  Restore Record
                </ActionButton>
              ) : null}

              {!editMode ? (
                <ActionButton
                  variant="danger"
                  onClick={deleteSelectedRecord}
                  disabled={saving}
                  title="Permanently delete this Firestore document"
                >
                  Delete Permanently
                </ActionButton>
              ) : null}
            </div>


            {/* =================================================
                COLLECTION INFORMATION
                ================================================= */}

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  border: "1px solid #dbeafe",
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
                  border: "1px solid #dbeafe",
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


            {/* =================================================
                BASIC INFORMATION
                ================================================= */}

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
                value={getRecordStatus(selectedRecord)}
              />

              <InfoCard
                label="Department"
                value={getRecordDepartment(selectedRecord)}
              />

              <InfoCard
                label="Airline"
                value={getRecordAirline(selectedRecord)}
              />

              <InfoCard
                label="Flight"
                value={getRecordFlight(selectedRecord)}
              />
            </div>


            {/* =================================================
                RECORD METADATA
                ================================================= */}

            <div
              style={{
                marginTop: 16,
                border: "1px solid #e2e8f0",
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
                  gap: 9,
                  fontSize: 13,
                  color: "#475569",
                }}
              >
                <div>
                  <strong>Submitted By:</strong>{" "}
                  {getRecordSubmittedBy(selectedRecord)}
                </div>

                <div>
                  <strong>Created:</strong>{" "}
                  {formatDateTime(
                    getRecordCreatedAt(selectedRecord)
                  )}
                </div>

                <div>
                  <strong>Last Updated:</strong>{" "}
                  {formatDateTime(
                    getRecordUpdatedAt(selectedRecord)
                  )}
                </div>

                {selectedRecord.lastManagementEditBy ? (
                  <div>
                    <strong>
                      Last Management Edit:
                    </strong>{" "}
                    {selectedRecord.lastManagementEditBy}
                  </div>
                ) : null}

                {selectedRecord.archived === true ? (
                  <>
                    <div>
                      <strong>Archived By:</strong>{" "}
                      {safeText(selectedRecord.archivedBy) ||
                        "-"}
                    </div>

                    <div>
                      <strong>Archived At:</strong>{" "}
                      {formatDateTime(
                        selectedRecord.archivedAt
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>


            {/* =================================================
                DATA QUALITY
                ================================================= */}

            <div
              style={{
                marginTop: 16,
                border: "1px solid #e2e8f0",
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
                    border: "1px solid #a7f3d0",
                    color: "#166534",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  ✓ No data issues detected.
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
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
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


            {/* =================================================
                ADMINISTRATIVE EDITOR
                ================================================= */}

            {editMode ? (
              <div
                style={{
                  marginTop: 16,
                  border: "1px solid #93c5fd",
                  borderRadius: 18,
                  padding: 15,
                  background:
                    "linear-gradient(180deg,#f8fbff 0%,#ffffff 100%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 900,
                        color: "#1769aa",
                      }}
                    >
                      Administrative Editor
                    </div>

                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 11,
                        color: "#64748b",
                      }}
                    >
                      Only approved fields for this report
                      type can be modified.
                    </div>
                  </div>

                  <span
                    style={{
                      display: "inline-flex",
                      padding: "5px 8px",
                      borderRadius: 999,
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      color: "#166534",
                      fontSize: 10,
                      fontWeight: 900,
                    }}
                  >
                    AUDIT ENABLED
                  </span>
                </div>

                {getEditableFields(
                  selectedModuleId,
                  selectedRecord
                ).length === 0 ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      color: "#9a3412",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    No editable primitive fields are available
                    for this record.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: 11,
                    }}
                  >
                    {getEditableFields(
                      selectedModuleId,
                      selectedRecord
                    ).map((field) => {
                      const originalValue =
                        selectedRecord[field];

                      /*
                        Objects, arrays and Firestore
                        timestamps are protected from the
                        generic editor.
                      */

                      if (
                        originalValue !== null &&
                        typeof originalValue === "object"
                      ) {
                        return null;
                      }

                      const isBoolean =
                        typeof originalValue === "boolean";

                      const isNumber =
                        typeof originalValue === "number";

                      return (
                        <div key={field}>
                          <FieldLabel>
                            {field}
                          </FieldLabel>

                          {isBoolean ? (
                            <SelectInput
                              value={
                                editValues[field] ??
                                String(originalValue)
                              }
                              onChange={(e) =>
                                handleEditChange(
                                  field,
                                  e.target.value
                                )
                              }
                              disabled={saving}
                            >
                              <option value="true">
                                True
                              </option>

                              <option value="false">
                                False
                              </option>
                            </SelectInput>
                          ) : (
                            <TextInput
                              type={
                                isNumber
                                  ? "number"
                                  : "text"
                              }
                              value={
                                editValues[field] ?? ""
                              }
                              onChange={(e) =>
                                handleEditChange(
                                  field,
                                  e.target.value
                                )
                              }
                              disabled={saving}
                            />
                          )}

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 10,
                              color: "#94a3b8",
                            }}
                          >
                            Current:{" "}
                            {displayStoredValue(
                              originalValue
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    padding: 11,
                    borderRadius: 12,
                    background: "#edf7ff",
                    border: "1px solid #cfe7fb",
                    color: "#475569",
                    fontSize: 11,
                    lineHeight: 1.6,
                  }}
                >
                  Changes are written to the original report
                  and recorded in the management audit trail
                  with manager, timestamp, source collection,
                  document ID and changed values.
                </div>
              </div>
            ) : null}


            {/* =================================================
                STORED FIELDS
                ================================================= */}

            <div
              style={{
                marginTop: 16,
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Stored Fields
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    fontWeight: 800,
                  }}
                >
                  {
                    Object.keys(selectedRecord).filter(
                      (key) => key !== "id"
                    ).length
                  }{" "}
                  FIELD(S)
                </div>
              </div>

              <StoredFieldsViewer
                record={selectedRecord}
              />
            </div>


            {/* =================================================
                SAFETY NOTICE
                ================================================= */}

            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 16,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#334155",
                }}
              >
                Protected Data
              </div>

              <div
                style={{
                  marginTop: 5,
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: "#64748b",
                }}
              >
                Document IDs, creation timestamps, audit
                information, authentication identifiers and
                protected system fields cannot be modified
                through the administrative editor.
              </div>
            </div>
          </PageCard>
        ) : null}
      </div>
            {/* ===================================================
          END DATA AREA
          =================================================== */}
    </div>
  );
}

/* =========================================================
   OPTIONAL PAGE LOADING ANIMATION

   Because the page uses inline styles, this component
   injects the small spinner keyframe required by the
   loading indicator.
   ========================================================= */

function ReportsManagementGlobalStyles() {
  return (
    <style>
      {`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }

          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1050px) {
          .reports-management-responsive-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}
    </style>
  );
}
