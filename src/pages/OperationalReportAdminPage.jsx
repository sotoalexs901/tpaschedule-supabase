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

  if (!d) return "—";

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

  return String(value ?? "—");
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
  Default formula.

  Management will later be able to edit this formula.

  Example:

  1 - 40 bags  = 1 hour
  41 - 80 bags = 3 hours
  81+ bags     = 4 hours

  The last range is intentionally included so reports
  above 80 bags always receive an estimated time.
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

function toSafeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, number);
}

/*
  These helpers support the new direct Firestore fields
  and also provide fallback support in case the values
  are stored inside responses.
*/

function getReportHasLobs(report) {
  return parseBooleanLike(
    report?.hasLobs ??
      report?.responses?.hasLobs ??
      report?.responses?.has_lobs ??
      report?.responses?.lobs
  );
}

function getReportLobBagCount(report) {
  return toSafeNumber(
    report?.lobBagCount ??
      report?.responses?.lobBagCount ??
      report?.responses?.lob_bag_count ??
      report?.responses?.lobBags ??
      report?.responses?.lob_bags
  );
}

function getReportLobAgentsUsed(report) {
  return toSafeNumber(
    report?.lobAgentsUsed ??
      report?.responses?.lobAgentsUsed ??
      report?.responses?.lob_agents_used ??
      report?.responses?.agentsUsedForLobs
  );
}

function getReportLobSupervisorsUsed(report) {
  return toSafeNumber(
    report?.lobSupervisorsUsed ??
      report?.responses?.lobSupervisorsUsed ??
      report?.responses?.lob_supervisors_used ??
      report?.responses?.supervisorsUsedForLobs
  );
}

/*
  Finds the estimated operational hours based on
  the number of LOB bags and the current management rules.
*/

function calculateLobEstimatedHours(bagCount, rules) {
  const bags = toSafeNumber(bagCount);

  if (bags <= 0) {
    return 0;
  }

  const normalizedRules = Array.isArray(rules)
    ? [...rules]
        .map((rule) => ({
          ...rule,
          minBags: toSafeNumber(rule.minBags),
          maxBags:
            rule.maxBags === null ||
            rule.maxBags === "" ||
            typeof rule.maxBags === "undefined"
              ? null
              : toSafeNumber(rule.maxBags),
          hours: toSafeNumber(rule.hours),
        }))
        .sort((a, b) => a.minBags - b.minBags)
    : DEFAULT_LOB_RULES;

  const matchingRule = normalizedRules.find((rule) => {
    const meetsMinimum = bags >= rule.minBags;

    const meetsMaximum =
      rule.maxBags === null ||
      bags <= rule.maxBags;

    return meetsMinimum && meetsMaximum;
  });

  if (matchingRule) {
    return toSafeNumber(matchingRule.hours);
  }

  /*
    Safety fallback:
    if bags exceed all configured ranges,
    use the last rule.
  */

  const lastRule =
    normalizedRules[normalizedRules.length - 1];

  return lastRule
    ? toSafeNumber(lastRule.hours)
    : 0;
}

/*
  Main LOB calculation.

  Example:
  Bags: 80
  Agents: 4
  Supervisors: 1
  Estimated time: 3 hrs

  Agent Hours:
  4 x 3 = 12

  Supervisor Hours:
  1 x 3 = 3

  Total:
  12 + 3 = 15 labor hours
*/

function calculateLobLabor(report, rules) {
  const bags = getReportLobBagCount(report);

  const agents = getReportLobAgentsUsed(report);

  const supervisors =
    getReportLobSupervisorsUsed(report);

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
  const number = toSafeNumber(value);

  if (Number.isInteger(number)) {
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
      responses?.operation_status || ""
    ).toLowerCase();

  const safetyConcern =
    String(
      responses?.safety_concern || ""
    ).toLowerCase();

  const delayedFlight =
    String(
      responses?.delayed_flight || ""
    ).toLowerCase() === "yes" ||
    String(
      responses?.delayed_flight_impact || ""
    ).toLowerCase() === "yes" ||
    String(
      responses?.service_delays || ""
    ).toLowerCase() === "yes";

  if (
    operationStatus.includes("not completed") ||
    operationStatus.includes("remarks")
  ) {
    return true;
  }

  if (safetyConcern === "yes") {
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

  if (value === "follow_up_required") {
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
    border: "1px solid transparent",
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

  if (value === "follow_up_required") {
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
  const responses =
    report?.responses || {};

  const lobCalculation =
    calculateLobLabor(
      report,
      lobRules
    );

  const hasLobs =
    getReportHasLobs(report);

  const dynamicBlocks =
    Object.entries(responses).length === 0
      ? `
        <div class="detail-box">
          <div class="detail-label">
            Dynamic Responses
          </div>

          <div class="detail-value">
            No dynamic responses found.
          </div>
        </div>
      `
      : Object.entries(responses)
          .map(
            ([key, value]) => `
              <div class="detail-box">

                <div class="detail-label">
                  ${escapeHtml(
                    prettifyKey(key)
                  )}
                </div>

                <div class="detail-value">
                  ${escapeHtml(
                    formatResponseValue(value)
                  ).replace(
                    /\n/g,
                    "<br/>"
                  )}
                </div>

              </div>
            `
          )
          .join("");

  const alertNeedsAttention =
    shouldFlagNeedsAttention(report)
      ? `
        <div class="alert alert-danger">
          This report needs attention because the operation indicates issues, delay, safety concern, or incomplete completion.
        </div>
      `
      : "";

  const alertDelay =
    report?.delayedFlight
      ? `
        <div class="alert alert-warning">

          Delay Alert:
          ${escapeHtml(
            report.normalizedAirline ||
              "Unknown"
          )}

          reported a delay of

          ${escapeHtml(
            String(
              Number(
                report.delayedTimeMinutes ||
                  0
              )
            )
          )}

          minutes.

          ${
            Number(
              report.delayedTimeMinutes ||
                0
            ) > 4
              ? "Duty Mgrs Follow up needed."
              : ""
          }

        </div>
      `
      : "";

  /*
    New LOB section in printed report.
  */

  const lobSection =
    hasLobs
      ? `
        <div class="lob-section">

          <div class="lob-title">
            Left Behind Bags (LOB)
          </div>

          <div class="lob-grid">

            <div class="lob-card">
              <div class="detail-label">
                LOB Bags
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  String(
                    lobCalculation.bags
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Agents Used
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  String(
                    lobCalculation.agents
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Supervisors Used
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  String(
                    lobCalculation.supervisors
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Estimated Hours
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  formatHours(
                    lobCalculation.estimatedHours
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Agent Labor Hours
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  formatHours(
                    lobCalculation.agentLaborHours
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Supervisor Labor Hours
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  formatHours(
                    lobCalculation.supervisorLaborHours
                  )
                )}
              </div>
            </div>

            <div class="lob-card">
              <div class="detail-label">
                Total Labor Hours
              </div>
              <div class="lob-value">
                ${escapeHtml(
                  formatHours(
                    lobCalculation.totalLaborHours
                  )
                )}
              </div>
            </div>

          </div>

        </div>
      `
      : "";

  const managerSection = `
    <div class="detail-box">

      <div class="detail-label">
        Review Status
      </div>

      <div class="detail-value">
        ${escapeHtml(
          getReviewStatusLabel(
            report.reviewStatus
          )
        )}
      </div>

    </div>

    <div class="detail-box">

      <div class="detail-label">
        Manager Notes
      </div>

      <div class="detail-value">
        ${escapeHtml(
          report.managerNotes || "—"
        ).replace(
          /\n/g,
          "<br/>"
        )}
      </div>

    </div>

    <div class="detail-box">

      <div class="detail-label">
        Follow Up Action
      </div>

      <div class="detail-value">
        ${escapeHtml(
          report.followUpAction || "—"
        ).replace(
          /\n/g,
          "<br/>"
        )}
      </div>

    </div>

    <div class="detail-box">

      <div class="detail-label">
        Follow Up Details
      </div>

      <div class="detail-value">
        ${escapeHtml(
          report.followUpDetails || "—"
        ).replace(
          /\n/g,
          "<br/>"
        )}
      </div>

    </div>
  `;

  return `
    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="utf-8" />

        <title>
          Operational Report
        </title>

        <style>

          body {
            font-family:
              Arial,
              Helvetica,
              sans-serif;

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

          .grid {
            display: grid;

            grid-template-columns:
              repeat(
                4,
                minmax(0, 1fr)
              );

            gap: 12px;

            margin-bottom: 18px;
          }

          .info-card {
            background: #f8fbff;

            border:
              1px solid #dbeafe;

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

            border:
              1px solid #dbeafe;

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

            border:
              1px solid #fecdd3;

            color: #9f1239;
          }

          .alert-warning {
            background: #fff7ed;

            border:
              1px solid #fdba74;

            color: #9a3412;
          }

          .lob-section {
            margin:
              18px 0;

            padding: 18px;

            border-radius: 16px;

            border:
              2px solid #bae6fd;

            background: #f0f9ff;
          }

          .lob-title {
            font-size: 18px;

            font-weight: 900;

            color: #075985;

            margin-bottom: 14px;
          }

          .lob-grid {
            display: grid;

            grid-template-columns:
              repeat(
                4,
                minmax(0, 1fr)
              );

            gap: 10px;
          }

          .lob-card {
            background: #ffffff;

            border:
              1px solid #bae6fd;

            border-radius: 12px;

            padding: 12px;
          }

          .lob-value {
            font-size: 18px;

            font-weight: 900;

            color: #0c4a6e;
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

          <h1 class="title">
            Operational Report
          </h1>

          <div class="subtitle">

            ${escapeHtml(
              getTemplateLabel(report)
            )}

            ·

            ${escapeHtml(
              report.normalizedAirline ||
                "—"
            )}

            ·

            ${escapeHtml(
              report.reportDate ||
                "—"
            )}

          </div>

        </div>

        <div class="grid">

          <div class="info-card">

            <div class="info-label">
              Department
            </div>

            <div class="info-value">
              ${escapeHtml(
                report.department ||
                  "—"
              )}
            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Template
            </div>

            <div class="info-value">
              ${escapeHtml(
                getTemplateLabel(
                  report
                )
              )}
            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Airline
            </div>

            <div class="info-value">
              ${escapeHtml(
                report.normalizedAirline ||
                  "—"
              )}
            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Report Date
            </div>

            <div class="info-value">
              ${escapeHtml(
                report.reportDate ||
                  "—"
              )}
            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Shift
            </div>

            <div class="info-value">
              ${escapeHtml(
                report.shift ||
                  "—"
              )}
            </div>

          </div>

          <div class="info-card">

            <div class="info-label">

              ${
                isCabinServiceReport(
                  report
                )
                  ? "Flights Serviced"
                  : "Flights Handled"
              }

            </div>

            <div class="info-value">

              ${escapeHtml(
                report.flightsHandled ||
                  "—"
              )}

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Flight Number
            </div>

            <div class="info-value">

              ${escapeHtml(
                report.flightNumber ||
                  "—"
              )}

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Supervisor
            </div>

            <div class="info-value">

              ${escapeHtml(
                report.supervisorReporting ||
                  "—"
              )}

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Delayed Flight
            </div>

            <div class="info-value">

              ${
                report.delayedFlight
                  ? "Yes"
                  : "No"
              }

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Delayed Time
            </div>

            <div class="info-value">

              ${escapeHtml(
                String(
                  Number(
                    report.delayedTimeMinutes ||
                      0
                  )
                )
              )}

              min

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Delayed Code
            </div>

            <div class="info-value">

              ${escapeHtml(
                report.delayedCodeReported ||
                  "—"
              )}

            </div>

          </div>

          <div class="info-card">

            <div class="info-label">
              Review Status
            </div>

            <div class="info-value">

              ${escapeHtml(
                getReviewStatusLabel(
                  report.reviewStatus
                )
              )}

            </div>

          </div>

        </div>

        ${alertNeedsAttention}

        ${alertDelay}

        ${lobSection}

        <div class="detail-box">

          <div class="detail-label">
            Delayed Reason
          </div>

          <div class="detail-value">

            ${escapeHtml(
              report.delayedReason ||
                "—"
            ).replace(
              /\n/g,
              "<br/>"
            )}

          </div>

        </div>

        <div class="detail-box">

          <div class="detail-label">
            Notes
          </div>

          <div class="detail-value">

            ${escapeHtml(
              report.notes ||
                "—"
            ).replace(
              /\n/g,
              "<br/>"
            )}

          </div>

        </div>

        ${managerSection}

        ${dynamicBlocks}

      </body>

    </html>
  `;
}

/* =========================================================
   DELAY SUMMARY PRINT
========================================================= */

function buildDelaySummaryPrintableHtml(
  airline,
  reports,
  range
) {
  const rowsHtml = reports
    .map((report) => {
      const dutyManager =
        report.reviewedBy ||
        report.readBy ||
        report.approvedBy ||
        report.closedBy ||
        report.archivedBy ||
        "—";

      return `
        <tr>

          <td>
            ${escapeHtml(
              report.reportDate ||
                "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              report.department ||
                "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              report.normalizedAirline ||
                "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              report.flightNumber ||
                "—"
            )}
          </td>

          <td>

            ${escapeHtml(
              String(
                Number(
                  report.delayedTimeMinutes ||
                    0
                )
              )
            )}

            min

          </td>

          <td>
            ${escapeHtml(
              report.supervisorReporting ||
                "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              dutyManager
            )}
          </td>

        </tr>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="utf-8" />

        <title>
          Delay Summary
        </title>

        <style>

          body {
            font-family:
              Arial,
              Helvetica,
              sans-serif;

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

            border:
              1px solid #dbeafe;

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
            border:
              1px solid #dbeafe;

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

        <h1>
          Delay Summary
        </h1>

        <div class="subtitle">

          ${escapeHtml(
            airline
          )}

          ·

          ${escapeHtml(
            range
          )}

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

              <th>
                Date
              </th>

              <th>
                Department
              </th>

              <th>
                Airline
              </th>

              <th>
                Flight Number
              </th>

              <th>
                Delayed Time
              </th>

              <th>
                Supervisor on Duty
              </th>

              <th>
                Duty Manager in Charge
              </th>

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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
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
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
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
        boxSizing: "border-box",
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

function InfoCard({
  label,
  value,
  accent = false,
}) {
  return (
    <div
      style={{
        background: accent ? "#f0f9ff" : "#f8fbff",
        border: accent
          ? "1px solid #bae6fd"
          : "1px solid #dbeafe",
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: accent ? "#0369a1" : "#64748b",
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
          color: accent ? "#0c4a6e" : "#0f172a",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailBox({
  label,
  value,
}) {
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

/* =========================================================
   LOB UI COMPONENTS
========================================================= */

function LobMetricCard({
  label,
  value,
  subtitle = "",
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #bae6fd",
        borderRadius: 18,
        padding: "16px 18px",
        boxShadow: "0 8px 20px rgba(14,116,144,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          color: "#0369a1",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 7,
          fontSize: 26,
          fontWeight: 900,
          color: "#0c4a6e",
          lineHeight: 1,
        }}
      >
        {value}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: 7,
            fontSize: 12,
            fontWeight: 600,
            color: "#64748b",
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function LobBadge({
  children,
  variant = "blue",
}) {
  const variants = {
    blue: {
      background: "#e0f2fe",
      border: "#bae6fd",
      color: "#075985",
    },

    green: {
      background: "#dcfce7",
      border: "#86efac",
      color: "#166534",
    },

    orange: {
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

  const selected =
    variants[variant] ||
    variants.blue;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 900,
        background: selected.background,
        border: `1px solid ${selected.border}`,
        color: selected.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function OperationalReportAdminPage() {
  const { user } = useUser();

  const normalizedUsername =
    String(user?.username || "")
      .trim()
      .toLowerCase();

  const isCabinDutyManager =
    user?.role === "duty_manager" &&
    normalizedUsername === "hhernandez";

  const isSupervisor =
    user?.role === "supervisor";

  const isManager =
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  const canAccess =
    user?.role === "supervisor" ||
    user?.role === "duty_manager" ||
    user?.role === "station_manager";

  /* =======================================================
     GENERAL REPORT STATE
  ======================================================= */

  const [reports, setReports] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const [
    selectedId,
    setSelectedId,
  ] = useState("");

  const [
    editingId,
    setEditingId,
  ] = useState("");

  const [
    savingId,
    setSavingId,
  ] = useState("");

  const [
    deletingId,
    setDeletingId,
  ] = useState("");

  const [
    actionId,
    setActionId,
  ] = useState("");

  const [
    selectedDelayAirline,
    setSelectedDelayAirline,
  ] = useState("");

  /* =======================================================
     LOB MANAGEMENT STATE
  ======================================================= */

  const [
    lobRules,
    setLobRules,
  ] = useState(DEFAULT_LOB_RULES);

  const [
    lobRulesLoading,
    setLobRulesLoading,
  ] = useState(true);

  const [
    lobRulesSaving,
    setLobRulesSaving,
  ] = useState(false);

  const [
    lobRulesEditing,
    setLobRulesEditing,
  ] = useState(false);

  const [
    lobRuleDraft,
    setLobRuleDraft,
  ] = useState(DEFAULT_LOB_RULES);

  const [
    selectedLobReportId,
    setSelectedLobReportId,
  ] = useState("");

  /*
    Management view:
    reports = regular Operational Reports
    lobs    = only flights that reported LOBs
  */

  const [
    managementView,
    setManagementView,
  ] = useState("reports");

  /* =======================================================
     FILTERS
  ======================================================= */

  const [
    filters,
    setFilters,
  ] = useState({
    airline: "all",
    department: "all",
    lifecycle: "active",
    dateMode: "quick",
    range: "today",
    fromDate: "",
    toDate: "",
  });

  /* =======================================================
     EDIT FORM
  ======================================================= */

  const [
    editForm,
    setEditForm,
  ] = useState({
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

    /*
      LOB fields are also editable by management.
    */

    hasLobs: false,
    lobBagCount: "",
    lobAgentsUsed: "",
    lobSupervisorsUsed: "",
  });

  /* =======================================================
     LOAD OPERATIONAL REPORTS
  ======================================================= */

  useEffect(() => {
    async function loadReports() {
      try {
        const q = query(
          collection(
            db,
            "operational_reports"
          ),
          orderBy(
            "createdAt",
            "desc"
          )
        );

        const snap =
          await getDocs(q);

        let rows =
          snap.docs.map((d) => {
            const data =
              d.data();

            const row = {
              id: d.id,

              ...data,

              normalizedAirline:
                normalizeAirlineName(
                  data.airline
                ),

              normalizedDepartment:
                normalizeDepartmentValue(
                  data.templateKey ||
                    data.department ||
                    data.airline
                ),

              reviewStatus:
                data.reviewStatus ||
                "submitted",

              managerNotes:
                data.managerNotes ||
                "",

              followUpRequired:
                Boolean(
                  data.followUpRequired
                ),

              followUpAction:
                data.followUpAction ||
                "",

              followUpDetails:
                data.followUpDetails ||
                "",

              archived:
                Boolean(
                  data.archived
                ),
            };

            /*
              Normalize LOB information when loading.

              This supports both:
              - direct fields
              - responses fields
            */

            return {
              ...row,

              hasLobs:
                getReportHasLobs(row),

              lobBagCount:
                getReportLobBagCount(row),

              lobAgentsUsed:
                getReportLobAgentsUsed(row),

              lobSupervisorsUsed:
                getReportLobSupervisorsUsed(
                  row
                ),
            };
          });

        if (isCabinDutyManager) {
          rows =
            rows.filter(
              (row) =>
                row.normalizedDepartment ===
                "cabin_service"
            );
        }

        setReports(rows);
      } catch (err) {
        console.error(
          "Error loading operational reports:",
          err
        );

        setStatusMessage(
          "Could not load operational reports."
        );
      } finally {
        setLoading(false);
      }
    }

    if (canAccess) {
      loadReports();
    } else {
      setLoading(false);
    }
  }, [
    canAccess,
    isCabinDutyManager,
  ]);

  /* =======================================================
     LOAD LOB FORMULA
  ======================================================= */

  useEffect(() => {
    async function loadLobRules() {
      /*
        Supervisors do not need access to management
        formula configuration.
      */

      if (!isManager) {
        setLobRulesLoading(false);
        return;
      }

      try {
        setLobRulesLoading(true);

        /*
          Firestore document:

          operational_settings
              |
              └── lob_formula
        */

        const formulaRef =
          doc(
            db,
            "operational_settings",
            "lob_formula"
          );

        const formulaSnap =
          await getDoc(
            formulaRef
          );

        if (
          formulaSnap.exists()
        ) {
          const data =
            formulaSnap.data();

          const storedRules =
            Array.isArray(data?.rules)
              ? data.rules
              : [];

          if (
            storedRules.length > 0
          ) {
            setLobRules(
              storedRules
            );

            setLobRuleDraft(
              storedRules
            );

            return;
          }
        }

        /*
          If no configuration exists yet,
          use the default formula.
        */

        setLobRules(
          DEFAULT_LOB_RULES
        );

        setLobRuleDraft(
          DEFAULT_LOB_RULES
        );
      } catch (err) {
        console.error(
          "Error loading LOB formula:",
          err
        );

        /*
          Important:
          reports continue working even if
          formula settings cannot be loaded.
        */

        setLobRules(
          DEFAULT_LOB_RULES
        );

        setLobRuleDraft(
          DEFAULT_LOB_RULES
        );
      } finally {
        setLobRulesLoading(false);
      }
    }

    loadLobRules();
  }, [isManager]);

  /* =======================================================
     FILTER OPTIONS
  ======================================================= */

  const airlineOptions =
    useMemo(() => {
      const set =
        new Set();

      reports.forEach((r) => {
        if (
          r.normalizedAirline
        ) {
          set.add(
            r.normalizedAirline
          );
        }
      });

      return Array.from(set)
        .sort(
          (a, b) =>
            a.localeCompare(b)
        );
    }, [reports]);

  const departmentOptions =
    useMemo(() => {
      const set =
        new Set();

      reports.forEach((r) => {
        if (r.department) {
          set.add(
            r.department
          );
        }
      });

      return Array.from(set)
        .sort(
          (a, b) =>
            a.localeCompare(b)
        );
    }, [reports]);

  /* =======================================================
     FILTER REPORTS
  ======================================================= */

  const filteredReports =
    useMemo(() => {
      const quickRange =
        filters.dateMode ===
        "quick"
          ? getRangeDates(
              filters.range
            )
          : null;

      const customRange =
        filters.dateMode ===
        "custom"
          ? getCustomDateRange(
              filters.fromDate,
              filters.toDate
            )
          : null;

      let baseReports =
        reports;

      /*
        Supervisors only see their own reports.
      */

      if (isSupervisor) {
        const myUserId =
          String(
            user?.id || ""
          ).trim();

        const myUsername =
          String(
            user?.username ||
              ""
          )
            .trim()
            .toLowerCase();

        const myName =
          String(
            user?.displayName ||
              user?.fullName ||
              user?.name ||
              user?.username ||
              ""
          )
            .trim()
            .toLowerCase();

        baseReports =
          reports.filter((r) => {
            const submittedUserId =
              String(
                r.submittedByUserId ||
                  ""
              ).trim();

            const submittedUsername =
              String(
                r.submittedByUsername ||
                  ""
              )
                .trim()
                .toLowerCase();

            const submittedName =
              String(
                r.submittedByName ||
                  r.supervisorReporting ||
                  ""
              )
                .trim()
                .toLowerCase();

            return (
              (myUserId &&
                submittedUserId ===
                  myUserId) ||
              (myUsername &&
                submittedUsername ===
                  myUsername) ||
              (myName &&
                submittedName ===
                  myName)
            );
          });
      }

      return baseReports.filter(
        (r) => {
          const created =
            tsToDate(
              r.createdAt
            );

          if (!created) {
            return false;
          }

          if (
            filters.dateMode ===
              "quick" &&
            quickRange
          ) {
            if (
              created <
                quickRange.start ||
              created >
                quickRange.end
            ) {
              return false;
            }
          }

          if (
            filters.dateMode ===
              "custom" &&
            customRange
          ) {
            if (
              created <
                customRange.start ||
              created >
                customRange.end
            ) {
              return false;
            }
          }

          if (
            filters.airline !==
              "all" &&
            r.normalizedAirline !==
              filters.airline
          ) {
            return false;
          }

          if (
            filters.department !==
              "all" &&
            r.department !==
              filters.department
          ) {
            return false;
          }

          const status =
            String(
              r.reviewStatus ||
                "submitted"
            ).toLowerCase();

          if (
            filters.lifecycle ===
            "active"
          ) {
            return ![
              "closed",
              "archived",
            ].includes(status);
          }

          if (
            filters.lifecycle ===
            "closed"
          ) {
            return (
              status === "closed"
            );
          }

          if (
            filters.lifecycle ===
            "archived"
          ) {
            return (
              status ===
              "archived"
            );
          }

          return true;
        }
      );
    }, [
      reports,
      filters,
      isSupervisor,
      user,
    ]);

  /* =======================================================
     DELAY REPORTS
  ======================================================= */

  const delayedReports =
    useMemo(() => {
      return filteredReports.filter(
        (r) =>
          Boolean(
            r.delayedFlight
          )
      );
    }, [filteredReports]);

  const delayedSummaryByAirline =
    useMemo(() => {
      const map = {};

      delayedReports.forEach(
        (r) => {
          const airline =
            r.normalizedAirline ||
            "Unknown";

          if (!map[airline]) {
            map[airline] = {
              airline,
              totalDelayedFlights: 0,
              reports: [],
            };
          }

          map[
            airline
          ].totalDelayedFlights += 1;

          map[
            airline
          ].reports.push(r);
        }
      );

      return Object.values(
        map
      ).sort(
        (a, b) =>
          b.totalDelayedFlights -
            a.totalDelayedFlights ||
          a.airline.localeCompare(
            b.airline
          )
      );
    }, [delayedReports]);

  const selectedDelayAirlineReports =
    useMemo(() => {
      if (
        !selectedDelayAirline
      ) {
        return [];
      }

      const found =
        delayedSummaryByAirline.find(
          (item) =>
            item.airline ===
            selectedDelayAirline
        );

      return (
        found?.reports || []
      );
    }, [
      delayedSummaryByAirline,
      selectedDelayAirline,
    ]);

  /* =======================================================
     LOB REPORTS
  ======================================================= */

  const lobReports =
    useMemo(() => {
      return filteredReports
        .filter((report) =>
          getReportHasLobs(
            report
          )
        )
        .map((report) => {
          const calculation =
            calculateLobLabor(
              report,
              lobRules
            );

          return {
            ...report,
            lobCalculation:
              calculation,
          };
        })
        .sort((a, b) => {
          /*
            Largest number of LOB bags first.
          */

          return (
            b.lobCalculation.bags -
            a.lobCalculation.bags
          );
        });
    }, [
      filteredReports,
      lobRules,
    ]);

  /* =======================================================
     LOB TOTALS
  ======================================================= */

  const lobTotals =
    useMemo(() => {
      return lobReports.reduce(
        (totals, report) => {
          const calc =
            report.lobCalculation;

          totals.totalFlights +=
            1;

          totals.totalBags +=
            calc.bags;

          totals.totalAgentAssignments +=
            calc.agents;

          totals.totalSupervisorAssignments +=
            calc.supervisors;

          totals.agentLaborHours +=
            calc.agentLaborHours;

          totals.supervisorLaborHours +=
            calc.supervisorLaborHours;

          totals.totalLaborHours +=
            calc.totalLaborHours;

          return totals;
        },
        {
          totalFlights: 0,
          totalBags: 0,
          totalAgentAssignments: 0,
          totalSupervisorAssignments: 0,
          agentLaborHours: 0,
          supervisorLaborHours: 0,
          totalLaborHours: 0,
        }
      );
    }, [lobReports]);

  /* =======================================================
     LOB SUMMARY BY AIRLINE
  ======================================================= */

  const lobSummaryByAirline =
    useMemo(() => {
      const map = {};

      lobReports.forEach(
        (report) => {
          const airline =
            report.normalizedAirline ||
            "Unknown";

          if (!map[airline]) {
            map[airline] = {
              airline,
              flights: 0,
              bags: 0,
              agentHours: 0,
              supervisorHours: 0,
              totalLaborHours: 0,
            };
          }

          map[airline].flights +=
            1;

          map[airline].bags +=
            report.lobCalculation
              .bags;

          map[airline].agentHours +=
            report.lobCalculation
              .agentLaborHours;

          map[
            airline
          ].supervisorHours +=
            report.lobCalculation
              .supervisorLaborHours;

          map[
            airline
          ].totalLaborHours +=
            report.lobCalculation
              .totalLaborHours;
        }
      );

      return Object.values(
        map
      ).sort(
        (a, b) =>
          b.bags - a.bags
      );
    }, [lobReports]);

  /* =======================================================
     SELECTED LOB REPORT
  ======================================================= */

  const selectedLobReport =
    useMemo(() => {
      if (
        !selectedLobReportId
      ) {
        return null;
      }

      return (
        lobReports.find(
          (report) =>
            report.id ===
            selectedLobReportId
        ) || null
      );
    }, [
      lobReports,
      selectedLobReportId,
    ]);

  useEffect(() => {
    if (
      managementView !==
      "lobs"
    ) {
      return;
    }

    if (
      !selectedLobReportId &&
      lobReports.length
    ) {
      setSelectedLobReportId(
        lobReports[0].id
      );

      return;
    }

    if (
      selectedLobReportId &&
      !lobReports.some(
        (report) =>
          report.id ===
          selectedLobReportId
      )
    ) {
      setSelectedLobReportId(
        lobReports[0]?.id ||
          ""
      );
    }
  }, [
    managementView,
    lobReports,
    selectedLobReportId,
  ]);

  /* =======================================================
     SAVE LOB FORMULA
  ======================================================= */

  const saveLobFormula =
    async () => {
      if (!isManager) {
        return;
      }

      /*
        Validate and normalize each rule.
      */

      const cleanedRules =
        lobRuleDraft
          .map(
            (
              rule,
              index
            ) => {
              const minBags =
                Math.max(
                  1,
                  Number(
                    rule.minBags ||
                      0
                  )
                );

              const maxBags =
                rule.maxBags ===
                  null ||
                rule.maxBags ===
                  ""
                  ? null
                  : Math.max(
                      minBags,
                      Number(
                        rule.maxBags
                      )
                    );

              const hours =
                Math.max(
                  0,
                  Number(
                    rule.hours ||
                      0
                  )
                );

              return {
                id:
                  rule.id ||
                  `lob_${index + 1}`,
                minBags,
                maxBags,
                hours,
              };
            }
          )
          .sort(
            (a, b) =>
              a.minBags -
              b.minBags
          );

      if (
        cleanedRules.length ===
        0
      ) {
        setStatusMessage(
          "LOB formula must contain at least one rule."
        );

        return;
      }

      try {
        setLobRulesSaving(
          true
        );

        const managerName =
          getVisibleUserName(
            user
          );

        await setDoc(
          doc(
            db,
            "operational_settings",
            "lob_formula"
          ),
          {
            rules:
              cleanedRules,

            updatedAt:
              serverTimestamp(),

            updatedBy:
              managerName,

            updatedByRole:
              user?.role || "",
          },
          {
            merge: true,
          }
        );

        setLobRules(
          cleanedRules
        );

        setLobRuleDraft(
          cleanedRules
        );

        setLobRulesEditing(
          false
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
          "Could not save LOB formula."
        );
      } finally {
        setLobRulesSaving(
          false
        );
      }
    };

  /* =======================================================
     EDIT LOB RULE
  ======================================================= */

  const updateLobRule =
    (
      index,
      field,
      value
    ) => {
      setLobRuleDraft(
        (prev) =>
          prev.map(
            (
              rule,
              ruleIndex
            ) => {
              if (
                ruleIndex !==
                index
              ) {
                return rule;
              }

              return {
                ...rule,
                [field]:
                  value,
              };
            }
          )
      );
    };

  /* =======================================================
     ADD LOB RULE
  ======================================================= */

  const addLobRule =
    () => {
      setLobRuleDraft(
        (prev) => {
          const last =
            prev[
              prev.length - 1
            ];

          const suggestedMin =
            last?.maxBags
              ? Number(
                  last.maxBags
                ) + 1
              : 1;

          return [
            ...prev,
            {
              id:
                `lob_${Date.now()}`,
              minBags:
                suggestedMin,
              maxBags: null,
              hours: 1,
            },
          ];
        }
      );
    };

  /* =======================================================
     REMOVE LOB RULE
  ======================================================= */

  const removeLobRule =
    (index) => {
      setLobRuleDraft(
        (prev) =>
          prev.filter(
            (
              _,
              ruleIndex
            ) =>
              ruleIndex !==
              index
          )
      );
    };

  /* =======================================================
     RESET LOB FORMULA
  ======================================================= */

  const resetLobFormula =
    () => {
      setLobRuleDraft(
        DEFAULT_LOB_RULES.map(
          (rule) => ({
            ...rule,
          })
        )
      );
    };
    /* =======================================================
     ALERTS
  ======================================================= */

  const alerts = useMemo(() => {
    const rows = [];

    delayedSummaryByAirline.forEach((item) => {
      const maxMinutes = Math.max(
        ...item.reports.map((report) =>
          Number(report.delayedTimeMinutes || 0)
        ),
        0
      );

      if (
        (filters.dateMode === "quick" && filters.range === "month") ||
        (filters.dateMode === "custom" && item.totalDelayedFlights > 2)
      ) {
        if (item.totalDelayedFlights > 2) {
          rows.push({
            type: "followup",
            airline: item.airline,
            text: `${item.airline}: Duty Mgrs Follow up needed. More than 2 delayed flights reported in selected period.`,
          });
        }
      }

      if (maxMinutes > 4) {
        rows.push({
          type: "followup",
          airline: item.airline,
          text: `${item.airline}: Duty Mgrs Follow up needed. At least one delayed flight exceeded 4 minutes.`,
        });
      }
    });

    filteredReports.forEach((r) => {
      if (shouldFlagNeedsAttention(r)) {
        rows.push({
          type: "attention",
          airline: r.normalizedAirline || "Unknown",
          text: `${
            r.normalizedAirline || "Unknown"
          }: Report needs attention because operation indicates issues or incomplete completion.`,
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

  /* =======================================================
     SELECTED REGULAR REPORT
  ======================================================= */

  const selectedReport = useMemo(() => {
    return filteredReports.find((r) => r.id === selectedId) || null;
  }, [filteredReports, selectedId]);

  useEffect(() => {
    if (!selectedId && filteredReports.length) {
      setSelectedId(filteredReports[0].id);
      return;
    }

    if (
      selectedId &&
      !filteredReports.some((r) => r.id === selectedId)
    ) {
      setSelectedId(filteredReports[0]?.id || "");
    }
  }, [filteredReports, selectedId]);

  /* =======================================================
     DELAY AIRLINE SELECTION
  ======================================================= */

  const handleSelectDelayAirline = (airline) => {
    setSelectedDelayAirline(airline);

    const found = delayedSummaryByAirline.find(
      (item) => item.airline === airline
    );

    if (found?.reports?.length) {
      setSelectedId(found.reports[0].id);
    }
  };

  /* =======================================================
     LOB REPORT SELECTION
  ======================================================= */

  const handleSelectLobReport = (report) => {
    if (!report) return;

    setSelectedLobReportId(report.id);
    setSelectedId(report.id);
  };

  /* =======================================================
     START EDIT
  ======================================================= */

  const startEdit = (report) => {
    if (!isManager) return;

    setEditingId(report.id);

    setEditForm({
      templateKey: report.templateKey || "",
      templateLabel: report.templateLabel || "",
      department: report.department || "",
      airline: report.airline || "",
      reportDate: report.reportDate || "",
      shift: report.shift || "",
      flightNumber: report.flightNumber || "",
      flightsHandled: report.flightsHandled || "",
      supervisorReporting: report.supervisorReporting || "",
      notes: report.notes || "",

      delayedFlight: Boolean(report.delayedFlight),
      delayedTimeMinutes: report.delayedTimeMinutes ?? "",
      delayedReason: report.delayedReason || "",
      delayedCodeReported: report.delayedCodeReported || "",

      needsAttention: Boolean(report.needsAttention),

      responses: {
        ...(report.responses || {}),
      },

      reviewStatus: report.reviewStatus || "submitted",

      managerNotes: report.managerNotes || "",

      followUpRequired: Boolean(report.followUpRequired),
      followUpAction: report.followUpAction || "",
      followUpDetails: report.followUpDetails || "",

      /*
        LOB information
      */

      hasLobs: getReportHasLobs(report),

      lobBagCount:
        getReportLobBagCount(report) || "",

      lobAgentsUsed:
        getReportLobAgentsUsed(report) || "",

      lobSupervisorsUsed:
        getReportLobSupervisorsUsed(report) || "",
    });

    setSelectedId(report.id);
  };

  /* =======================================================
     CANCEL EDIT
  ======================================================= */

  const cancelEdit = () => {
    setEditingId("");
    setSavingId("");
  };

  /* =======================================================
     DYNAMIC RESPONSES
  ======================================================= */

  const handleDynamicResponseChange = (key, value) => {
    setEditForm((prev) => ({
      ...prev,

      responses: {
        ...(prev.responses || {}),
        [key]: value,
      },
    }));
  };

  /* =======================================================
     SAVE EDIT
  ======================================================= */

  const saveEdit = async (report) => {
    if (!isManager) return;

    try {
      setSavingId(report.id);

      const hasLobs =
        Boolean(editForm.hasLobs);

      const lobBagCount =
        hasLobs
          ? Math.max(
              0,
              Number(editForm.lobBagCount || 0)
            )
          : 0;

      const lobAgentsUsed =
        hasLobs
          ? Math.max(
              0,
              Number(editForm.lobAgentsUsed || 0)
            )
          : 0;

      const lobSupervisorsUsed =
        hasLobs
          ? Math.max(
              0,
              Number(editForm.lobSupervisorsUsed || 0)
            )
          : 0;

      /*
        Keep the LOB fields in responses as well.

        This makes the management page compatible
        with the Supervisor Daily Report format.
      */

      const updatedResponses = {
        ...(editForm.responses || {}),

        had_lobs:
          hasLobs ? "Yes" : "No",

        lob_total_bags:
          lobBagCount,

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
            editForm.delayedReason ||
              ""
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

        responses:
          updatedResponses,

        reviewStatus:
          editForm.reviewStatus ||
          "submitted",

        managerNotes:
          editForm.managerNotes ||
          "",

        followUpRequired:
          Boolean(
            editForm.followUpRequired
          ),

        followUpAction:
          editForm.followUpAction ||
          "",

        followUpDetails:
          editForm.followUpDetails ||
          "",

        /*
          Direct LOB fields.

          These make queries and calculations
          easier in Management.
        */

        hasLobs,

        lobBagCount,

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
        prev.map((item) => {
          if (
            item.id !==
            report.id
          ) {
            return item;
          }

          return {
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

            hasLobs,

            lobBagCount,

            lobAgentsUsed,

            lobSupervisorsUsed,
          };
        })
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

  /* =======================================================
     WORKFLOW STATUS
  ======================================================= */

  const updateWorkflowStatus = async (report, mode) => {
    if (!isManager) return;

    try {
      setActionId(report.id);

      const managerName =
        getVisibleUserName(user);

      const managerRole =
        user?.role || "";

      const payload = {};

      if (mode === "read") {
        payload.reviewStatus =
          "read";

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

        payload.archived =
          true;

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

  /* =======================================================
     SAVE FOLLOW UP
  ======================================================= */

  const saveFollowUp = async (report) => {
    if (!isManager) return;

    const action =
      String(
        editForm.followUpAction ||
          ""
      ).trim();

    const details =
      String(
        editForm.followUpDetails ||
          ""
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
          editForm.managerNotes ||
          "",

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

        followUpRequired:
          true,

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

  /* =======================================================
     DELETE REPORT
  ======================================================= */

  const deleteReport = async (report) => {
    if (!isManager) return;

    const ok =
      window.confirm(
        `Delete operational report for ${
          report.normalizedAirline ||
          "Unknown"
        }?`
      );

    if (!ok) return;

    try {
      setDeletingId(
        report.id
      );

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
            item.id !==
            report.id
        )
      );

      if (
        selectedLobReportId ===
        report.id
      ) {
        setSelectedLobReportId(
          ""
        );
      }

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

  /* =======================================================
     PRINT SINGLE REPORT
  ======================================================= */

  const handlePrintExport = () => {
    if (!selectedReport) {
      return;
    }

    const html =
      buildPrintableHtml(
        selectedReport
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

    const triggerPrint =
      () => {
        printWindow.focus();
        printWindow.print();
      };

    setTimeout(
      triggerPrint,
      400
    );
  };

  /* =======================================================
     PRINT DELAY SUMMARY
  ======================================================= */

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

  /* =======================================================
     PRINT LOB SUMMARY
  ======================================================= */

  const handlePrintLobSummary =
    () => {
      if (
        lobReports.length ===
        0
      ) {
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
          lobTotals,
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

  /* =======================================================
     ACCESS DENIED
  ======================================================= */

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
            TPA OPS · Operational
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

  /* =======================================================
     MAIN PAGE
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
          PAGE HEADER
      =================================================== */}

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
          TPA OPS · Operational Reports
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
            : managementView === "lobs"
            ? "LOB Management"
            : "Operational Report Admin"}
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: 800,
            fontSize: 14,
            color:
              "rgba(255,255,255,0.88)",
          }}
        >
          {isSupervisor
            ? "Review the operational reports submitted by you, including review status, follow up, and manager comments."
            : managementView === "lobs"
            ? "Review flights with Left on Board baggage, calculate staffing labor hours, and manage the LOB labor formula."
            : "Review delays, alerts, follow-up cases, and manage submitted operational reports by department."}
        </p>
      </div>

      {/* ===================================================
          MANAGEMENT VIEW SELECTOR
      =================================================== */}

      {!isSupervisor && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() =>
                setManagementView(
                  "reports"
                )
              }
              style={{
                border:
                  managementView ===
                  "reports"
                    ? "1px solid #1769aa"
                    : "1px solid #dbeafe",

                background:
                  managementView ===
                  "reports"
                    ? "#1769aa"
                    : "#ffffff",

                color:
                  managementView ===
                  "reports"
                    ? "#ffffff"
                    : "#1769aa",

                borderRadius: 14,
                padding:
                  "11px 16px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Operational Reports
            </button>

            <button
              type="button"
              onClick={() =>
                setManagementView(
                  "lobs"
                )
              }
              style={{
                border:
                  managementView ===
                  "lobs"
                    ? "1px solid #0369a1"
                    : "1px solid #bae6fd",

                background:
                  managementView ===
                  "lobs"
                    ? "#0369a1"
                    : "#f0f9ff",

                color:
                  managementView ===
                  "lobs"
                    ? "#ffffff"
                    : "#0369a1",

                borderRadius: 14,
                padding:
                  "11px 16px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              LOB Management
              {lobTotals.totalFlights >
                0 &&
                ` (${lobTotals.totalFlights})`}
            </button>
          </div>
        </PageCard>
      )}

      {/* ===================================================
          STATUS MESSAGE
      =================================================== */}

      {statusMessage && (
        <PageCard
          style={{
            padding: 16,
          }}
        >
          <div
            style={{
              background:
                "#edf7ff",
              border:
                "1px solid #cfe7fb",
              borderRadius: 16,
              padding:
                "14px 16px",
              color: "#1769aa",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

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
            marginBottom: 16,
          }}
        >
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

          {managementView ===
            "lobs" &&
            !isSupervisor && (
              <p
                style={{
                  margin:
                    "5px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                These filters also
                control the LOB labor
                totals shown below.
              </p>
            )}
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
            <FieldLabel>
              Date Filter Mode
            </FieldLabel>

            <SelectInput
              value={
                filters.dateMode
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    dateMode:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option value="quick">
                Quick Range
              </option>

              <option value="custom">
                Custom Dates
              </option>
            </SelectInput>
          </div>

          {filters.dateMode ===
          "quick" ? (
            <div>
              <FieldLabel>
                Range
              </FieldLabel>

              <SelectInput
                value={
                  filters.range
                }
                onChange={(e) =>
                  setFilters(
                    (prev) => ({
                      ...prev,
                      range:
                        e.target
                          .value,
                    })
                  )
                }
              >
                <option value="today">
                  Today
                </option>

                <option value="week">
                  This Week
                </option>

                <option value="month">
                  This Month
                </option>
              </SelectInput>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>
                  From
                </FieldLabel>

                <TextInput
                  type="date"
                  value={
                    filters.fromDate
                  }
                  onChange={(e) =>
                    setFilters(
                      (prev) => ({
                        ...prev,
                        fromDate:
                          e.target
                            .value,
                      })
                    )
                  }
                />
              </div>

              <div>
                <FieldLabel>
                  To
                </FieldLabel>

                <TextInput
                  type="date"
                  value={
                    filters.toDate
                  }
                  onChange={(e) =>
                    setFilters(
                      (prev) => ({
                        ...prev,
                        toDate:
                          e.target
                            .value,
                      })
                    )
                  }
                />
              </div>
            </>
          )}

          <div>
            <FieldLabel>
              Airline
            </FieldLabel>

            <SelectInput
              value={
                filters.airline
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    airline:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option value="all">
                All
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
              Department
            </FieldLabel>

            <SelectInput
              value={
                filters.department
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    department:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option value="all">
                All
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
              View
            </FieldLabel>

            <SelectInput
              value={
                filters.lifecycle
              }
              onChange={(e) =>
                setFilters(
                  (prev) => ({
                    ...prev,
                    lifecycle:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option value="active">
                Active Reports
              </option>

              <option value="closed">
                Closed Reports
              </option>

              <option value="archived">
                Archived Reports
              </option>

              <option value="all">
                All
              </option>
            </SelectInput>
          </div>
        </div>
      </PageCard>
            {/* ===================================================
          LOB MANAGEMENT VIEW
      =================================================== */}

      {!isSupervisor && managementView === "lobs" && (
        <>
          {/* ===============================================
              LOB FORMULA / RULES
          =============================================== */}

          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 18,
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
                  LOB Labor Formula
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                    maxWidth: 760,
                    lineHeight: 1.6,
                  }}
                >
                  Configure the estimated handling time based on the number of
                  Left on Board bags. The system multiplies the calculated time
                  by the number of agents and supervisors reported.
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
                  onClick={resetLobFormula}
                >
                  Reset Formula
                </ActionButton>

                <ActionButton
                  variant="primary"
                  onClick={saveLobFormula}
                  disabled={savingLobFormula}
                >
                  {savingLobFormula ? "Saving..." : "Save Formula"}
                </ActionButton>
              </div>
            </div>

            <div
              style={{
                borderRadius: 18,
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}
              >
                {lobRules.map((rule, index) => (
                  <div
                    key={`${rule.maxBags}-${index}`}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #dbeafe",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 10,
                      }}
                    >
                      Rule {index + 1}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div>
                        <FieldLabel>Up To Bags</FieldLabel>

                        <TextInput
                          type="number"
                          min="1"
                          value={rule.maxBags}
                          onChange={(e) =>
                            updateLobRule(
                              index,
                              "maxBags",
                              e.target.value
                            )
                          }
                        />
                      </div>

                      <div>
                        <FieldLabel>Handling Hours</FieldLabel>

                        <TextInput
                          type="number"
                          min="0"
                          step="0.25"
                          value={rule.hours}
                          onChange={(e) =>
                            updateLobRule(
                              index,
                              "hours",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "13px 15px",
                  borderRadius: 14,
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  color: "#1e40af",
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1.6,
                }}
              >
                Example: if 80 bags equal 3 handling hours and the supervisor
                reported 4 agents and 1 supervisor, the system calculates
                12 Agent Labor Hours and 3 Supervisor Labor Hours.
              </div>
            </div>
          </PageCard>

          {/* ===============================================
              LOB TOTALS
          =============================================== */}

          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 18,
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
                  LOB Labor Summary
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Calculated from the LOB reports matching the current filters.
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              <InfoCard
                label="Flights With LOBs"
                value={lobTotals.totalFlights}
              />

              <InfoCard
                label="Total LOB Bags"
                value={lobTotals.totalBags}
              />

              <InfoCard
                label="Agents Used"
                value={lobTotals.totalAgents}
              />

              <InfoCard
                label="Supervisors Used"
                value={lobTotals.totalSupervisors}
              />

              <InfoCard
                label="Agent Labor Hours"
                value={`${formatLobHours(
                  lobTotals.totalAgentHours
                )} hrs`}
              />

              <InfoCard
                label="Supervisor Labor Hours"
                value={`${formatLobHours(
                  lobTotals.totalSupervisorHours
                )} hrs`}
              />

              <InfoCard
                label="Total Labor Hours"
                value={`${formatLobHours(
                  lobTotals.totalLaborHours
                )} hrs`}
              />
            </div>
          </PageCard>

          {/* ===============================================
              LOB FLIGHTS TABLE
          =============================================== */}

          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Flights With LOBs
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Each flight shows the reported bags and staffing used together
                with the calculated labor hours.
              </p>
            </div>

            {lobReports.length === 0 ? (
              <div
                style={{
                  padding: 18,
                  borderRadius: 16,
                  background: "#f8fbff",
                  border: "1px solid #dbeafe",
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                No flights with LOBs were found for the selected period.
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
                    <tr
                      style={{
                        background: "#f8fbff",
                      }}
                    >
                      <th style={thStyle()}>Date</th>

                      <th style={thStyle()}>
                        Airline
                      </th>

                      <th style={thStyle()}>
                        Flight
                      </th>

                      <th style={thStyle()}>
                        Supervisor
                      </th>

                      <th style={thStyle()}>
                        LOB Bags
                      </th>

                      <th style={thStyle()}>
                        Agents
                      </th>

                      <th style={thStyle()}>
                        Supervisors
                      </th>

                      <th style={thStyle()}>
                        Handling Time
                      </th>

                      <th style={thStyle()}>
                        Agent Hours
                      </th>

                      <th style={thStyle()}>
                        Supervisor Hours
                      </th>

                      <th style={thStyle()}>
                        Total Hours
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
                    {lobReports.map((report, index) => {
                      const calculation =
                        calculateLobReportLabor(
                          report,
                          lobRules
                        );

                      return (
                        <tr
                          key={report.id}
                          style={{
                            background:
                              report.id === selectedLobReportId
                                ? "#e0f2fe"
                                : index % 2 === 0
                                ? "#ffffff"
                                : "#fbfdff",
                          }}
                        >
                          <td style={tdStyle}>
                            {report.reportDate || "—"}
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {report.normalizedAirline || "—"}
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            {report.flightNumber || "—"}
                          </td>

                          <td style={tdStyle}>
                            {report.supervisorReporting || "—"}
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {calculation.bags}
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            {calculation.agents}
                          </td>

                          <td style={tdStyle}>
                            {calculation.supervisors}
                          </td>

                          <td style={tdStyle}>
                            {formatLobHours(
                              calculation.handlingHours
                            )}{" "}
                            hrs
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatLobHours(
                                calculation.agentHours
                              )}{" "}
                              hrs
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatLobHours(
                                calculation.supervisorHours
                              )}{" "}
                              hrs
                            </strong>
                          </td>

                          <td style={tdStyle}>
                            <strong>
                              {formatLobHours(
                                calculation.totalHours
                              )}{" "}
                              hrs
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
                                handleSelectLobReport(report)
                              }
                            >
                              View
                            </ActionButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PageCard>

          {/* ===============================================
              SELECTED LOB FLIGHT DETAIL
          =============================================== */}

          {selectedLobReport && (
            <PageCard style={{ padding: 22 }}>
              {(() => {
                const calculation =
                  calculateLobReportLabor(
                    selectedLobReport,
                    lobRules
                  );

                return (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        marginBottom: 18,
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
                          LOB Flight Detail
                        </h2>

                        <p
                          style={{
                            margin: "5px 0 0",
                            fontSize: 13,
                            color: "#64748b",
                          }}
                        >
                          {selectedLobReport.normalizedAirline || "—"} ·{" "}
                          {selectedLobReport.flightNumber || "—"} ·{" "}
                          {selectedLobReport.reportDate || "—"}
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
                          onClick={() =>
                            setSelectedId(
                              selectedLobReport.id
                            )
                          }
                        >
                          Open Full Report
                        </ActionButton>

                        {isManager && (
                          <ActionButton
                            variant="warning"
                            onClick={() =>
                              startEdit(
                                selectedLobReport
                              )
                            }
                          >
                            Edit Report
                          </ActionButton>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(190px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <InfoCard
                        label="Date"
                        value={
                          selectedLobReport.reportDate ||
                          "—"
                        }
                      />

                      <InfoCard
                        label="Airline"
                        value={
                          selectedLobReport.normalizedAirline ||
                          "—"
                        }
                      />

                      <InfoCard
                        label="Flight"
                        value={
                          selectedLobReport.flightNumber ||
                          "—"
                        }
                      />

                      <InfoCard
                        label="Supervisor Reporting"
                        value={
                          selectedLobReport.supervisorReporting ||
                          "—"
                        }
                      />

                      <InfoCard
                        label="LOB Bags"
                        value={calculation.bags}
                      />

                      <InfoCard
                        label="Agents Used"
                        value={calculation.agents}
                      />

                      <InfoCard
                        label="Supervisors Used"
                        value={
                          calculation.supervisors
                        }
                      />

                      <InfoCard
                        label="Calculated Handling Time"
                        value={`${formatLobHours(
                          calculation.handlingHours
                        )} hrs`}
                      />

                      <InfoCard
                        label="Agent Labor Hours"
                        value={`${formatLobHours(
                          calculation.agentHours
                        )} hrs`}
                      />

                      <InfoCard
                        label="Supervisor Labor Hours"
                        value={`${formatLobHours(
                          calculation.supervisorHours
                        )} hrs`}
                      />

                      <InfoCard
                        label="Total Labor Hours"
                        value={`${formatLobHours(
                          calculation.totalHours
                        )} hrs`}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        padding: "16px 18px",
                        borderRadius: 18,
                        background: "#f0f9ff",
                        border: "1px solid #bae6fd",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#0369a1",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 8,
                        }}
                      >
                        Labor Calculation
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 6,
                          color: "#0f172a",
                          fontSize: 14,
                          fontWeight: 700,
                          lineHeight: 1.6,
                        }}
                      >
                        <div>
                          {calculation.bags} LOB bags ={" "}
                          <strong>
                            {formatLobHours(
                              calculation.handlingHours
                            )}{" "}
                            handling hours
                          </strong>
                        </div>

                        <div>
                          Agents: {calculation.agents} ×{" "}
                          {formatLobHours(
                            calculation.handlingHours
                          )}{" "}
                          hrs ={" "}
                          <strong>
                            {formatLobHours(
                              calculation.agentHours
                            )}{" "}
                            labor hrs
                          </strong>
                        </div>

                        <div>
                          Supervisors:{" "}
                          {calculation.supervisors} ×{" "}
                          {formatLobHours(
                            calculation.handlingHours
                          )}{" "}
                          hrs ={" "}
                          <strong>
                            {formatLobHours(
                              calculation.supervisorHours
                            )}{" "}
                            labor hrs
                          </strong>
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            fontSize: 16,
                            color: "#0369a1",
                            fontWeight: 900,
                          }}
                        >
                          Total Labor:{" "}
                          {formatLobHours(
                            calculation.totalHours
                          )}{" "}
                          hours
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </PageCard>
          )}
        </>
      )}

      {/* ===================================================
          NORMAL OPERATIONAL REPORT MANAGEMENT
          continues in Part 5
      =================================================== */}
            {(isSupervisor || managementView === "reports") && (
        <>
          {/* ===================================================
              ALERTS
          =================================================== */}

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

          {/* ===================================================
              DELAY SUMMARY
          =================================================== */}

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
                      ? ` Filter: ${filters.fromDate || "Start"} to ${
                          filters.toDate || "End"
                        }`
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
                      {delayedSummaryByAirline.map((row, index) => (
                        <tr
                          key={row.airline}
                          style={{
                            background:
                              row.airline === selectedDelayAirline
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
                                handleSelectDelayAirline(row.airline)
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
                                handleSelectDelayAirline(row.airline)
                              }
                            >
                              View
                            </ActionButton>
                          </td>
                        </tr>
                      ))}
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
                            <th style={thStyle()}>Supervisor on Duty</th>
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
                                "—";

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
                                    {report.reportDate || "—"}
                                  </td>

                                  <td style={tdStyle}>
                                    {report.department || "—"}
                                  </td>

                                  <td style={tdStyle}>
                                    {report.normalizedAirline || "—"}
                                  </td>

                                  <td style={tdStyle}>
                                    {report.flightNumber || "—"}
                                  </td>

                                  <td style={tdStyle}>
                                    {Number(
                                      report.delayedTimeMinutes || 0
                                    )}{" "}
                                    min
                                  </td>

                                  <td style={tdStyle}>
                                    {report.supervisorReporting || "—"}
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

          {/* ===================================================
              SUBMITTED REPORTS + DETAIL
          =================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: selectedReport
                ? "minmax(320px, 0.95fr) minmax(460px, 1.3fr)"
                : "1fr",
              gap: 18,
            }}
          >
            {/* ===============================================
                REPORT LIST
            =============================================== */}

            <PageCard
              style={{
                padding: 18,
                overflow: "hidden",
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {isSupervisor
                    ? "My Submitted Reports"
                    : "Submitted Reports"}
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

                        <th style={thStyle()}>Delayed</th>
                        <th style={thStyle()}>Minutes</th>
                        <th style={thStyle()}>Needs Attention</th>
                        <th style={thStyle()}>Status</th>
                        <th style={thStyle()}>Created</th>

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
                      {filteredReports.map((report, index) => {
                        const hasLobs = getReportHasLobs(report);
                        const lobBagCount =
                          getReportLobBagCount(report);

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
                              {report.department || "—"}
                            </td>

                            <td style={tdStyle}>
                              {getTemplateLabel(report)}
                            </td>

                            <td style={tdStyle}>
                              {report.normalizedAirline || "—"}
                            </td>

                            <td style={tdStyle}>
                              {report.reportDate || "—"}
                            </td>

                            <td style={tdStyle}>
                              {isCabinServiceReport(report)
                                ? "—"
                                : report.flightNumber || "—"}
                            </td>

                            <td style={tdStyle}>
                              {report.flightsHandled || "—"}
                            </td>

                            <td style={tdStyle}>
                              {report.supervisorReporting || "—"}
                            </td>

                            <td style={tdStyle}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: 50,
                                  padding: "5px 9px",
                                  borderRadius: 999,
                                  background: hasLobs
                                    ? "#fff7ed"
                                    : "#f1f5f9",
                                  border: hasLobs
                                    ? "1px solid #fdba74"
                                    : "1px solid #cbd5e1",
                                  color: hasLobs
                                    ? "#9a3412"
                                    : "#475569",
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                {hasLobs ? "Yes" : "No"}
                              </span>
                            </td>

                            <td style={tdStyle}>
                              {hasLobs ? lobBagCount : "—"}
                            </td>

                            <td style={tdStyle}>
                              {report.delayedFlight ? "Yes" : "No"}
                            </td>

                            <td style={tdStyle}>
                              {Number(
                                report.delayedTimeMinutes || 0
                              )}
                            </td>

                            <td style={tdStyle}>
                              {shouldFlagNeedsAttention(report)
                                ? "Yes"
                                : "No"}
                            </td>

                            <td style={tdStyle}>
                              <span
                                style={getReviewStatusStyle(
                                  report.reviewStatus
                                )}
                              >
                                {getReviewStatusLabel(
                                  report.reviewStatus
                                )}
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
                                  onClick={() =>
                                    setSelectedId(report.id)
                                  }
                                >
                                  View
                                </ActionButton>

                                {isManager && (
                                  <ActionButton
                                    variant="warning"
                                    onClick={() =>
                                      startEdit(report)
                                    }
                                  >
                                    Edit
                                  </ActionButton>
                                )}

                                {isManager && (
                                  <ActionButton
                                    variant="danger"
                                    onClick={() =>
                                      deleteReport(report)
                                    }
                                    disabled={
                                      deletingId === report.id
                                    }
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

            {/* ===============================================
                SELECTED REPORT
            =============================================== */}

            {selectedReport && (
              <PageCard style={{ padding: 20 }}>
                {editingId === selectedReport.id && isManager ? (
                  /* =========================================
                     EDIT REPORT
                  ========================================= */

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
                          Edit Operational Report
                        </h2>

                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 13,
                            color: "#64748b",
                          }}
                        >
                          Update the operational and LOB information.
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
                          variant="success"
                          onClick={() =>
                            saveEdit(selectedReport)
                          }
                          disabled={
                            savingId === selectedReport.id
                          }
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

                    {/* =====================================
                        BASIC REPORT INFORMATION
                    ===================================== */}

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
                        <FieldLabel>
                          Supervisor Reporting
                        </FieldLabel>

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
                    </div>

                    {/* =====================================
                        LOB EDIT SECTION
                    ===================================== */}

                    <div
                      style={{
                        borderRadius: 18,
                        padding: 18,
                        background: editForm.hasLobs
                          ? "#f0f9ff"
                          : "#f8fafc",
                        border: editForm.hasLobs
                          ? "1px solid #7dd3fc"
                          : "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          alignItems: "center",
                          marginBottom: editForm.hasLobs
                            ? 14
                            : 0,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 900,
                              color: "#0f172a",
                            }}
                          >
                            Left on Board (LOB)
                          </div>

                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              color: "#64748b",
                            }}
                          >
                            Edit the LOB information reported by
                            the supervisor.
                          </div>
                        </div>

                        <div
                          style={{
                            minWidth: 180,
                          }}
                        >
                          <FieldLabel>
                            Did This Flight Have LOBs?
                          </FieldLabel>

                          <SelectInput
                            value={
                              editForm.hasLobs ? "Yes" : "No"
                            }
                            onChange={(e) => {
                              const hasLobs =
                                e.target.value === "Yes";

                              setEditForm((prev) => ({
                                ...prev,
                                hasLobs,

                                lobBagCount: hasLobs
                                  ? prev.lobBagCount
                                  : "",

                                lobAgentsUsed: hasLobs
                                  ? prev.lobAgentsUsed
                                  : "",

                                lobSupervisorsUsed: hasLobs
                                  ? prev.lobSupervisorsUsed
                                  : "",
                              }));
                            }}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </SelectInput>
                        </div>
                      </div>

                      {editForm.hasLobs && (
                        <>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: 12,
                            }}
                          >
                            <div>
                              <FieldLabel>
                                Total LOB Bags
                              </FieldLabel>

                              <TextInput
                                type="number"
                                min="0"
                                value={editForm.lobBagCount}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobBagCount: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>
                                Agents Used
                              </FieldLabel>

                              <TextInput
                                type="number"
                                min="0"
                                value={editForm.lobAgentsUsed}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobAgentsUsed: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>
                                Supervisors Used
                              </FieldLabel>

                              <TextInput
                                type="number"
                                min="0"
                                value={
                                  editForm.lobSupervisorsUsed
                                }
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    lobSupervisorsUsed:
                                      e.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          {(() => {
                            const preview =
                              calculateLobLaborFromValues(
                                editForm.lobBagCount,
                                editForm.lobAgentsUsed,
                                editForm.lobSupervisorsUsed,
                                lobRules
                              );

                            return (
                              <div
                                style={{
                                  marginTop: 14,
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(160px, 1fr))",
                                  gap: 10,
                                }}
                              >
                                <InfoCard
                                  label="Handling Time"
                                  value={`${formatLobHours(
                                    preview.handlingHours
                                  )} hrs`}
                                />

                                <InfoCard
                                  label="Agent Labor"
                                  value={`${formatLobHours(
                                    preview.agentHours
                                  )} hrs`}
                                />

                                <InfoCard
                                  label="Supervisor Labor"
                                  value={`${formatLobHours(
                                    preview.supervisorHours
                                  )} hrs`}
                                />

                                <InfoCard
                                  label="Total Labor"
                                  value={`${formatLobHours(
                                    preview.totalHours
                                  )} hrs`}
                                />
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {/* =====================================
                        DELAY EDIT
                    ===================================== */}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 14,
                      }}
                    >
                      <div>
                        <FieldLabel>Delayed Flight</FieldLabel>

                        <SelectInput
                          value={
                            editForm.delayedFlight ? "Yes" : "No"
                          }
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              delayedFlight:
                                e.target.value === "Yes",
                            }))
                          }
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </SelectInput>
                      </div>

                      <div>
                        <FieldLabel>
                          Delayed Time (minutes)
                        </FieldLabel>

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
                        <FieldLabel>
                          Delayed Code Reported
                        </FieldLabel>

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

                    {/* =====================================
                        MANAGER / FOLLOW-UP EDIT
                    ===================================== */}

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

                    {/* =====================================
                        DYNAMIC RESPONSES EDIT
                    ===================================== */}

                    <div>
                      <FieldLabel>Dynamic Responses</FieldLabel>

                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                        }}
                      >
                        {Object.entries(editForm.responses || {})
                          .filter(
                            ([key]) =>
                              ![
                                "had_lobs",
                                "has_lobs",
                                "lob_total_bags",
                                "lob_bag_count",
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
                          Object.entries(editForm.responses || {})
                            .filter(
                              ([key]) =>
                                ![
                                  "had_lobs",
                                  "has_lobs",
                                  "lob_total_bags",
                                  "lob_bag_count",
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
                                  style={{
                                    minHeight: 70,
                                  }}
                                />
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* =========================================
                     VIEW REPORT
                     CONTINUES IN PART 6
                  ========================================= */

                  <div style={{ display: "grid", gap: 16 }}>
                                        {/* =========================================
                        REPORT DETAIL HEADER
                    ========================================= */}

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
                          {getTemplateLabel(selectedReport)} ·{" "}
                          {selectedReport.normalizedAirline || "—"} ·{" "}
                          {selectedReport.reportDate || "—"}
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

                    {/* =========================================
                        BASIC REPORT INFORMATION
                    ========================================= */}

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
                        value={selectedReport.department || "—"}
                      />

                      <InfoCard
                        label="Template"
                        value={getTemplateLabel(selectedReport)}
                      />

                      <InfoCard
                        label="Airline"
                        value={selectedReport.normalizedAirline || "—"}
                      />

                      <InfoCard
                        label="Report Date"
                        value={selectedReport.reportDate || "—"}
                      />

                      <InfoCard
                        label="Shift"
                        value={selectedReport.shift || "—"}
                      />

                      <InfoCard
                        label={
                          isCabinServiceReport(selectedReport)
                            ? "Flights Serviced"
                            : "Flights Handled"
                        }
                        value={selectedReport.flightsHandled || "—"}
                      />

                      {!isCabinServiceReport(selectedReport) && (
                        <InfoCard
                          label="Flight Number"
                          value={selectedReport.flightNumber || "—"}
                        />
                      )}

                      <InfoCard
                        label="Supervisor"
                        value={selectedReport.supervisorReporting || "—"}
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
                          selectedReport.delayedCodeReported || "—"
                        }
                      />

                      <InfoCard
                        label="Review Status"
                        value={getReviewStatusLabel(
                          selectedReport.reviewStatus
                        )}
                      />
                    </div>

                    {/* =========================================
                        LOB DETAIL
                    ========================================= */}

                    {getReportHasLobs(selectedReport) && (
                      <div
                        style={{
                          borderRadius: 20,
                          padding: 18,
                          background:
                            "linear-gradient(135deg, #f0f9ff 0%, #eff6ff 100%)",
                          border: "1px solid #7dd3fc",
                          boxShadow:
                            "0 10px 24px rgba(14,165,233,0.08)",
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
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <h3
                                style={{
                                  margin: 0,
                                  fontSize: 19,
                                  fontWeight: 900,
                                  color: "#0f172a",
                                }}
                              >
                                Left on Board (LOB)
                              </h3>

                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "5px 9px",
                                  borderRadius: 999,
                                  background: "#fff7ed",
                                  border: "1px solid #fdba74",
                                  color: "#9a3412",
                                  fontSize: 11,
                                  fontWeight: 900,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                LOB Reported
                              </span>
                            </div>

                            <p
                              style={{
                                margin: "5px 0 0",
                                fontSize: 13,
                                color: "#475569",
                              }}
                            >
                              Labor calculation based on the current
                              management LOB formula.
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const bagCount =
                            getReportLobBagCount(selectedReport);

                          const agentsUsed =
                            getReportLobAgentsUsed(selectedReport);

                          const supervisorsUsed =
                            getReportLobSupervisorsUsed(
                              selectedReport
                            );

                          const calculation =
                            calculateLobLaborFromValues(
                              bagCount,
                              agentsUsed,
                              supervisorsUsed,
                              lobRules
                            );

                          return (
                            <>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(180px, 1fr))",
                                  gap: 12,
                                }}
                              >
                                <InfoCard
                                  label="LOB Bags"
                                  value={bagCount}
                                />

                                <InfoCard
                                  label="Agents Used"
                                  value={agentsUsed}
                                />

                                <InfoCard
                                  label="Supervisors Used"
                                  value={supervisorsUsed}
                                />

                                <InfoCard
                                  label="Handling Time"
                                  value={`${formatLobHours(
                                    calculation.handlingHours
                                  )} hrs`}
                                />
                              </div>

                              <div
                                style={{
                                  marginTop: 14,
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(180px, 1fr))",
                                  gap: 12,
                                }}
                              >
                                <div
                                  style={{
                                    borderRadius: 16,
                                    padding: "16px 18px",
                                    background: "#ffffff",
                                    border: "1px solid #bae6fd",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 900,
                                      color: "#64748b",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    Agent Labor Hours
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 25,
                                      fontWeight: 900,
                                      color: "#0369a1",
                                    }}
                                  >
                                    {formatLobHours(
                                      calculation.agentHours
                                    )}{" "}
                                    hrs
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 5,
                                      fontSize: 12,
                                      color: "#64748b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {agentsUsed} agent
                                    {Number(agentsUsed) === 1
                                      ? ""
                                      : "s"}{" "}
                                    ×{" "}
                                    {formatLobHours(
                                      calculation.handlingHours
                                    )}{" "}
                                    hrs
                                  </div>
                                </div>

                                <div
                                  style={{
                                    borderRadius: 16,
                                    padding: "16px 18px",
                                    background: "#ffffff",
                                    border: "1px solid #bae6fd",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 900,
                                      color: "#64748b",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    Supervisor Labor Hours
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 25,
                                      fontWeight: 900,
                                      color: "#0369a1",
                                    }}
                                  >
                                    {formatLobHours(
                                      calculation.supervisorHours
                                    )}{" "}
                                    hrs
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 5,
                                      fontSize: 12,
                                      color: "#64748b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {supervisorsUsed} supervisor
                                    {Number(supervisorsUsed) === 1
                                      ? ""
                                      : "s"}{" "}
                                    ×{" "}
                                    {formatLobHours(
                                      calculation.handlingHours
                                    )}{" "}
                                    hrs
                                  </div>
                                </div>

                                <div
                                  style={{
                                    borderRadius: 16,
                                    padding: "16px 18px",
                                    background:
                                      "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                                    border: "1px solid #1769aa",
                                    color: "#ffffff",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 900,
                                      color:
                                        "rgba(255,255,255,0.78)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    Total Labor Hours
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 28,
                                      fontWeight: 900,
                                    }}
                                  >
                                    {formatLobHours(
                                      calculation.totalHours
                                    )}{" "}
                                    hrs
                                  </div>

                                  <div
                                    style={{
                                      marginTop: 5,
                                      fontSize: 12,
                                      color:
                                        "rgba(255,255,255,0.82)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Agent + Supervisor labor
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  marginTop: 14,
                                  padding: "12px 14px",
                                  borderRadius: 14,
                                  background: "#ffffff",
                                  border: "1px solid #bae6fd",
                                  color: "#475569",
                                  fontSize: 13,
                                  lineHeight: 1.6,
                                }}
                              >
                                <strong
                                  style={{
                                    color: "#0f172a",
                                  }}
                                >
                                  Calculation:
                                </strong>{" "}
                                {bagCount} LOB bags ={" "}
                                {formatLobHours(
                                  calculation.handlingHours
                                )}{" "}
                                handling hours.{" "}
                                {agentsUsed} agent
                                {Number(agentsUsed) === 1
                                  ? ""
                                  : "s"}{" "}
                                ×{" "}
                                {formatLobHours(
                                  calculation.handlingHours
                                )}{" "}
                                hrs ={" "}
                                <strong>
                                  {formatLobHours(
                                    calculation.agentHours
                                  )}{" "}
                                  agent hrs
                                </strong>
                                . {supervisorsUsed} supervisor
                                {Number(supervisorsUsed) === 1
                                  ? ""
                                  : "s"}{" "}
                                ×{" "}
                                {formatLobHours(
                                  calculation.handlingHours
                                )}{" "}
                                hrs ={" "}
                                <strong>
                                  {formatLobHours(
                                    calculation.supervisorHours
                                  )}{" "}
                                  supervisor hrs
                                </strong>
                                .
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* =========================================
                        NORMAL REPORT DETAILS
                    ========================================= */}

                    <DetailBox
                      label="Delayed Reason"
                      value={selectedReport.delayedReason || "—"}
                    />

                    <DetailBox
                      label="Notes"
                      value={selectedReport.notes || "—"}
                    />

                    <DetailBox
                      label="Manager Notes"
                      value={selectedReport.managerNotes || "—"}
                    />

                    <DetailBox
                      label="Follow Up Action"
                      value={selectedReport.followUpAction || "—"}
                    />

                    <DetailBox
                      label="Follow Up Details"
                      value={selectedReport.followUpDetails || "—"}
                    />

                    {/* =========================================
                        REVIEW HISTORY
                    ========================================= */}

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
                          value={selectedReport.readBy || "—"}
                        />

                        <InfoCard
                          label="Read At"
                          value={formatDateTime(
                            selectedReport.readAt
                          )}
                        />

                        <InfoCard
                          label="Approved By"
                          value={selectedReport.approvedBy || "—"}
                        />

                        <InfoCard
                          label="Approved At"
                          value={formatDateTime(
                            selectedReport.approvedAt
                          )}
                        />

                        <InfoCard
                          label="Closed By"
                          value={selectedReport.closedBy || "—"}
                        />

                        <InfoCard
                          label="Closed At"
                          value={formatDateTime(
                            selectedReport.closedAt
                          )}
                        />

                        <InfoCard
                          label="Archived By"
                          value={selectedReport.archivedBy || "—"}
                        />

                        <InfoCard
                          label="Archived At"
                          value={formatDateTime(
                            selectedReport.archivedAt
                          )}
                        />
                      </div>
                    )}

                    {/* =========================================
                        NEEDS ATTENTION
                    ========================================= */}

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
                        This report needs attention because the
                        operation indicates issues, delay, safety
                        concern, or incomplete completion.
                      </div>
                    )}

                    {/* =========================================
                        DELAY ALERT
                    ========================================= */}

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
                        {selectedReport.normalizedAirline ||
                          "Unknown"}{" "}
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

                    {/* =========================================
                        MANAGER WORKFLOW
                    ========================================= */}

                    {isManager && (
                      <>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          {selectedReport.reviewStatus !==
                            "read" && (
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

                          {selectedReport.reviewStatus !==
                            "closed" && (
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

                        {/* =====================================
                            FOLLOW UP MANAGER ENTRY
                        ===================================== */}

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

                          <div
                            style={{
                              display: "grid",
                              gap: 12,
                            }}
                          >
                            <div>
                              <FieldLabel>
                                Manager Notes
                              </FieldLabel>

                              <TextArea
                                value={editForm.managerNotes}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    managerNotes:
                                      e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>
                                Follow Up Action
                              </FieldLabel>

                              <TextArea
                                value={editForm.followUpAction}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    followUpAction:
                                      e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div>
                              <FieldLabel>
                                Follow Up Details
                              </FieldLabel>

                              <TextArea
                                value={editForm.followUpDetails}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    followUpDetails:
                                      e.target.value,
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

                    {/* =========================================
                        DYNAMIC RESPONSES
                    ========================================= */}

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
                              "had_lobs",
                              "has_lobs",
                              "lob_total_bags",
                              "lob_bag_count",
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
                                  "had_lobs",
                                  "has_lobs",
                                  "lob_total_bags",
                                  "lob_bag_count",
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
                                    : String(value || "—")}
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
        </>
      )}
    </div>
  );
}                    
