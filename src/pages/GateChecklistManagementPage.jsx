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

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
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
        fontWeight: 800,
        color: "#475569",
        letterSpacing: "0.04em",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function TimeInput(props) {
  return (
    <input
      type="time"
      step="60"
      {...props}
      style={{
        width: "100%",
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: props.disabled ? "#f8fafc" : "#ffffff",
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
  disabled = false,
  type = "button",
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#fff",
      border: "none",
    },
    secondary: {
      background: "#ffffff",
      color: "#1769aa",
      border: "1px solid #cfe7fb",
    },
    success: {
      background: "#16a34a",
      color: "#fff",
      border: "none",
    },
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
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
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value, tone = "default" }) {
  const tones = {
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
  };

  const current = tones[tone] || tones.default;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
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
          fontSize: 20,
          fontWeight: 900,
          color: current.color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DetailsRow({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 14,
        padding: "12px 14px",
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
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function getStartOfWeek(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateOnly(d);
}

function toDateOnly(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sameMonth(dateStr, month) {
  return String(dateStr || "").slice(0, 7) === month;
}

function sameWeek(dateStr, weekStart) {
  return getStartOfWeek(dateStr) === weekStart;
}

function inDateRange(dateStr, startDate, endDate) {
  if (!dateStr) return false;
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

function getOtpPercent(otpFlights, flights) {
  if (!flights) return 0;
  return (otpFlights / flights) * 100;
}

function getMbrPercent(notLoadedBags, checkedBags) {
  if (!checkedBags) return 0;
  return (notLoadedBags / checkedBags) * 100;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function getMonthKey(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function downloadCsv(filename, rows) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printManagementView() {
  window.print();
}

function printReportDetails(report) {
  const specials = report?.specials || {};
  const gateCheck = report?.gateCheck || {};
  const delayAnnouncements = Array.isArray(report?.delayAnnouncements)
    ? report.delayAnnouncements
    : [];
  const checklistSections = Array.isArray(report?.checklistSections)
    ? report.checklistSections
    : [];
  const actuals = report?.actuals || {};

  const html = `
    <html>
      <head>
        <title>Gate Checklist Details</title>
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            padding: 24px;
            color: #0f172a;
          }
          h1, h2, h3 {
            margin: 0 0 12px;
          }
          .card {
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }
          .label {
            font-size: 11px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 800;
            letter-spacing: 0.06em;
          }
          .value {
            margin-top: 6px;
            font-size: 14px;
            font-weight: 700;
            white-space: pre-wrap;
            word-break: break-word;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            vertical-align: top;
            text-align: left;
            font-size: 13px;
          }
          th {
            background: #f8fafc;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
        </style>
      </head>
      <body>
        <h1>Gate Checklist Details</h1>

        <div class="card">
          <div class="grid">
            <div><div class="label">Airline</div><div class="value">${report.airline || "-"}</div></div>
            <div><div class="label">Flight</div><div class="value">${report.flight || "-"}</div></div>
            <div><div class="label">Date</div><div class="value">${report.date || "-"}</div></div>
            <div><div class="label">Aircraft</div><div class="value">${report.aircraft || "-"}</div></div>
            <div><div class="label">Origin</div><div class="value">${report.origin || "-"}</div></div>
            <div><div class="label">Destination</div><div class="value">${report.destination || "-"}</div></div>
            <div><div class="label">ETD</div><div class="value">${report.etd || "-"}</div></div>
            <div><div class="label">New ETD</div><div class="value">${report.newEtd || "-"}</div></div>
            <div><div class="label">${report.airline === "SY" ? "D-10" : "D-15"}</div><div class="value">${report.boardingDeadline || "-"}</div></div>
            <div><div class="label">Push Time</div><div class="value">${report.pushTime || "-"}</div></div>
            <div><div class="label">Brake Release</div><div class="value">${report.brakeReleaseTime || "-"}</div></div>
            <div><div class="label">Delay Code</div><div class="value">${report.delayCode || "-"}</div></div>
            <div><div class="label">Delay</div><div class="value">${report.delay || "-"}</div></div>
            <div><div class="label">Delay Time (Minutes)</div><div class="value">${safeNumber(report.delayTimeMinutes)}</div></div>
            <div><div class="label">Controllable</div><div class="value">${report.controllable || "-"}</div></div>
            <div><div class="label">Gate Agent</div><div class="value">${report.gateAgent || "-"}</div></div>
            <div><div class="label">Expeditor</div><div class="value">${report.expeditor || "-"}</div></div>
            <div><div class="label">Supervisor</div><div class="value">${report.supervisor || "-"}</div></div>
            <div><div class="label">Final Total Pax</div><div class="value">${safeNumber(report.finalTotalPax)}</div></div>
            <div><div class="label">First Pax Off</div><div class="value">${report.firstPaxOff || "-"}</div></div>
            <div><div class="label">Last Pax Off</div><div class="value">${report.lastPaxOff || "-"}</div></div>
            <div><div class="label">First Pax On</div><div class="value">${report.firstPaxOn || "-"}</div></div>
            <div><div class="label">Last Pax On</div><div class="value">${report.lastPaxOn || "-"}</div></div>
            <div><div class="label">Checked Bags</div><div class="value">${safeNumber(report.checkedBags)}</div></div>
            <div><div class="label">Not Loaded Bags</div><div class="value">${safeNumber(report.notLoadedBags)}</div></div>
            <div><div class="label">MBR %</div><div class="value">${formatPercent(
              getMbrPercent(safeNumber(report.notLoadedBags), safeNumber(report.checkedBags))
            )}</div></div>
          </div>
        </div>

        <div class="card">
          <h3>Ops Info</h3>
          <div class="grid">
            <div><div class="label">GPU Connected</div><div class="value">${report.gpuConnected || "-"}</div></div>
            <div><div class="label">Gate Agent 1 Arrival</div><div class="value">${report.gateAgent1Arrival || "-"}</div></div>
            <div><div class="label">Gate Agent 2 Arrival</div><div class="value">${report.gateAgent2Arrival || "-"}</div></div>
            <div><div class="label">Actual Departure</div><div class="value">${report.actualDepartureTime || "-"}</div></div>
            <div><div class="label">Actual Arrival</div><div class="value">${report.actualArrivalTime || "-"}</div></div>
            <div><div class="label">Created</div><div class="value">${formatDateTime(report.createdAt)}</div></div>
          </div>
        </div>

        <div class="card">
          <h3>Specials</h3>
          <table>
            <thead>
              <tr><th>Type</th><th>Value</th></tr>
            </thead>
            <tbody>
              ${Object.keys(specials).length
                ? Object.entries(specials)
                    .map(
                      ([key, value]) =>
                        `<tr><td>${key}</td><td>${String(value || "-")}</td></tr>`
                    )
                    .join("")
                : `<tr><td colspan="2">No specials</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Gate Check</h3>
          <table>
            <thead>
              <tr><th>Item</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td>Bags</td><td>${gateCheck.bags || "-"}</td></tr>
              <tr><td>Strollers / Car Seats</td><td>${gateCheck.strollersCarSeats || "-"}</td></tr>
              <tr><td>WCHRS</td><td>${gateCheck.wchrs || "-"}</td></tr>
              <tr><td>Other</td><td>${gateCheck.other || "-"}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Delay Announcements</h3>
          ${
            delayAnnouncements.length
              ? `<ul>${delayAnnouncements
                  .map((item) => `<li>${item || "-"}</li>`)
                  .join("")}</ul>`
              : `<div>No delay announcements</div>`
          }
        </div>

        <div class="card">
          <h3>Checklist Details</h3>
          <table>
            <thead>
              <tr><th>Time</th><th>Task</th><th>Actual</th></tr>
            </thead>
            <tbody>
              ${
                checklistSections.length
                  ? checklistSections
                      .map((section, sectionIndex) =>
                        (section.tasks || [])
                          .map(
                            (task, taskIndex) => `
                              <tr>
                                <td>${section.time || "-"}</td>
                                <td>${task || "-"}</td>
                                <td>${actuals[`${sectionIndex}-${taskIndex}`] || "-"}</td>
                              </tr>
                            `
                          )
                          .join("")
                      )
                      .join("")
                  : `<tr><td colspan="3">No checklist data</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Notes</h3>
          <div class="value">${report.remarks || "-"}</div>
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

export default function GateChecklistManagementPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [editReportId, setEditReportId] = useState("");
  const [editForm, setEditForm] = useState(null);

  const [filters, setFilters] = useState({
    airline: "all",
    flight: "",
    date: "",
    weekStart: "",
    month: "",
    startDate: "",
    endDate: "",
    periodType: "day",
    status: "all",
    monthClosed: "all",
  });

  useEffect(() => {
    async function loadReports() {
      try {
        const snap = await getDocs(
          query(collection(db, "gateChecklistReports"), orderBy("createdAt", "desc"))
        );

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (error) {
        console.error("Error loading gate checklist reports:", error);
        setStatusMessage("Could not load gate checklist reports.");
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (filters.airline !== "all" && item.airline !== filters.airline) {
        return false;
      }

      if (
        filters.flight &&
        !String(item.flight || "")
          .toLowerCase()
          .includes(filters.flight.toLowerCase().trim())
      ) {
        return false;
      }

      if (filters.status !== "all" && String(item.status || "") !== filters.status) {
        return false;
      }

      if (filters.monthClosed !== "all") {
        const isClosed = !!item.monthClosed;
        if (filters.monthClosed === "closed" && !isClosed) return false;
        if (filters.monthClosed === "open" && isClosed) return false;
      }

      if (filters.periodType === "day" && filters.date) {
        if (item.date !== filters.date) return false;
      }

      if (filters.periodType === "week" && filters.weekStart) {
        if (!sameWeek(item.date, filters.weekStart)) return false;
      }

      if (filters.periodType === "month" && filters.month) {
        if (!sameMonth(item.date, filters.month)) return false;
      }

      if (filters.periodType === "range") {
        if (!inDateRange(item.date, filters.startDate, filters.endDate)) {
          return false;
        }
      }

      return true;
    });
  }, [reports, filters]);

  const selectedReport = useMemo(() => {
    return filteredReports.find((item) => item.id === selectedReportId) || null;
  }, [filteredReports, selectedReportId]);

  const otpByAirline = useMemo(() => {
    const map = {};

    filteredReports.forEach((item) => {
      const airline = item.airline || "N/A";

      if (!map[airline]) {
        map[airline] = {
          flights: 0,
          otpFlights: 0,
          totalCheckedBags: 0,
          totalNotLoadedBags: 0,
        };
      }

      map[airline].flights += 1;
      map[airline].totalCheckedBags += safeNumber(item.checkedBags);
      map[airline].totalNotLoadedBags += safeNumber(item.notLoadedBags);

      if (item.isOtpDeparture === true) {
        map[airline].otpFlights += 1;
      }
    });

    return Object.entries(map).map(([airline, data]) => {
      const otpPercent = getOtpPercent(data.otpFlights, data.flights);
      const mbrPercent = getMbrPercent(
        data.totalNotLoadedBags,
        data.totalCheckedBags
      );

      return {
        airline,
        ...data,
        otpPercent,
        mbrPercent,
      };
    });
  }, [filteredReports]);

  const delaySummary = useMemo(() => {
    return filteredReports
      .filter((item) => String(item.delay || "").toLowerCase() === "yes")
      .map((item) => ({
        id: item.id,
        airline: item.airline || "-",
        flight: item.flight || "-",
        route: `${item.origin || "-"} - ${item.destination || "-"}`,
        etd: item.etd || "-",
        pushTime: item.pushTime || "-",
        delayTimeMinutes: safeNumber(item.delayTimeMinutes),
        delayCode: item.delayCode || "-",
      }));
  }, [filteredReports]);

  const paxFlowSummary = useMemo(() => {
    return filteredReports.map((item) => ({
      id: item.id,
      date: item.date || "-",
      airline: item.airline || "-",
      flight: item.flight || "-",
      totalInPax: safeNumber(item.finalTotalPax),
      totalOutPax: safeNumber(item.finalTotalPax),
    }));
  }, [filteredReports]);

  const totals = useMemo(() => {
    const flights = filteredReports.length;
    const otpFlights = filteredReports.filter(
      (item) => item.isOtpDeparture === true
    ).length;
    const checkedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.checkedBags),
      0
    );
    const notLoadedBags = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.notLoadedBags),
      0
    );
    const delayedFlights = filteredReports.filter(
      (item) => String(item.delay || "").toLowerCase() === "yes"
    ).length;
    const totalInPax = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.finalTotalPax),
      0
    );
    const totalOutPax = filteredReports.reduce(
      (sum, item) => sum + safeNumber(item.finalTotalPax),
      0
    );

    const otpPercent = getOtpPercent(otpFlights, flights);
    const stationMbrPercent = getMbrPercent(notLoadedBags, checkedBags);

    return {
      flights,
      otpFlights,
      otpPercent,
      checkedBags,
      notLoadedBags,
      stationMbrPercent,
      delayedFlights,
      totalInPax,
      totalOutPax,
    };
  }, [filteredReports]);

  const monthlySummaries = useMemo(() => {
    const monthlyMap = {};

    reports.forEach((item) => {
      const month = getMonthKey(item.date || item.month || "");
      if (!month) return;

      if (!monthlyMap[month]) {
        monthlyMap[month] = {
          month,
          flights: 0,
          otpFlights: 0,
          checkedBags: 0,
          notLoadedBags: 0,
          monthClosed: false,
          closedAt: "",
        };
      }

      monthlyMap[month].flights += 1;
      monthlyMap[month].checkedBags += safeNumber(item.checkedBags);
      monthlyMap[month].notLoadedBags += safeNumber(item.notLoadedBags);
      if (item.isOtpDeparture === true) {
        monthlyMap[month].otpFlights += 1;
      }

      if (item.monthClosed) {
        monthlyMap[month].monthClosed = true;
        monthlyMap[month].closedAt = item.monthClosedAt || monthlyMap[month].closedAt;
      }
    });

    return Object.values(monthlyMap)
      .map((row) => ({
        ...row,
        otpPercent: getOtpPercent(row.otpFlights, row.flights),
        mbrPercent: getMbrPercent(row.notLoadedBags, row.checkedBags),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [reports]);

  function startEdit(report) {
    setSelectedReportId(report.id);
    setEditReportId(report.id);
    setEditForm({
      airline: report.airline || "",
      flight: report.flight || "",
      date: report.date || "",
      aircraft: report.aircraft || "",
      origin: report.origin || "",
      destination: report.destination || "",
      etd: report.etd || "",
      newEtd: report.newEtd || "",
      boardingDeadline: report.boardingDeadline || "",
      pushTime: report.pushTime || "",
      brakeReleaseTime: report.brakeReleaseTime || "",
      delay: report.delay || "No",
      delayTimeMinutes:
        report.delayTimeMinutes !== undefined && report.delayTimeMinutes !== null
          ? String(report.delayTimeMinutes)
          : "",
      delayCode: report.delayCode || "",
      controllable: report.controllable || "No",
      gateAgent: report.gateAgent || "",
      expeditor: report.expeditor || "",
      supervisor: report.supervisor || "",
      finalTotalPax:
        report.finalTotalPax !== undefined && report.finalTotalPax !== null
          ? String(report.finalTotalPax)
          : "",
      firstPaxOff: report.firstPaxOff || "",
      lastPaxOff: report.lastPaxOff || "",
      firstPaxOn: report.firstPaxOn || "",
      lastPaxOn: report.lastPaxOn || "",
      checkedBags:
        report.checkedBags !== undefined && report.checkedBags !== null
          ? String(report.checkedBags)
          : "",
      notLoadedBags:
        report.notLoadedBags !== undefined && report.notLoadedBags !== null
          ? String(report.notLoadedBags)
          : "",
      gpuConnected: report.gpuConnected || "",
      gateAgent1Arrival: report.gateAgent1Arrival || "",
      gateAgent2Arrival: report.gateAgent2Arrival || "",
      actualDepartureTime: report.actualDepartureTime || "",
      actualArrivalTime: report.actualArrivalTime || "",
      remarks: report.remarks || "",
      status: report.status || "draft",
    });
  }

  function cancelEdit() {
    setEditReportId("");
    setEditForm(null);
  }

  async function handleSaveReportEdits(reportId) {
    if (!editForm) return;

    try {
      setWorkingId(reportId);

      const payload = {
        airline: editForm.airline || "",
        flight: editForm.flight || "",
        date: editForm.date || "",
        aircraft: editForm.aircraft || "",
        origin: editForm.origin || "",
        destination: editForm.destination || "",
        etd: editForm.etd || "",
        newEtd: editForm.newEtd || "",
        boardingDeadline: editForm.boardingDeadline || "",
        pushTime: editForm.pushTime || "",
        brakeReleaseTime: editForm.brakeReleaseTime || "",
        delay: editForm.delay || "No",
        delayTimeMinutes: Number(editForm.delayTimeMinutes || 0),
        delayCode: editForm.delayCode || "",
        controllable: editForm.controllable || "No",
        gateAgent: editForm.gateAgent || "",
        expeditor: editForm.expeditor || "",
        supervisor: editForm.supervisor || "",
        finalTotalPax: Number(editForm.finalTotalPax || 0),
        firstPaxOff: editForm.firstPaxOff || "",
        lastPaxOff: editForm.lastPaxOff || "",
        firstPaxOn: editForm.firstPaxOn || "",
        lastPaxOn: editForm.lastPaxOn || "",
        checkedBags: Number(editForm.checkedBags || 0),
        notLoadedBags: Number(editForm.notLoadedBags || 0),
        gpuConnected: editForm.gpuConnected || "",
        gateAgent1Arrival: editForm.gateAgent1Arrival || "",
        gateAgent2Arrival: editForm.gateAgent2Arrival || "",
        actualDepartureTime: editForm.actualDepartureTime || "",
        actualArrivalTime: editForm.actualArrivalTime || "",
        remarks: editForm.remarks || "",
        status: editForm.status || "draft",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "gateChecklistReports", reportId), payload);

      setReports((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? {
                ...item,
                ...payload,
                updatedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage("Report updated successfully.");
      setEditReportId("");
      setEditForm(null);
    } catch (error) {
      console.error("Error updating report:", error);
      setStatusMessage("Could not update report.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleDeleteReport(reportId) {
    const ok = window.confirm("Delete this report permanently?");
    if (!ok) return;

    try {
      setWorkingId(reportId);
      await deleteDoc(doc(db, "gateChecklistReports", reportId));
      setReports((prev) => prev.filter((item) => item.id !== reportId));
      if (selectedReportId === reportId) {
        setSelectedReportId("");
      }
      if (editReportId === reportId) {
        setEditReportId("");
        setEditForm(null);
      }
      setStatusMessage("Report deleted successfully.");
    } catch (error) {
      console.error("Error deleting report:", error);
      setStatusMessage("Could not delete report.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleCloseMonth(monthValue) {
    const monthReports = reports.filter((item) => getMonthKey(item.date || "") === monthValue);

    if (!monthReports.length) {
      setStatusMessage("No reports found for that month.");
      return;
    }

    const ok = window.confirm(
      `Close month ${monthValue} for ${monthReports.length} reports?`
    );
    if (!ok) return;

    try {
      setWorkingId(monthValue);

      await Promise.all(
        monthReports.map((item) =>
          updateDoc(doc(db, "gateChecklistReports", item.id), {
            monthClosed: true,
            monthClosedAt: serverTimestamp(),
          })
        )
      );

      setReports((prev) =>
        prev.map((item) =>
          getMonthKey(item.date || "") === monthValue
            ? {
                ...item,
                monthClosed: true,
                monthClosedAt: new Date(),
              }
            : item
        )
      );

      setStatusMessage(`Month ${monthValue} closed successfully.`);
    } catch (error) {
      console.error("Error closing month:", error);
      setStatusMessage("Could not close month.");
    } finally {
      setWorkingId("");
    }
  }

  function handleExportCurrentCsv() {
    const rows = [
      [
        "Date",
        "Airline",
        "Flight",
        "Origin",
        "Destination",
        "ETD",
        "Push Time",
        "OTP",
        "Delay",
        "Delay Time Minutes",
        "Delay Code",
        "Controllable",
        "Final Total Pax",
        "Checked Bags",
        "Not Loaded Bags",
        "MBR %",
        "Status",
        "Month Closed",
        "Submitted By",
        "Created At",
      ],
      ...filteredReports.map((item) => {
        const checked = safeNumber(item.checkedBags);
        const notLoaded = safeNumber(item.notLoadedBags);
        const mbr = getMbrPercent(notLoaded, checked);

        return [
          item.date || "",
          item.airline || "",
          item.flight || "",
          item.origin || "",
          item.destination || "",
          item.etd || "",
          item.pushTime || "",
          item.isOtpDeparture === true
            ? "YES"
            : item.isOtpDeparture === false
            ? "NO"
            : "",
          item.delay || "",
          safeNumber(item.delayTimeMinutes),
          item.delayCode || "",
          item.controllable || "",
          safeNumber(item.finalTotalPax),
          checked,
          notLoaded,
          formatPercent(mbr),
          item.status || "",
          item.monthClosed ? "YES" : "NO",
          item.submittedBy || "",
          formatDateTime(item.createdAt),
        ];
      }),
    ];

    downloadCsv("gate-checklist-management.csv", rows);
  }

  const selectedMonthSummary = useMemo(() => {
    if (!filters.month) return null;
    return monthlySummaries.find((item) => item.month === filters.month) || null;
  }, [monthlySummaries, filters.month]);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <style>{`
        @media print {
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 24,
          padding: 24,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            opacity: 0.85,
          }}
        >
          TPA OPS · Gate Checklist Management
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          Gate Checklist Management / OTP / MBR / Pax Flow
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 960,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          Filter by flight, airline, date range, week or month. Close months,
          print, export, delete bad reports, and review OTP, delays, baggage
          MBR, and pax flow.
        </p>
      </div>

      {statusMessage && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#edf7ff",
              border: "1px solid #cfe7fb",
              color: "#1769aa",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {statusMessage}
          </div>
        </PageCard>
      )}

      <PageCard className="no-print" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <ActionButton variant="primary" onClick={printManagementView}>
              Print
            </ActionButton>
            <ActionButton variant="secondary" onClick={handleExportCurrentCsv}>
              Export CSV
            </ActionButton>
            {filters.month && (
              <ActionButton
                variant="warning"
                onClick={() => handleCloseMonth(filters.month)}
                disabled={workingId === filters.month}
              >
                {workingId === filters.month ? "Closing..." : `Close Month ${filters.month}`}
              </ActionButton>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Period Type</FieldLabel>
            <SelectInput
              value={filters.periodType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, periodType: e.target.value }))
              }
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="range">Date Range</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={filters.airline}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, airline: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="SY">SUN COUNTRY (SY)</option>
              <option value="AV">AVIANCA (AV)</option>
              <option value="WL">WORLD ATLANTIC (WL)</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Flight</FieldLabel>
            <TextInput
              value={filters.flight}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, flight: e.target.value }))
              }
              placeholder="Example: SY123"
            />
          </div>

          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="closed">Closed</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Month Closed</FieldLabel>
            <SelectInput
              value={filters.monthClosed}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, monthClosed: e.target.value }))
              }
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </SelectInput>
          </div>

          {filters.periodType === "day" && (
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={filters.date}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "week" && (
            <div>
              <FieldLabel>Week Start</FieldLabel>
              <TextInput
                type="date"
                value={filters.weekStart}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, weekStart: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "month" && (
            <div>
              <FieldLabel>Month</FieldLabel>
              <TextInput
                type="month"
                value={filters.month}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, month: e.target.value }))
                }
              />
            </div>
          )}

          {filters.periodType === "range" && (
            <>
              <div>
                <FieldLabel>Start Date</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>

              <div>
                <FieldLabel>End Date</FieldLabel>
                <TextInput
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </>
          )}
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <InfoCard label="Flights" value={String(totals.flights)} />
        <InfoCard label="OTP Flights" value={String(totals.otpFlights)} tone="green" />
        <InfoCard label="OTP %" value={formatPercent(totals.otpPercent)} tone="blue" />
        <InfoCard label="Delayed Flights" value={String(totals.delayedFlights)} tone="amber" />
        <InfoCard label="Checked Bags" value={String(totals.checkedBags)} />
        <InfoCard
          label="Not Loaded Bags"
          value={String(totals.notLoadedBags)}
          tone={totals.notLoadedBags > 0 ? "red" : "green"}
        />
        <InfoCard
          label="Station MBR %"
          value={formatPercent(totals.stationMbrPercent)}
          tone={totals.stationMbrPercent > 0 ? "amber" : "green"}
        />
        <InfoCard label="Total IN Pax" value={String(totals.totalInPax)} tone="blue" />
        <InfoCard label="Total OUT Pax" value={String(totals.totalOutPax)} tone="blue" />
      </div>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Delay Summary
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>ETD</th>
                <th style={thStyle}>Push Back</th>
                <th style={thStyle}>Delay Time</th>
                <th style={thStyle}>Delay Code</th>
              </tr>
            </thead>
            <tbody>
              {delaySummary.length === 0 ? (
                <tr>
                  <td colSpan={7} style={tdStyle}>
                    {loading ? "Loading..." : "No delays found."}
                  </td>
                </tr>
              ) : (
                delaySummary.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.airline}</td>
                    <td style={tdStyle}>{item.flight}</td>
                    <td style={tdStyle}>{item.route}</td>
                    <td style={tdStyle}>{item.etd}</td>
                    <td style={tdStyle}>{item.pushTime}</td>
                    <td style={tdStyle}>{item.delayTimeMinutes}</td>
                    <td style={tdStyle}>{item.delayCode}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Pax Flow Summary
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Total IN Pax</th>
                <th style={thStyle}>Total OUT Pax</th>
              </tr>
            </thead>
            <tbody>
              {paxFlowSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} style={tdStyle}>
                    {loading ? "Loading..." : "No pax flow data found."}
                  </td>
                </tr>
              ) : (
                paxFlowSummary.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.date}</td>
                    <td style={tdStyle}>{item.airline}</td>
                    <td style={tdStyle}>{item.flight}</td>
                    <td style={tdStyle}>{item.totalInPax}</td>
                    <td style={tdStyle}>{item.totalOutPax}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Submitted Checklists
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Airline</th>
                <th style={thStyle}>Flight</th>
                <th style={thStyle}>Final Total Pax</th>
                <th style={thStyle}>Route</th>
                <th style={thStyle}>ETD</th>
                <th style={thStyle}>Push</th>
                <th style={thStyle}>OTP</th>
                <th style={thStyle}>Delay</th>
                <th style={thStyle}>Delay Time</th>
                <th style={thStyle}>Delay Code</th>
                <th style={thStyle}>Checked Bags</th>
                <th style={thStyle}>Not Loaded</th>
                <th style={thStyle}>MBR %</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Month Closed</th>
                <th style={thStyle}>Submitted By</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={19} style={tdStyle}>
                    {loading ? "Loading..." : "No reports found."}
                  </td>
                </tr>
              ) : (
                filteredReports.map((item) => {
                  const checked = safeNumber(item.checkedBags);
                  const notLoaded = safeNumber(item.notLoadedBags);
                  const mbrPercent = getMbrPercent(notLoaded, checked);

                  return (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.date || "-"}</td>
                      <td style={tdStyle}>{item.airline || "-"}</td>
                      <td style={tdStyle}>{item.flight || "-"}</td>
                      <td style={tdStyle}>{safeNumber(item.finalTotalPax)}</td>
                      <td style={tdStyle}>
                        {item.origin || "-"} - {item.destination || "-"}
                      </td>
                      <td style={tdStyle}>{item.etd || "-"}</td>
                      <td style={tdStyle}>{item.pushTime || "-"}</td>
                      <td style={tdStyle}>
                        {item.isOtpDeparture === true
                          ? "YES"
                          : item.isOtpDeparture === false
                          ? "NO"
                          : "-"}
                      </td>
                      <td style={tdStyle}>{item.delay || "-"}</td>
                      <td style={tdStyle}>{safeNumber(item.delayTimeMinutes)}</td>
                      <td style={tdStyle}>{item.delayCode || "-"}</td>
                      <td style={tdStyle}>{checked}</td>
                      <td style={tdStyle}>{notLoaded}</td>
                      <td style={tdStyle}>{formatPercent(mbrPercent)}</td>
                      <td style={tdStyle}>{item.status || "-"}</td>
                      <td style={tdStyle}>{item.monthClosed ? "YES" : "NO"}</td>
                      <td style={tdStyle}>{item.submittedBy || "-"}</td>
                      <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="secondary"
                            onClick={() =>
                              setSelectedReportId((prev) =>
                                prev === item.id ? "" : item.id
                              )
                            }
                          >
                            {selectedReportId === item.id ? "Hide Details" : "View Details"}
                          </ActionButton>

                          <ActionButton
                            variant="warning"
                            onClick={() => startEdit(item)}
                          >
                            Edit
                          </ActionButton>

                          <ActionButton
                            variant="dark"
                            onClick={() => printReportDetails(item)}
                          >
                            Print Details
                          </ActionButton>

                          <ActionButton
                            variant="danger"
                            onClick={() => handleDeleteReport(item.id)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? "Deleting..." : "Delete"}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      {selectedReport && (
        <PageCard style={{ padding: 20 }}>
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
                  fontSize: 22,
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                Gate Checklist Details
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 14,
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {selectedReport.airline || "-"} · {selectedReport.flight || "-"} · {selectedReport.date || "-"}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ActionButton
                variant="warning"
                onClick={() => startEdit(selectedReport)}
              >
                Edit
              </ActionButton>
              <ActionButton
                variant="dark"
                onClick={() => printReportDetails(selectedReport)}
              >
                Print Details
              </ActionButton>
              <ActionButton
                variant="secondary"
                onClick={() => setSelectedReportId("")}
              >
                Close
              </ActionButton>
            </div>
          </div>

          {editReportId === selectedReport.id && editForm && (
            <div
              style={{
                marginBottom: 18,
                border: "1px solid #fed7aa",
                background: "#fff7ed",
                borderRadius: 18,
                padding: 16,
                display: "grid",
                gap: 14,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#9a3412",
                }}
              >
                Edit Report
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <div>
                  <FieldLabel>Airline</FieldLabel>
                  <SelectInput
                    value={editForm.airline}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, airline: e.target.value }))
                    }
                  >
                    <option value="SY">SUN COUNTRY (SY)</option>
                    <option value="AV">AVIANCA (AV)</option>
                    <option value="WL">WORLD ATLANTIC (WL)</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Flight</FieldLabel>
                  <TextInput
                    value={editForm.flight}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, flight: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Date</FieldLabel>
                  <TextInput
                    type="date"
                    value={editForm.date}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Aircraft</FieldLabel>
                  <TextInput
                    value={editForm.aircraft}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, aircraft: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Origin</FieldLabel>
                  <TextInput
                    value={editForm.origin}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, origin: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Destination</FieldLabel>
                  <TextInput
                    value={editForm.destination}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, destination: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>ETD</FieldLabel>
                  <TimeInput
                    value={editForm.etd}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, etd: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>New ETD</FieldLabel>
                  <TimeInput
                    value={editForm.newEtd}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, newEtd: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>D-10 / D-15</FieldLabel>
                  <TimeInput
                    value={editForm.boardingDeadline}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        boardingDeadline: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Push Time</FieldLabel>
                  <TimeInput
                    value={editForm.pushTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, pushTime: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Brake Release</FieldLabel>
                  <TimeInput
                    value={editForm.brakeReleaseTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        brakeReleaseTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Delay</FieldLabel>
                  <SelectInput
                    value={editForm.delay}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, delay: e.target.value }))
                    }
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Delay Time Minutes</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editForm.delayTimeMinutes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        delayTimeMinutes: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Delay Code</FieldLabel>
                  <TextInput
                    value={editForm.delayCode}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, delayCode: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Controllable</FieldLabel>
                  <SelectInput
                    value={editForm.controllable}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        controllable: e.target.value,
                      }))
                    }
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </SelectInput>
                </div>

                <div>
                  <FieldLabel>Gate Agent</FieldLabel>
                  <TextInput
                    value={editForm.gateAgent}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, gateAgent: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Expeditor</FieldLabel>
                  <TextInput
                    value={editForm.expeditor}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, expeditor: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Supervisor</FieldLabel>
                  <TextInput
                    value={editForm.supervisor}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, supervisor: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Final Total Pax</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editForm.finalTotalPax}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        finalTotalPax: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>First Pax Off</FieldLabel>
                  <TimeInput
                    value={editForm.firstPaxOff}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        firstPaxOff: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Last Pax Off</FieldLabel>
                  <TimeInput
                    value={editForm.lastPaxOff}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        lastPaxOff: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>First Pax On</FieldLabel>
                  <TimeInput
                    value={editForm.firstPaxOn}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        firstPaxOn: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Last Pax On</FieldLabel>
                  <TimeInput
                    value={editForm.lastPaxOn}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        lastPaxOn: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Checked Bags</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editForm.checkedBags}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        checkedBags: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Not Loaded Bags</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    value={editForm.notLoadedBags}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        notLoadedBags: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>GPU Connected</FieldLabel>
                  <TextInput
                    value={editForm.gpuConnected}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        gpuConnected: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Gate Agent 1 Arrival</FieldLabel>
                  <TimeInput
                    value={editForm.gateAgent1Arrival}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        gateAgent1Arrival: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Gate Agent 2 Arrival</FieldLabel>
                  <TimeInput
                    value={editForm.gateAgent2Arrival}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        gateAgent2Arrival: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Actual Departure</FieldLabel>
                  <TimeInput
                    value={editForm.actualDepartureTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        actualDepartureTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Actual Arrival</FieldLabel>
                  <TimeInput
                    value={editForm.actualArrivalTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        actualArrivalTime: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <FieldLabel>Status</FieldLabel>
                  <SelectInput
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="closed">Closed</option>
                  </SelectInput>
                </div>
              </div>

              <div>
                <FieldLabel>Notes</FieldLabel>
                <TextArea
                  value={editForm.remarks}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, remarks: e.target.value }))
                  }
                />
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ActionButton
                  variant="success"
                  onClick={() => handleSaveReportEdits(selectedReport.id)}
                  disabled={workingId === selectedReport.id}
                >
                  {workingId === selectedReport.id ? "Saving..." : "Save Changes"}
                </ActionButton>

                <ActionButton
                  variant="secondary"
                  onClick={cancelEdit}
                  disabled={workingId === selectedReport.id}
                >
                  Cancel
                </ActionButton>
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <DetailsRow label="Airline" value={selectedReport.airline} />
            <DetailsRow label="Flight" value={selectedReport.flight} />
            <DetailsRow label="Date" value={selectedReport.date} />
            <DetailsRow label="Aircraft" value={selectedReport.aircraft} />
            <DetailsRow label="Origin" value={selectedReport.origin} />
            <DetailsRow label="Destination" value={selectedReport.destination} />
            <DetailsRow label="ETD" value={selectedReport.etd} />
            <DetailsRow label="New ETD" value={selectedReport.newEtd} />
            <DetailsRow
              label={selectedReport.airline === "SY" ? "D-10" : "D-15"}
              value={selectedReport.boardingDeadline}
            />
            <DetailsRow label="Final Total Pax" value={String(safeNumber(selectedReport.finalTotalPax))} />
            <DetailsRow label="First Pax Off" value={selectedReport.firstPaxOff} />
            <DetailsRow label="Last Pax Off" value={selectedReport.lastPaxOff} />
            <DetailsRow label="First Pax On" value={selectedReport.firstPaxOn} />
            <DetailsRow label="Last Pax On" value={selectedReport.lastPaxOn} />
            <DetailsRow label="Delay" value={selectedReport.delay} />
            <DetailsRow label="Delay Time (Minutes)" value={String(safeNumber(selectedReport.delayTimeMinutes))} />
            <DetailsRow label="Delay Code" value={selectedReport.delayCode} />
            <DetailsRow label="Controllable" value={selectedReport.controllable} />
            <DetailsRow label="Block In" value={selectedReport.blockIn} />
            <DetailsRow label="Actual Departure" value={selectedReport.actualDepartureTime} />
            <DetailsRow label="Actual Arrival" value={selectedReport.actualArrivalTime} />
            <DetailsRow label="Brake Release" value={selectedReport.brakeReleaseTime} />
            <DetailsRow label="Push Time" value={selectedReport.pushTime} />
            <DetailsRow label="GPU Connected" value={selectedReport.gpuConnected} />
            <DetailsRow label="Gate Agent" value={selectedReport.gateAgent} />
            <DetailsRow label="Expeditor" value={selectedReport.expeditor} />
            <DetailsRow label="Supervisor" value={selectedReport.supervisor} />
            <DetailsRow label="Gate Agent 1 Arrival" value={selectedReport.gateAgent1Arrival} />
            <DetailsRow label="Gate Agent 2 Arrival" value={selectedReport.gateAgent2Arrival} />
            <DetailsRow label="Checked Bags" value={String(safeNumber(selectedReport.checkedBags))} />
            <DetailsRow label="Not Loaded Bags" value={String(safeNumber(selectedReport.notLoadedBags))} />
            <DetailsRow
              label="MBR %"
              value={formatPercent(
                getMbrPercent(
                  safeNumber(selectedReport.notLoadedBags),
                  safeNumber(selectedReport.checkedBags)
                )
              )}
            />
            <DetailsRow label="Status" value={selectedReport.status} />
            <DetailsRow label="Submitted By" value={selectedReport.submittedBy} />
            <DetailsRow label="Created" value={formatDateTime(selectedReport.createdAt)} />
          </div>
        </PageCard>
      )}
    </div>
  );
}

const tableWrapStyle = {
  overflowX: "auto",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1700,
  background: "#fff",
};

const thStyle = {
  padding: "14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};

const sectionTitleStyle = {
  margin: "0 0 10px",
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const emptyTextStyle = {
  fontSize: 14,
  color: "#64748b",
  fontWeight: 700,
};

const announcementRowStyle = {
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
};
