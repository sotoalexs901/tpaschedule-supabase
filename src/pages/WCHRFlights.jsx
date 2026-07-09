import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const WCHR_LOCATIONS = [
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
  "Baggage Claim",
  "Customs",
  "CBP",
  "Wheelchair Storage",
  "Maintenance",
  "Other",
];

const TRACKING_STATUS_OPTIONS = ["IN_PROGRESS", "COMPLETED", "STORED"];

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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function tsToDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function safeText(v) {
  return String(v || "").trim();
}

function getReportDate(report) {
  return (
    tsToDate(report.submitted_at) ||
    tsToDate(report.billing_date) ||
    tsToDate(report.flight_date)
  );
}

function getReportDateKey(report) {
  const d = getReportDate(report);
  return d ? toYYYYMMDD(d) : "NO_DATE";
}

function getMillis(val) {
  if (!val) return 0;
  if (typeof val?.toMillis === "function") return val.toMillis();
  const d = tsToDate(val);
  return d ? d.getTime() : 0;
}

function formatDateValue(val) {
  const d = tsToDate(val);
  return d ? toMMDDYYYY(d) : "—";
}

function formatDateTimeValue(val) {
  const d = tsToDate(val);
  if (!d) return "—";
  return `${toMMDDYYYY(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function minutesSince(val) {
  const ms = getMillis(val);
  if (!ms) return 0;
  return Math.floor((Date.now() - ms) / 60000);
}

function needsLocationAlert(report) {
  const trackingStatus = safeUpper(report.tracking_status || "");
  const active = report.is_active !== false;
  const alertsEnabled = report.alerts_enabled !== false;
  const limit = Number(report.alert_after_minutes || 30);
  const mins = minutesSince(report.last_location_update_at || report.last_updated_at);

  return (
    active &&
    alertsEnabled &&
    trackingStatus !== "STORED" &&
    mins >= limit
  );
}

function normalizeLoginKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[./#[\]$]/g, "_");
}

function statsDateKey(dateLike) {
  const d = tsToDate(dateLike) || new Date(dateLike);
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

async function decrementDailyWchrStats(report) {
  const dateKey = statsDateKey(report.submitted_at || report.billing_date);
  if (!dateKey) return;

  const airline = safeUpper(report.airline) || "UNKNOWN";
  const loginKey = normalizeLoginKey(
    report.employee_login || report.employee_name || "unknown"
  );
  const chair = safeUpper(report.wheelchair_number || "");
  const submitted = tsToDate(report.submitted_at);
  const hour = submitted ? submitted.getHours() : null;

  const statsRef = doc(db, "wch_stats_daily", dateKey);
  const snap = await getDoc(statsRef);
  if (!snap.exists()) return;

  const payload = {
    updated_at: Timestamp.now(),
    total_reports: increment(-1),
    [`by_airline.${airline}`]: increment(-1),
    [`by_employee.${loginKey}`]: increment(-1),
  };

  if (hour !== null && hour >= 0 && hour <= 23) {
    payload[`by_hour.${hour}`] = increment(-1);
  }

  if (chair) {
    payload[`wheelchair_by_airline.${airline}.${chair}`] = increment(-1);
  }

  await updateDoc(statsRef, payload);
}

function downloadCSV(filename, rows) {
  const headers = [
    "Report ID",
    "Submitted By",
    "Employee Role",
    "Passenger",
    "Airline",
    "Flight",
    "Report Date",
    "PNR",
    "WCHR Type",
    "Wheelchair #",
    "Current Location",
    "Tracking Status",
    "Last Location Update",
    "Stored At",
    "Billing Status",
    "Last Edited By",
    "Last Edited At",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => {
      const reportDate = getReportDate(r);

      const cols = [
        r.report_id || "",
        r.employee_name || "",
        r.employee_role || "",
        r.passenger_name || "",
        r.airline || "",
        r.flight_number || "",
        reportDate ? toMMDDYYYY(reportDate) : "",
        r.pnr || "",
        r.wch_type || "",
        r.wheelchair_number || "",
        r.current_location || "",
        r.tracking_status || "",
        r.last_location_update_at
          ? formatDateTimeValue(r.last_location_update_at)
          : "",
        r.stored_at ? formatDateTimeValue(r.stored_at) : "",
        r.status || "",
        r.last_edited_by_name || "",
        r.last_edited_at ? formatDateTimeValue(r.last_edited_at) : "",
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);

      return cols.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildFlightsFromRows(rows) {
  const map = new Map();

  for (const r of rows) {
    const flightNumber = safeUpper(r.flight_number) || "NO_FLIGHT";
    const dateKey = getReportDateKey(r);
    const groupKey = `${dateKey}-${flightNumber}`;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        flight_key: groupKey,
        flight_number: flightNumber,
        report_date: getReportDate(r),
        total_reports: 0,
        new_reports: 0,
        late_reports: 0,
        active_reports: 0,
        stored_reports: 0,
        alert_reports: 0,
        wheelchair_numbers: new Set(),
      });
    }

    const item = map.get(groupKey);
    item.total_reports += 1;

    const chair = safeUpper(r.wheelchair_number);
    if (chair) item.wheelchair_numbers.add(chair);

    if (safeUpper(r.status) === "LATE") item.late_reports += 1;
    else item.new_reports += 1;

    if (safeUpper(r.tracking_status) === "STORED") item.stored_reports += 1;
    else item.active_reports += 1;

    if (needsLocationAlert(r)) item.alert_reports += 1;
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      wheelchair_numbers: Array.from(item.wheelchair_numbers).sort(),
    }))
    .sort((a, b) => {
      const dateA = a.report_date ? a.report_date.getTime() : 0;
      const dateB = b.report_date ? b.report_date.getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.flight_number.localeCompare(b.flight_number);
    });
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

  if (k === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (k === "IN_PROGRESS") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (k === "COMPLETED") {
    return {
      ...base,
      background: "#fefce8",
      color: "#854d0e",
      borderColor: "#fde68a",
    };
  }

  if (k === "STORED") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (k === "ALERT") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#be123c",
      borderColor: "#fecdd3",
    };
  }

  if (k === "NEW") {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function DetailField({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
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
          fontSize: 14,
          color: "#0f172a",
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function EditInput({ value, onChange, placeholder = "", type = "text" }) {
  return (
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={editInputStyle}
    />
  );
}

function SelectInput({ value, onChange, options = [] }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={editInputStyle}
    >
      {options.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  );
}

function TrackingSummary({ report }) {
  const alert = needsLocationAlert(report);
  const mins = minutesSince(report.last_location_update_at || report.last_updated_at);

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: 12,
        borderRadius: 16,
        border: alert ? "1px solid #fecdd3" : "1px solid #dbeafe",
        background: alert ? "#fff1f2" : "#f8fbff",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={statusBadge(report.tracking_status || "IN_PROGRESS")}>
          {safeUpper(report.tracking_status || "IN_PROGRESS")}
        </span>

        {alert && <span style={statusBadge("ALERT")}>30+ MIN ALERT</span>}
      </div>

      <DetailField
        label="Current Location"
        value={report.current_location || "—"}
      />

      <DetailField
        label="Last Location Update"
        value={
          report.last_location_update_at
            ? `${formatDateTimeValue(report.last_location_update_at)} · ${mins} min ago`
            : "—"
        }
      />

      {safeUpper(report.tracking_status) === "STORED" && (
        <DetailField
          label="Stored At"
          value={report.stored_at ? formatDateTimeValue(report.stored_at) : "—"}
        />
      )}
    </div>
  );
}

function buildEmployeeActivePayload(report, payload) {
  return {
    report_doc_id: report.id,
    report_id: report.report_id || "",
    wheelchair_number: safeUpper(payload.wheelchair_number || report.wheelchair_number),
    passenger_name: safeText(payload.passenger_name || report.passenger_name),
    pnr: safeUpper(payload.pnr || report.pnr),
    flight_number: safeUpper(payload.flight_number || report.flight_number),
    current_location: payload.current_location || report.current_location || "",
    tracking_status: payload.tracking_status || report.tracking_status || "IN_PROGRESS",
    is_active: payload.is_active !== false,
    alerts_enabled: payload.alerts_enabled !== false,
    alert_after_minutes: Number(report.alert_after_minutes || 30),
    started_at: report.pickup_at || report.submitted_at || null,
    last_location_update_at: payload.last_location_update_at || serverTimestamp(),
  };
}
export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { isMobile, isTablet } = useViewport();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedFlightKey, setSelectedFlightKey] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [allDayReports, setAllDayReports] = useState([]);
  const [deletingId, setDeletingId] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [trackingEditId, setTrackingEditId] = useState("");
  const [trackingLocation, setTrackingLocation] = useState("");
  const [savingTrackingId, setSavingTrackingId] = useState("");

  const currentUserId = user?.id || user?.uid || "";
  const currentUserName =
    user?.fullName || user?.displayName || user?.name || user?.username || "";

  useEffect(() => {
    let mounted = true;

    async function loadFlights() {
      setError("");
      setMessage("");
      setLoading(true);

      try {
        const start = Timestamp.fromDate(startOfDay(selectedDate));
        const end = Timestamp.fromDate(endOfDay(selectedDate));

        const q = query(
          collection(db, "wch_reports"),
          where("submitted_at", ">=", start),
          where("submitted_at", "<=", end)
        );

        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => getMillis(b.submitted_at) - getMillis(a.submitted_at));

        if (!mounted) return;

        setAllDayReports(rows);

        const flightArr = buildFlightsFromRows(rows);
        setFlights(flightArr);

        const exists = flightArr.some((x) => x.flight_key === selectedFlightKey);
        if (!exists) {
          setSelectedFlightKey("");
          setReports([]);
        }
      } catch (e) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load flights.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadFlights();

    return () => {
      mounted = false;
    };
  }, [selectedDate, selectedFlightKey]);

  useEffect(() => {
    let mounted = true;

    async function loadReportsForFlight() {
      setError("");

      if (!selectedFlightKey) {
        setReports([]);
        return;
      }

      setReportsLoading(true);

      try {
        const flightRows = allDayReports
          .filter((r) => {
            const flightNumber = safeUpper(r.flight_number) || "NO_FLIGHT";
            const dateKey = getReportDateKey(r);
            return `${dateKey}-${flightNumber}` === selectedFlightKey;
          })
          .map((r) => ({
            ...r,
            airline: safeUpper(r.airline),
            flight_number: safeUpper(r.flight_number),
            pnr: safeUpper(r.pnr),
            employee_login: safeText(r.employee_login),
            employee_role: safeText(r.employee_role),
            wheelchair_number: safeUpper(r.wheelchair_number),
            current_location: safeText(r.current_location),
            tracking_status: safeUpper(r.tracking_status || "IN_PROGRESS"),
          }))
          .sort((a, b) => getMillis(a.submitted_at) - getMillis(b.submitted_at));

        if (mounted) setReports(flightRows);
      } catch (e) {
        console.error(e);
        if (mounted) {
          setError(e?.message || "Failed to load reports for this flight.");
        }
      } finally {
        if (mounted) setReportsLoading(false);
      }
    }

    loadReportsForFlight();

    return () => {
      mounted = false;
    };
  }, [selectedFlightKey, allDayReports]);

  const selectedFlight = useMemo(() => {
    return flights.find((f) => f.flight_key === selectedFlightKey) || null;
  }, [flights, selectedFlightKey]);

  const unresolvedReports = useMemo(() => {
    return allDayReports.filter((r) => {
      const status = safeUpper(r.tracking_status || "IN_PROGRESS");
      return r.tracking_enabled !== false && status !== "STORED";
    });
  }, [allDayReports]);

  const handleDeleteReport = async (report) => {
    const ok = window.confirm(
      `Delete report ${report.report_id || report.id}?\n\nThis action cannot be undone.`
    );

    if (!ok) return;

    try {
      setDeletingId(report.id);
      setError("");
      setMessage("");

      await decrementDailyWchrStats(report);
      await deleteDoc(doc(db, "wch_reports", report.id));

      const updatedAllDayReports = allDayReports.filter((r) => r.id !== report.id);
      setAllDayReports(updatedAllDayReports);

      const updatedReports = reports.filter((r) => r.id !== report.id);
      setReports(updatedReports);

      const updatedFlights = buildFlightsFromRows(updatedAllDayReports);
      setFlights(updatedFlights);

      const stillExists = updatedFlights.some((f) => f.flight_key === selectedFlightKey);
      if (!stillExists) {
        setSelectedFlightKey("");
        setReports([]);
      }

      setMessage("Report deleted successfully.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to delete report.");
    } finally {
      setDeletingId("");
    }
  };

  const handleStartEdit = (report) => {
    setError("");
    setMessage("");
    setEditingId(report.id);

    setEditForm({
      passenger_name: report.passenger_name || "",
      airline: report.airline || "",
      flight_number: report.flight_number || "",
      pnr: report.pnr || "",
      wch_type: report.wch_type || "",
      wheelchair_number: report.wheelchair_number || "",
      status: safeUpper(report.status || "NEW"),
    });
  };

  const handleCancelEdit = () => {
    setEditingId("");
    setEditForm({});
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };
    const handleSaveEdit = async (report) => {
    try {
      setSavingEdit(true);
      setError("");
      setMessage("");

      const nowTs = Timestamp.now();

      const payload = {
        passenger_name: safeText(editForm.passenger_name),
        airline: safeUpper(editForm.airline),
        flight_number: safeUpper(editForm.flight_number),
        pnr: safeUpper(editForm.pnr),
        wch_type: safeUpper(editForm.wch_type),
        wheelchair_number: safeUpper(editForm.wheelchair_number),
        status: safeUpper(editForm.status || "NEW"),
        last_edited_at: nowTs,
        last_edited_by_id: currentUserId,
        last_edited_by_name: currentUserName,
      };

      await updateDoc(doc(db, "wch_reports", report.id), {
        ...payload,
        edit_history: arrayUnion({
          edited_at: nowTs,
          edited_by_id: currentUserId,
          edited_by_name: currentUserName,
          previous_airline: report.airline || "",
          previous_flight_number: report.flight_number || "",
          previous_passenger_name: report.passenger_name || "",
          previous_pnr: report.pnr || "",
          previous_wch_type: report.wch_type || "",
          previous_wheelchair_number: report.wheelchair_number || "",
          previous_status: report.status || "",
        }),
      });

      const updatedAllDayReports = allDayReports.map((r) =>
        r.id === report.id ? { ...r, ...payload } : r
      );

      setAllDayReports(updatedAllDayReports);

      const updatedReports = reports.map((r) =>
        r.id === report.id ? { ...r, ...payload } : r
      );

      setReports(updatedReports);
      setFlights(buildFlightsFromRows(updatedAllDayReports));

      setEditingId("");
      setEditForm({});
      setMessage("Report updated successfully.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to update report.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStartTrackingEdit = (report) => {
    setError("");
    setMessage("");
    setTrackingEditId(report.id);
    setTrackingLocation(report.current_location || "Counter");
  };

  const handleCancelTrackingEdit = () => {
    setTrackingEditId("");
    setTrackingLocation("");
  };

  const applyReportUpdateLocally = (reportId, payload) => {
    const updateRow = (r) => (r.id === reportId ? { ...r, ...payload } : r);

    const updatedAllDayReports = allDayReports.map(updateRow);
    const updatedReports = reports.map(updateRow);

    setAllDayReports(updatedAllDayReports);
    setReports(updatedReports);
    setFlights(buildFlightsFromRows(updatedAllDayReports));
  };

  const handleUpdateLocation = async (report) => {
    const newLocation = safeText(trackingLocation);

    if (!newLocation) {
      setError("Please select a location.");
      return;
    }

    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const previousLocation = report.current_location || "";

      const payload = {
        current_location: newLocation,
        last_location: previousLocation,
        tracking_status: "IN_PROGRESS",
        is_active: true,
        alerts_enabled: true,
        last_location_update_at: serverTimestamp(),
        last_updated_at: serverTimestamp(),
        last_updated_by: currentUserName,
        last_updated_by_id: currentUserId,
      };

      await updateDoc(doc(db, "wch_reports", report.id), payload);

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: report.id,
        report_id: report.report_id || "",
        wheelchair_number: report.wheelchair_number || "",
        passenger_name: report.passenger_name || "",
        pnr: report.pnr || "",
        flight_number: report.flight_number || "",
        event_type: "LOCATION_UPDATE",
        location: newLocation,
        previous_location: previousLocation,
        notes: `Wheelchair location updated to ${newLocation}`,
        tracking_status: "IN_PROGRESS",
        is_active: true,
        alerts_enabled: true,
        employee_id: currentUserId,
        employee_name: currentUserName,
        created_at: serverTimestamp(),
      });

      if (report.wchr_agent_id) {
        await updateDoc(doc(db, "employees", report.wchr_agent_id), {
          active_wchr_service: buildEmployeeActivePayload(report, {
            ...payload,
            current_location: newLocation,
            tracking_status: "IN_PROGRESS",
            is_active: true,
            alerts_enabled: true,
            last_location_update_at: serverTimestamp(),
          }),
        });
      }

      applyReportUpdateLocally(report.id, {
        ...payload,
        current_location: newLocation,
        last_location: previousLocation,
        tracking_status: "IN_PROGRESS",
        is_active: true,
        alerts_enabled: true,
        last_location_update_at: Timestamp.now(),
        last_updated_at: Timestamp.now(),
        last_updated_by: currentUserName,
        last_updated_by_id: currentUserId,
      });

      setTrackingEditId("");
      setTrackingLocation("");
      setMessage("Location updated successfully.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to update location.");
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleMarkCompleted = async (report) => {
    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const location = report.current_location || "Gate";

      const payload = {
        tracking_status: "COMPLETED",
        current_location: location,
        dropoff_location: location,
        dropoff_at: serverTimestamp(),
        is_active: true,
        alerts_enabled: true,
        last_location_update_at: serverTimestamp(),
        last_updated_at: serverTimestamp(),
        last_updated_by: currentUserName,
        last_updated_by_id: currentUserId,
      };

      await updateDoc(doc(db, "wch_reports", report.id), payload);

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: report.id,
        report_id: report.report_id || "",
        wheelchair_number: report.wheelchair_number || "",
        passenger_name: report.passenger_name || "",
        pnr: report.pnr || "",
        flight_number: report.flight_number || "",
        event_type: "PASSENGER_DELIVERED",
        location,
        previous_location: report.current_location || "",
        notes: "Passenger delivered. Wheelchair still needs to be stored.",
        tracking_status: "COMPLETED",
        is_active: true,
        alerts_enabled: true,
        employee_id: currentUserId,
        employee_name: currentUserName,
        created_at: serverTimestamp(),
      });

      if (report.wchr_agent_id) {
        await updateDoc(doc(db, "employees", report.wchr_agent_id), {
          active_wchr_service: buildEmployeeActivePayload(report, {
            ...payload,
            current_location: location,
            tracking_status: "COMPLETED",
            is_active: true,
            alerts_enabled: true,
            last_location_update_at: serverTimestamp(),
          }),
        });
      }

      applyReportUpdateLocally(report.id, {
        ...payload,
        tracking_status: "COMPLETED",
        current_location: location,
        dropoff_location: location,
        dropoff_at: Timestamp.now(),
        is_active: true,
        alerts_enabled: true,
        last_location_update_at: Timestamp.now(),
        last_updated_at: Timestamp.now(),
      });

      setMessage("Passenger marked as delivered. Wheelchair still must be stored.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to mark completed.");
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleMarkStored = async (report) => {
    const ok = window.confirm(
      `Mark ${report.wheelchair_number || "this wheelchair"} as Stored / Not In Use?`
    );

    if (!ok) return;

    try {
      setSavingTrackingId(report.id);
      setError("");
      setMessage("");

      const previousLocation = report.current_location || "";

      const payload = {
        tracking_status: "STORED",
        current_location: "Wheelchair Storage",
        last_location: previousLocation,
        stored_location: "Wheelchair Storage",
        stored_at: serverTimestamp(),
        is_active: false,
        alerts_enabled: false,
        last_location_update_at: serverTimestamp(),
        last_updated_at: serverTimestamp(),
        last_updated_by: currentUserName,
        last_updated_by_id: currentUserId,
      };

      await updateDoc(doc(db, "wch_reports", report.id), payload);

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: report.id,
        report_id: report.report_id || "",
        wheelchair_number: report.wheelchair_number || "",
        passenger_name: report.passenger_name || "",
        pnr: report.pnr || "",
        flight_number: report.flight_number || "",
        event_type: "STORED",
        location: "Wheelchair Storage",
        previous_location: previousLocation,
        notes: "Wheelchair stored and marked Not In Use",
        tracking_status: "STORED",
        is_active: false,
        alerts_enabled: false,
        employee_id: currentUserId,
        employee_name: currentUserName,
        created_at: serverTimestamp(),
      });

      if (report.wchr_agent_id) {
        await updateDoc(doc(db, "employees", report.wchr_agent_id), {
          active_wchr_service: null,
        });
      }

      applyReportUpdateLocally(report.id, {
        ...payload,
        tracking_status: "STORED",
        current_location: "Wheelchair Storage",
        last_location: previousLocation,
        stored_location: "Wheelchair Storage",
        stored_at: Timestamp.now(),
        is_active: false,
        alerts_enabled: false,
        last_location_update_at: Timestamp.now(),
        last_updated_at: Timestamp.now(),
      });

      setMessage("Wheelchair marked as Stored / Not In Use.");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to mark wheelchair as stored.");
    } finally {
      setSavingTrackingId("");
    }
  };

  const handleValidateCloseOperation = () => {
    if (!unresolvedReports.length) {
      setMessage("Operation can be closed. All wheelchairs are Stored / Not In Use.");
      setError("");
      return;
    }

    const first = unresolvedReports[0];

    setMessage("");
    setError(
      `Cannot close operation. ${first.wheelchair_number || "A wheelchair"} is still not stored. Last location: ${
        first.current_location || "Unknown"
      }. Status: ${safeUpper(first.tracking_status || "IN_PROGRESS")}.`
    );
  };

  const handleExportFullDay = () => {
    if (!allDayReports.length) return;
    const filename = `WCHR_FULL_DAY_${toYYYYMMDD(selectedDate)}.csv`;
    downloadCSV(filename, allDayReports);
  };

  const handleExportCurrentFlight = () => {
    if (!selectedFlight || !reports.length) return;

    const filename = `WCHR_FLIGHT_${selectedFlight.flight_number}_${toYYYYMMDD(
      selectedFlight.report_date || new Date()
    )}.csv`;

    downloadCSV(filename, reports);
  };
    return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1380,
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
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
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
              TPA OPS · WCHR TRACKING
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: isMobile ? 26 : 32,
                lineHeight: 1.05,
                fontWeight: 800,
              }}
            >
              WCHR Flight Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 780,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Reports are grouped by report date and flight number. Track each
              wheelchair until it is marked as Stored / Not In Use.
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
              onClick={() => navigate("/wchr/my-reports")}
              variant="secondary"
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              My Reports
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
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <div style={{ width: isMobile ? "100%" : "auto" }}>
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
                Report Date
              </label>

              <input
                type="date"
                value={toYYYYMMDD(selectedDate)}
                onChange={(e) =>
                  setSelectedDate(new Date(e.target.value + "T00:00:00"))
                }
                style={{
                  border: "1px solid #dbeafe",
                  background: "#ffffff",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontSize: 14,
                  color: "#0f172a",
                  outline: "none",
                  width: isMobile ? "100%" : "auto",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "12px 14px",
                fontSize: 13,
                color: "#334155",
                width: isMobile ? "100%" : "auto",
                boxSizing: "border-box",
              }}
            >
              Showing reports submitted on: <b>{toMMDDYYYY(selectedDate)}</b>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              width: isMobile ? "100%" : "auto",
            }}
          >
            <ActionButton
              onClick={handleValidateCloseOperation}
              variant={unresolvedReports.length ? "warning" : "success"}
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Validate Close Operation
            </ActionButton>

            <ActionButton
              onClick={handleExportFullDay}
              variant="secondary"
              disabled={!allDayReports.length}
              style={{ width: isMobile ? "100%" : "auto" }}
            >
              Export Full Day
            </ActionButton>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? 18 : 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Flight Summary
          </h2>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            The list is grouped by report date and flight number.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>Loading...</div>
        ) : flights.length === 0 ? (
          <div style={infoBoxStyle}>No reports found for this date.</div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {flights.map((f) => (
              <div
                key={f.flight_key}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 18,
                  padding: 14,
                  background:
                    selectedFlightKey === f.flight_key ? "#edf7ff" : "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#0f172a",
                      }}
                    >
                      Flight {f.flight_number}
                    </div>

                    <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                      {f.alert_reports > 0 && (
                        <span style={statusBadge("ALERT")}>
                          {f.alert_reports} ALERT
                        </span>
                      )}
                      <span style={statusBadge("IN_PROGRESS")}>
                        Active {f.active_reports}
                      </span>
                      <span style={statusBadge("STORED")}>
                        Stored {f.stored_reports}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#64748b",
                      fontWeight: 700,
                    }}
                  >
                    {f.report_date ? toMMDDYYYY(f.report_date) : "—"}
                  </div>
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  <DetailField
                    label="Wheelchairs"
                    value={(f.wheelchair_numbers || []).join(", ") || "—"}
                  />
                  <DetailField
                    label="Reports"
                    value={`Total: ${f.total_reports} · NEW: ${f.new_reports} · LATE: ${f.late_reports}`}
                  />
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  <ActionButton
                    onClick={() => setSelectedFlightKey(f.flight_key)}
                    variant="primary"
                    style={{ width: "100%" }}
                  >
                    View Details
                  </ActionButton>
                </div>
              </div>
            ))}
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
                minWidth: 980,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle({ textAlign: "left" })}>Flight Number</th>
                  <th style={thStyle({ textAlign: "left" })}>Date</th>
                  <th style={thStyle({ textAlign: "left" })}>Wheelchairs</th>
                  <th style={thStyle({ textAlign: "left" })}>Reports</th>
                  <th style={thStyle({ textAlign: "left" })}>Tracking</th>
                  <th style={thStyle({ textAlign: "center" })}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {flights.map((f, index) => (
                  <tr
                    key={f.flight_key}
                    style={{
                      background:
                        selectedFlightKey === f.flight_key
                          ? "#edf7ff"
                          : index % 2 === 0
                          ? "#ffffff"
                          : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <button
                        onClick={() => setSelectedFlightKey(f.flight_key)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          color: "#1769aa",
                          cursor: "pointer",
                          fontWeight:
                            selectedFlightKey === f.flight_key ? 900 : 700,
                          fontSize: 14,
                        }}
                      >
                        Flight {f.flight_number}
                      </button>
                    </td>

                    <td style={tdStyle}>
                      {f.report_date ? toMMDDYYYY(f.report_date) : "—"}
                    </td>

                    <td style={tdStyle}>
                      {(f.wheelchair_numbers || []).join(", ") || "—"}
                    </td>

                    <td style={tdStyle}>
                      Total: {f.total_reports}
                      <br />
                      <span style={{ fontSize: 12, color: "#64748b" }}>
                        NEW: {f.new_reports} · LATE: {f.late_reports}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {f.alert_reports > 0 && (
                          <span style={statusBadge("ALERT")}>
                            {f.alert_reports} ALERT
                          </span>
                        )}
                        <span style={statusBadge("IN_PROGRESS")}>
                          Active {f.active_reports}
                        </span>
                        <span style={statusBadge("STORED")}>
                          Stored {f.stored_reports}
                        </span>
                      </div>
                    </td>

                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <ActionButton
                        onClick={() => setSelectedFlightKey(f.flight_key)}
                        variant="primary"
                        style={{ padding: "8px 12px", fontSize: 12 }}
                      >
                        View Details
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: isMobile ? 16 : 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? 18 : 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Flight Details
            </h2>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              {selectedFlight ? (
                <>
                  Showing reports for <b>Flight {selectedFlight.flight_number}</b>{" "}
                  ·{" "}
                  <b>
                    {selectedFlight.report_date
                      ? toMMDDYYYY(selectedFlight.report_date)
                      : "—"}
                  </b>
                </>
              ) : (
                "Select a flight row above to view details."
              )}
            </p>
          </div>

          {selectedFlight && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <ActionButton
                onClick={() => window.print()}
                variant="secondary"
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                Print
              </ActionButton>

              <ActionButton
                onClick={handleExportCurrentFlight}
                variant="secondary"
                disabled={!reports?.length}
                style={{ width: isMobile ? "100%" : "auto" }}
              >
                Export CSV
              </ActionButton>
            </div>
          )}
        </div>

        {reportsLoading ? (
          <div style={infoBoxStyle}>Loading reports...</div>
        ) : !selectedFlight ? (
          <div style={infoBoxStyle}>No flight selected.</div>
        ) : reports.length === 0 ? (
          <div style={infoBoxStyle}>No reports for this flight/date.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {reports.map((r) => {
              const isEditing = editingId === r.id;
              const isTrackingEditing = trackingEditId === r.id;
              const alert = needsLocationAlert(r);

              return (
                <div
                  key={r.id}
                  style={{
                    border: alert ? "1px solid #fecdd3" : "1px solid #e2e8f0",
                    borderRadius: 18,
                    padding: 14,
                    background: alert ? "#fff7f8" : "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile || isTablet ? "1fr" : "2fr 1.2fr",
                      gap: 14,
                    }}
                  >
                    <div style={{ display: "grid", gap: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 900,
                              color: "#0f172a",
                            }}
                          >
                            {r.report_id || r.id}
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              display: "flex",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={statusBadge(r.status || "NEW")}>
                              {safeUpper(r.status || "NEW")}
                            </span>
                            <span
                              style={statusBadge(
                                r.tracking_status || "IN_PROGRESS"
                              )}
                            >
                              {safeUpper(r.tracking_status || "IN_PROGRESS")}
                            </span>
                            {alert && (
                              <span style={statusBadge("ALERT")}>
                                UPDATE LOCATION
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            fontWeight: 700,
                          }}
                        >
                          {r.last_edited_at
                            ? `Edited ${formatDateTimeValue(r.last_edited_at)}`
                            : "No edits"}
                        </div>
                      </div>

                      {isEditing ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              isMobile || isTablet
                                ? "1fr"
                                : "repeat(3, minmax(160px, 1fr))",
                            gap: 10,
                          }}
                        >
                          <EditInput
                            value={editForm.passenger_name}
                            onChange={(v) => handleEditChange("passenger_name", v)}
                            placeholder="Passenger"
                          />
                          <EditInput
                            value={editForm.airline}
                            onChange={(v) => handleEditChange("airline", v)}
                            placeholder="Airline"
                          />
                          <EditInput
                            value={editForm.flight_number}
                            onChange={(v) => handleEditChange("flight_number", v)}
                            placeholder="Flight"
                          />
                          <EditInput
                            value={editForm.pnr}
                            onChange={(v) => handleEditChange("pnr", v)}
                            placeholder="PNR"
                          />
                          <EditInput
                            value={editForm.wch_type}
                            onChange={(v) => handleEditChange("wch_type", v)}
                            placeholder="WCHR Type"
                          />
                          <EditInput
                            value={editForm.wheelchair_number}
                            onChange={(v) =>
                              handleEditChange("wheelchair_number", v)
                            }
                            placeholder="Wheelchair #"
                          />
                          <SelectInput
                            value={editForm.status || "NEW"}
                            onChange={(v) => handleEditChange("status", v)}
                            options={["NEW", "LATE"]}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              isMobile || isTablet
                                ? "1fr"
                                : "repeat(3, minmax(160px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <DetailField
                            label="Passenger"
                            value={r.passenger_name}
                          />
                          <DetailField
                            label="Flight"
                            value={`${r.airline || "—"} ${r.flight_number || "—"}`}
                          />
                          <DetailField label="PNR" value={r.pnr} />
                          <DetailField label="WCHR Type" value={r.wch_type} />
                          <DetailField
                            label="Wheelchair #"
                            value={r.wheelchair_number}
                          />
                          <DetailField
                            label="Submitted By"
                            value={r.employee_name}
                          />
                          <DetailField
                            label="Report Date"
                            value={getReportDate(r) ? toMMDDYYYY(getReportDate(r)) : "—"}
                          />
                          <DetailField
                            label="Billing"
                            value={r.billing_ready ? "Ready" : "Not Ready"}
                          />
                          <DetailField
                            label="Last Edited By"
                            value={r.last_edited_by_name}
                          />
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {isEditing ? (
                          <>
                            <ActionButton
                              variant="success"
                              onClick={() => handleSaveEdit(r)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </ActionButton>

                            <ActionButton
                              variant="secondary"
                              onClick={handleCancelEdit}
                              disabled={savingEdit}
                            >
                              Cancel
                            </ActionButton>
                          </>
                        ) : (
                          <>
                            <ActionButton
                              variant="secondary"
                              onClick={() => handleStartEdit(r)}
                            >
                              Edit
                            </ActionButton>

                            <ActionButton
                              variant="danger"
                              onClick={() => handleDeleteReport(r)}
                              disabled={deletingId === r.id}
                            >
                              {deletingId === r.id ? "Deleting..." : "Delete"}
                            </ActionButton>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <TrackingSummary report={r} />

                      {isTrackingEditing && (
                        <SelectInput
                          value={trackingLocation}
                          onChange={setTrackingLocation}
                          options={WCHR_LOCATIONS}
                        />
                      )}

                      <div style={{ display: "grid", gap: 8 }}>
                        {isTrackingEditing ? (
                          <>
                            <ActionButton
                              variant="success"
                              onClick={() => handleUpdateLocation(r)}
                              disabled={savingTrackingId === r.id}
                              style={{ width: "100%" }}
                            >
                              {savingTrackingId === r.id
                                ? "Updating..."
                                : "Save Location"}
                            </ActionButton>

                            <ActionButton
                              variant="secondary"
                              onClick={handleCancelTrackingEdit}
                              disabled={savingTrackingId === r.id}
                              style={{ width: "100%" }}
                            >
                              Cancel
                            </ActionButton>
                          </>
                        ) : (
                          <ActionButton
                            variant={alert ? "warning" : "secondary"}
                            onClick={() => handleStartTrackingEdit(r)}
                            disabled={safeUpper(r.tracking_status) === "STORED"}
                            style={{ width: "100%" }}
                          >
                            Update Location
                          </ActionButton>
                        )}

                        <ActionButton
                          variant="warning"
                          onClick={() => handleMarkCompleted(r)}
                          disabled={
                            savingTrackingId === r.id ||
                            safeUpper(r.tracking_status) === "STORED"
                          }
                          style={{ width: "100%" }}
                        >
                          Passenger Delivered
                        </ActionButton>

                        <ActionButton
                          variant="success"
                          onClick={() => handleMarkStored(r)}
                          disabled={
                            savingTrackingId === r.id ||
                            safeUpper(r.tracking_status) === "STORED"
                          }
                          style={{ width: "100%" }}
                        >
                          Mark Stored / Not In Use
                        </ActionButton>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Total reports: <b>{reports.length}</b>
            </div>
          </div>
        )}
      </PageCard>
    </div>
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
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};

const editInputStyle = {
  width: "100%",
  minWidth: 90,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
};

const infoBoxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
};
