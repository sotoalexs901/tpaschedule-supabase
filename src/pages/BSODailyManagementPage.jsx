// src/pages/BSODailyManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { APP_NAME, APP_SUBTITLE } from "../config/appConfig.js";

const EXCEPTION_REASONS = [
  "Vital Medication / Medical Device",
  "Carseat / Stroller",
  "Wedding Attire",
  "Sporting Equipment",
  "Military",
  "Other",
];

const DELIVERY_METHODS = ["FedEx", "SDD", "Other"];

function useViewport() {
  const [w, setW] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  return {
    width: w,
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1100,
  };
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,.06)",
        padding: 18,
        minWidth: 0,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 11,
        fontWeight: 850,
        color: "#475569",
        textTransform: "uppercase",
        letterSpacing: ".04em",
      }}
    >
      {children}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        minHeight: 44,
        fontSize: 13.5,
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        minHeight: 44,
        fontSize: 13.5,
        background: "#fff",
        outline: "none",
        ...props.style,
      }}
    >
      {props.children}
    </select>
  );
}

function Button({ children, onClick, variant = "primary", disabled = false }) {
  const variants = {
    primary: {
      background: "linear-gradient(135deg,#0f4c81,#1769aa 58%,#5aa9e6)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#fff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    danger: {
      background: "#dc2626",
      color: "#fff",
      border: "none",
    },
    dark: {
      background: "#0f172a",
      color: "#fff",
      border: "none",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 11,
        padding: "9px 13px",
        fontSize: 12.5,
        fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
        whiteSpace: "nowrap",
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, tone = "default", subtitle = "", onClick = null, active = false }) {
  const tones = {
    default: ["#f8fbff", "#dbeafe", "#0f172a"],
    green: ["#ecfdf5", "#a7f3d0", "#166534"],
    amber: ["#fff7ed", "#fdba74", "#9a3412"],
    red: ["#fff1f2", "#fecdd3", "#9f1239"],
    blue: ["#edf7ff", "#cfe7fb", "#1769aa"],
    slate: ["#f8fafc", "#e2e8f0", "#334155"],
  };
  const t = tones[tone] || tones.default;

  return (
    <div
      onClick={onClick || undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      style={{
        background: t[0],
        border: `1px solid ${t[1]}`,
        borderRadius: 16,
        padding: "13px 15px",
        minWidth: 0,
        cursor: onClick ? "pointer" : "default",
        outline: active ? "3px solid rgba(23,105,170,.22)" : "none",
        transform: active ? "translateY(-1px)" : "none",
        transition: "all .16s ease",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 23,
          fontWeight: 900,
          color: t[2],
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function BrandHeader({ isMobile }) {
  return (
    <div
      style={{
        background:
          "linear-gradient(135deg,#073b66 0%,#0f5c91 48%,#2e9fd6 100%)",
        borderRadius: 22,
        padding: isMobile ? 16 : 22,
        color: "#fff",
        boxShadow: "0 16px 34px rgba(15,76,129,.16)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 190,
          height: 190,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,.09)",
          top: -105,
          right: -30,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: isMobile ? 40 : 46,
            height: isMobile ? 40 : 46,
            borderRadius: 13,
            overflow: "hidden",
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <img
            src="/icons/aerostation-icon.png"
            alt={APP_NAME}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: ".15em",
              fontWeight: 900,
              color: "rgba(255,255,255,.78)",
            }}
          >
            {APP_NAME} | AA BSO
          </div>
          <h1
            style={{
              margin: "6px 0 4px",
              fontSize: isMobile ? 22 : 30,
              lineHeight: 1.1,
              fontWeight: 900,
            }}
          >
            BSO Daily Management
          </h1>
          <div
            style={{
              fontSize: isMobile ? 11.5 : 13,
              color: "rgba(255,255,255,.9)",
              lineHeight: 1.5,
            }}
          >
            KPI dashboard and management control for Code 24, Code 39,
            Exception Delivery and other BSO office activity.
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTs(v) {
  try {
    return v?.toDate
      ? v.toDate().toLocaleString()
      : v
      ? new Date(v).toLocaleString()
      : "-";
  } catch {
    return "-";
  }
}

function eventLabel(type) {
  if (type === "CODE_24") return "Code 24 / Bag Return";
  if (type === "CODE_39") return "Code 39";
  if (type === "EXCEPTION_DELIVERY") return "Exception Delivery";
  return "Other";
}

function yesNo(value) {
  return value === true || value === "Yes" || value === "YES" ? "Yes" : "No";
}

function percent(part, total) {
  if (!total) return 0;
  return (Number(part || 0) / Number(total || 1)) * 100;
}

const BSO_WATCH_BANDS = {
  errorMargin: { greenMax: 10, amberMax: 20 },
  code39Share: { greenMax: 10, amberMax: 20 },
  followUpRate: { greenMax: 5, amberMax: 10 },
  code24Avoidance: { greenMin: 90, amberMin: 80 },
  controlSuccess: { greenMin: 90, amberMin: 80 },
};

function lowerIsBetterTone(value, band) {
  if (value <= band.greenMax) return "green";
  if (value <= band.amberMax) return "amber";
  return "red";
}

function higherIsBetterTone(value, band) {
  if (value >= band.greenMin) return "green";
  if (value >= band.amberMin) return "amber";
  return "red";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadCsv(name, rows) {
  const text = rows
    .map((r) =>
      r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8;" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPrintableWindow(html) {
  const printWindow = window.open("", "_blank", "width=1200,height=850");
  if (!printWindow) {
    window.alert("Please allow pop-ups to print this report.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function basePrintStyles() {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 24px;
      color: #111827;
      background: #ffffff;
    }
    .brand-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding-bottom: 16px;
      margin-bottom: 18px;
      border-bottom: 2px solid #e5eef7;
    }
    .brand-left { display: flex; align-items: center; gap: 12px; }
    .brand-logo {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      border: 1px solid #dbeafe;
      background: #fff;
      object-fit: contain;
    }
    .brand-name {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: #1769aa;
    }
    .brand-subtitle {
      margin-top: 3px;
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
    }
    .document-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
      text-align: right;
    }
    .title {
      font-size: 27px;
      font-weight: 800;
      margin: 0;
      letter-spacing: -.03em;
    }
    .subtitle {
      margin-top: 6px;
      font-size: 14px;
      color: #475569;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4,minmax(0,1fr));
      gap: 10px;
      margin: 16px 0;
    }
    .card {
      background: #f8fbff;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      padding: 11px 12px;
    }
    .card-label, .section-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .card-value {
      margin-top: 5px;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      border: 1px solid #dbeafe;
      padding: 8px 9px;
      text-align: left;
      font-size: 10.5px;
      vertical-align: top;
    }
    th {
      background: #f8fbff;
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #475569;
    }
    .notes-box {
      margin-top: 14px;
      padding: 12px 13px;
      border-radius: 12px;
      background: #f8fbff;
      border: 1px solid #dbeafe;
      line-height: 1.55;
      font-size: 12px;
    }
    .print-footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 9px;
      text-align: center;
    }
    @media print {
      body { margin: 14px; }
      @page { size: landscape; margin: 10mm; }
    }
  `;
}

function reportEventDetails(e) {
  if (e.eventType === "CODE_24") {
    return [
      e.code24Created ? "Code 24 Created" : "Code 24 Avoided",
      `BCC: ${yesNo(e.bccReferral)}`,
      e.code24Reason || "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (e.eventType === "CODE_39") {
    return [
      e.reportId ? `Report ID: ${e.reportId}` : "",
      e.worldTracerId ? `World Tracer: ${e.worldTracerId}` : "",
      e.faultStation ? `Fault: ${e.faultStation}` : "",
      e.lossCode ? `Loss: ${e.lossCode}` : "",
      e.bagsChecked !== undefined ? `Bags: ${e.bagsChecked}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (e.eventType === "EXCEPTION_DELIVERY") {
    return [
      e.netTracerFile ? `NetTracer: ${e.netTracerFile}` : "",
      e.exceptionReason || "",
      e.deliveryMethod || "",
      e.agentCode ? `Agent Code: ${e.agentCode}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
  }

  return e.otherDescription || "";
}

function buildReportPrintHtml(report) {
  const logoUrl = `${window.location.origin}/icons/aerostation-icon.png`;
  const events = Array.isArray(report?.events) ? report.events : [];
  const metrics = recalc(events);

  const rowsHtml = events
    .map(
      (e, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(eventLabel(e.eventType))}</td>
          <td>${escapeHtml(e.employee || "-")}</td>
          <td>${escapeHtml(e.passengerName || "-")}</td>
          <td>${escapeHtml(e.pnr || "-")}</td>
          <td>${escapeHtml(e.flightNumber || "-")}</td>
          <td>${escapeHtml(e.bagTags || "-")}</td>
          <td>${escapeHtml(reportEventDetails(e) || "-")}</td>
          <td>${escapeHtml(e.supervisorReview || "-")}</td>
          <td>${escapeHtml(e.comments || "-")}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(APP_NAME)} - BSO Daily Report</title>
        <style>${basePrintStyles()}</style>
      </head>
      <body>
        <div class="brand-header">
          <div class="brand-left">
            <img class="brand-logo" src="${logoUrl}" alt="${escapeHtml(APP_NAME)}" />
            <div>
              <div class="brand-name">${escapeHtml(APP_NAME)}</div>
              <div class="brand-subtitle">${escapeHtml(APP_SUBTITLE)}</div>
            </div>
          </div>
          <div class="document-label">BSO Daily Management Report</div>
        </div>

        <h1 class="title">BSO Daily Report</h1>
        <div class="subtitle">
          ${escapeHtml(report.reportDate || "-")} &middot; ${escapeHtml(
    report.shift || "-"
  )}
        </div>

        <div class="grid">
          <div class="card"><div class="card-label">Supervisor</div><div class="card-value">${escapeHtml(
            report.supervisorName || report.submittedByName || "-"
          )}</div></div>
          <div class="card"><div class="card-label">Created</div><div class="card-value">${escapeHtml(
            formatTs(report.createdAt)
          )}</div></div>
          <div class="card"><div class="card-label">Review Status</div><div class="card-value">${escapeHtml(
            report.reviewStatus || report.status || "submitted"
          )}</div></div>
          <div class="card"><div class="card-label">Total Events</div><div class="card-value">${metrics.totalEvents}</div></div>
          <div class="card"><div class="card-label">Code 24 / Bag Returns</div><div class="card-value">${metrics.code24BagReturnEvents}</div></div>
          <div class="card"><div class="card-label">Code 39</div><div class="card-value">${metrics.code39Count}</div></div>
          <div class="card"><div class="card-label">Exception Delivery</div><div class="card-value">${metrics.exceptionDeliveryCount}</div></div>
          <div class="card"><div class="card-label">Other</div><div class="card-value">${metrics.otherCount}</div></div>
        </div>

        ${
          report.notes
            ? `<div class="notes-box"><div class="section-label">Shift Notes</div><div style="margin-top:6px;">${escapeHtml(
                report.notes
              ).replace(/\n/g, "<br/>")}</div></div>`
            : ""
        }

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Employee</th>
              <th>Passenger</th>
              <th>PNR</th>
              <th>Flight</th>
              <th>Bag Tag(s)</th>
              <th>Event Details</th>
              <th>Supervisor Review</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="print-footer">${escapeHtml(APP_NAME)} &middot; ${escapeHtml(
    APP_SUBTITLE
  )}</div>
      </body>
    </html>
  `;
}

function buildSummaryPrintHtml(filtered, totals, filters) {
  const logoUrl = `${window.location.origin}/icons/aerostation-icon.png`;
  const rowsHtml = filtered
    .map(
      (e, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(e.reportDate || "-")}</td>
          <td>${escapeHtml(e.shift || "-")}</td>
          <td>${escapeHtml(eventLabel(e.eventType))}</td>
          <td>${escapeHtml(e.supervisorName || "-")}</td>
          <td>${escapeHtml(e.employee || "-")}</td>
          <td>${escapeHtml(e.pnr || "-")}</td>
          <td>${escapeHtml(e.flightNumber || "-")}</td>
          <td>${escapeHtml(e.bagTags || "-")}</td>
          <td>${escapeHtml(reportEventDetails(e) || "-")}</td>
        </tr>
      `
    )
    .join("");

  const rangeLabel =
    filters.startDate || filters.endDate
      ? `${filters.startDate || "Start"} to ${filters.endDate || "End"}`
      : "All available records";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(APP_NAME)} - BSO Management Summary</title>
        <style>${basePrintStyles()}</style>
      </head>
      <body>
        <div class="brand-header">
          <div class="brand-left">
            <img class="brand-logo" src="${logoUrl}" alt="${escapeHtml(APP_NAME)}" />
            <div>
              <div class="brand-name">${escapeHtml(APP_NAME)}</div>
              <div class="brand-subtitle">${escapeHtml(APP_SUBTITLE)}</div>
            </div>
          </div>
          <div class="document-label">BSO Management Summary</div>
        </div>

        <h1 class="title">BSO Management Summary</h1>
        <div class="subtitle">${escapeHtml(rangeLabel)}</div>

        <div class="grid">
          <div class="card"><div class="card-label">Total Events</div><div class="card-value">${totals.total}</div></div>
          <div class="card"><div class="card-label">Code 24 / Bag Returns</div><div class="card-value">${totals.code24Events}</div></div>
          <div class="card"><div class="card-label">Code 24 Created</div><div class="card-value">${totals.code24Created}</div></div>
          <div class="card"><div class="card-label">Code 24 Rate</div><div class="card-value">${totals.code24Rate.toFixed(
            1
          )}%</div></div>
          <div class="card"><div class="card-label">Code 39</div><div class="card-value">${totals.code39}</div></div>
          <div class="card"><div class="card-label">Code 39 Bags</div><div class="card-value">${totals.code39Bags}</div></div>
          <div class="card"><div class="card-label">Exception Delivery</div><div class="card-value">${totals.exceptions}</div></div>
          <div class="card"><div class="card-label">Follow-up</div><div class="card-value">${totals.followUp}</div></div>
          <div class="card"><div class="card-label">Error Margin</div><div class="card-value">${totals.errorMargin.toFixed(1)}%</div></div>
          <div class="card"><div class="card-label">Control Success</div><div class="card-value">${totals.controlSuccessRate.toFixed(1)}%</div></div>
          <div class="card"><div class="card-label">Code 24 Avoidance</div><div class="card-value">${totals.code24AvoidanceRate.toFixed(1)}%</div></div>
          <div class="card"><div class="card-label">Code 39 Share</div><div class="card-value">${totals.code39Share.toFixed(1)}%</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Shift</th>
              <th>Type</th>
              <th>Supervisor</th>
              <th>Employee</th>
              <th>PNR</th>
              <th>Flight</th>
              <th>Bag Tag(s)</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="print-footer">${escapeHtml(APP_NAME)} &middot; ${escapeHtml(
    APP_SUBTITLE
  )}</div>
      </body>
    </html>
  `;
}

function recalc(events) {
  const code24 = events.filter((e) => e.eventType === "CODE_24");
  const code24Created = code24.filter(
    (e) => e.code24Created === true || e.code24Created === "Yes"
  ).length;
  const code39 = events.filter((e) => e.eventType === "CODE_39");
  const exceptions = events.filter(
    (e) => e.eventType === "EXCEPTION_DELIVERY"
  );

  return {
    totalEvents: events.length,
    code24BagReturnEvents: code24.length,
    code24CreatedCount: code24Created,
    code24Rate: code24.length
      ? Number(((code24Created / code24.length) * 100).toFixed(2))
      : 0,
    code39Count: code39.length,
    code39BagsAffected: code39.reduce(
      (s, e) => s + (Number(e.bagsChecked) || 0),
      0
    ),
    exceptionDeliveryCount: exceptions.length,
    exceptionFedExCount: exceptions.filter((e) => e.deliveryMethod === "FedEx")
      .length,
    exceptionSddCount: exceptions.filter((e) => e.deliveryMethod === "SDD")
      .length,
    exceptionOtherMethodCount: exceptions.filter(
      (e) => e.deliveryMethod === "Other"
    ).length,
    otherCount: events.filter((e) => e.eventType === "OTHER").length,
  };
}

export default function BSODailyManagementPage() {
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();
  const canAccess = ["duty_manager", "station_manager"].includes(user?.role);

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeCaseType, setActiveCaseType] = useState("all");
  const [working, setWorking] = useState("");

  const emptyFilters = {
    startDate: "",
    endDate: "",
    shift: "all",
    eventType: "all",
    supervisor: "",
    employee: "",
    status: "all",
    faultStation: "",
    lossCode: "",
    deliveryMethod: "all",
    exceptionReason: "all",
    netTracerFile: "",
    search: "",
  };

  const [filters, setFilters] = useState(emptyFilters);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "bso_daily_reports"), orderBy("createdAt", "desc"))
        );
        setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
        setMessage("Could not load BSO Daily Reports.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const flat = useMemo(
    () =>
      reports.flatMap((r) =>
        (Array.isArray(r.events) ? r.events : []).map((e, idx) => ({
          ...e,
          eventIndex: idx,
          reportIdDoc: r.id,
          reportDate: r.reportDate,
          shift: r.shift,
          supervisorName: r.supervisorName || r.submittedByName || "",
          reportStatus: r.status,
          reviewStatus: r.reviewStatus,
          createdAt: r.createdAt,
          reportNotes: r.notes,
        }))
      ),
    [reports]
  );

  const filtered = useMemo(
    () =>
      flat.filter((e) => {
        if (filters.startDate && e.reportDate < filters.startDate) return false;
        if (filters.endDate && e.reportDate > filters.endDate) return false;
        if (filters.shift !== "all" && e.shift !== filters.shift) return false;
        if (filters.eventType !== "all" && e.eventType !== filters.eventType)
          return false;
        if (
          filters.status !== "all" &&
          String(e.status || e.reportStatus || "").toLowerCase() !== filters.status
        )
          return false;
        if (
          filters.supervisor &&
          !String(e.supervisorName || "")
            .toLowerCase()
            .includes(filters.supervisor.toLowerCase())
        )
          return false;
        if (
          filters.employee &&
          !String(e.employee || "")
            .toLowerCase()
            .includes(filters.employee.toLowerCase())
        )
          return false;
        if (
          filters.faultStation &&
          !String(e.faultStation || "")
            .toLowerCase()
            .includes(filters.faultStation.toLowerCase())
        )
          return false;
        if (
          filters.lossCode &&
          !String(e.lossCode || "")
            .toLowerCase()
            .includes(filters.lossCode.toLowerCase())
        )
          return false;
        if (
          filters.deliveryMethod !== "all" &&
          e.deliveryMethod !== filters.deliveryMethod
        )
          return false;
        if (
          filters.exceptionReason !== "all" &&
          e.exceptionReason !== filters.exceptionReason
        )
          return false;
        if (
          filters.netTracerFile &&
          !String(e.netTracerFile || "")
            .toLowerCase()
            .includes(filters.netTracerFile.toLowerCase())
        )
          return false;

        const q = filters.search.trim().toLowerCase();
        if (q) {
          const hay = [
            e.passengerName,
            e.pnr,
            e.flightNumber,
            e.bagTags,
            e.reportId,
            e.worldTracerId,
            e.netTracerFile,
            e.agentCode,
            e.deliveryMethod,
            e.exceptionReason,
            e.employee,
            e.supervisorName,
            e.comments,
            e.otherDescription,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      }),
    [flat, filters]
  );

  const totals = useMemo(() => {
    const code24 = filtered.filter((e) => e.eventType === "CODE_24");
    const code24Created = code24.filter(
      (e) => e.code24Created === true || e.code24Created === "Yes"
    ).length;
    const code39 = filtered.filter((e) => e.eventType === "CODE_39");
    const exceptions = filtered.filter(
      (e) => e.eventType === "EXCEPTION_DELIVERY"
    );

    return {
      total: filtered.length,
      code24Events: code24.length,
      code24Created,
      code24Avoided: Math.max(0, code24.length - code24Created),
      code24Rate: percent(code24Created, code24.length),
      code24AvoidanceRate: percent(Math.max(0, code24.length - code24Created), code24.length),
      code39: code39.length,
      code39Share: percent(code39.length, filtered.length),
      code39Bags: code39.reduce(
        (s, e) => s + (Number(e.bagsChecked) || 0),
        0
      ),
      exceptions: exceptions.length,
      fedEx: exceptions.filter((e) => e.deliveryMethod === "FedEx").length,
      sdd: exceptions.filter((e) => e.deliveryMethod === "SDD").length,
      otherDelivery: exceptions.filter((e) => e.deliveryMethod === "Other")
        .length,
      other: filtered.filter((e) => e.eventType === "OTHER").length,
      followUp: filtered.filter(
        (e) =>
          e.followUpRequired === true ||
          e.supervisorReview === "Follow-up required"
      ).length,
      followUpRate: percent(
        filtered.filter(
          (e) =>
            e.followUpRequired === true ||
            e.supervisorReview === "Follow-up required"
        ).length,
        filtered.length
      ),
      errorCases: code24Created + code39.length,
      errorMargin: percent(code24Created + code39.length, filtered.length),
      controlSuccessRate: Math.max(0, 100 - percent(code24Created + code39.length, filtered.length)),
    };
  }, [filtered]);

  const caseRows = useMemo(() => {
    if (activeCaseType === "all") return filtered;
    return filtered.filter((event) => event.eventType === activeCaseType);
  }, [filtered, activeCaseType]);

  const activeCaseLabel =
    activeCaseType === "CODE_24"
      ? "Code 24 / Bag Return"
      : activeCaseType === "CODE_39"
      ? "Code 39"
      : activeCaseType === "EXCEPTION_DELIVERY"
      ? "Exception Delivery"
      : activeCaseType === "OTHER"
      ? "Other"
      : "All BSO Cases";

  const exceptionReasonSummary = useMemo(
    () =>
      EXCEPTION_REASONS.map((reason) => ({
        reason,
        count: filtered.filter(
          (e) =>
            e.eventType === "EXCEPTION_DELIVERY" && e.exceptionReason === reason
        ).length,
      })).filter((x) => x.count > 0),
    [filtered]
  );

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedId) || null,
    [reports, selectedId]
  );

  async function deleteReport(reportId) {
    if (!window.confirm("Delete this entire BSO Daily Report permanently?"))
      return;

    try {
      setWorking(reportId);
      await deleteDoc(doc(db, "bso_daily_reports", reportId));
      setReports((p) => p.filter((r) => r.id !== reportId));
      if (selectedId === reportId) setSelectedId("");
      setMessage("Report deleted successfully.");
    } catch (e) {
      console.error(e);
      setMessage("Could not delete report.");
    } finally {
      setWorking("");
    }
  }

  async function deleteEvent(reportId, eventIndex) {
    if (!window.confirm("Delete this BSO event permanently?")) return;
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;

    const events = (report.events || [])
      .filter((_, i) => i !== eventIndex)
      .map((e, i) => ({ ...e, sequence: i + 1 }));

    try {
      setWorking(`${reportId}-${eventIndex}`);

      if (!events.length) {
        await deleteDoc(doc(db, "bso_daily_reports", reportId));
        setReports((p) => p.filter((r) => r.id !== reportId));
        if (selectedId === reportId) setSelectedId("");
      } else {
        const summary = recalc(events);
        await updateDoc(doc(db, "bso_daily_reports", reportId), {
          events,
          ...summary,
          updatedAt: serverTimestamp(),
        });
        setReports((p) =>
          p.map((r) =>
            r.id === reportId
              ? { ...r, events, ...summary, updatedAt: new Date() }
              : r
          )
        );
      }

      setMessage("Event deleted successfully.");
    } catch (e) {
      console.error(e);
      setMessage("Could not delete event.");
    } finally {
      setWorking("");
    }
  }

  async function markReviewed(reportId) {
    try {
      setWorking(reportId);
      await updateDoc(doc(db, "bso_daily_reports", reportId), {
        reviewStatus: "reviewed",
        reviewedAt: serverTimestamp(),
        reviewedBy: user?.username || user?.name || "",
      });
      setReports((p) =>
        p.map((r) =>
          r.id === reportId
            ? {
                ...r,
                reviewStatus: "reviewed",
                reviewedAt: new Date(),
                reviewedBy: user?.username || user?.name || "",
              }
            : r
        )
      );
      setMessage("Report marked as reviewed.");
    } catch (e) {
      console.error(e);
      setMessage("Could not update report.");
    } finally {
      setWorking("");
    }
  }

  function exportCsv() {
    const rows = [
      [
        "Date",
        "Shift",
        "Type",
        "Supervisor",
        "Employee",
        "Passenger",
        "PNR",
        "Flight",
        "Bag Tags",
        "Code 24 Created",
        "BCC Referral",
        "Code 24 Reason",
        "Code 39 Report ID",
        "Fault Station",
        "Loss Code",
        "Bag Type",
        "Bags Checked",
        "Bags Received",
        "World Tracer ID",
        "NetTracer File",
        "Exception Date",
        "Agent Code",
        "Exception Reason",
        "Delivery Method",
        "Status",
        "Review",
        "Comments",
      ],
      ...caseRows.map((e) => [
        e.reportDate,
        e.shift,
        eventLabel(e.eventType),
        e.supervisorName,
        e.employee,
        e.passengerName,
        e.pnr,
        e.flightNumber,
        e.bagTags,
        yesNo(e.code24Created),
        yesNo(e.bccReferral),
        e.code24Reason,
        e.reportId,
        e.faultStation,
        e.lossCode,
        e.bagType,
        e.bagsChecked,
        e.bagsReceived,
        e.worldTracerId,
        e.netTracerFile,
        e.exceptionDate,
        e.agentCode,
        e.exceptionReason,
        e.deliveryMethod,
        e.status || e.reportStatus,
        e.supervisorReview,
        e.comments,
      ]),
    ];

    downloadCsv("bso-daily-management.csv", rows);
  }

  function printSummary() {
    openPrintableWindow(buildSummaryPrintHtml(caseRows, totals, filters));
  }

  function printSelectedReport() {
    if (!selectedReport) return;
    openPrintableWindow(buildReportPrintHtml(selectedReport));
  }

  if (!canAccess) {
    return (
      <Card>
        <h2 style={{ margin: 0 }}>Access denied</h2>
      </Card>
    );
  }

  const grid = {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "1fr"
      : isTablet
      ? "repeat(2,minmax(0,1fr))"
      : "repeat(auto-fit,minmax(190px,1fr))",
    gap: 10,
  };

  const th = {
    padding: "10px 11px",
    fontSize: 10.5,
    textTransform: "uppercase",
    color: "#475569",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left",
    whiteSpace: "nowrap",
    letterSpacing: ".04em",
  };

  const td = {
    padding: "11px",
    fontSize: 12.5,
    borderBottom: "1px solid #eef2f7",
    verticalAlign: "top",
    color: "#0f172a",
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        width: "100%",
        minWidth: 0,
      }}
    >
      <BrandHeader isMobile={isMobile} />

      {message && (
        <Card style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, color: "#1769aa" }}>{message}</div>
        </Card>
      )}

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 14,
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 19, color: "#0f172a" }}>
              Filters & Export
            </h2>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              KPI cards, CSV and print output follow the active filters.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="dark" onClick={printSummary}>
              Print Summary
            </Button>
          </div>
        </div>

        <div style={grid}>
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) =>
                setFilters((p) => ({ ...p, startDate: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) =>
                setFilters((p) => ({ ...p, endDate: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Shift</Label>
            <Select
              value={filters.shift}
              onChange={(e) =>
                setFilters((p) => ({ ...p, shift: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option>AM</option>
              <option>PM</option>
              <option>MID</option>
            </Select>
          </div>
          <div>
            <Label>Event Type</Label>
            <Select
              value={filters.eventType}
              onChange={(e) =>
                setFilters((p) => ({ ...p, eventType: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="CODE_24">Code 24 / Bag Return</option>
              <option value="CODE_39">Code 39</option>
              <option value="EXCEPTION_DELIVERY">Exception Delivery</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div>
            <Label>Supervisor</Label>
            <Input
              value={filters.supervisor}
              onChange={(e) =>
                setFilters((p) => ({ ...p, supervisor: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Employee</Label>
            <Input
              value={filters.employee}
              onChange={(e) =>
                setFilters((p) => ({ ...p, employee: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Fault Station</Label>
            <Input
              value={filters.faultStation}
              onChange={(e) =>
                setFilters((p) => ({ ...p, faultStation: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Loss Code</Label>
            <Input
              value={filters.lossCode}
              onChange={(e) =>
                setFilters((p) => ({ ...p, lossCode: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Delivery Method</Label>
            <Select
              value={filters.deliveryMethod}
              onChange={(e) =>
                setFilters((p) => ({ ...p, deliveryMethod: e.target.value }))
              }
            >
              <option value="all">All</option>
              {DELIVERY_METHODS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Exception Reason</Label>
            <Select
              value={filters.exceptionReason}
              onChange={(e) =>
                setFilters((p) => ({ ...p, exceptionReason: e.target.value }))
              }
            >
              <option value="all">All</option>
              {EXCEPTION_REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>NetTracer File</Label>
            <Input
              value={filters.netTracerFile}
              onChange={(e) =>
                setFilters((p) => ({ ...p, netTracerFile: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={filters.status}
              onChange={(e) =>
                setFilters((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
            </Select>
          </div>
          <div>
            <Label>Quick Search</Label>
            <Input
              value={filters.search}
              onChange={(e) =>
                setFilters((p) => ({ ...p, search: e.target.value }))
              }
              placeholder="PNR, bag tag, NetTracer, report ID..."
            />
          </div>
        </div>

        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>
            Clear Filters
          </Button>
        </div>
      </Card>

      <Card style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19, color: "#0f172a" }}>BSO Case KPIs</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontWeight: 700 }}>Click a KPI to filter the case table below. All counts follow the active date and management filters.</div>
          </div>
          {activeCaseType !== "all" && <Button variant="secondary" onClick={() => setActiveCaseType("all")}>Show All Cases</Button>}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "repeat(2,minmax(0,1fr))"
              : isTablet
              ? "repeat(3,minmax(0,1fr))"
              : "repeat(5,minmax(0,1fr))",
            gap: 9,
          }}
        >
          <Metric label="All BSO Cases" value={totals.total} tone="blue" onClick={() => setActiveCaseType("all")} active={activeCaseType === "all"} />
          <Metric label="Code 24" value={totals.code24Events} tone="amber" onClick={() => setActiveCaseType("CODE_24")} active={activeCaseType === "CODE_24"} />
          <Metric label="Code 39" value={totals.code39} tone="red" onClick={() => setActiveCaseType("CODE_39")} active={activeCaseType === "CODE_39"} />
          <Metric label="Exception Delivery" value={totals.exceptions} tone="blue" onClick={() => setActiveCaseType("EXCEPTION_DELIVERY")} active={activeCaseType === "EXCEPTION_DELIVERY"} />
          <Metric label="Other" value={totals.other} tone="green" onClick={() => setActiveCaseType("OTHER")} active={activeCaseType === "OTHER"} />
        </div>
      </Card>

      <Card>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Operational Error & Control KPIs</h2>
          <div style={{ marginTop: 4, color: "#64748b", fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
            Internal watch bands modeled after the Gate Checklist KPI dashboard. These are operational control indicators, not statistical confidence intervals.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(5,minmax(0,1fr))", gap: 9 }}>
          <Metric
            label="Error Margin"
            value={`${totals.errorMargin.toFixed(1)}%`}
            subtitle={`${totals.errorCases} Code 24 created + Code 39 cases`}
            tone={lowerIsBetterTone(totals.errorMargin, BSO_WATCH_BANDS.errorMargin)}
          />
          <Metric
            label="Control Success"
            value={`${totals.controlSuccessRate.toFixed(1)}%`}
            subtitle="Inverse of current error margin"
            tone={higherIsBetterTone(totals.controlSuccessRate, BSO_WATCH_BANDS.controlSuccess)}
          />
          <Metric
            label="Code 24 Avoidance"
            value={`${totals.code24AvoidanceRate.toFixed(1)}%`}
            subtitle={`${totals.code24Avoided} avoided / ${totals.code24Events} bag return cases`}
            tone={higherIsBetterTone(totals.code24AvoidanceRate, BSO_WATCH_BANDS.code24Avoidance)}
          />
          <Metric
            label="Code 39 Share"
            value={`${totals.code39Share.toFixed(1)}%`}
            subtitle={`${totals.code39} of ${totals.total} BSO cases`}
            tone={lowerIsBetterTone(totals.code39Share, BSO_WATCH_BANDS.code39Share)}
          />
          <Metric
            label="Follow-up Rate"
            value={`${totals.followUpRate.toFixed(1)}%`}
            subtitle={`${totals.followUp} case(s) requiring follow-up`}
            tone={lowerIsBetterTone(totals.followUpRate, BSO_WATCH_BANDS.followUpRate)}
          />
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", fontWeight: 700 }}>
          Watch bands: Error Margin and Code 39 Share green <=10%, amber <=20%; Follow-up green <=5%, amber <=10%; Control Success and Code 24 Avoidance green >=90%, amber >=80%.
        </div>
      </Card>

      <Card>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Exception Delivery KPI</h2>
          <div
            style={{
              marginTop: 4,
              color: "#64748b",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Delivery method and exception-reason breakdown for the selected
            filters.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(3,minmax(0,1fr))",
            gap: 9,
            marginBottom: 12,
          }}
        >
          <Metric label="FedEx" value={totals.fedEx} tone="blue" />
          <Metric label="SDD" value={totals.sdd} tone="green" />
          <Metric
            label="Other Method"
            value={totals.otherDelivery}
            tone="slate"
          />
        </div>

        {exceptionReasonSummary.length === 0 ? (
          <div
            style={{
              padding: 14,
              background: "#f8fafc",
              borderRadius: 12,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No Exception Delivery data for the selected filters.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(auto-fit,minmax(210px,1fr))",
              gap: 8,
            }}
          >
            {exceptionReasonSummary.map((row) => (
              <div
                key={row.reason}
                style={{
                  border: "1px solid #dbeafe",
                  borderRadius: 13,
                  padding: 11,
                  background: "#f8fbff",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    fontWeight: 800,
                  }}
                >
                  {row.reason}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 20,
                    fontWeight: 900,
                    color: "#1769aa",
                  }}
                >
                  {row.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <div><h2 style={{ margin: 0, fontSize: 19 }}>BSO Cases | {activeCaseLabel}</h2><div style={{ marginTop: 4, fontSize: 11.5, color: "#64748b", fontWeight: 700 }}>Select a KPI above to change this case list.</div></div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
            {loading ? "Loading..." : `${caseRows.length} case(s)`}
          </div>
        </div>

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
              borderCollapse: "collapse",
              minWidth: 1500,
              background: "#fff",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={th}>Date</th>
                <th style={th}>Type</th>
                <th style={th}>Employee</th>
                <th style={th}>Passenger / PNR</th>
                <th style={th}>Flight</th>
                <th style={th}>Bag Tags</th>
                <th style={th}>Code 24</th>
                <th style={th}>Code 39 ID</th>
                <th style={th}>Exception Delivery</th>
                <th style={th}>Fault / Loss</th>
                <th style={th}>Supervisor</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!caseRows.length ? (
                <tr>
                  <td colSpan={12} style={td}>
                    {loading ? "Loading..." : "No data found."}
                  </td>
                </tr>
              ) : (
                caseRows.map((e, i) => (
                  <tr key={`${e.reportIdDoc}-${e.eventIndex}-${i}`}>
                    <td style={td}>
                      {e.reportDate}
                      <br />
                      <span style={{ color: "#64748b" }}>{e.shift}</span>
                    </td>
                    <td style={td}>
                      <b>{eventLabel(e.eventType)}</b>
                    </td>
                    <td style={td}>
                      {e.employee || "-"}
                      {e.agentCode ? (
                        <>
                          <br />
                          <span style={{ color: "#64748b" }}>
                            Code: {e.agentCode}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td style={td}>
                      {e.passengerName || "-"}
                      <br />
                      <b>{e.pnr || "-"}</b>
                    </td>
                    <td style={td}>{e.flightNumber || "-"}</td>
                    <td style={td}>{e.bagTags || "-"}</td>
                    <td style={td}>
                      {e.eventType === "CODE_24"
                        ? e.code24Created === true || e.code24Created === "Yes"
                          ? "Created"
                          : "Avoided"
                        : "-"}
                    </td>
                    <td style={td}>{e.reportId || "-"}</td>
                    <td style={td}>
                      {e.eventType === "EXCEPTION_DELIVERY" ? (
                        <>
                          <b>{e.netTracerFile || "-"}</b>
                          <br />
                          {e.deliveryMethod || "-"}
                          <br />
                          <span style={{ color: "#64748b" }}>
                            {e.exceptionReason || "-"}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={td}>
                      {e.faultStation || "-"}
                      <br />
                      {e.lossCode || "-"}
                    </td>
                    <td style={td}>{e.supervisorName || "-"}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedCase(e)}
                        >
                          View Case
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedId(e.reportIdDoc)}
                        >
                          Shift Report
                        </Button>
                        <Button
                          variant="danger"
                          disabled={
                            working === `${e.reportIdDoc}-${e.eventIndex}`
                          }
                          onClick={() =>
                            deleteEvent(e.reportIdDoc, e.eventIndex)
                          }
                        >
                          Delete Event
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedCase && (
        <div
          onClick={() => setSelectedCase(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000, background: "rgba(15,23,42,.58)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 10 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(900px,96vw)", maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 22, border: "1px solid #bfdbfe", boxShadow: "0 28px 80px rgba(15,23,42,.28)", padding: isMobile ? 14 : 20 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: "#1769aa", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>BSO Case Detail</div>
                <h2 style={{ margin: "4px 0", fontSize: isMobile ? 20 : 25 }}>{eventLabel(selectedCase.eventType)}</h2>
                <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 700 }}>{selectedCase.reportDate || "-"} | {selectedCase.shift || "-"} Shift | Supervisor: {selectedCase.supervisorName || "-"}</div>
              </div>
              <Button variant="secondary" onClick={() => setSelectedCase(null)}>Close</Button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 9 }}>
              <Metric label="Employee" value={selectedCase.employee || "-"} tone="slate" />
              <Metric label="Passenger" value={selectedCase.passengerName || "-"} tone="slate" />
              <Metric label="PNR" value={selectedCase.pnr || "-"} tone="blue" />
              <Metric label="Flight" value={selectedCase.flightNumber || "-"} tone="slate" />
              <Metric label="Bag Tag(s)" value={selectedCase.bagTags || "-"} tone="slate" />
              <Metric label="Review" value={selectedCase.supervisorReview || "-"} tone="slate" />
            </div>

            <div style={{ marginTop: 12, border: "1px solid #dbeafe", borderRadius: 16, padding: 14, background: "#f8fbff", fontSize: 13, lineHeight: 1.75, color: "#334155" }}>
              {selectedCase.eventType === "CODE_24" && <>
                <div><b>Code 24 Created:</b> {yesNo(selectedCase.code24Created)}</div>
                <div><b>Return Reason:</b> {selectedCase.returnReason || "-"}</div>
                <div><b>Code 24 Reason:</b> {selectedCase.code24Reason || "-"}</div>
                <div><b>BCC Referral:</b> {yesNo(selectedCase.bccReferral)}</div>
              </>}
              {selectedCase.eventType === "CODE_39" && <>
                <div><b>Report ID:</b> {selectedCase.reportId || "-"}</div>
                <div><b>World Tracer:</b> {selectedCase.worldTracerId || "-"}</div>
                <div><b>Fault Station:</b> {selectedCase.faultStation || "-"}</div>
                <div><b>Loss Code:</b> {selectedCase.lossCode || "-"}</div>
                <div><b>Bags Checked:</b> {selectedCase.bagsChecked ?? 0}</div>
                <div><b>Bags Received:</b> {selectedCase.bagsReceived ?? 0}</div>
              </>}
              {selectedCase.eventType === "EXCEPTION_DELIVERY" && <>
                <div><b>NetTracer File:</b> {selectedCase.netTracerFile || "-"}</div>
                <div><b>Exception Date:</b> {selectedCase.exceptionDate || "-"}</div>
                <div><b>Agent Code:</b> {selectedCase.agentCode || "-"}</div>
                <div><b>Exception Reason:</b> {selectedCase.exceptionReason || "-"}</div>
                <div><b>Delivery Method:</b> {selectedCase.deliveryMethod || "-"}</div>
              </>}
              {selectedCase.eventType === "OTHER" && <>
                <div><b>Category:</b> {selectedCase.otherCategory || "-"}</div>
                <div><b>Description:</b> {selectedCase.otherDescription || "-"}</div>
                <div><b>Action Taken:</b> {selectedCase.actionTaken || "-"}</div>
              </>}
              {selectedCase.comments ? <div style={{ marginTop: 8 }}><b>Comments / Coaching:</b> {selectedCase.comments}</div> : null}
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => { setSelectedId(selectedCase.reportIdDoc); setSelectedCase(null); }}>View Shift Report</Button>
              <Button variant="danger" disabled={working === `${selectedCase.reportIdDoc}-${selectedCase.eventIndex}`} onClick={() => { deleteEvent(selectedCase.reportIdDoc, selectedCase.eventIndex); setSelectedCase(null); }}>Delete Case</Button>
            </div>
          </div>
        </div>
      )}

      {selectedReport && (
        <div
          onClick={() => setSelectedId("")}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15,23,42,.58)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? 10 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1180px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 22,
              border: "1px solid #bfdbfe",
              boxShadow: "0 28px 80px rgba(15,23,42,.28)",
              padding: isMobile ? 14 : 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 14,
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#1769aa",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                  }}
                >
                  Selected Shift Report
                </div>
                <h2
                  style={{
                    margin: "4px 0",
                    fontSize: isMobile ? 20 : 24,
                    color: "#0f172a",
                  }}
                >
                  {selectedReport.reportDate} | {selectedReport.shift}
                </h2>
                <div style={{ color: "#64748b", fontSize: 12.5 }}>
                  Supervisor: {selectedReport.supervisorName || "-"} | Created:{" "}
                  {formatTs(selectedReport.createdAt)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <Button variant="dark" onClick={printSelectedReport}>
                  Print Report
                </Button>
                <Button
                  onClick={() => markReviewed(selectedReport.id)}
                  disabled={working === selectedReport.id}
                >
                  Mark Reviewed
                </Button>
                <Button
                  variant="danger"
                  onClick={() => deleteReport(selectedReport.id)}
                  disabled={working === selectedReport.id}
                >
                  Delete Report
                </Button>
                <Button variant="secondary" onClick={() => setSelectedId("")}>
                  Close
                </Button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr 1fr"
                  : "repeat(4,minmax(0,1fr))",
                gap: 9,
                marginBottom: 14,
              }}
            >
              <Metric
                label="Total Events"
                value={(selectedReport.events || []).length}
                tone="blue"
              />
              <Metric
                label="Code 24"
                value={
                  (selectedReport.events || []).filter(
                    (e) => e.eventType === "CODE_24"
                  ).length
                }
                tone="amber"
              />
              <Metric
                label="Code 39"
                value={
                  (selectedReport.events || []).filter(
                    (e) => e.eventType === "CODE_39"
                  ).length
                }
                tone="red"
              />
              <Metric
                label="Exception Delivery"
                value={
                  (selectedReport.events || []).filter(
                    (e) => e.eventType === "EXCEPTION_DELIVERY"
                  ).length
                }
                tone="blue"
              />
            </div>

            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 13,
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                fontSize: 12.5,
                color: "#475569",
              }}
            >
              Review Status: <b>{selectedReport.reviewStatus || "submitted"}</b>
              {selectedReport.notes ? (
                <>
                  <br />
                  <b>Notes:</b> {selectedReport.notes}
                </>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {(selectedReport.events || []).map((e, idx) => (
                <div
                  key={idx}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 13,
                    background: "#f8fbff",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {idx + 1}. {eventLabel(e.eventType)}
                  </div>
                  <div
                    style={{
                      marginTop: 7,
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: "#334155",
                    }}
                  >
                    <b>Employee:</b> {e.employee || "-"} | <b>Passenger:</b>{" "}
                    {e.passengerName || "-"} | <b>PNR:</b> {e.pnr || "-"} |{" "}
                    <b>Flight:</b> {e.flightNumber || "-"} | <b>Bag Tags:</b>{" "}
                    {e.bagTags || "-"}
                    <br />
                    <b>Details:</b> {reportEventDetails(e) || "-"}
                    <br />
                    <b>Review:</b> {e.supervisorReview || "-"}
                    {e.comments ? (
                      <>
                        {" | "}
                        <b>Comments:</b> {e.comments}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
