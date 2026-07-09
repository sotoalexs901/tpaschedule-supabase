// src/pages/WCHRMonthlyClose.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYYYYMMDD(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}`;
}

function toMMDDYYYY(dateObj) {
  return `${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}-${dateObj.getFullYear()}`;
}

function tsToDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeText(v) {
  return String(v || "").trim();
}

function safeUpper(v) {
  return safeText(v).toUpperCase();
}

function getMonthStart(year, monthIndex) {
  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
}

function getMonthEnd(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
}

function getReportDate(report) {
  return (
    tsToDate(report.submitted_at) ||
    tsToDate(report.billing_date) ||
    tsToDate(report.flight_date)
  );
}

function getMillis(val) {
  if (!val) return 0;
  if (typeof val?.toMillis === "function") return val.toMillis();
  const d = tsToDate(val);
  return d ? d.getTime() : 0;
}

function minutesBetween(startVal, endVal) {
  const start = getMillis(startVal);
  const end = getMillis(endVal);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 60000);
}

function formatMinutes(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function getCounterToGateMinutes(report) {
  return minutesBetween(
    report.pickup_at || report.submitted_at,
    report.gate_arrived_at
  );
}

function getGateToDeliveredMinutes(report) {
  return minutesBetween(
    report.gate_arrived_at,
    report.delivered_at || report.dropoff_at
  );
}

function getTotalDeliveredMinutes(report) {
  return minutesBetween(
    report.pickup_at || report.submitted_at,
    report.delivered_at || report.dropoff_at
  );
}
function average(values) {
  const nums = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}

function buildMonthSummary(rows) {
  const totalReports = rows.length;
  const activeReports = rows.filter(
    (r) => safeUpper(r.tracking_status || "IN_PROGRESS") !== "STORED"
  ).length;

  const storedReports = rows.filter(
    (r) => safeUpper(r.tracking_status || "") === "STORED"
  ).length;

  const completedReports = rows.filter((r) =>
    Boolean(r.delivered_at || r.dropoff_at)
  ).length;

  const uniqueWheelchairs = new Set(
    rows.map((r) => safeUpper(r.wheelchair_number)).filter(Boolean)
  );

  const uniqueFlights = new Set(
    rows.map((r) => safeUpper(r.flight_number)).filter(Boolean)
  );

  const counterToGateTimes = rows.map(getCounterToGateMinutes);
  const gateToDeliveredTimes = rows.map(getGateToDeliveredMinutes);
  const totalDeliveredTimes = rows.map(getTotalDeliveredMinutes);

  return {
    total_reports: totalReports,
    active_reports: activeReports,
    stored_reports: storedReports,
    completed_reports: completedReports,
    unique_wheelchairs: uniqueWheelchairs.size,
    unique_flights: uniqueFlights.size,
    avg_counter_to_gate: average(counterToGateTimes),
    avg_gate_to_delivered: average(gateToDeliveredTimes),
    avg_total_delivered: average(totalDeliveredTimes),
  };
}

function downloadCSV(filename, headers, rows) {
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportBillingCSV(filename, rows) {
  downloadCSV(
    filename,
    ["Passenger Name", "Date", "WCHR Number", "Flight Number", "PNR", "Agent Name"],
    rows.map((r) => {
      const d = getReportDate(r);

      return [
        r.passenger_name || "",
        d ? toMMDDYYYY(d) : "",
        r.wheelchair_number || "",
        r.flight_number || "",
        r.pnr || "",
        r.wchr_agent_name || r.assigned_wchr_agent || r.employee_name || "",
      ];
    })
  );
}

function exportFullBackupCSV(filename, rows) {
  downloadCSV(
    filename,
    [
      "Report ID",
      "Passenger",
      "Date",
      "Airline",
      "Flight",
      "PNR",
      "WCHR Type",
      "Wheelchair",
      "Agent",
      "Current Location",
      "Tracking Status",
      "Counter to Gate",
      "Gate to Delivered",
      "Total Delivered Time",
      "Stored At",
      "Submitted At",
    ],
    rows.map((r) => {
      const d = getReportDate(r);

      return [
        r.report_id || r.id || "",
        r.passenger_name || "",
        d ? toMMDDYYYY(d) : "",
        r.airline || "",
        r.flight_number || "",
        r.pnr || "",
        r.wch_type || "",
        r.wheelchair_number || "",
        r.wchr_agent_name || r.assigned_wchr_agent || r.employee_name || "",
        r.current_location || "",
        r.tracking_status || "",
        formatMinutes(getCounterToGateMinutes(r)),
        formatMinutes(getGateToDeliveredMinutes(r)),
        formatMinutes(getTotalDeliveredMinutes(r)),
        r.stored_at ? toMMDDYYYY(tsToDate(r.stored_at)) : "",
        r.submitted_at ? toMMDDYYYY(tsToDate(r.submitted_at)) : "",
      ];
    })
  );
}

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

function ActionButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false,
  style = {},
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
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
        whiteSpace: "nowrap",
        opacity: disabled ? 0.55 : 1,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
function DetailCard({ label, value, subtext }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 24,
          fontWeight: 900,
          color: "#0f172a",
        }}
      >
        {value}
      </div>

      {subtext && (
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "#64748b",
            fontWeight: 600,
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

function statusBadge(kind) {
  const k = safeUpper(kind);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  if (k === "OPEN") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (k === "CLOSED") {
    return {
      ...base,
      background: "#fefce8",
      color: "#854d0e",
      borderColor: "#fde68a",
    };
  }

  if (k === "ARCHIVED") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (k === "WARNING") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function monthKey(year, monthIndex) {
  return `${year}-${pad2(monthIndex + 1)}`;
}

function useViewport() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

export default function WCHRMonthlyClose() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isMobile } = useViewport();

  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reports, setReports] = useState([]);
  const [monthStatus, setMonthStatus] = useState(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const selectedMonthName = MONTHS[selectedMonth];
  const selectedKey = monthKey(selectedYear, selectedMonth);

  const currentUserName =
    user?.fullName || user?.displayName || user?.name || user?.username || "";

  const currentUserId = user?.id || user?.uid || "";

  const summary = useMemo(() => buildMonthSummary(reports), [reports]);

  const unresolvedReports = useMemo(() => {
    return reports.filter((r) => {
      const status = safeUpper(r.tracking_status || "IN_PROGRESS");
      return r.tracking_enabled !== false && status !== "STORED";
    });
  }, [reports]);

  const canCloseMonth = reports.length > 0 && unresolvedReports.length === 0;
  const requiredDeletePhrase = `DELETE ${selectedMonthName.toUpperCase()} ${selectedYear}`;
    useEffect(() => {
    let mounted = true;

    async function loadMonthData() {
      setError("");
      setMessage("");
      setLoading(true);

      try {
        const start = Timestamp.fromDate(getMonthStart(selectedYear, selectedMonth));
        const end = Timestamp.fromDate(getMonthEnd(selectedYear, selectedMonth));

        const reportsQuery = query(
          collection(db, "wch_reports"),
          where("submitted_at", ">=", start),
          where("submitted_at", "<=", end)
        );

        const reportsSnap = await getDocs(reportsQuery);

        const rows = reportsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => getMillis(a.submitted_at) - getMillis(b.submitted_at));

        const statusSnap = await getDocs(
          query(
            collection(db, "wch_monthly_close"),
            where("month_key", "==", selectedKey)
          )
        );

        const statusRow = statusSnap.docs[0]
          ? { id: statusSnap.docs[0].id, ...statusSnap.docs[0].data() }
          : null;

        if (!mounted) return;

        setReports(rows);
        setMonthStatus(statusRow);
      } catch (e) {
        console.error(e);
        if (mounted) {
          setError(e?.message || "Failed to load month data.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMonthData();

    return () => {
      mounted = false;
    };
  }, [selectedYear, selectedMonth, selectedKey]);

  const handleExportBilling = () => {
    if (!reports.length) return;

    exportBillingCSV(
      `WCHR_BILLING_${selectedKey}.csv`,
      reports
    );

    setMessage("Billing export generated.");
    setError("");
  };

  const handleExportBackup = () => {
    if (!reports.length) return;

    exportFullBackupCSV(
      `WCHR_FULL_BACKUP_${selectedKey}.csv`,
      reports
    );

    setMessage("Full backup export generated.");
    setError("");
  };

  const handleCloseMonth = async () => {
    setError("");
    setMessage("");

    if (!reports.length) {
      setError("There are no WCHR reports for this month.");
      return;
    }

    if (unresolvedReports.length > 0) {
      const first = unresolvedReports[0];

      setError(
        `Cannot close ${selectedMonthName} ${selectedYear}. ${
          first.wheelchair_number || "A wheelchair"
        } is still not stored. Last location: ${
          first.current_location || "Unknown"
        }.`
      );
      return;
    }

    const ok = window.confirm(
      `Close ${selectedMonthName} ${selectedYear}?\n\nThis will mark the month as CLOSED and lock the monthly close record.`
    );

    if (!ok) return;

    try {
      setClosing(true);

      const closeRef = doc(db, "wch_monthly_close", selectedKey);

      const payload = {
        month_key: selectedKey,
        year: selectedYear,
        month_index: selectedMonth,
        month_name: selectedMonthName,
        status: "CLOSED",
        closed_at: serverTimestamp(),
        closed_by_id: currentUserId,
        closed_by_name: currentUserName,

        total_reports: summary.total_reports,
        active_reports: summary.active_reports,
        stored_reports: summary.stored_reports,
        completed_reports: summary.completed_reports,
        unique_wheelchairs: summary.unique_wheelchairs,
        unique_flights: summary.unique_flights,
        avg_counter_to_gate: summary.avg_counter_to_gate,
        avg_gate_to_delivered: summary.avg_gate_to_delivered,
        avg_total_delivered: summary.avg_total_delivered,

        updated_at: serverTimestamp(),
      };

      await setDoc(closeRef, payload, { merge: true });

      const updatePromises = reports.map((r) =>
        updateDoc(doc(db, "wch_reports", r.id), {
          monthly_close_key: selectedKey,
          monthly_close_status: "CLOSED",
          monthly_closed_at: serverTimestamp(),
          monthly_closed_by_id: currentUserId,
          monthly_closed_by_name: currentUserName,
        })
      );

      await Promise.all(updatePromises);

      setMonthStatus({
        id: selectedKey,
        ...payload,
        closed_by_name: currentUserName,
      });

      setMessage(`${selectedMonthName} ${selectedYear} closed successfully.`);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to close month.");
    } finally {
      setClosing(false);
    }
  };

  const handleDeleteMonth = async () => {
    setError("");
    setMessage("");

    if (safeUpper(deleteConfirmText) !== requiredDeletePhrase) {
      setError(`Type "${requiredDeletePhrase}" to confirm deletion.`);
      return;
    }

    const ok = window.confirm(
      `FINAL WARNING:\n\nThis will permanently delete all WCHR reports for ${selectedMonthName} ${selectedYear}.\n\nThis action cannot be undone.`
    );

    if (!ok) return;

    try {
      setDeleting(true);

      const start = Timestamp.fromDate(getMonthStart(selectedYear, selectedMonth));
      const end = Timestamp.fromDate(getMonthEnd(selectedYear, selectedMonth));

      const reportsQuery = query(
        collection(db, "wch_reports"),
        where("submitted_at", ">=", start),
        where("submitted_at", "<=", end)
      );

      const eventsQuery = query(
        collection(db, "wch_tracking_events"),
        where("created_at", ">=", start),
        where("created_at", "<=", end)
      );

      const statsQuery = query(
        collection(db, "wch_stats_daily"),
        where("date", ">=", toYYYYMMDD(getMonthStart(selectedYear, selectedMonth))),
        where("date", "<=", toYYYYMMDD(getMonthEnd(selectedYear, selectedMonth)))
      );

      const [reportsSnap, eventsSnap, statsSnap] = await Promise.all([
        getDocs(reportsQuery),
        getDocs(eventsQuery),
        getDocs(statsQuery),
      ]);

      const deleteReports = reportsSnap.docs.map((d) =>
        deleteDoc(doc(db, "wch_reports", d.id))
      );

      const deleteEvents = eventsSnap.docs.map((d) =>
        deleteDoc(doc(db, "wch_tracking_events", d.id))
      );

      const deleteStats = statsSnap.docs.map((d) =>
        deleteDoc(doc(db, "wch_stats_daily", d.id))
      );

      await Promise.all([...deleteReports, ...deleteEvents, ...deleteStats]);

      await setDoc(
        doc(db, "wch_monthly_close", selectedKey),
        {
          month_key: selectedKey,
          year: selectedYear,
          month_index: selectedMonth,
          month_name: selectedMonthName,
          status: "DELETED",
          deleted_at: serverTimestamp(),
          deleted_by_id: currentUserId,
          deleted_by_name: currentUserName,
          deleted_reports_count: reportsSnap.size,
          deleted_tracking_events_count: eventsSnap.size,
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );

      setReports([]);
      setDeleteConfirmText("");
      setMonthStatus({
        id: selectedKey,
        month_key: selectedKey,
        status: "DELETED",
        deleted_by_name: currentUserName,
      });

      setMessage(`${selectedMonthName} ${selectedYear} data deleted successfully.`);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to delete month data.");
    } finally {
      setDeleting(false);
    }
  };
    return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: isMobile ? 20 : 28,
          padding: isMobile ? 16 : 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
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
              TPA OPS · WCHR MONTHLY CLOSE
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: isMobile ? 26 : 32,
                lineHeight: 1.05,
                fontWeight: 800,
              }}
            >
              Monthly Close
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Export billing, validate stored wheelchairs, close the month, or
              delete completed month data.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <ActionButton
              onClick={() => navigate("/wchr/flights")}
              variant="secondary"
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              WCHR Reports
            </ActionButton>

            <ActionButton
              onClick={() => navigate("/dashboard")}
              variant="secondary"
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error ? "#fff1f2" : "#ecfdf5",
              border: `1px solid ${error ? "#fecdd3" : "#a7f3d0"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error ? "#9f1239" : "#065f46",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={inputStyle}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Year</label>
            <input
              type="number"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div>
            <span style={statusBadge(monthStatus?.status || "OPEN")}>
              {monthStatus?.status || "OPEN"}
            </span>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(4, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <DetailCard
            label="Total WCHR"
            value={loading ? "..." : summary.total_reports}
            subtext={`${summary.completed_reports} completed`}
          />

          <DetailCard
            label="Stored"
            value={loading ? "..." : summary.stored_reports}
            subtext={`${summary.active_reports} still active`}
          />

          <DetailCard
            label="Wheelchairs"
            value={loading ? "..." : summary.unique_wheelchairs}
            subtext="Unique wheelchair numbers"
          />

          <DetailCard
            label="Flights"
            value={loading ? "..." : summary.unique_flights}
            subtext="Unique flight numbers"
          />

          <DetailCard
            label="Avg Counter → Gate"
            value={formatMinutes(summary.avg_counter_to_gate)}
          />

          <DetailCard
            label="Avg Gate → Delivered"
            value={formatMinutes(summary.avg_gate_to_delivered)}
          />

          <DetailCard
            label="Avg Total"
            value={formatMinutes(summary.avg_total_delivered)}
          />

          <DetailCard
            label="Open Items"
            value={loading ? "..." : unresolvedReports.length}
            subtext="Must be 0 before closing"
          />
        </div>
      </PageCard>

      {unresolvedReports.length > 0 && (
        <PageCard style={{ padding: isMobile ? 16 : 20 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={statusBadge("WARNING")}>ACTION REQUIRED</span>
          </div>

          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 18,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Wheelchairs not stored
          </h2>

          <p
            style={{
              margin: "0 0 14px",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            These records must be marked as Stored / Not In Use before closing
            the month.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 760,
                borderCollapse: "separate",
                borderSpacing: 0,
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle({ textAlign: "left" })}>Report</th>
                  <th style={thStyle({ textAlign: "left" })}>WCHR</th>
                  <th style={thStyle({ textAlign: "left" })}>Passenger</th>
                  <th style={thStyle({ textAlign: "left" })}>Flight</th>
                  <th style={thStyle({ textAlign: "left" })}>Last Location</th>
                  <th style={thStyle({ textAlign: "left" })}>Status</th>
                </tr>
              </thead>

              <tbody>
                {unresolvedReports.slice(0, 25).map((r, index) => (
                  <tr
                    key={r.id}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{r.report_id || r.id}</td>
                    <td style={tdStyle}>{r.wheelchair_number || "—"}</td>
                    <td style={tdStyle}>{r.passenger_name || "—"}</td>
                    <td style={tdStyle}>{r.flight_number || "—"}</td>
                    <td style={tdStyle}>{r.current_location || "—"}</td>
                    <td style={tdStyle}>{r.tracking_status || "IN_PROGRESS"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unresolvedReports.length > 25 && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Showing first 25 open items out of {unresolvedReports.length}.
            </p>
          )}
        </PageCard>
      )}

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          Monthly Actions
        </h2>

        <p
          style={{
            margin: "0 0 16px",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          Always export billing and backup files before closing or deleting a
          month.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            onClick={handleExportBilling}
            variant="success"
            disabled={!reports.length || loading}
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            Export Billing
          </ActionButton>

          <ActionButton
            onClick={handleExportBackup}
            variant="secondary"
            disabled={!reports.length || loading}
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            Export Full Backup
          </ActionButton>

          <ActionButton
            onClick={handleCloseMonth}
            variant={canCloseMonth ? "primary" : "warning"}
            disabled={!canCloseMonth || closing || loading}
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            {closing ? "Closing..." : `Close ${selectedMonthName}`}
          </ActionButton>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 900,
            color: "#991b1b",
          }}
        >
          Delete Month Data
        </h2>

        <p
          style={{
            margin: "0 0 14px",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          This permanently deletes WCHR reports, tracking events, and daily
          stats for <b>{selectedMonthName} {selectedYear}</b>. This cannot be
          undone.
        </p>

        <div
          style={{
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 16,
            padding: 14,
            marginBottom: 14,
            color: "#9f1239",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.6,
          }}
        >
          Type <b>{requiredDeletePhrase}</b> to enable deletion.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={requiredDeletePhrase}
            style={inputStyle}
          />

          <ActionButton
            onClick={handleDeleteMonth}
            variant="danger"
            disabled={
              deleting ||
              safeUpper(deleteConfirmText) !== requiredDeletePhrase
            }
            style={{ width: isMobile ? "100%" : "auto" }}
          >
            {deleting ? "Deleting..." : "Delete Month Data"}
          </ActionButton>
        </div>
      </PageCard>
    </div>
  );
}

function thStyle(extra = {}) {
  return {
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "12px 14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 13,
  color: "#0f172a",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const inputStyle = {
  width: "100%",
  border: "1px solid #dbeafe",
  background: "#ffffff",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
};
