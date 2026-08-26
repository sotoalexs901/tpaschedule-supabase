// src/pages/OperationalReportAdminPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

/* =========================================================
   GENERAL NORMALIZATION
========================================================= */

function normalizeAirlineName(value) {
  const airline = String(value || "").trim();

  if (
    airline.toUpperCase() === "WL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA AIR" ||
    airline.toUpperCase() === "WAL HAVANA" ||
    airline.toUpperCase() === "WESTJET"
  ) {
    return "WestJet";
  }

  return airline;
}

function normalizeCabinServiceValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (
    raw === "cabin service" ||
    raw === "dl cabin service" ||
    raw.includes("cabin service")
  ) {
    return "cabin_service";
  }

  return raw;
}

function normalizeDepartmentValue(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (raw.includes("wchr")) return "wchr";
  if (raw.includes("wheelchair")) return "wchr";
  if (raw.includes("baggage")) return "baggage";
  if (raw.includes("cabin")) return "cabin_service";
  if (raw.includes("passenger")) return "passenger_service";

  return raw;
}

/* =========================================================
   DATE HELPERS
========================================================= */

function tsToDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = tsToDate(value);

  if (!d) return "â";

  return d.toLocaleString();
}

function startOfToday() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
}

function endOfToday() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;

  const monday = new Date(now);

  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

function endOfWeek() {
  const start = startOfWeek();
  const end = new Date(start);

  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return end;
}

function startOfMonth() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0
  );
}

function endOfMonth() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
}

function getRangeDates(range) {
  if (range === "today") {
    return {
      start: startOfToday(),
      end: endOfToday(),
    };
  }

  if (range === "week") {
    return {
      start: startOfWeek(),
      end: endOfWeek(),
    };
  }

  return {
    start: startOfMonth(),
    end: endOfMonth(),
  };
}

function getCustomDateRange(fromDate, toDate) {
  if (!fromDate && !toDate) return null;

  const start = fromDate
    ? new Date(`${fromDate}T00:00:00`)
    : new Date("2000-01-01T00:00:00");

  const end = toDate
    ? new Date(`${toDate}T23:59:59.999`)
    : new Date("2100-12-31T23:59:59.999");

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}

/* =========================================================
   DISPLAY HELPERS
========================================================= */

function prettifyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;

  const raw = String(value || "")
    .trim()
    .toLowerCase();

  return (
    raw === "yes" ||
    raw === "true" ||
    raw === "1"
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatResponseValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value ?? "â");
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
/* =========================================================
   LOB HELPERS
========================================================= */

/*
  Default management formula:

  1 - 40 bags  = 1 hour
  41 - 80 bags = 3 hours
  81+ bags     = 4 hours

  IMPORTANT:
  Operational Reports have used different LOB field names
  over time.

  These helpers normalize ALL supported formats so old and
  new reports can be read without breaking the page.
*/

const DEFAULT_LOB_RULES = [
  {
    id: "lob_1",
    minBags: 1,
    maxBags: 40,
    hours: 1,
  },
  {
    id: "lob_2",
    minBags: 41,
    maxBags: 80,
    hours: 3,
  },
  {
    id: "lob_3",
    minBags: 81,
    maxBags: null,
    hours: 4,
  },
];

function normalizeLobRules(rules) {
  const source = Array.isArray(rules) ? rules : [];

  return source
    .map((rule, index) => {
      const minBags = Math.max(0, Number(rule?.minBags || 0));
      const rawMax = rule?.maxBags;
      const maxBags =
        rawMax === null || rawMax === "" || typeof rawMax === "undefined"
          ? null
          : Math.max(0, Number(rawMax || 0));
      const hours = Math.max(0, Number(rule?.hours || 0));

      return {
        id: rule?.id || `lob_${index + 1}`,
        minBags,
        maxBags,
        hours,
      };
    })
    .filter((rule) =>
      Number.isFinite(rule.minBags) &&
      Number.isFinite(rule.hours) &&
      (rule.maxBags === null || Number.isFinite(rule.maxBags)) &&
      (rule.maxBags === null || rule.maxBags >= rule.minBags)
    )
    .sort((a, b) => a.minBags - b.minBags);
}

function toSafeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, number);
}

/*
  ---------------------------------------------------------
  HAS LOBS
  ---------------------------------------------------------

  Supported formats:

  Top level:
    hasLobs

  responses:
    had_lobs
    has_lobs
    hasLobs
    lobs
*/

function getReportHasLobs(report) {
  return parseBooleanLike(
    report?.hasLobs ??
      report?.responses?.had_lobs ??
      report?.responses?.has_lobs ??
      report?.responses?.hasLobs ??
      report?.responses?.lobs
  );
}

/*
  ---------------------------------------------------------
  LOB BAG COUNT
  ---------------------------------------------------------

  Supported formats:

  Top level:
    lobBags
    lobBagCount

  responses:
    lob_bags
    lob_total_bags
    lobBagCount
    lob_bag_count
    lobBags
*/

function getReportLobBagCount(report) {
  return toSafeNumber(
    report?.lobBags ??
      report?.lobBagCount ??
      report?.responses?.lob_bags ??
      report?.responses?.lob_total_bags ??
      report?.responses?.lobBagCount ??
      report?.responses?.lob_bag_count ??
      report?.responses?.lobBags
  );
}

/*
  ---------------------------------------------------------
  LOB AGENTS USED
  ---------------------------------------------------------
*/

function getReportLobAgentsUsed(report) {
  return toSafeNumber(
    report?.lobAgentsUsed ??
      report?.responses?.lob_agents_used ??
      report?.responses?.lobAgentsUsed ??
      report?.responses?.agentsUsedForLobs
  );
}

/*
  ---------------------------------------------------------
  LOB SUPERVISORS USED
  ---------------------------------------------------------
*/

function getReportLobSupervisorsUsed(report) {
  return toSafeNumber(
    report?.lobSupervisorsUsed ??
      report?.responses?.lob_supervisors_used ??
      report?.responses?.lobSupervisorsUsed ??
      report?.responses?.supervisorsUsedForLobs
  );
}

/*
  ---------------------------------------------------------
  NORMALIZED LOB DATA
  ---------------------------------------------------------

  THIS FUNCTION IS IMPORTANT.

  The page uses getLobData() when:

  - Operational Reports are loaded
  - A report is edited
  - The Operational Reports table is rendered
  - LOB details are displayed
  - Management summaries are generated

  Previously the page called getLobData(), but the function
  itself was missing.
*/

function getLobData(report) {
  const hasLobs =
    getReportHasLobs(report);

  const bags =
    getReportLobBagCount(report);

  const agents =
    getReportLobAgentsUsed(report);

  const supervisors =
    getReportLobSupervisorsUsed(report);

  return {
    hasLobs,
    bags,
    agents,
    supervisors,
  };
}/* =========================================================
   LOB TIME CALCULATION
========================================================= */

function calculateLobEstimatedHours(bagCount, rules) {
  const bags = toSafeNumber(bagCount);

  if (bags <= 0) {
    return 0;
  }

  const sourceRules =
    Array.isArray(rules) && rules.length > 0
      ? rules
      : DEFAULT_LOB_RULES;

  const normalizedRules = [...sourceRules]
    .map((rule) => ({
      ...rule,

      minBags: toSafeNumber(
        rule.minBags
      ),

      maxBags:
        rule.maxBags === null ||
        rule.maxBags === "" ||
        typeof rule.maxBags === "undefined"
          ? null
          : toSafeNumber(
              rule.maxBags
            ),

      hours: toSafeNumber(
        rule.hours
      ),
    }))
    .sort(
      (a, b) =>
        a.minBags - b.minBags
    );

  const matchingRule =
    normalizedRules.find((rule) => {
      const meetsMinimum =
        bags >= rule.minBags;

      const meetsMaximum =
        rule.maxBags === null ||
        bags <= rule.maxBags;

      return (
        meetsMinimum &&
        meetsMaximum
      );
    });

  if (matchingRule) {
    return toSafeNumber(
      matchingRule.hours
    );
  }

  /*
    If bags exceed every configured range,
    use the final rule as a safe fallback.
  */

  const lastRule =
    normalizedRules[
      normalizedRules.length - 1
    ];

  return lastRule
    ? toSafeNumber(
        lastRule.hours
      )
    : 0;
}

/* =========================================================
   LOB LABOR CALCULATION
========================================================= */

/*
  Example:

  80 LOB bags
  4 agents
  1 supervisor

  Formula says:
  41 - 80 bags = 3 hours

  Agent labor:
  4 x 3 = 12 hours

  Supervisor labor:
  1 x 3 = 3 hours

  Total:
  15 labor hours
*/

function calculateLobLabor(
  report,
  rules
) {
  const bags =
    getReportLobBagCount(
      report
    );

  const agents =
    getReportLobAgentsUsed(
      report
    );

  const supervisors =
    getReportLobSupervisorsUsed(
      report
    );

  const estimatedHours =
    calculateLobEstimatedHours(
      bags,
      rules
    );

  const agentLaborHours =
    agents * estimatedHours;

  const supervisorLaborHours =
    supervisors * estimatedHours;

  const totalLaborHours =
    agentLaborHours +
    supervisorLaborHours;

  return {
    bags,
    agents,
    supervisors,
    estimatedHours,
    agentLaborHours,
    supervisorLaborHours,
    totalLaborHours,
  };
}

function formatHours(value) {
  const number =
    toSafeNumber(value);

  if (
    Number.isInteger(number)
  ) {
    return String(number);
  }

  return number.toFixed(2);
}

/* =========================================================
   REPORT ATTENTION
========================================================= */

function shouldFlagNeedsAttention(report) {
  if (report?.needsAttention) {
    return true;
  }

  const responses =
    report?.responses || {};

  const operationStatus =
    String(
      responses?.operation_status ||
        ""
    ).toLowerCase();

  const safetyConcern =
    String(
      responses?.safety_concern ||
        ""
    ).toLowerCase();

  const delayedFlight =
    String(
      responses?.delayed_flight ||
        ""
    ).toLowerCase() === "yes" ||
    String(
      responses?.delayed_flight_impact ||
        ""
    ).toLowerCase() === "yes" ||
    String(
      responses?.service_delays ||
        ""
    ).toLowerCase() === "yes";

  if (
    operationStatus.includes(
      "not completed"
    ) ||
    operationStatus.includes(
      "remarks"
    )
  ) {
    return true;
  }

  if (
    safetyConcern === "yes"
  ) {
    return true;
  }

  if (delayedFlight) {
    return true;
  }

  return false;
}

/* =========================================================
   REVIEW STATUS
========================================================= */

function getReviewStatusLabel(status) {
  const value =
    String(
      status || "submitted"
    ).toLowerCase();

  if (value === "read") {
    return "Read";
  }

  if (value === "approved") {
    return "Approved";
  }

  if (
    value ===
    "follow_up_required"
  ) {
    return "Follow Up Required";
  }

  if (value === "closed") {
    return "Closed";
  }

  if (value === "archived") {
    return "Archived";
  }

  return "Submitted";
}

function getReviewStatusStyle(status) {
  const value =
    String(
      status || "submitted"
    ).toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border:
      "1px solid transparent",
  };

  if (value === "read") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (value === "approved") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    };
  }

  if (
    value ===
    "follow_up_required"
  ) {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fdba74",
    };
  }

  if (value === "closed") {
    return {
      ...base,
      background: "#f1f5f9",
      color: "#334155",
      borderColor: "#cbd5e1",
    };
  }

  if (value === "archived") {
    return {
      ...base,
      background: "#f8fafc",
      color: "#475569",
      borderColor: "#e2e8f0",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

/* =========================================================
   TEMPLATE HELPERS
========================================================= */

function getTemplateLabel(report) {
  return (
    report.templateLabel ||
    report.department ||
    prettifyKey(
      report.templateKey ||
        "operational_report"
    )
  );
}

function isCabinServiceReport(report) {
  return (
    normalizeDepartmentValue(
      report.templateKey ||
        report.department
    ) === "cabin_service"
  );
}
/* =========================================================
   PRINTABLE OPERATIONAL REPORT
========================================================= */

function buildPrintableHtml(report, lobRules = DEFAULT_LOB_RULES) {
  const responses = report?.responses || {};

  const dynamicBlocks =
    Object.entries(responses).length === 0
      ? `
        <div class="detail-box">
          <div class="detail-label">Dynamic Responses</div>
          <div class="detail-value">No dynamic responses found.</div>
        </div>
      `
      : Object.entries(responses)
          .map(
            ([key, value]) => `
              <div class="detail-box">
                <div class="detail-label">
                  ${escapeHtml(prettifyKey(key))}
                </div>
                <div class="detail-value">
                  ${escapeHtml(formatResponseValue(value)).replace(
                    /\n/g,
                    "<br/>"
                  )}
                </div>
              </div>
            `
          )
          .join("");

  const alertNeedsAttention = shouldFlagNeedsAttention(report)
    ? `
      <div class="alert alert-danger">
        This report needs attention because the operation indicates issues,
        delay, safety concern, or incomplete completion.
      </div>
    `
    : "";

  const alertDelay = report?.delayedFlight
    ? `
      <div class="alert alert-warning">
        Delay Alert:
        ${escapeHtml(report.normalizedAirline || "Unknown")}
        reported a delay of
        ${escapeHtml(String(Number(report.delayedTimeMinutes || 0)))}
        minutes.
        ${
          Number(report.delayedTimeMinutes || 0) > 4
            ? "Duty Mgrs Follow up needed."
            : ""
        }
      </div>
    `
    : "";

  const lobLabor = calculateLobLabor(report, lobRules);
  const hasLobs = getReportHasLobs(report);

  const lobSection = hasLobs
    ? `
      <div class="section-title">LOB Information</div>

      <div class="grid">
        <div class="info-card">
          <div class="info-label">LOBs Reported</div>
          <div class="info-value">Yes</div>
        </div>

        <div class="info-card">
          <div class="info-label">Total LOB Bags</div>
          <div class="info-value">
            ${escapeHtml(String(lobLabor.bags))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">Agents Used</div>
          <div class="info-value">
            ${escapeHtml(String(lobLabor.agents))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">Supervisors Used</div>
          <div class="info-value">
            ${escapeHtml(String(lobLabor.supervisors))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">LOB Hours</div>
          <div class="info-value">
            ${escapeHtml(formatHours(lobLabor.estimatedHours))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">Agent Labor Hours</div>
          <div class="info-value">
            ${escapeHtml(formatHours(lobLabor.agentLaborHours))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">Supervisor Labor Hours</div>
          <div class="info-value">
            ${escapeHtml(formatHours(lobLabor.supervisorLaborHours))}
          </div>
        </div>

        <div class="info-card">
          <div class="info-label">Total Labor Hours</div>
          <div class="info-value">
            ${escapeHtml(formatHours(lobLabor.totalLaborHours))}
          </div>
        </div>
      </div>
    `
    : "";

  const managerSection = `
    <div class="detail-box">
      <div class="detail-label">Review Status</div>
      <div class="detail-value">
        ${escapeHtml(getReviewStatusLabel(report.reviewStatus))}
      </div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Manager Notes</div>
      <div class="detail-value">
        ${escapeHtml(report.managerNotes || "â").replace(/\n/g, "<br/>")}
      </div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Follow Up Action</div>
      <div class="detail-value">
        ${escapeHtml(report.followUpAction || "â").replace(/\n/g, "<br/>")}
      </div>
    </div>

    <div class="detail-box">
      <div class="detail-label">Follow Up Details</div>
      <div class="detail-value">
        ${escapeHtml(report.followUpDetails || "â").replace(/\n/g, "<br/>")}
      </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Operational Report</title>

        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
          }

          .header {
            margin-bottom: 20px;
          }

          .title {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
          }

          .subtitle {
            margin-top: 8px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }

          .section-title {
            margin-top: 22px;
            margin-bottom: 12px;
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }

          .info-card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px 16px;
          }

          .info-label {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }

          .info-value {
            margin-top: 6px;
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            word-break: break-word;
          }

          .detail-box {
            border-radius: 14px;
            padding: 14px 16px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            margin-bottom: 12px;
          }

          .detail-label {
            font-size: 12px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }

          .detail-value {
            font-size: 14px;
            color: #0f172a;
            white-space: pre-line;
            line-height: 1.7;
          }

          .alert {
            border-radius: 14px;
            padding: 14px 16px;
            font-weight: 800;
            font-size: 14px;
            margin-bottom: 14px;
          }

          .alert-danger {
            background: #fff1f2;
            border: 1px solid #fecdd3;
            color: #9f1239;
          }

          .alert-warning {
            background: #fff7ed;
            border: 1px solid #fdba74;
            color: #9a3412;
          }

          @media print {
            body {
              margin: 14px;
            }
          }
        </style>
      </head>

      <body>
        <div class="header">
          <h1 class="title">Operational Report</h1>

          <div class="subtitle">
            ${escapeHtml(getTemplateLabel(report))}
            Â·
            ${escapeHtml(report.normalizedAirline || "â")}
            Â·
            ${escapeHtml(report.reportDate || "â")}
          </div>
        </div>

        <div class="grid">
          <div class="info-card">
            <div class="info-label">Department</div>
            <div class="info-value">
              ${escapeHtml(report.department || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Template</div>
            <div class="info-value">
              ${escapeHtml(getTemplateLabel(report))}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Airline</div>
            <div class="info-value">
              ${escapeHtml(report.normalizedAirline || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Report Date</div>
            <div class="info-value">
              ${escapeHtml(report.reportDate || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Shift</div>
            <div class="info-value">
              ${escapeHtml(report.shift || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">
              ${
                isCabinServiceReport(report)
                  ? "Flights Serviced"
                  : "Flights Handled"
              }
            </div>
            <div class="info-value">
              ${escapeHtml(report.flightsHandled || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Flight Number</div>
            <div class="info-value">
              ${escapeHtml(report.flightNumber || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Supervisor</div>
            <div class="info-value">
              ${escapeHtml(report.supervisorReporting || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Delayed Flight</div>
            <div class="info-value">
              ${report.delayedFlight ? "Yes" : "No"}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Delayed Time</div>
            <div class="info-value">
              ${escapeHtml(String(Number(report.delayedTimeMinutes || 0)))} min
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Delayed Code</div>
            <div class="info-value">
              ${escapeHtml(report.delayedCodeReported || "â")}
            </div>
          </div>

          <div class="info-card">
            <div class="info-label">Review Status</div>
            <div class="info-value">
              ${escapeHtml(getReviewStatusLabel(report.reviewStatus))}
            </div>
          </div>
        </div>

        ${lobSection}

        ${alertNeedsAttention}

        ${alertDelay}

        <div class="detail-box">
          <div class="detail-label">Delayed Reason</div>
          <div class="detail-value">
            ${escapeHtml(report.delayedReason || "â").replace(/\n/g, "<br/>")}
          </div>
        </div>

        <div class="detail-box">
          <div class="detail-label">Notes</div>
          <div class="detail-value">
            ${escapeHtml(report.notes || "â").replace(/\n/g, "<br/>")}
          </div>
        </div>

        ${managerSection}

        ${dynamicBlocks}
      </body>
    </html>
  `;
}

/* =========================================================
   PRINTABLE DELAY SUMMARY
========================================================= */

function buildDelaySummaryPrintableHtml(airline, reports, range) {
  const rowsHtml = reports
    .map((report) => {
      const dutyManager =
        report.reviewedBy ||
        report.readBy ||
        report.approvedBy ||
        report.closedBy ||
        report.archivedBy ||
        "â";

      return `
        <tr>
          <td>${escapeHtml(report.reportDate || "â")}</td>

          <td>${escapeHtml(report.department || "â")}</td>

          <td>${escapeHtml(report.normalizedAirline || "â")}</td>

          <td>${escapeHtml(report.flightNumber || "â")}</td>

          <td>
            ${escapeHtml(
              String(Number(report.delayedTimeMinutes || 0))
            )} min
          </td>

          <td>${escapeHtml(report.supervisorReporting || "â")}</td>

          <td>${escapeHtml(dutyManager)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />

        <title>Delay Summary</title>

        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
          }

          h1 {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
          }

          .subtitle {
            margin-top: 8px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }

          .summary-box {
            margin-top: 16px;
            margin-bottom: 18px;
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px 16px;
          }

          .summary-label {
            font-size: 12px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .summary-value {
            margin-top: 6px;
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }

          th,
          td {
            border: 1px solid #dbeafe;
            padding: 10px 12px;
            text-align: left;
            font-size: 13px;
          }

          th {
            background: #f8fbff;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #475569;
          }
        </style>
      </head>

      <body>
        <h1>Delay Summary</h1>

        <div class="subtitle">
          ${escapeHtml(airline)}
          Â·
          ${escapeHtml(range)}
        </div>

        <div class="summary-box">
          <div class="summary-label">
            Total of Flights Delayed
          </div>

          <div class="summary-value">
            ${reports.length}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Department</th>
              <th>Airline</th>
              <th>Flight Number</th>
              <th>Delayed Time</th>
              <th>Supervisor on Duty</th>
              <th>Duty Manager in Charge</th>
            </tr>
          </thead>

          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

/* =========================================================
   PRINTABLE LOB SUMMARY
========================================================= */

function buildLobSummaryPrintableHtml(reports, rules, rangeLabel) {
  const rowsHtml = reports
    .map((report) => {
      const labor = calculateLobLabor(report, rules);

      return `
        <tr>
          <td>${escapeHtml(report.reportDate || "â")}</td>

          <td>${escapeHtml(report.normalizedAirline || "â")}</td>

          <td>${escapeHtml(report.flightNumber || "â")}</td>

          <td>${escapeHtml(report.supervisorReporting || "â")}</td>

          <td>${escapeHtml(String(labor.bags))}</td>

          <td>${escapeHtml(String(labor.agents))}</td>

          <td>${escapeHtml(String(labor.supervisors))}</td>

          <td>${escapeHtml(formatHours(labor.estimatedHours))}</td>

          <td>${escapeHtml(formatHours(labor.agentLaborHours))}</td>

          <td>${escapeHtml(formatHours(labor.supervisorLaborHours))}</td>

          <td>${escapeHtml(formatHours(labor.totalLaborHours))}</td>
        </tr>
      `;
    })
    .join("");

  const totals = reports.reduce(
    (acc, report) => {
      const labor = calculateLobLabor(report, rules);

      acc.totalFlights += 1;
      acc.totalBags += labor.bags;
      acc.totalAgentHours += labor.agentLaborHours;
      acc.totalSupervisorHours += labor.supervisorLaborHours;
      acc.totalLaborHours += labor.totalLaborHours;

      return acc;
    },
    {
      totalFlights: 0,
      totalBags: 0,
      totalAgentHours: 0,
      totalSupervisorHours: 0,
      totalLaborHours: 0,
    }
  );

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />

        <title>LOB Management Summary</title>

        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 24px;
            color: #0f172a;
          }

          h1 {
            margin: 0;
            font-size: 30px;
            font-weight: 800;
          }

          .subtitle {
            margin-top: 8px;
            font-size: 14px;
            color: #475569;
            font-weight: 700;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 10px;
            margin-top: 18px;
            margin-bottom: 20px;
          }

          .summary-card {
            background: #f8fbff;
            border: 1px solid #dbeafe;
            border-radius: 14px;
            padding: 14px;
          }

          .summary-label {
            font-size: 10px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .summary-value {
            margin-top: 6px;
            font-size: 21px;
            font-weight: 900;
            color: #0f172a;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #dbeafe;
            padding: 9px 10px;
            text-align: left;
            font-size: 12px;
          }

          th {
            background: #f8fbff;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-size: 10px;
          }

          .formula {
            margin-top: 20px;
            border: 1px solid #dbeafe;
            background: #f8fbff;
            border-radius: 14px;
            padding: 14px 16px;
          }

          .formula-title {
            font-size: 12px;
            font-weight: 800;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 8px;
          }

          .formula-row {
            font-size: 13px;
            font-weight: 700;
            margin-top: 4px;
          }

          @media print {
            body {
              margin: 12px;
            }
          }
        </style>
      </head>

      <body>
        <h1>LOB Management Summary</h1>

        <div class="subtitle">
          ${escapeHtml(rangeLabel)}
        </div>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">LOB Flights</div>
            <div class="summary-value">
              ${totals.totalFlights}
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-label">LOB Bags</div>
            <div class="summary-value">
              ${formatHours(totals.totalBags)}
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Agent Labor Hours</div>
            <div class="summary-value">
              ${formatHours(totals.totalAgentHours)}
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Supervisor Labor Hours</div>
            <div class="summary-value">
              ${formatHours(totals.totalSupervisorHours)}
            </div>
          </div>

          <div class="summary-card">
            <div class="summary-label">Total Labor Hours</div>
            <div class="summary-value">
              ${formatHours(totals.totalLaborHours)}
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Airline</th>
              <th>Flight</th>
              <th>Supervisor</th>
              <th>LOB Bags</th>
              <th>Agents</th>
              <th>Supervisors</th>
              <th>LOB Hours</th>
              <th>Agent Hours</th>
              <th>Supervisor Hours</th>
              <th>Total Hours</th>
            </tr>
          </thead>

          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="formula">
          <div class="formula-title">
            LOB Labor Formula Used
          </div>

          ${rules
            .map(
              (rule) => `
                <div class="formula-row">
                  ${escapeHtml(String(rule.minBags))}
                  -
                  ${
                    rule.maxBags === null ||
                    rule.maxBags === ""
                      ? "â"
                      : escapeHtml(String(rule.maxBags))
                  }
                  bags
                  =
                  ${escapeHtml(formatHours(rule.hours))}
                  hour(s)
                </div>
              `
            )
            .join("")}
        </div>
      </body>
    </html>
  `;
}

/* =========================================================
   UI COMPONENTS
========================================================= */

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

function FieldLabel({ children }) {
  return (
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
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
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
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
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
        boxSizing: "border-box",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        resize: "vertical",
        minHeight: 90,
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
  type = "button",
  disabled = false,
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

    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
      boxShadow: "0 10px 20px rgba(220,38,38,0.18)",
    },

    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
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
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...styles[variant],
      }}
    >
      {children}
    </button>
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
    textAlign: "left",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 14,
};

function InfoCard({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 16,
        padding: "14px 16px",
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
          fontSize: 16,
          fontWeight: 800,
          color: "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailBox({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: "14px 16px",
        background: "#f8fbff",
        border: "1px solid #dbeafe",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 14,
          color: "#0f172a",
          whiteSpace: "pre-line",
          lineHeight: 1.7,
        }}
      >
        {value}
      </div>
    </div>
  );
}
export default function OperationalReportAdminPage() {
  const { user } = useUser();

  const normalizedUsername = String(user?.username || "")
    .trim()
    .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" && normalizedUsername === "hhernandez";

  const isSupervisor = user?.role === "supervisor";

  const isManager =
    user?.role === "duty_manager" || user?.role === "station_manager";

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  /* =========================================================
     MAIN STATE
  ========================================================= */

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [actionId, setActionId] = useState("");

  const [selectedDelayAirline, setSelectedDelayAirline] = useState("");

  /* =========================================================
     LOB STATE
  ========================================================= */

  const [lobRules, setLobRules] = useState(DEFAULT_LOB_RULES);

  const [lobRulesDraft, setLobRulesDraft] = useState(
    DEFAULT_LOB_RULES.map((rule) => ({ ...rule }))
  );

  const [savingLobRules, setSavingLobRules] = useState(false);

  const [lobOnly, setLobOnly] = useState(false);

  /* =========================================================
     FILTERS
  ========================================================= */

  const [filters, setFilters] = useState({
    airline: "all",
    department: "all",
    lifecycle: "active",
    dateMode: "quick",
    range: "today",
    fromDate: "",
    toDate: "",
  });

  /* =========================================================
     EDIT FORM
  ========================================================= */

  const [editForm, setEditForm] = useState({
    templateKey: "",
    templateLabel: "",
    department: "",
    airline: "",
    reportDate: "",
    shift: "",
    flightNumber: "",
    flightsHandled: "",
    supervisorReporting: "",
    notes: "",

    delayedFlight: false,
    delayedTimeMinutes: "",
    delayedReason: "",
    delayedCodeReported: "",

    needsAttention: false,

    responses: {},

    reviewStatus: "submitted",

    managerNotes: "",

    followUpRequired: false,
    followUpAction: "",
    followUpDetails: "",

    hasLobs: false,
    lobBags: "",
    lobAgentsUsed: "",
    lobSupervisorsUsed: "",
  });

  /* =========================================================
     LOAD OPERATIONAL REPORTS
  ========================================================= */

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);

        const q = query(
          collection(db, "operational_reports"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);

        let rows = snap.docs.map((d) => {
          const data = d.data();

          const normalizedReport = {
            id: d.id,
            ...data,

            normalizedAirline: normalizeAirlineName(data.airline),

            normalizedDepartment: normalizeDepartmentValue(
              data.templateKey || data.department || data.airline
            ),

            reviewStatus: data.reviewStatus || "submitted",

            managerNotes: data.managerNotes || "",

            followUpRequired: Boolean(data.followUpRequired),

            followUpAction: data.followUpAction || "",

            followUpDetails: data.followUpDetails || "",

            archived: Boolean(data.archived),
          };

          /*
           * Keep LOB information compatible with reports already saved
           * inside responses as well as the newer top-level fields.
           */
          const lobData = getLobData(normalizedReport);

          return {
            ...normalizedReport,

            hasLobs: lobData.hasLobs,

            lobBags: lobData.bags,

            lobAgentsUsed: lobData.agents,

            lobSupervisorsUsed: lobData.supervisors,
          };
        });

        if (isCabinDutyManager) {
          rows = rows.filter(
            (row) => row.normalizedDepartment === "cabin_service"
          );
        }

        setReports(rows);
      } catch (err) {
        console.error("Error loading operational reports:", err);
        setStatusMessage("Could not load operational reports.");
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadReports();
    } else {
      setLoading(false);
    }
  }, [canAccess, isCabinDutyManager]);

  /* =========================================================
     LOAD LOB FORMULA
  ========================================================= */

  useEffect(() => {
    async function loadLobRules() {
      if (!isManager) return;

      try {
        const snap = await getDocs(
          collection(db, "operational_report_lob_settings")
        );

        if (snap.empty) {
          setLobRules(DEFAULT_LOB_RULES);
          setLobRulesDraft(
            DEFAULT_LOB_RULES.map((rule) => ({ ...rule }))
          );
          return;
        }

        const firstDoc = snap.docs[0];
        const data = firstDoc.data();

        const savedRules = Array.isArray(data?.rules)
          ? data.rules
          : DEFAULT_LOB_RULES;

        const cleanedRules = normalizeLobRules(savedRules);

        setLobRules(cleanedRules);

        setLobRulesDraft(
          cleanedRules.map((rule) => ({ ...rule }))
        );
      } catch (err) {
        console.error("Error loading LOB formula:", err);

        /*
         * Do not break the management page if the settings collection
         * does not exist yet or Firestore rules have not been updated.
         */
        setLobRules(DEFAULT_LOB_RULES);

        setLobRulesDraft(
          DEFAULT_LOB_RULES.map((rule) => ({ ...rule }))
        );
      }
    }

    if (canAccess) {
      loadLobRules();
    }
  }, [canAccess, isManager]);

  /* =========================================================
     AIRLINE OPTIONS
  ========================================================= */

  const airlineOptions = useMemo(() => {
    const set = new Set();

    reports.forEach((r) => {
      if (r.normalizedAirline) {
        set.add(r.normalizedAirline);
      }
    });

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [reports]);

  /* =========================================================
     DEPARTMENT OPTIONS
  ========================================================= */

  const departmentOptions = useMemo(() => {
    const set = new Set();

    reports.forEach((r) => {
      if (r.department) {
        set.add(r.department);
      }
    });

    return Array.from(set).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [reports]);

  /* =========================================================
     FILTERED REPORTS
  ========================================================= */

  const filteredReports = useMemo(() => {
    const quickRange =
      filters.dateMode === "quick"
        ? getRangeDates(filters.range)
        : null;

    const customRange =
      filters.dateMode === "custom"
        ? getCustomDateRange(
            filters.fromDate,
            filters.toDate
          )
        : null;

    let baseReports = reports;

    /*
     * Supervisors only see reports submitted by themselves.
     */
    if (isSupervisor) {
      const myUserId = String(user?.id || "").trim();

      const myUsername = String(user?.username || "")
        .trim()
        .toLowerCase();

      const myName = String(
        user?.displayName ||
          user?.fullName ||
          user?.name ||
          user?.username ||
          ""
      )
        .trim()
        .toLowerCase();

      baseReports = reports.filter((r) => {
        const submittedUserId = String(
          r.submittedByUserId || ""
        ).trim();

        const submittedUsername = String(
          r.submittedByUsername || ""
        )
          .trim()
          .toLowerCase();

        const submittedName = String(
          r.submittedByName ||
            r.supervisorReporting ||
            ""
        )
          .trim()
          .toLowerCase();

        return (
          (myUserId &&
            submittedUserId === myUserId) ||
          (myUsername &&
            submittedUsername === myUsername) ||
          (myName &&
            submittedName === myName)
        );
      });
    }

    return baseReports.filter((r) => {
      const created = tsToDate(r.createdAt);

      if (!created) return false;

      if (
        filters.dateMode === "quick" &&
        quickRange
      ) {
        if (
          created < quickRange.start ||
          created > quickRange.end
        ) {
          return false;
        }
      }

      if (
        filters.dateMode === "custom" &&
        customRange
      ) {
        if (
          created < customRange.start ||
          created > customRange.end
        ) {
          return false;
        }
      }

      if (
        filters.airline !== "all" &&
        r.normalizedAirline !== filters.airline
      ) {
        return false;
      }

      if (
        filters.department !== "all" &&
        r.department !== filters.department
      ) {
        return false;
      }

      if (lobOnly && !getReportHasLobs(r)) {
        return false;
      }

      const status = String(
        r.reviewStatus || "submitted"
      ).toLowerCase();

      if (filters.lifecycle === "active") {
        return !["closed", "archived"].includes(status);
      }

      if (filters.lifecycle === "closed") {
        return status === "closed";
      }

      if (filters.lifecycle === "archived") {
        return status === "archived";
      }

      return true;
    });
  }, [
    reports,
    filters,
    isSupervisor,
    user,
    lobOnly,
  ]);

  /* =========================================================
     DELAY REPORTS
  ========================================================= */

  const delayedReports = useMemo(() => {
    return filteredReports.filter((r) =>
      Boolean(r.delayedFlight)
    );
  }, [filteredReports]);

  /* =========================================================
     DELAY SUMMARY BY AIRLINE
  ========================================================= */

  const delayedSummaryByAirline = useMemo(() => {
    const map = {};

    delayedReports.forEach((r) => {
      const airline =
        r.normalizedAirline || "Unknown";

      if (!map[airline]) {
        map[airline] = {
          airline,
          totalDelayedFlights: 0,
          reports: [],
        };
      }

      map[airline].totalDelayedFlights += 1;
      map[airline].reports.push(r);
    });

    return Object.values(map).sort(
      (a, b) =>
        b.totalDelayedFlights -
          a.totalDelayedFlights ||
        a.airline.localeCompare(b.airline)
    );
  }, [delayedReports]);

  /* =========================================================
     SELECTED DELAY AIRLINE REPORTS
  ========================================================= */

  const selectedDelayAirlineReports = useMemo(() => {
    if (!selectedDelayAirline) return [];

    const found = delayedSummaryByAirline.find(
      (item) =>
        item.airline === selectedDelayAirline
    );

    return found?.reports || [];
  }, [
    delayedSummaryByAirline,
    selectedDelayAirline,
  ]);

  /* =========================================================
     LOB REPORTS
  ========================================================= */

  const lobReports = useMemo(() => {
    return filteredReports.filter((report) =>
      getReportHasLobs(report)
    );
  }, [filteredReports]);

  /* =========================================================
     LOB MANAGEMENT SUMMARY
  ========================================================= */

  const lobSummary = useMemo(() => {
    return lobReports.reduce(
      (summary, report) => {
        const labor = calculateLobLabor(
          report,
          lobRules
        );

        summary.totalFlights += 1;

        summary.totalBags += labor.bags;

        summary.totalAgentsUsed += labor.agents;

        summary.totalSupervisorsUsed +=
          labor.supervisors;

        summary.totalAgentHours +=
          labor.agentLaborHours;

        summary.totalSupervisorHours +=
          labor.supervisorLaborHours;

        summary.totalLaborHours +=
          labor.totalLaborHours;

        return summary;
      },
      {
        totalFlights: 0,
        totalBags: 0,
        totalAgentsUsed: 0,
        totalSupervisorsUsed: 0,
        totalAgentHours: 0,
        totalSupervisorHours: 0,
        totalLaborHours: 0,
      }
    );
  }, [lobReports, lobRules]);

  /* =========================================================
     LOB SUMMARY BY AIRLINE
  ========================================================= */

  const lobSummaryByAirline = useMemo(() => {
    const map = {};

    lobReports.forEach((report) => {
      const airline =
        report.normalizedAirline || "Unknown";

      const labor = calculateLobLabor(
        report,
        lobRules
      );

      if (!map[airline]) {
        map[airline] = {
          airline,
          totalFlights: 0,
          totalBags: 0,
          agentLaborHours: 0,
          supervisorLaborHours: 0,
          totalLaborHours: 0,
        };
      }

      map[airline].totalFlights += 1;

      map[airline].totalBags +=
        labor.bags;

      map[airline].agentLaborHours +=
        labor.agentLaborHours;

      map[airline].supervisorLaborHours +=
        labor.supervisorLaborHours;

      map[airline].totalLaborHours +=
        labor.totalLaborHours;
    });

    return Object.values(map).sort(
      (a, b) =>
        b.totalBags - a.totalBags ||
        a.airline.localeCompare(b.airline)
    );
  }, [lobReports, lobRules]);

  /* =========================================================
     ALERTS
  ========================================================= */

  const alerts = useMemo(() => {
    const rows = [];

    delayedSummaryByAirline.forEach((item) => {
      const maxMinutes = Math.max(
        ...item.reports.map((report) =>
          Number(
            report.delayedTimeMinutes || 0
          )
        ),
        0
      );

      if (
        (filters.dateMode === "quick" &&
          filters.range === "month") ||
        (filters.dateMode === "custom" &&
          item.totalDelayedFlights > 2)
      ) {
        if (item.totalDelayedFlights > 2) {
          rows.push({
            type: "followup",
            airline: item.airline,

            text:
              `${item.airline}: Duty Mgrs Follow up needed. ` +
              `More than 2 delayed flights reported in selected period.`,
          });
        }
      }

      if (maxMinutes > 4) {
        rows.push({
          type: "followup",
          airline: item.airline,

          text:
            `${item.airline}: Duty Mgrs Follow up needed. ` +
            `At least one delayed flight exceeded 4 minutes.`,
        });
      }
    });

    filteredReports.forEach((r) => {
      if (shouldFlagNeedsAttention(r)) {
        rows.push({
          type: "attention",

          airline:
            r.normalizedAirline || "Unknown",

          text:
            `${r.normalizedAirline || "Unknown"}: ` +
            `Report needs attention because operation indicates ` +
            `issues or incomplete completion.`,
        });
      }
    });

    return rows;
  }, [
    delayedSummaryByAirline,
    filteredReports,
    filters.range,
    filters.dateMode,
  ]);

  /* =========================================================
     SELECTED REPORT
  ========================================================= */

  const selectedReport = useMemo(() => {
    return (
      filteredReports.find(
        (r) => r.id === selectedId
      ) || null
    );
  }, [filteredReports, selectedId]);

  /* =========================================================
     KEEP SELECTED REPORT VALID
  ========================================================= */

  useEffect(() => {
    if (
      !selectedId &&
      filteredReports.length
    ) {
      setSelectedId(
        filteredReports[0].id
      );

      return;
    }

    if (
      selectedId &&
      !filteredReports.some(
        (r) => r.id === selectedId
      )
    ) {
      setSelectedId(
        filteredReports[0]?.id || ""
      );
    }
  }, [filteredReports, selectedId]);

  /* =========================================================
     SELECT DELAY AIRLINE
  ========================================================= */

  const handleSelectDelayAirline = (
    airline
  ) => {
    setSelectedDelayAirline(airline);

    const found =
      delayedSummaryByAirline.find(
        (item) =>
          item.airline === airline
      );

    if (found?.reports?.length) {
      setSelectedId(
        found.reports[0].id
      );
    }
  };

  /* =========================================================
     START EDIT
  ========================================================= */

  const startEdit = (report) => {
    if (!isManager) return;

    const lobData = getLobData(report);

    setEditingId(report.id);

    setEditForm({
      templateKey:
        report.templateKey || "",

      templateLabel:
        report.templateLabel || "",

      department:
        report.department || "",

      airline:
        report.airline || "",

      reportDate:
        report.reportDate || "",

      shift:
        report.shift || "",

      flightNumber:
        report.flightNumber || "",

      flightsHandled:
        report.flightsHandled || "",

      supervisorReporting:
        report.supervisorReporting || "",

      notes:
        report.notes || "",

      delayedFlight:
        Boolean(report.delayedFlight),

      delayedTimeMinutes:
        report.delayedTimeMinutes ?? "",

      delayedReason:
        report.delayedReason || "",

      delayedCodeReported:
        report.delayedCodeReported || "",

      needsAttention:
        Boolean(report.needsAttention),

      responses: {
        ...(report.responses || {}),
      },

      reviewStatus:
        report.reviewStatus ||
        "submitted",

      managerNotes:
        report.managerNotes || "",

      followUpRequired:
        Boolean(
          report.followUpRequired
        ),

      followUpAction:
        report.followUpAction || "",

      followUpDetails:
        report.followUpDetails || "",

      hasLobs:
        lobData.hasLobs,

      lobBags:
        lobData.bags || "",

      lobAgentsUsed:
        lobData.agents || "",

      lobSupervisorsUsed:
        lobData.supervisors || "",
    });

    setSelectedId(report.id);
  };

  /* =========================================================
     CANCEL EDIT
  ========================================================= */

  const cancelEdit = () => {
    setEditingId("");
    setSavingId("");
  };

  /* =========================================================
     DYNAMIC RESPONSE CHANGE
  ========================================================= */

  const handleDynamicResponseChange = (
    key,
    value
  ) => {
    setEditForm((prev) => ({
      ...prev,

      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  /* =========================================================
     UPDATE LOB RULE DRAFT
  ========================================================= */

  const updateLobRuleDraft = (
    index,
    field,
    value
  ) => {
    setLobRulesDraft((prev) =>
      prev.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              [field]: value,
            }
          : rule
      )
    );
  };

  /* =========================================================
     ADD LOB RULE
  ========================================================= */

  const addLobRule = () => {
    setLobRulesDraft((prev) => {
      const lastRule =
        prev[prev.length - 1];

      const nextMin =
        lastRule &&
        lastRule.maxBags !== null &&
        lastRule.maxBags !== ""
          ? Number(lastRule.maxBags) + 1
          : 1;

      return [
        ...prev,
        {
          minBags: nextMin,
          maxBags: "",
          hours: 1,
        },
      ];
    });
  };

  /* =========================================================
     REMOVE LOB RULE
  ========================================================= */

  const removeLobRule = (index) => {
    setLobRulesDraft((prev) =>
      prev.filter(
        (_, ruleIndex) =>
          ruleIndex !== index
      )
    );
  };
    /* =========================================================
     SAVE LOB RULES
  ========================================================= */

  const saveLobRules = async () => {
    if (!isManager) return;

    try {
      setSavingLobRules(true);
      setStatusMessage("");

      const cleanedRules = normalizeLobRules(lobRulesDraft);

      if (!cleanedRules.length) {
        setStatusMessage(
          "Please add at least one valid LOB labor rule."
        );
        return;
      }

      /*
       * We use a fixed document ID so there is only one
       * active LOB formula for Operational Reports.
       */
      const settingsRef = doc(
        db,
        "operational_report_lob_settings",
        "default"
      );

      await setDoc(
        settingsRef,
        {
          rules: cleanedRules,
          updatedAt: serverTimestamp(),
          updatedBy: getVisibleUserName(user),
          updatedByUserId: user?.id || "",
          updatedByUsername: user?.username || "",
        },
        { merge: true }
      );

      setLobRules(cleanedRules);

      setLobRulesDraft(
        cleanedRules.map((rule) => ({
          ...rule,
        }))
      );

      setStatusMessage(
        "LOB labor formula updated successfully."
      );
    } catch (err) {
      console.error(
        "Error saving LOB formula:",
        err
      );

      setStatusMessage(
        "Could not save the LOB labor formula."
      );
    } finally {
      setSavingLobRules(false);
    }
  };

  /* =========================================================
     SAVE REPORT EDIT
  ========================================================= */

  const saveEdit = async (report) => {
    if (!isManager) return;

    try {
      setSavingId(report.id);
      setStatusMessage("");

      const hasLobs =
        Boolean(editForm.hasLobs);

      const lobBags = hasLobs
        ? Math.max(
            0,
            Number(editForm.lobBags || 0)
          )
        : 0;

      const lobAgentsUsed = hasLobs
        ? Math.max(
            0,
            Number(editForm.lobAgentsUsed || 0)
          )
        : 0;

      const lobSupervisorsUsed = hasLobs
        ? Math.max(
            0,
            Number(
              editForm.lobSupervisorsUsed || 0
            )
          )
        : 0;

      const responses = {
        ...(editForm.responses || {}),

        has_lobs: hasLobs
          ? "Yes"
          : "No",

        lob_bags: lobBags,

        lob_agents_used:
          lobAgentsUsed,

        lob_supervisors_used:
          lobSupervisorsUsed,
      };

      const payload = {
        templateKey:
          editForm.templateKey ||
          report.templateKey ||
          "",

        templateLabel:
          editForm.templateLabel ||
          report.templateLabel ||
          "",

        department:
          editForm.department ||
          report.department ||
          "",

        airline:
          normalizeAirlineName(
            editForm.airline
          ),

        reportDate:
          editForm.reportDate,

        shift:
          editForm.shift,

        flightNumber:
          isCabinServiceReport(editForm)
            ? ""
            : editForm.flightNumber,

        flightsHandled:
          editForm.flightsHandled,

        supervisorReporting:
          editForm.supervisorReporting,

        notes:
          editForm.notes,

        delayedFlight:
          Boolean(
            editForm.delayedFlight
          ),

        delayedTimeMinutes:
          Number(
            editForm.delayedTimeMinutes ||
              0
          ),

        delayedReason:
          String(
            editForm.delayedReason || ""
          ).trim(),

        delayedCodeReported:
          String(
            editForm.delayedCodeReported ||
              ""
          ).trim(),

        needsAttention:
          Boolean(
            editForm.needsAttention
          ),

        responses,

        reviewStatus:
          editForm.reviewStatus ||
          "submitted",

        managerNotes:
          editForm.managerNotes || "",

        followUpRequired:
          Boolean(
            editForm.followUpRequired
          ),

        followUpAction:
          editForm.followUpAction || "",

        followUpDetails:
          editForm.followUpDetails || "",

        /*
         * LOB values are also stored at the top level.
         * This makes management reporting much easier
         * while maintaining compatibility with responses.
         */
        hasLobs,

        lobBags,

        lobAgentsUsed,

        lobSupervisorsUsed,

        updatedAt:
          serverTimestamp(),

        updatedBy:
          getVisibleUserName(user),
      };

      await updateDoc(
        doc(
          db,
          "operational_reports",
          report.id
        ),
        payload
      );

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,

                normalizedAirline:
                  normalizeAirlineName(
                    payload.airline
                  ),

                normalizedDepartment:
                  normalizeDepartmentValue(
                    payload.templateKey ||
                      payload.department
                  ),
              }
            : item
        )
      );

      setEditingId("");
      setSavingId("");

      setStatusMessage(
        "Operational report updated successfully."
      );
    } catch (err) {
      console.error(
        "Error updating operational report:",
        err
      );

      setStatusMessage(
        "Could not update operational report."
      );

      setSavingId("");
    }
  };

  /* =========================================================
     UPDATE WORKFLOW STATUS
  ========================================================= */

  const updateWorkflowStatus = async (
    report,
    mode
  ) => {
    if (!isManager) return;

    try {
      setActionId(report.id);

      const managerName =
        getVisibleUserName(user);

      const managerRole =
        user?.role || "";

      const payload = {};

      if (mode === "read") {
        payload.reviewStatus = "read";

        payload.readAt =
          serverTimestamp();

        payload.readBy =
          managerName;

        payload.readByRole =
          managerRole;
      }

      if (mode === "approved") {
        payload.reviewStatus =
          "approved";

        payload.approvedAt =
          serverTimestamp();

        payload.approvedBy =
          managerName;

        payload.approvedByRole =
          managerRole;
      }

      if (
        mode ===
        "follow_up_required"
      ) {
        payload.reviewStatus =
          "follow_up_required";

        payload.followUpRequired =
          true;

        payload.reviewedAt =
          serverTimestamp();

        payload.reviewedBy =
          managerName;

        payload.reviewedByRole =
          managerRole;
      }

      if (mode === "closed") {
        payload.reviewStatus =
          "closed";

        payload.closedAt =
          serverTimestamp();

        payload.closedBy =
          managerName;

        payload.closedByRole =
          managerRole;
      }

      if (mode === "archived") {
        payload.reviewStatus =
          "archived";

        payload.archived = true;

        payload.archivedAt =
          serverTimestamp();

        payload.archivedBy =
          managerName;

        payload.archivedByRole =
          managerRole;
      }

      await updateDoc(
        doc(
          db,
          "operational_reports",
          report.id
        ),
        payload
      );

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setStatusMessage(
        `Report marked as ${getReviewStatusLabel(
          payload.reviewStatus
        )}.`
      );
    } catch (err) {
      console.error(
        "Error updating workflow status:",
        err
      );

      setStatusMessage(
        "Could not update report status."
      );
    } finally {
      setActionId("");
    }
  };

  /* =========================================================
     SAVE FOLLOW UP
  ========================================================= */

  const saveFollowUp = async (
    report
  ) => {
    if (!isManager) return;

    const action = String(
      editForm.followUpAction || ""
    ).trim();

    const details = String(
      editForm.followUpDetails || ""
    ).trim();

    if (!action && !details) {
      setStatusMessage(
        "Please enter follow up action or follow up details."
      );

      return;
    }

    try {
      setActionId(report.id);

      const managerName =
        getVisibleUserName(user);

      const managerRole =
        user?.role || "";

      const payload = {
        followUpRequired: true,

        reviewStatus:
          "follow_up_required",

        followUpAction:
          action,

        followUpDetails:
          details,

        managerNotes:
          editForm.managerNotes || "",

        followUpCompletedAt:
          serverTimestamp(),

        followUpCompletedBy:
          managerName,

        followUpCompletedByRole:
          managerRole,
      };

      await updateDoc(
        doc(
          db,
          "operational_reports",
          report.id
        ),
        payload
      );

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setEditForm((prev) => ({
        ...prev,

        followUpRequired: true,

        reviewStatus:
          "follow_up_required",
      }));

      setStatusMessage(
        "Follow up saved successfully."
      );
    } catch (err) {
      console.error(
        "Error saving follow up:",
        err
      );

      setStatusMessage(
        "Could not save follow up."
      );
    } finally {
      setActionId("");
    }
  };

  /* =========================================================
     DELETE REPORT
  ========================================================= */

  const deleteReport = async (
    report
  ) => {
    if (!isManager) return;

    const ok = window.confirm(
      `Delete operational report for ${
        report.normalizedAirline ||
        "Unknown"
      }?`
    );

    if (!ok) return;

    try {
      setDeletingId(report.id);

      await deleteDoc(
        doc(
          db,
          "operational_reports",
          report.id
        )
      );

      setReports((prev) =>
        prev.filter(
          (item) =>
            item.id !== report.id
        )
      );

      setStatusMessage(
        "Operational report deleted."
      );
    } catch (err) {
      console.error(
        "Error deleting operational report:",
        err
      );

      setStatusMessage(
        "Could not delete operational report."
      );
    } finally {
      setDeletingId("");
    }
  };

  /* =========================================================
     PRINT INDIVIDUAL REPORT
  ========================================================= */

  const handlePrintExport = () => {
    if (!selectedReport) return;

    const html =
      buildPrintableHtml(
        selectedReport,
        lobRules
      );

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=1200,height=900"
      );

    if (!printWindow) {
      setStatusMessage(
        "Pop-up blocked. Please allow pop-ups to export/print."
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

    setTimeout(
      triggerPrint,
      400
    );
  };

  /* =========================================================
     PRINT DELAY SUMMARY
  ========================================================= */

  const handlePrintDelaySummary =
    () => {
      if (
        !selectedDelayAirline ||
        selectedDelayAirlineReports.length ===
          0
      ) {
        setStatusMessage(
          "Please select an airline with delayed flights first."
        );

        return;
      }

      const rangeLabel =
        filters.dateMode ===
        "custom"
          ? `${
              filters.fromDate ||
              "Start"
            } to ${
              filters.toDate ||
              "End"
            }`
          : filters.range;

      const html =
        buildDelaySummaryPrintableHtml(
          selectedDelayAirline,
          selectedDelayAirlineReports,
          rangeLabel
        );

      const printWindow =
        window.open(
          "",
          "_blank",
          "width=1200,height=900"
        );

      if (!printWindow) {
        setStatusMessage(
          "Pop-up blocked. Please allow pop-ups to export/print."
        );

        return;
      }

      printWindow.document.open();
      printWindow.document.write(
        html
      );
      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 400);
    };

  /* =========================================================
     PRINT LOB SUMMARY
  ========================================================= */

  const handlePrintLobSummary =
    () => {
      if (!lobReports.length) {
        setStatusMessage(
          "No LOB reports found for the selected period."
        );

        return;
      }

      const rangeLabel =
        filters.dateMode ===
        "custom"
          ? `${
              filters.fromDate ||
              "Start"
            } to ${
              filters.toDate ||
              "End"
            }`
          : filters.range;

      const html =
        buildLobSummaryPrintableHtml(
          lobReports,
          lobRules,
          rangeLabel
        );

      const printWindow =
        window.open(
          "",
          "_blank",
          "width=1400,height=900"
        );

      if (!printWindow) {
        setStatusMessage(
          "Pop-up blocked. Please allow pop-ups to export/print."
        );

        return;
      }

      printWindow.document.open();
      printWindow.document.write(
        html
      );
      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 400);
    };

  /* =========================================================
     ACCESS DENIED
  ========================================================= */

  if (!canAccess) {
    return (
      <div
        style={{
          display: "grid",
          gap: 18,
          fontFamily:
            "Poppins, Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            background:
              "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
            borderRadius: 28,
            padding: 24,
            color: "#fff",
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
            TPA OPS Â· Operational
            Reports
          </p>

          <h1
            style={{
              margin:
                "10px 0 6px",
              fontSize: 32,
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing:
                "-0.04em",
            }}
          >
            Access denied
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 700,
              fontSize: 14,
              color:
                "rgba(255,255,255,0.88)",
            }}
          >
            You do not have
            permission to view
            operational reports.
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN PAGE
  ========================================================= */

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
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
          TPA OPS Â· Operational Reports
        </p>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 32,
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing:
              "-0.04em",
          }}
        >
          {isSupervisor
            ? "My Supervisor Operational Reports"
            : "Operational Report Admin"}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 760,
            fontSize: 14,
            color:
              "rgba(255,255,255,0.88)",
          }}
        >
          {isSupervisor
            ? "Review the operational reports submitted by you, including review status, follow up, and manager comments."
            : "Review delays, LOB operations, labor hours, alerts, follow-up cases, and manage submitted operational reports by department."}
        </p>
      </div>

      {statusMessage && (
        <PageCard
          style={{ padding: 16 }}
        >
          <div
            style={{
              background: "#edf7ff",
              border:
                "1px solid #cfe7fb",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}
            <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Filters
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Date Filter Mode</FieldLabel>
            <SelectInput
              value={filters.dateMode}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  dateMode: e.target.value,
                }))
              }
            >
              <option value="quick">Quick Range</option>
              <option value="custom">Custom Dates</option>
            </SelectInput>
          </div>

          {filters.dateMode === "quick" ? (
            <div>
              <FieldLabel>Range</FieldLabel>
              <SelectInput
                value={filters.range}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    range: e.target.value,
                  }))
                }
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </SelectInput>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>From</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      fromDate: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <FieldLabel>To</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.toDate}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      toDate: e.target.value,
                    }))
                  }
                />
              </div>
            </>
          )}

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  airline: e.target.value,
                }))
              }
            >
              <option value="all">All</option>

              {airlineOptions.map((airline) => (
                <option key={airline} value={airline}>
                  {airline}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Department</FieldLabel>
            <SelectInput
              value={filters.department}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  department: e.target.value,
                }))
              }
            >
              <option value="all">All</option>

              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>View</FieldLabel>
            <SelectInput
              value={filters.lifecycle}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  lifecycle: e.target.value,
                }))
              }
            >
              <option value="active">Active Reports</option>
              <option value="closed">Closed Reports</option>
              <option value="archived">Archived Reports</option>
              <option value="all">All</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>LOB Filter</FieldLabel>
            <SelectInput
              value={lobOnly ? "lobs" : "all"}
              onChange={(e) =>
                setLobOnly(e.target.value === "lobs")
              }
            >
              <option value="all">All Reports</option>
              <option value="lobs">LOB Reports Only</option>
            </SelectInput>
          </div>
        </div>
      </PageCard>

      {!isSupervisor && alerts.length > 0 && (
        <PageCard style={{ padding: 18 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 18,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#9f1239",
                marginBottom: 8,
              }}
            >
              Alerts
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.airline}-${index}`}
                  style={{
                    color: "#9f1239",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          </div>
        </PageCard>
      )}

      {/* =====================================================
          LOB MANAGEMENT
      ===================================================== */}

      {!isSupervisor && (
        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                LOB Management
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                  maxWidth: 760,
                }}
              >
                Review flights reported with LOBs and calculate the
                estimated labor hours based on the number of bags,
                agents, supervisors, and the management formula.
              </p>
            </div>

            {lobReports.length > 0 && (
              <ActionButton
                variant="secondary"
                onClick={handlePrintLobSummary}
              >
                Print / Export LOB Summary
              </ActionButton>
            )}
          </div>

          {/* LOB TOTAL CARDS */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 22,
            }}
          >
            <InfoCard
              label="Flights With LOBs"
              value={lobSummary.totalFlights}
            />

            <InfoCard
              label="Total LOB Bags"
              value={lobSummary.totalBags}
            />

            <InfoCard
              label="Agents Used"
              value={lobSummary.totalAgentsUsed}
            />

            <InfoCard
              label="Supervisors Used"
              value={lobSummary.totalSupervisorsUsed}
            />

            <InfoCard
              label="Agent Labor Hours"
              value={formatHours(lobSummary.totalAgentHours)}
            />

            <InfoCard
              label="Supervisor Labor Hours"
              value={formatHours(lobSummary.totalSupervisorHours)}
            />

            <InfoCard
              label="Total Labor Hours"
              value={formatHours(lobSummary.totalLaborHours)}
            />
          </div>

          {/* =================================================
              EDITABLE LOB LABOR FORMULA
          ================================================= */}

          {isManager && (
            <div
              style={{
                borderRadius: 18,
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                padding: 18,
                marginBottom: 22,
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
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    LOB Labor Formula
                  </h3>

                  <p
                    style={{
                      margin: "5px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                      maxWidth: 720,
                    }}
                  >
                    Set how many operational hours should be assigned
                    according to the number of LOB bags. The system
                    multiplies those hours by the agents and
                    supervisors reported for the flight.
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="secondary"
                    onClick={addLobRule}
                  >
                    + Add Range
                  </ActionButton>

                  <ActionButton
                    variant="success"
                    onClick={saveLobRules}
                    disabled={savingLobRules}
                  >
                    {savingLobRules
                      ? "Saving..."
                      : "Save Formula"}
                  </ActionButton>
                </div>
              </div>

              <div
                style={{
                  overflowX: "auto",
                  borderRadius: 16,
                  border: "1px solid #dbeafe",
                  background: "#fff",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "separate",
                    borderSpacing: 0,
                    minWidth: 700,
                  }}
                >
                  <thead>
                    <tr style={{ background: "#edf7ff" }}>
                      <th style={thStyle()}>Minimum Bags</th>
                      <th style={thStyle()}>Maximum Bags</th>
                      <th style={thStyle()}>Hours</th>
                      <th style={thStyle()}>
                        Example
                      </th>
                      <th
                        style={thStyle({
                          textAlign: "center",
                        })}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lobRulesDraft.map((rule, index) => (
                      <tr key={`lob-rule-${index}`}>
                        <td style={tdStyle}>
                          <TextInput
                            type="number"
                            min="0"
                            value={rule.minBags}
                            onChange={(e) =>
                              updateLobRuleDraft(
                                index,
                                "minBags",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td style={tdStyle}>
                          <TextInput
                            type="number"
                            min="0"
                            value={
                              rule.maxBags === null
                                ? ""
                                : rule.maxBags
                            }
                            onChange={(e) =>
                              updateLobRuleDraft(
                                index,
                                "maxBags",
                                e.target.value
                              )
                            }
                            placeholder="No limit"
                          />
                        </td>

                        <td style={tdStyle}>
                          <TextInput
                            type="number"
                            min="0"
                            step="0.25"
                            value={rule.hours}
                            onChange={(e) =>
                              updateLobRuleDraft(
                                index,
                                "hours",
                                e.target.value
                              )
                            }
                          />
                        </td>

                        <td style={tdStyle}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#475569",
                              lineHeight: 1.6,
                            }}
                          >
                            {rule.maxBags === "" ||
                            rule.maxBags === null
                              ? `${rule.minBags || 0}+ bags = ${
                                  rule.hours || 0
                                } hrs`
                              : `${rule.minBags || 0}â${
                                  rule.maxBags
                                } bags = ${
                                  rule.hours || 0
                                } hrs`}
                          </div>
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                          }}
                        >
                          <ActionButton
                            variant="danger"
                            onClick={() =>
                              removeLobRule(index)
                            }
                          >
                            Remove
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#ffffff",
                  border: "1px solid #dbeafe",
                  fontSize: 13,
                  color: "#475569",
                  lineHeight: 1.7,
                }}
              >
                <strong>Calculation example:</strong> if 80 LOB bags
                equal 3 operational hours, and the supervisor reported
                4 agents plus 1 supervisor, the calculation is{" "}
                <strong>4 Ã 3 = 12 Agent Hours</strong> and{" "}
                <strong>1 Ã 3 = 3 Supervisor Hours</strong>, for a
                total of <strong>15 Labor Hours</strong>.
              </div>
            </div>
          )}

          {/* =================================================
              LOB SUMMARY BY AIRLINE
          ================================================= */}

          <div style={{ marginBottom: 22 }}>
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              LOB Summary by Airline
            </h3>

            {lobSummaryByAirline.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                No LOB operations found for the selected filters.
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
                    minWidth: 850,
                    background: "#fff",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fbff" }}>
                      <th style={thStyle()}>Airline</th>
                      <th style={thStyle()}>LOB Flights</th>
                      <th style={thStyle()}>LOB Bags</th>
                      <th style={thStyle()}>Agent Hours</th>
                      <th style={thStyle()}>
                        Supervisor Hours
                      </th>
                      <th style={thStyle()}>Total Hours</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lobSummaryByAirline.map((row, index) => (
                      <tr
                        key={row.airline}
                        style={{
                          background:
                            index % 2 === 0
                              ? "#ffffff"
                              : "#fbfdff",
                        }}
                      >
                        <td style={tdStyle}>
                          <strong>{row.airline}</strong>
                        </td>

                        <td style={tdStyle}>
                          {row.totalFlights}
                        </td>

                        <td style={tdStyle}>
                          {row.totalBags}
                        </td>

                        <td style={tdStyle}>
                          {formatHours(row.agentLaborHours)}
                        </td>

                        <td style={tdStyle}>
                          {formatHours(
                            row.supervisorLaborHours
                          )}
                        </td>

                        <td style={tdStyle}>
                          <strong>
                            {formatHours(row.totalLaborHours)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* =================================================
              ALL FLIGHTS WITH LOBS
          ================================================= */}

          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  Flights With LOBs
                </h3>

                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Total found: {lobReports.length}
                </p>
              </div>
            </div>

            {lobReports.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                No flights with LOBs were reported for this period.
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
                    minWidth: 1450,
                    background: "#fff",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f8fbff" }}>
                      <th style={thStyle()}>Date</th>
                      <th style={thStyle()}>Airline</th>
                      <th style={thStyle()}>Flight</th>
                      <th style={thStyle()}>Supervisor</th>
                      <th style={thStyle()}>LOB Bags</th>
                      <th style={thStyle()}>Agents Used</th>
                      <th style={thStyle()}>
                        Supervisors Used
                      </th>
                      <th style={thStyle()}>
                        Formula Hours
                      </th>
                      <th style={thStyle()}>Agent Hours</th>
                      <th style={thStyle()}>
                        Supervisor Hours
                      </th>
                      <th style={thStyle()}>Total Hours</th>
                      <th
                        style={thStyle({
                          textAlign: "center",
                        })}
                      >
                        Open
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lobReports.map((report, index) => {
                      const labor = calculateLobLabor(
                        report,
                        lobRules
                      );

                      return (
                        <tr
                          key={report.id}
                          style={{
                            background:
                              report.id === selectedId
                                ? "#edf7ff"
                                : index % 2 === 0
                                ? "#ffffff"
                                : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            {report.reportDate || "â"}
                          </td>

                          <td style={tdStyle}>
                            {report.normalizedAirline || "â"}
                          </td>

                          <td style={tdStyle}>
                            {report.flightNumber || "â"}
                          </td>

                          <td style={tdStyle}>
                            {report.supervisorReporting || "â"}
                          </td>

                          <td style={tdStyle}>
                            <strong>{labor.bags}</strong>
                          </td>

                          <td style={tdStyle}>
                            {labor.agents}
                          </td>

                          <td style={tdStyle}>
                            {labor.supervisors}
                          </td>

                          <td style={tdStyle}>
                            {formatHours(labor.operationalHours)}
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatHours(labor.agentLaborHours)}
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatHours(
                                labor.supervisorLaborHours
                              )}
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatHours(labor.totalLaborHours)}
                            </strong>
                          </td>

                          <td
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                            }}
                          >
                            <ActionButton
                              variant="secondary"
                              onClick={() =>
                                setSelectedId(report.id)
                              }
                            >
                              View Report
                            </ActionButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </PageCard>
      )}

      {/* =====================================================
          DELAY SUMMARY
      ===================================================== */}

      {!isSupervisor && (
        <PageCard style={{ padding: 22 }}>
          <div
            style={{
              marginBottom: 14,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Delay Summary
              </h2>

              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Click an airline to view its delayed flight list.
                {filters.dateMode === "custom"
                  ? ` Filter: ${
                      filters.fromDate || "Start"
                    } to ${filters.toDate || "End"}`
                  : ` Filter: ${filters.range}`}
              </p>
            </div>

            {selectedDelayAirline &&
              selectedDelayAirlineReports.length > 0 && (
                <ActionButton
                  variant="secondary"
                  onClick={handlePrintDelaySummary}
                >
                  Print / Export Delay Summary
                </ActionButton>
              )}
          </div>

          {delayedSummaryByAirline.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              No delayed flights found for this filter.
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
                  minWidth: 620,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>
                      Total of Flights Delayed
                    </th>
                    <th
                      style={thStyle({
                        textAlign: "center",
                      })}
                    >
                      Open
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {delayedSummaryByAirline.map(
                    (row, index) => (
                      <tr
                        key={row.airline}
                        style={{
                          background:
                            row.airline ===
                            selectedDelayAirline
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
                              handleSelectDelayAirline(
                                row.airline
                              )
                            }
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#1769aa",
                              fontWeight: 800,
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            {row.airline}
                          </button>
                        </td>

                        <td style={tdStyle}>
                          {row.totalDelayedFlights}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                          }}
                        >
                          <ActionButton
                            variant="secondary"
                            onClick={() =>
                              handleSelectDelayAirline(
                                row.airline
                              )
                            }
                          >
                            View
                          </ActionButton>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {selectedDelayAirline && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    {selectedDelayAirline} Delayed Flights
                  </h3>

                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    Total delayed flights:{" "}
                    {selectedDelayAirlineReports.length}
                  </p>
                </div>
              </div>

              {selectedDelayAirlineReports.length === 0 ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    color: "#64748b",
                    fontWeight: 600,
                  }}
                >
                  No delayed reports found for this airline.
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
                      minWidth: 1100,
                      background: "#fff",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f8fbff" }}>
                        <th style={thStyle()}>Date</th>
                        <th style={thStyle()}>Department</th>
                        <th style={thStyle()}>Airline</th>
                        <th style={thStyle()}>Flight Number</th>
                        <th style={thStyle()}>Delayed Time</th>
                        <th style={thStyle()}>
                          Supervisor on Duty
                        </th>
                        <th style={thStyle()}>
                          Duty Manager in Charge
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {selectedDelayAirlineReports.map(
                        (report, index) => {
                          const dutyManager =
                            report.reviewedBy ||
                            report.readBy ||
                            report.approvedBy ||
                            report.closedBy ||
                            report.archivedBy ||
                            "â";

                          return (
                            <tr
                              key={report.id}
                              style={{
                                background:
                                  index % 2 === 0
                                    ? "#ffffff"
                                    : "#fbfdff",
                              }}
                            >
                              <td style={tdStyle}>
                                {report.reportDate || "â"}
                              </td>

                              <td style={tdStyle}>
                                {report.department || "â"}
                              </td>

                              <td style={tdStyle}>
                                {report.normalizedAirline || "â"}
                              </td>

                              <td style={tdStyle}>
                                {report.flightNumber || "â"}
                              </td>

                              <td style={tdStyle}>
                                {Number(
                                  report.delayedTimeMinutes || 0
                                )}{" "}
                                min
                              </td>

                              <td style={tdStyle}>
                                {report.supervisorReporting || "â"}
                              </td>

                              <td style={tdStyle}>
                                {dutyManager}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </PageCard>
      )}
            <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedReport
            ? "minmax(320px, 0.95fr) minmax(460px, 1.3fr)"
            : "1fr",
          gap: 18,
        }}
      >
        <PageCard style={{ padding: 18, overflow: "hidden" }}>
          <div style={{ marginBottom: 14 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {isSupervisor ? "My Submitted Reports" : "Submitted Reports"}
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Total found: {filteredReports.length}
            </p>
          </div>

          {loading ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              Loading operational reports...
            </div>
          ) : filteredReports.length === 0 ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              No operational reports found.
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
                  minWidth: 1900,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle()}>Department</th>
                    <th style={thStyle()}>Template</th>
                    <th style={thStyle()}>Airline</th>
                    <th style={thStyle()}>Date</th>
                    <th style={thStyle()}>Flight Number</th>
                    <th style={thStyle()}>Flights</th>
                    <th style={thStyle()}>Supervisor</th>
                    <th style={thStyle()}>LOBs</th>
                    <th style={thStyle()}>LOB Bags</th>
                    <th style={thStyle()}>Labor Hours</th>
                    <th style={thStyle()}>Delayed</th>
                    <th style={thStyle()}>Minutes</th>
                    <th style={thStyle()}>Needs Attention</th>
                    <th style={thStyle()}>Status</th>
                    <th style={thStyle()}>Created</th>
                    <th style={thStyle({ textAlign: "center" })}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredReports.map((report, index) => {
                    const lob = getLobData(report);
                    const labor = calculateLobLabor(report, lobRules);

                    return (
                      <tr
                        key={report.id}
                        style={{
                          background:
                            report.id === selectedId
                              ? "#edf7ff"
                              : index % 2 === 0
                              ? "#ffffff"
                              : "#fbfdff",
                        }}
                      >
                        <td style={tdStyle}>
                          {report.department || "â"}
                        </td>

                        <td style={tdStyle}>
                          {getTemplateLabel(report)}
                        </td>

                        <td style={tdStyle}>
                          {report.normalizedAirline || "â"}
                        </td>

                        <td style={tdStyle}>
                          {report.reportDate || "â"}
                        </td>

                        <td style={tdStyle}>
                          {isCabinServiceReport(report)
                            ? "â"
                            : report.flightNumber || "â"}
                        </td>

                        <td style={tdStyle}>
                          {report.flightsHandled || "â"}
                        </td>

                        <td style={tdStyle}>
                          {report.supervisorReporting || "â"}
                        </td>

                        <td style={tdStyle}>
                          {lob.hasLobs ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: "#fff7ed",
                                border: "1px solid #fdba74",
                                color: "#9a3412",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Yes
                            </span>
                          ) : (
                            "No"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {lob.hasLobs ? lob.bags : "â"}
                        </td>

                        <td style={tdStyle}>
                          {lob.hasLobs
                            ? formatHours(labor.totalLaborHours)
                            : "â"}
                        </td>

                        <td style={tdStyle}>
                          {report.delayedFlight ? "Yes" : "No"}
                        </td>

                        <td style={tdStyle}>
                          {Number(report.delayedTimeMinutes || 0)}
                        </td>

                        <td style={tdStyle}>
                          {shouldFlagNeedsAttention(report) ? "Yes" : "No"}
                        </td>

                        <td style={tdStyle}>
                          <span
                            style={getReviewStatusStyle(report.reviewStatus)}
                          >
                            {getReviewStatusLabel(report.reviewStatus)}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          {formatDateTime(report.createdAt)}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              justifyContent: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <ActionButton
                              variant="secondary"
                              onClick={() => setSelectedId(report.id)}
                            >
                              View
                            </ActionButton>

                            {isManager && (
                              <ActionButton
                                variant="warning"
                                onClick={() => startEdit(report)}
                              >
                                Edit
                              </ActionButton>
                            )}

                            {isManager && (
                              <ActionButton
                                variant="danger"
                                onClick={() => deleteReport(report)}
                                disabled={deletingId === report.id}
                              >
                                {deletingId === report.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </ActionButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PageCard>

        {selectedReport && (
          <PageCard style={{ padding: 20 }}>
            {editingId === selectedReport.id && isManager ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#0f172a",
                    }}
                  >
                    Edit Operational Report
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      variant="success"
                      onClick={() => saveEdit(selectedReport)}
                      disabled={savingId === selectedReport.id}
                    >
                      {savingId === selectedReport.id
                        ? "Saving..."
                        : "Save"}
                    </ActionButton>

                    <ActionButton
                      variant="secondary"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </ActionButton>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>Department</FieldLabel>
                    <TextInput
                      value={editForm.department}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          department: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Template</FieldLabel>
                    <TextInput
                      value={editForm.templateLabel}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          templateLabel: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Airline</FieldLabel>
                    <TextInput
                      value={editForm.airline}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          airline: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Report Date</FieldLabel>
                    <TextInput
                      type="date"
                      value={editForm.reportDate}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reportDate: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Shift</FieldLabel>
                    <TextInput
                      value={editForm.shift}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          shift: e.target.value,
                        }))
                      }
                    />
                  </div>

                  {!isCabinServiceReport(editForm) && (
                    <div>
                      <FieldLabel>Flight Number</FieldLabel>
                      <TextInput
                        value={editForm.flightNumber}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            flightNumber: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}

                  <div>
                    <FieldLabel>
                      {isCabinServiceReport(editForm)
                        ? "Flights Serviced"
                        : "Flights Handled"}
                    </FieldLabel>

                    <TextInput
                      value={editForm.flightsHandled}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          flightsHandled: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Supervisor Reporting</FieldLabel>
                    <TextInput
                      value={editForm.supervisorReporting}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          supervisorReporting: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Flight</FieldLabel>
                    <SelectInput
                      value={editForm.delayedFlight ? "Yes" : "No"}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedFlight: e.target.value === "Yes",
                        }))
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </SelectInput>
                  </div>

                  <div>
                    <FieldLabel>Delayed Time (minutes)</FieldLabel>
                    <TextInput
                      type="number"
                      value={editForm.delayedTimeMinutes}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedTimeMinutes: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <FieldLabel>Delayed Code Reported</FieldLabel>
                    <TextInput
                      value={editForm.delayedCodeReported}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          delayedCodeReported: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* LOB EDITING */}

                <div
                  style={{
                    borderRadius: 18,
                    border: "1px solid #fdba74",
                    background: "#fff7ed",
                    padding: 18,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#9a3412",
                      marginBottom: 14,
                    }}
                  >
                    LOB Information
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div>
                      <FieldLabel>Did this flight have LOBs?</FieldLabel>

                      <SelectInput
                        value={
                          parseBooleanLike(
                            editForm.responses?.lobs
                          )
                            ? "Yes"
                            : "No"
                        }
                        onChange={(e) => {
                          const hasLobs = e.target.value === "Yes";

                          setEditForm((prev) => ({
                            ...prev,
                            responses: {
                              ...(prev.responses || {}),
                              lobs: hasLobs ? "Yes" : "No",
                              lob_bags: hasLobs
                                ? prev.responses?.lob_bags || ""
                                : "",
                              lob_agents_used: hasLobs
                                ? prev.responses?.lob_agents_used || ""
                                : "",
                              lob_supervisors_used: hasLobs
                                ? prev.responses?.lob_supervisors_used || ""
                                : "",
                            },
                          }));
                        }}
                      >
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </SelectInput>
                    </div>

                    {parseBooleanLike(editForm.responses?.lobs) && (
                      <>
                        <div>
                          <FieldLabel>Total LOB Bags</FieldLabel>
                          <TextInput
                            type="number"
                            min="0"
                            value={
                              editForm.responses?.lob_bags || ""
                            }
                            onChange={(e) =>
                              handleDynamicResponseChange(
                                "lob_bags",
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div>
                          <FieldLabel>Agents Used</FieldLabel>
                          <TextInput
                            type="number"
                            min="0"
                            value={
                              editForm.responses?.lob_agents_used ||
                              ""
                            }
                            onChange={(e) =>
                              handleDynamicResponseChange(
                                "lob_agents_used",
                                e.target.value
                              )
                            }
                          />
                        </div>

                        <div>
                          <FieldLabel>Supervisors Used</FieldLabel>
                          <TextInput
                            type="number"
                            min="0"
                            value={
                              editForm.responses
                                ?.lob_supervisors_used || ""
                            }
                            onChange={(e) =>
                              handleDynamicResponseChange(
                                "lob_supervisors_used",
                                e.target.value
                              )
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {parseBooleanLike(editForm.responses?.lobs) && (
                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {(() => {
                        const previewReport = {
                          ...selectedReport,
                          responses: editForm.responses,
                        };

                        const labor = calculateLobLabor(
                          previewReport,
                          lobRules
                        );

                        return (
                          <>
                            <InfoCard
                              label="Formula Hours"
                              value={formatHours(
                                labor.operationalHours
                              )}
                            />

                            <InfoCard
                              label="Agent Labor Hours"
                              value={formatHours(
                                labor.agentLaborHours
                              )}
                            />

                            <InfoCard
                              label="Supervisor Labor Hours"
                              value={formatHours(
                                labor.supervisorLaborHours
                              )}
                            />

                            <InfoCard
                              label="Total Labor Hours"
                              value={formatHours(
                                labor.totalLaborHours
                              )}
                            />
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel>Delayed Reason</FieldLabel>
                  <TextArea
                    value={editForm.delayedReason}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        delayedReason: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Notes</FieldLabel>
                  <TextArea
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                  />
                </div>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.needsAttention}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        needsAttention: e.target.checked,
                      }))
                    }
                  />

                  Needs Attention
                </label>

                <div>
                  <FieldLabel>Manager Notes</FieldLabel>
                  <TextArea
                    value={editForm.managerNotes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        managerNotes: e.target.value,
                      }))
                    }
                  />
                </div>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editForm.followUpRequired}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        followUpRequired: e.target.checked,
                        reviewStatus: e.target.checked
                          ? "follow_up_required"
                          : prev.reviewStatus,
                      }))
                    }
                  />

                  Follow Up Required
                </label>

                <div>
                  <FieldLabel>Follow Up Action</FieldLabel>
                  <TextArea
                    value={editForm.followUpAction}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        followUpAction: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Follow Up Details</FieldLabel>
                  <TextArea
                    value={editForm.followUpDetails}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        followUpDetails: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Dynamic Responses</FieldLabel>

                  <div style={{ display: "grid", gap: 12 }}>
                    {Object.entries(editForm.responses || {}).length ===
                    0 ? (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No dynamic responses found.
                      </div>
                    ) : (
                      Object.entries(editForm.responses || {})
                        .filter(
                          ([key]) =>
                            ![
                              "lobs",
                              "lob_bags",
                              "lob_agents_used",
                              "lob_supervisors_used",
                            ].includes(key)
                        )
                        .map(([key, value]) => (
                          <div key={key}>
                            <FieldLabel>
                              {prettifyKey(key)}
                            </FieldLabel>

                            <TextArea
                              value={
                                Array.isArray(value)
                                  ? value.join(", ")
                                  : String(value ?? "")
                              }
                              onChange={(e) =>
                                handleDynamicResponseChange(
                                  key,
                                  e.target.value
                                )
                              }
                              style={{ minHeight: 70 }}
                            />
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 22,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      Report Detail
                    </h2>

                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      {getTemplateLabel(selectedReport)} Â·{" "}
                      {selectedReport.normalizedAirline || "â"} Â·{" "}
                      {selectedReport.reportDate || "â"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <ActionButton
                      variant="secondary"
                      onClick={handlePrintExport}
                    >
                      Print / Export PDF
                    </ActionButton>

                    {isManager && (
                      <ActionButton
                        variant="warning"
                        onClick={() => startEdit(selectedReport)}
                      >
                        Edit
                      </ActionButton>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <InfoCard
                    label="Department"
                    value={selectedReport.department || "â"}
                  />

                  <InfoCard
                    label="Template"
                    value={getTemplateLabel(selectedReport)}
                  />

                  <InfoCard
                    label="Airline"
                    value={selectedReport.normalizedAirline || "â"}
                  />

                  <InfoCard
                    label="Report Date"
                    value={selectedReport.reportDate || "â"}
                  />

                  <InfoCard
                    label="Shift"
                    value={selectedReport.shift || "â"}
                  />

                  <InfoCard
                    label={
                      isCabinServiceReport(selectedReport)
                        ? "Flights Serviced"
                        : "Flights Handled"
                    }
                    value={selectedReport.flightsHandled || "â"}
                  />

                  {!isCabinServiceReport(selectedReport) && (
                    <InfoCard
                      label="Flight Number"
                      value={selectedReport.flightNumber || "â"}
                    />
                  )}

                  <InfoCard
                    label="Supervisor"
                    value={selectedReport.supervisorReporting || "â"}
                  />

                  <InfoCard
                    label="Delayed Flight"
                    value={
                      selectedReport.delayedFlight ? "Yes" : "No"
                    }
                  />

                  <InfoCard
                    label="Delayed Time"
                    value={`${Number(
                      selectedReport.delayedTimeMinutes || 0
                    )} min`}
                  />

                  <InfoCard
                    label="Delayed Code"
                    value={
                      selectedReport.delayedCodeReported || "â"
                    }
                  />

                  <InfoCard
                    label="Review Status"
                    value={getReviewStatusLabel(
                      selectedReport.reviewStatus
                    )}
                  />
                </div>

                {/* LOB DETAIL */}

                {(() => {
                  const lob = getLobData(selectedReport);

                  if (!lob.hasLobs) return null;

                  const labor = calculateLobLabor(
                    selectedReport,
                    lobRules
                  );

                  return (
                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        background: "#fff7ed",
                        border: "1px solid #fdba74",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color: "#9a3412",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            LOB Operation
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 18,
                              fontWeight: 900,
                              color: "#7c2d12",
                            }}
                          >
                            LOBs Reported
                          </div>
                        </div>

                        <span
                          style={{
                            display: "inline-flex",
                            padding: "7px 12px",
                            borderRadius: 999,
                            background: "#ffffff",
                            border: "1px solid #fdba74",
                            color: "#9a3412",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          {lob.bags} Bags
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 12,
                        }}
                      >
                        <InfoCard
                          label="LOB Bags"
                          value={lob.bags}
                        />

                        <InfoCard
                          label="Agents Used"
                          value={lob.agents}
                        />

                        <InfoCard
                          label="Supervisors Used"
                          value={lob.supervisors}
                        />

                        <InfoCard
                          label="Formula Hours"
                          value={formatHours(
                            labor.operationalHours
                          )}
                        />

                        <InfoCard
                          label="Agent Labor Hours"
                          value={formatHours(
                            labor.agentLaborHours
                          )}
                        />

                        <InfoCard
                          label="Supervisor Labor Hours"
                          value={formatHours(
                            labor.supervisorLaborHours
                          )}
                        />

                        <InfoCard
                          label="Total Labor Hours"
                          value={formatHours(
                            labor.totalLaborHours
                          )}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          padding: "12px 14px",
                          borderRadius: 14,
                          background: "#ffffff",
                          border: "1px solid #fed7aa",
                          color: "#7c2d12",
                          fontSize: 13,
                          lineHeight: 1.7,
                        }}
                      >
                        <strong>Calculation:</strong>{" "}
                        {lob.agents} agents Ã{" "}
                        {formatHours(labor.operationalHours)} ={" "}
                        <strong>
                          {formatHours(labor.agentLaborHours)}
                        </strong>{" "}
                        agent hours. {lob.supervisors} supervisor(s) Ã{" "}
                        {formatHours(labor.operationalHours)} ={" "}
                        <strong>
                          {formatHours(
                            labor.supervisorLaborHours
                          )}
                        </strong>{" "}
                        supervisor hours.
                      </div>
                    </div>
                  );
                })()}

                <DetailBox
                  label="Delayed Reason"
                  value={selectedReport.delayedReason || "â"}
                />

                <DetailBox
                  label="Notes"
                  value={selectedReport.notes || "â"}
                />

                <DetailBox
                  label="Manager Notes"
                  value={selectedReport.managerNotes || "â"}
                />

                <DetailBox
                  label="Follow Up Action"
                  value={selectedReport.followUpAction || "â"}
                />

                <DetailBox
                  label="Follow Up Details"
                  value={selectedReport.followUpDetails || "â"}
                />

                {(selectedReport.readBy ||
                  selectedReport.approvedBy ||
                  selectedReport.closedBy ||
                  selectedReport.archivedBy) && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <InfoCard
                      label="Read By"
                      value={selectedReport.readBy || "â"}
                    />

                    <InfoCard
                      label="Read At"
                      value={formatDateTime(selectedReport.readAt)}
                    />

                    <InfoCard
                      label="Approved By"
                      value={selectedReport.approvedBy || "â"}
                    />

                    <InfoCard
                      label="Approved At"
                      value={formatDateTime(
                        selectedReport.approvedAt
                      )}
                    />

                    <InfoCard
                      label="Closed By"
                      value={selectedReport.closedBy || "â"}
                    />

                    <InfoCard
                      label="Closed At"
                      value={formatDateTime(selectedReport.closedAt)}
                    />

                    <InfoCard
                      label="Archived By"
                      value={selectedReport.archivedBy || "â"}
                    />

                    <InfoCard
                      label="Archived At"
                      value={formatDateTime(
                        selectedReport.archivedAt
                      )}
                    />
                  </div>
                )}

                {shouldFlagNeedsAttention(selectedReport) && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      color: "#9f1239",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    This report needs attention because the operation
                    indicates issues, delay, safety concern, or
                    incomplete completion.
                  </div>
                )}

                {selectedReport.delayedFlight && (
                  <div
                    style={{
                      borderRadius: 16,
                      padding: "14px 16px",
                      background: "#fff7ed",
                      border: "1px solid #fdba74",
                      color: "#9a3412",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    Delay Alert:{" "}
                    {selectedReport.normalizedAirline || "Unknown"}{" "}
                    reported a delay of{" "}
                    {Number(
                      selectedReport.delayedTimeMinutes || 0
                    )}{" "}
                    minutes.
                    {Number(
                      selectedReport.delayedTimeMinutes || 0
                    ) > 4
                      ? " Duty Mgrs Follow up needed."
                      : ""}
                  </div>
                )}

                {isManager && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      {selectedReport.reviewStatus !== "read" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() =>
                            updateWorkflowStatus(
                              selectedReport,
                              "read"
                            )
                          }
                          disabled={
                            actionId === selectedReport.id
                          }
                        >
                          Mark Read
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !==
                        "approved" && (
                        <ActionButton
                          variant="success"
                          onClick={() =>
                            updateWorkflowStatus(
                              selectedReport,
                              "approved"
                            )
                          }
                          disabled={
                            actionId === selectedReport.id
                          }
                        >
                          Approve
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !==
                        "follow_up_required" && (
                        <ActionButton
                          variant="warning"
                          onClick={() =>
                            updateWorkflowStatus(
                              selectedReport,
                              "follow_up_required"
                            )
                          }
                          disabled={
                            actionId === selectedReport.id
                          }
                        >
                          Require Follow Up
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !== "closed" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() =>
                            updateWorkflowStatus(
                              selectedReport,
                              "closed"
                            )
                          }
                          disabled={
                            actionId === selectedReport.id
                          }
                        >
                          Close Report
                        </ActionButton>
                      )}

                      {selectedReport.reviewStatus !==
                        "archived" && (
                        <ActionButton
                          variant="secondary"
                          onClick={() =>
                            updateWorkflowStatus(
                              selectedReport,
                              "archived"
                            )
                          }
                          disabled={
                            actionId === selectedReport.id
                          }
                        >
                          Archive
                        </ActionButton>
                      )}
                    </div>

                    <div
                      style={{
                        borderRadius: 16,
                        padding: "14px 16px",
                        background: "#f8fbff",
                        border: "1px solid #dbeafe",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 8,
                        }}
                      >
                        Follow Up Manager Entry
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        <div>
                          <FieldLabel>Manager Notes</FieldLabel>

                          <TextArea
                            value={editForm.managerNotes}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                managerNotes: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div>
                          <FieldLabel>Follow Up Action</FieldLabel>

                          <TextArea
                            value={editForm.followUpAction}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                followUpAction: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div>
                          <FieldLabel>Follow Up Details</FieldLabel>

                          <TextArea
                            value={editForm.followUpDetails}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                followUpDetails: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <ActionButton
                            variant="warning"
                            onClick={() =>
                              saveFollowUp(selectedReport)
                            }
                            disabled={
                              actionId === selectedReport.id
                            }
                          >
                            Save Follow Up
                          </ActionButton>

                          <ActionButton
                            variant="secondary"
                            onClick={() =>
                              startEdit(selectedReport)
                            }
                          >
                            Sync From Report
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#64748b",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 8,
                    }}
                  >
                    Dynamic Responses
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {Object.entries(
                      selectedReport.responses || {}
                    ).filter(
                      ([key]) =>
                        ![
                          "lobs",
                          "lob_bags",
                          "lob_agents_used",
                          "lob_supervisors_used",
                        ].includes(key)
                    ).length === 0 ? (
                      <div
                        style={{
                          borderRadius: 14,
                          padding: "12px 14px",
                          background: "#f8fbff",
                          border: "1px solid #dbeafe",
                          color: "#64748b",
                          fontWeight: 600,
                        }}
                      >
                        No dynamic responses found.
                      </div>
                    ) : (
                      Object.entries(
                        selectedReport.responses || {}
                      )
                        .filter(
                          ([key]) =>
                            ![
                              "lobs",
                              "lob_bags",
                              "lob_agents_used",
                              "lob_supervisors_used",
                            ].includes(key)
                        )
                        .map(([key, value]) => (
                          <div
                            key={key}
                            style={{
                              borderRadius: 14,
                              padding: "12px 14px",
                              background: "#f8fbff",
                              border: "1px solid #dbeafe",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: "#64748b",
                                marginBottom: 4,
                              }}
                            >
                              {prettifyKey(key)}
                            </div>

                            <div
                              style={{
                                fontSize: 14,
                                color: "#0f172a",
                                fontWeight: 600,
                                whiteSpace: "pre-line",
                              }}
                            >
                              {Array.isArray(value)
                                ? value.join(", ")
                                : String(value || "â")}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </PageCard>
        )}
      </div>
    </div>
  );
}
