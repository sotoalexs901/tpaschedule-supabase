import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  increment,
  arrayUnion,
} from "firebase/firestore";

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

function formatTimeAtGate(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function getMillis(val) {
  if (!val) return 0;
  if (typeof val?.toMillis === "function") return val.toMillis();
  const d = tsToDate(val);
  return d ? d.getTime() : 0;
}

function formatReportFlightDate(val) {
  const d = tsToDate(val);
  return d ? toMMDDYYYY(d) : "—";
}

function formatDateTimeValue(val) {
  const d = tsToDate(val);
  if (!d) return "—";
  return `${toMMDDYYYY(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

async function decrementDailyWchrStats(report) {
  const dateKey = statsDateKey(report.flight_date);
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

  await setDoc(statsRef, payload, { merge: true });
}

function downloadCSV(filename, rows) {
  const headers = [
    "Report ID",
    "Submitted By",
    "Employee Role",
    "Passenger",
    "Airline",
    "Flight",
    "Flight Date",
    "Destination",
    "Seat",
    "Gate",
    "PNR",
    "WCHR Type",
    "Wheelchair #",
    "Status",
    "Last Edited By",
    "Last Edited At",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => {
      const flightDate = tsToDate(r.flight_date);

      const cols = [
        r.report_id || "",
        r.employee_name || "",
        r.employee_role || "",
        r.passenger_name || "",
        r.airline || "",
        r.flight_number || "",
        flightDate ? toMMDDYYYY(flightDate) : "",
        r.destination || "",
        r.seat || "",
        r.gate || "",
        r.pnr || "",
        r.wch_type || "",
        r.wheelchair_number || "",
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
    const airline = safeUpper(r.airline) || "UNKNOWN";
    const reportFlightDate = tsToDate(r.flight_date);
    const dateKey = reportFlightDate ? toYYYYMMDD(reportFlightDate) : "NO_DATE";
    const groupKey = `${airline}-${dateKey}`;

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        flight_key: groupKey,
        airline,
        flight_date: reportFlightDate,
        total_reports: 0,
        new_reports: 0,
        late_reports: 0,
        flights_count: 0,
        flight_numbers: new Set(),
        routes: new Set(),
        operators: new Set(),
        closed: false,
        closed_at: null,
      });
    }

    const item = map.get(groupKey);
    item.total_reports += 1;

    const flightNumber = safeUpper(r.flight_number);
    if (flightNumber) {
      item.flight_numbers.add(flightNumber);
    }

    const origin = safeUpper(r.origin);
    const destination = safeUpper(r.destination);
    if (origin || destination) {
      item.routes.add(`${origin || "—"} → ${destination || "—"}`);
    }

    const operator = safeUpper(r.operator);
    if (operator) {
      item.operators.add(operator);
    }

    if (String(r.status || "").toUpperCase() === "LATE") {
      item.late_reports += 1;
    } else {
      item.new_reports += 1;
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      flights_count: item.flight_numbers.size,
      flight_numbers: Array.from(item.flight_numbers).sort(),
      routes: Array.from(item.routes),
      operators: Array.from(item.operators),
    }))
    .sort((a, b) => {
      const dateA = a.flight_date ? a.flight_date.getTime() : 0;
      const dateB = b.flight_date ? b.flight_date.getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.airline.localeCompare(b.airline);
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
  const k = String(kind || "").toUpperCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (k === "CLOSED") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }
  if (k === "OPEN") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }
  if (k === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
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

export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();

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

  const canClose = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return (
      role.includes("station") ||
      role.includes("duty") ||
      role.includes("supervisor")
    );
  }, [user]);

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

        if (mounted) {
          setAllDayReports(rows);
        }

        const flightArr = buildFlightsFromRows(rows);

        if (mounted) {
          setFlights(flightArr);

          const exists = flightArr.some((x) => x.flight_key === selectedFlightKey);
          if (!exists) {
            setSelectedFlightKey("");
            setReports([]);
          }
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
            const airline = safeUpper(r.airline) || "UNKNOWN";
            const reportFlightDate = tsToDate(r.flight_date);
            const dateKey = reportFlightDate ? toYYYYMMDD(reportFlightDate) : "NO_DATE";
            return `${airline}-${dateKey}` === selectedFlightKey;
          })
          .map((r) => ({
            ...r,
            airline: safeUpper(r.airline),
            flight_number: safeUpper(r.flight_number),
            origin: safeUpper(r.origin),
            destination: safeUpper(r.destination),
            gate: safeUpper(r.gate),
            seat: safeUpper(r.seat),
            boarding_group: safeUpper(r.boarding_group),
            operator: safeUpper(r.operator),
            time_at_gate: formatTimeAtGate(r.time_at_gate),
            pnr: safeText(r.pnr).toUpperCase(),
            employee_login: safeText(r.employee_login),
            employee_role: safeText(r.employee_role),
            wheelchair_number: safeText(r.wheelchair_number).toUpperCase(),
          }))
          .sort((a, b) => {
            if (safeUpper(a.flight_number) !== safeUpper(b.flight_number)) {
              return safeUpper(a.flight_number).localeCompare(safeUpper(b.flight_number));
            }
            return getMillis(a.submitted_at) - getMillis(b.submitted_at);
          });

        if (mounted) setReports(flightRows);
      } catch (e) {
        console.error(e);
        if (mounted) {
          setError(e?.message || "Failed to load reports for this flight group.");
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
      flight_date: tsToDate(report.flight_date)
        ? toYYYYMMDD(tsToDate(report.flight_date))
        : "",
      destination: report.destination || "",
      seat: report.seat || "",
      gate: report.gate || "",
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

      const updatedFlightDate = editForm.flight_date
        ? Timestamp.fromDate(new Date(editForm.flight_date + "T00:00:00"))
        : report.flight_date || null;

      const updatedAirline = safeUpper(editForm.airline);
      const updatedFlightNumber = safeUpper(editForm.flight_number);

      const updatedFlightKey =
        updatedAirline && updatedFlightNumber && editForm.flight_date
          ? `${updatedAirline}-${updatedFlightNumber}-${editForm.flight_date}`
          : report.flight_key || "";

      const nowTs = Timestamp.now();
      const editorName =
        user?.fullName || user?.displayName || user?.username || "";

      const payload = {
        passenger_name: safeText(editForm.passenger_name),
        airline: updatedAirline,
        flight_number: updatedFlightNumber,
        flight_date: updatedFlightDate,
        destination: safeUpper(editForm.destination),
        seat: safeUpper(editForm.seat),
        gate: safeUpper(editForm.gate),
        pnr: safeUpper(editForm.pnr),
        wch_type: safeUpper(editForm.wch_type),
        wheelchair_number: safeUpper(editForm.wheelchair_number),
        status: safeUpper(editForm.status || "NEW"),
        flight_key: updatedFlightKey,
        last_edited_at: nowTs,
        last_edited_by_id: user?.id || "",
        last_edited_by_name: editorName,
      };

      await updateDoc(doc(db, "wch_reports", report.id), {
        ...payload,
        edit_history: arrayUnion({
          edited_at: nowTs,
          edited_by_id: user?.id || "",
          edited_by_name: editorName,
          previous_airline: report.airline || "",
          previous_flight_number: report.flight_number || "",
          previous_flight_date: report.flight_date || null,
          previous_passenger_name: report.passenger_name || "",
          previous_destination: report.destination || "",
          previous_seat: report.seat || "",
          previous_gate: report.gate || "",
          previous_pnr: report.pnr || "",
          previous_wch_type: report.wch_type || "",
          previous_wheelchair_number: report.wheelchair_number || "",
          previous_status: report.status || "",
        }),
      });

      const updatedAllDayReports = allDayReports.map((r) =>
        r.id === report.id
          ? {
              ...r,
              ...payload,
            }
          : r
      );

      setAllDayReports(updatedAllDayReports);

      const updatedReports = reports.map((r) =>
        r.id === report.id
          ? {
              ...r,
              ...payload,
            }
          : r
      );

      setReports(updatedReports);

      const updatedFlights = buildFlightsFromRows(updatedAllDayReports);
      setFlights(updatedFlights);

      const newGroupKey =
        updatedAirline && editForm.flight_date
          ? `${updatedAirline}-${editForm.flight_date}`
          : selectedFlightKey;

      if (selectedFlightKey !== newGroupKey) {
        setSelectedFlightKey(newGroupKey);
      }

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

  const handleExportFullDay = () => {
    if (!allDayReports.length) return;
    const filename = `WCHR_FULL_DAY_${toYYYYMMDD(selectedDate)}.csv`;
    downloadCSV(filename, allDayReports);
  };

  const handleExportCurrentFlight = () => {
    if (!selectedFlight || !reports.length) return;

    const filename = `WCHR_${selectedFlight.airline}_${toYYYYMMDD(
      selectedFlight.flight_date || new Date()
    )}.csv`;

    downloadCSV(filename, reports);
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

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
              TPA OPS · WCHR
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              WCHR Flight Report
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              View reports grouped by airline and date, open details, print, edit,
              delete and export records.
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
              onClick={() => navigate("/wchr/my-reports")}
              variant="secondary"
            >
              My Reports
            </ActionButton>
            <ActionButton
              onClick={() => navigate("/dashboard")}
              variant="secondary"
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

      <PageCard style={{ padding: 20 }}>
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
            }}
          >
            <div>
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
                Date
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
              }}
            >
              Showing reports submitted on: <b>{toMMDDYYYY(selectedDate)}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ActionButton
              onClick={handleExportFullDay}
              variant="secondary"
              disabled={!allDayReports.length}
              style={{ padding: "8px 12px", fontSize: 12 }}
            >
              Export Full Day
            </ActionButton>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Airlines Summary
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            The list is grouped by airline and date. Inside details you will see
            each flight number like WL293, WL294, etc.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>Loading...</div>
        ) : flights.length === 0 ? (
          <div style={infoBoxStyle}>No flights found for this date.</div>
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
                  <th style={thStyle({ textAlign: "left" })}>Airline</th>
                  <th style={thStyle({ textAlign: "left" })}>Date</th>
                  <th style={thStyle({ textAlign: "left" })}>Flights</th>
                  <th style={thStyle({ textAlign: "left" })}>Routes</th>
                  <th style={thStyle({ textAlign: "left" })}>Reports</th>
                  <th style={thStyle({ textAlign: "left" })}>Status</th>
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
                          fontWeight: selectedFlightKey === f.flight_key ? 900 : 700,
                          fontSize: 14,
                        }}
                      >
                        {f.airline}
                      </button>
                    </td>

                    <td style={tdStyle}>
                      {f.flight_date ? toMMDDYYYY(f.flight_date) : "—"}
                    </td>

                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>
                        {f.flights_count || 0} flight(s)
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        {(f.flight_numbers || []).join(", ") || "—"}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {(f.routes || []).length ? (f.routes || []).join(" | ") : "—"}
                    </td>

                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>
                        Total: {f.total_reports}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        NEW: {f.new_reports} · LATE: {f.late_reports}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      <span style={statusBadge("OPEN")}>OPEN</span>
                    </td>

                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "center",
                        }}
                      >
                        <ActionButton
                          onClick={() => setSelectedFlightKey(f.flight_key)}
                          variant="primary"
                          style={{ padding: "8px 12px", fontSize: 12 }}
                        >
                          View Details
                        </ActionButton>

                        <ActionButton
                          onClick={() => {
                            const filename = `WCHR_${f.airline}_${toYYYYMMDD(
                              f.flight_date || new Date()
                            )}.csv`;
                            const groupRows = allDayReports.filter((r) => {
                              const airline = safeUpper(r.airline) || "UNKNOWN";
                              const reportFlightDate = tsToDate(r.flight_date);
                              const dateKey = reportFlightDate
                                ? toYYYYMMDD(reportFlightDate)
                                : "NO_DATE";
                              return `${airline}-${dateKey}` === f.flight_key;
                            });
                            downloadCSV(filename, groupRows);
                          }}
                          variant="secondary"
                          style={{ padding: "8px 12px", fontSize: 12 }}
                        >
                          Export
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p
              style={{
                margin: "10px 12px 0",
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              Note: Reports submitted after closure rules in your workflow can still
              be marked as <b>LATE</b>.
            </p>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
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
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Flight Details
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {selectedFlight ? (
                <>
                  Showing reports for <b>{selectedFlight.airline}</b> ·{" "}
                  <b>
                    {selectedFlight.flight_date
                      ? toMMDDYYYY(selectedFlight.flight_date)
                      : "—"}
                  </b>
                  <br />
                  <span style={{ color: "#64748b" }}>
                    Flights: {(selectedFlight.flight_numbers || []).join(", ") || "—"}
                  </span>
                </>
              ) : (
                "Select an airline row above to view details."
              )}
            </p>
          </div>

          {selectedFlight && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <ActionButton
                onClick={() => window.print()}
                variant="secondary"
              >
                Print
              </ActionButton>

              <ActionButton
                onClick={handleExportCurrentFlight}
                variant="secondary"
                disabled={!reports?.length}
              >
                Export CSV
              </ActionButton>
            </div>
          )}
        </div>

        {reportsLoading ? (
          <div style={infoBoxStyle}>Loading reports...</div>
        ) : !selectedFlight ? (
          <div style={infoBoxStyle}>No airline selected.</div>
        ) : reports.length === 0 ? (
          <div style={infoBoxStyle}>No reports for this airline/date.</div>
        ) : (
          <>
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
                  minWidth: 1850,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle({ textAlign: "left" })}>Report ID</th>
                    <th style={thStyle({ textAlign: "left" })}>Submitted By</th>
                    <th style={thStyle({ textAlign: "left" })}>Employee Role</th>
                    <th style={thStyle({ textAlign: "left" })}>Passenger</th>
                    <th style={thStyle({ textAlign: "left" })}>Airline</th>
                    <th style={thStyle({ textAlign: "left" })}>Flight</th>
                    <th style={thStyle({ textAlign: "left" })}>Flight Date</th>
                    <th style={thStyle({ textAlign: "left" })}>Destination</th>
                    <th style={thStyle({ textAlign: "left" })}>Seat</th>
                    <th style={thStyle({ textAlign: "left" })}>Gate</th>
                    <th style={thStyle({ textAlign: "left" })}>PNR</th>
                    <th style={thStyle({ textAlign: "left" })}>WCHR Type</th>
                    <th style={thStyle({ textAlign: "left" })}>Wheelchair #</th>
                    <th style={thStyle({ textAlign: "center" })}>Status</th>
                    <th style={thStyle({ textAlign: "left" })}>Last Edited By</th>
                    <th style={thStyle({ textAlign: "left" })}>Last Edited At</th>
                    <th style={thStyle({ textAlign: "center" })}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {reports.map((r, index) => {
                    const isEditing = editingId === r.id;

                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                        }}
                      >
                        <td style={tdStyle}>{r.report_id || r.id}</td>
                        <td style={tdStyle}>{r.employee_name || "—"}</td>
                        <td style={tdStyle}>{r.employee_role || "—"}</td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.passenger_name || ""}
                              onChange={(e) =>
                                handleEditChange("passenger_name", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.passenger_name || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.airline || ""}
                              onChange={(e) =>
                                handleEditChange("airline", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.airline || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.flight_number || ""}
                              onChange={(e) =>
                                handleEditChange("flight_number", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.flight_number || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              type="date"
                              value={editForm.flight_date || ""}
                              onChange={(e) =>
                                handleEditChange("flight_date", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            formatReportFlightDate(r.flight_date)
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.destination || ""}
                              onChange={(e) =>
                                handleEditChange("destination", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.destination || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.seat || ""}
                              onChange={(e) =>
                                handleEditChange("seat", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.seat || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.gate || ""}
                              onChange={(e) =>
                                handleEditChange("gate", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.gate || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.pnr || ""}
                              onChange={(e) =>
                                handleEditChange("pnr", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.pnr || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.wch_type || ""}
                              onChange={(e) =>
                                handleEditChange("wch_type", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.wch_type || "—"
                          )}
                        </td>

                        <td style={tdStyle}>
                          {isEditing ? (
                            <input
                              value={editForm.wheelchair_number || ""}
                              onChange={(e) =>
                                handleEditChange("wheelchair_number", e.target.value)
                              }
                              style={editInputStyle}
                            />
                          ) : (
                            r.wheelchair_number || "—"
                          )}
                        </td>

                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {isEditing ? (
                            <select
                              value={editForm.status || "NEW"}
                              onChange={(e) =>
                                handleEditChange("status", e.target.value)
                              }
                              style={editInputStyle}
                            >
                              <option value="NEW">NEW</option>
                              <option value="LATE">LATE</option>
                            </select>
                          ) : String(r.status || "").toUpperCase() === "LATE" ? (
                            <span style={statusBadge("LATE")}>LATE</span>
                          ) : (
                            <span style={statusBadge("NEW")}>NEW</span>
                          )}
                        </td>

                        <td style={tdStyle}>{r.last_edited_by_name || "—"}</td>
                        <td style={tdStyle}>
                          {r.last_edited_at ? formatDateTimeValue(r.last_edited_at) : "—"}
                        </td>

                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              justifyContent: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            {isEditing ? (
                              <>
                                <ActionButton
                                  variant="success"
                                  onClick={() => handleSaveEdit(r)}
                                  disabled={savingEdit}
                                  style={{ padding: "8px 12px", fontSize: 12 }}
                                >
                                  {savingEdit ? "Saving..." : "Save"}
                                </ActionButton>

                                <ActionButton
                                  variant="secondary"
                                  onClick={handleCancelEdit}
                                  disabled={savingEdit}
                                  style={{ padding: "8px 12px", fontSize: 12 }}
                                >
                                  Cancel
                                </ActionButton>
                              </>
                            ) : (
                              <>
                                <ActionButton
                                  variant="secondary"
                                  onClick={() => handleStartEdit(r)}
                                  style={{ padding: "8px 12px", fontSize: 12 }}
                                >
                                  Edit
                                </ActionButton>

                                <ActionButton
                                  variant="danger"
                                  onClick={() => handleDeleteReport(r)}
                                  disabled={deletingId === r.id}
                                  style={{ padding: "8px 12px", fontSize: 12 }}
                                >
                                  {deletingId === r.id ? "Deleting..." : "Delete"}
                                </ActionButton>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Total reports: <b>{reports.length}</b>
            </div>
          </>
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
