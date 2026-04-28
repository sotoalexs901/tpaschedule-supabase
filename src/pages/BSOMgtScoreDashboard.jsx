import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInputDate(value) {
  const d = toDateSafe(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateLabel(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
  return d.toLocaleDateString();
}

function todayDateInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function endOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
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
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfDay(dateLike) {
  const d = toDateSafe(dateLike) || new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function getRangeDates(range) {
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  if (range === "month") return { start: startOfMonth(), end: endOfMonth() };
  return { start: null, end: null };
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getLetterGrade(value, thresholds) {
  if (value <= thresholds.A) return "A";
  if (value <= thresholds.B) return "B";
  if (value <= thresholds.C) return "C";
  if (value <= thresholds.D) return "D";
  return "F";
}

function average(items, selector) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function buildCountRows(items, getKey, getValue) {
  const map = {};

  items.forEach((item) => {
    const key = getKey(item) || "Unknown";
    if (!map[key]) map[key] = 0;
    map[key] += getValue(item);
  });

  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getGradeStyles(grade) {
  if (grade === "A") {
    return { color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" };
  }
  if (grade === "B") {
    return { color: "#1769aa", bg: "#edf7ff", border: "#cfe7fb" };
  }
  if (grade === "C") {
    return { color: "#b45309", bg: "#fff7ed", border: "#fdba74" };
  }
  if (grade === "D" || grade === "F") {
    return { color: "#b91c1c", bg: "#fff1f2", border: "#fecdd3" };
  }
  return { color: "#334155", bg: "#f8fafc", border: "#cbd5e1" };
}

function createEditDraft(item) {
  return {
    date: item.date || "",
    station: item.station || "",
    airline: item.airline || "",
    flightNumber: item.flightNumber || "",
    origin: item.origin || "",
    beltNumber: item.beltNumber || "",
    agentName: item.agentName || "",
    actualArrivalTime: item.actualArrivalTime || "",
    firstBagTime: item.firstBagTime || "",
    lastBagTime: item.lastBagTime || "",
    scanStartTime: item.scanStartTime || "",
    scanEndTime: item.scanEndTime || "",
    onHandBags: String(item.onHandBags ?? ""),
    filesCreated: String(item.filesCreated ?? ""),
    totalBagsHandled: String(item.totalBagsHandled ?? ""),
    notes: item.notes || "",
  };
}

function getMinutesBetween(dateStr, startTime, endTime) {
  if (!dateStr || !startTime || !endTime) return 0;
  const start = new Date(`${dateStr}T${startTime}:00`);
  const end = new Date(`${dateStr}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = (end.getTime() - start.getTime()) / 60000;
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
}

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
        background: "#ffffff",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
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
        border: "1px solid #cbd5e1",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        background: "#ffffff",
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
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
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

function MetricTile({ title, value, subtitle, grade }) {
  const gradeStyle = getGradeStyles(grade);

  return (
    <div
      style={{
        border: "2px solid #1f2937",
        borderRadius: 6,
        background: "#ffffff",
        overflow: "hidden",
        minHeight: 220,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #dbeafe",
          textAlign: "center",
          fontSize: 15,
          fontWeight: 900,
          color: "#334155",
        }}
      >
        {title}
      </div>

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 900,
            color: "#0f172a",
            textAlign: "center",
          }}
        >
          {value}
        </div>

        {grade ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 999,
              background: gradeStyle.bg,
              color: gradeStyle.color,
              border: `2px solid ${gradeStyle.border}`,
              fontWeight: 900,
              fontSize: 28,
            }}
          >
            {grade}
          </div>
        ) : null}
      </div>

      <div
        style={{
          borderTop: "1px solid #e2e8f0",
          padding: "10px 12px",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function BarList({ rows, suffix = "" }) {
  if (!rows.length) {
    return <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>;
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 700,
              color: "#334155",
            }}
          >
            <span>{row.label}</span>
            <span>
              {row.value.toFixed(2)}
              {suffix}
            </span>
          </div>

          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const FIRST_BAG_THRESHOLDS = { A: 15, B: 20, C: 25, D: 30 };
const LAST_BAG_THRESHOLDS = { A: 30, B: 40, C: 50, D: 60 };
const SCAN_WINDOW_THRESHOLDS = { A: 20, B: 30, C: 40, D: 50 };
const OHD_BAGS_THRESHOLDS = { A: 0.25, B: 0.5, C: 1, D: 2 };
const FILES_THRESHOLDS = { A: 0.1, B: 0.25, C: 0.5, D: 1 };
const OHD_PERCENT_THRESHOLDS = { A: 10, B: 20, C: 35, D: 50 };
const FILE_PERCENT_THRESHOLDS = { A: 5, B: 10, C: 20, D: 30 };

export default function BSOMgtScoreDashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1400
  );

  const [range, setRange] = useState("week");
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [selectedAirline, setSelectedAirline] = useState("all");
  const [selectedStation, setSelectedStation] = useState("all");
  const [searchDate, setSearchDate] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [workingId, setWorkingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1100;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bso_operations"),
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Error loading BSO operations:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (range === "custom") return;
    const { start, end } = getRangeDates(range);
    setFromDate(formatInputDate(start));
    setToDate(formatInputDate(end));
  }, [range]);

  const airlineOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => String(item.airline || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const stationOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => String(item.station || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const activeStartDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const activeEndDate = toDate ? endOfDay(`${toDate}T00:00:00`) : null;

  const filteredRows = useMemo(() => {
    return rows
      .filter((item) => {
        const createdAt = toDateSafe(item.createdAt || item.updatedAt);
        if (!createdAt) return false;
        if (activeStartDate && createdAt < activeStartDate) return false;
        if (activeEndDate && createdAt > activeEndDate) return false;
        if (selectedAirline !== "all" && item.airline !== selectedAirline) return false;
        if (selectedStation !== "all" && item.station !== selectedStation) return false;
        if (searchDate && item.date !== searchDate) return false;
        return true;
      })
      .sort((a, b) => {
        const A = toDateSafe(a.createdAt)?.getTime() || 0;
        const B = toDateSafe(b.createdAt)?.getTime() || 0;
        return B - A;
      });
  }, [rows, activeStartDate, activeEndDate, selectedAirline, selectedStation, searchDate]);

  const totalFlights = filteredRows.length;

  const avgFirstBagMinutes = average(filteredRows, (item) =>
    safeNumber(item.firstBagMinutes)
  );
  const avgLastBagMinutes = average(filteredRows, (item) =>
    safeNumber(item.lastBagMinutes)
  );
  const avgScanWindowMinutes = average(filteredRows, (item) =>
    safeNumber(item.scanWindowMinutes)
  );
  const avgOnHandBagsPerFlight = average(filteredRows, (item) =>
    safeNumber(item.onHandBags)
  );
  const avgFilesPerFlight = average(filteredRows, (item) =>
    safeNumber(item.filesCreated)
  );

  const flightsWithOnHand = filteredRows.filter(
    (item) => safeNumber(item.onHandBags) > 0
  ).length;

  const flightsWithFiles = filteredRows.filter(
    (item) => safeNumber(item.filesCreated) > 0
  ).length;

  const percentFlightsWithOnHand = percent(flightsWithOnHand, totalFlights);
  const percentFlightsWithFiles = percent(flightsWithFiles, totalFlights);

  const gradeFirstBag = getLetterGrade(avgFirstBagMinutes, FIRST_BAG_THRESHOLDS);
  const gradeLastBag = getLetterGrade(avgLastBagMinutes, LAST_BAG_THRESHOLDS);
  const gradeScanWindow = getLetterGrade(avgScanWindowMinutes, SCAN_WINDOW_THRESHOLDS);
  const gradeOhdBags = getLetterGrade(avgOnHandBagsPerFlight, OHD_BAGS_THRESHOLDS);
  const gradeFiles = getLetterGrade(avgFilesPerFlight, FILES_THRESHOLDS);
  const gradeOhdPercent = getLetterGrade(
    percentFlightsWithOnHand,
    OHD_PERCENT_THRESHOLDS
  );
  const gradeFilesPercent = getLetterGrade(
    percentFlightsWithFiles,
    FILE_PERCENT_THRESHOLDS
  );

  const overallGrade = useMemo(() => {
    const grades = [
      gradeFirstBag,
      gradeLastBag,
      gradeScanWindow,
      gradeOhdBags,
      gradeFiles,
      gradeOhdPercent,
      gradeFilesPercent,
    ];

    const scoreMap = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    const reverseMap = ["F", "D", "C", "B", "A"];
    const avg =
      grades.reduce((sum, item) => sum + (scoreMap[item] ?? 0), 0) / grades.length;

    return reverseMap[Math.round(avg)] || "C";
  }, [
    gradeFirstBag,
    gradeLastBag,
    gradeScanWindow,
    gradeOhdBags,
    gradeFiles,
    gradeOhdPercent,
    gradeFilesPercent,
  ]);

  const agentRows = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => item.agentName || "Unknown",
        () => 1
      ).slice(0, 10),
    [filteredRows]
  );

  const airlineRows = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => item.airline || "Unknown",
        () => 1
      ).slice(0, 10),
    [filteredRows]
  );

  function startEditing(item) {
    setEditingId(item.id);
    setEditDraft(createEditDraft(item));
    setStatusMessage("");
  }

  function cancelEditing() {
    setEditingId("");
    setEditDraft(null);
  }

  async function handleSaveEdit() {
    if (!editingId || !editDraft) return;

    const firstBagMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.firstBagTime
    );

    const lastBagMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.lastBagTime
    );

    const scanWindowMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.scanStartTime,
      editDraft.scanEndTime
    );

    try {
      setWorkingId(editingId);

      await updateDoc(doc(db, "bso_operations", editingId), {
        ...editDraft,
        onHandBags: safeNumber(editDraft.onHandBags),
        filesCreated: safeNumber(editDraft.filesCreated),
        totalBagsHandled: safeNumber(editDraft.totalBagsHandled),
        firstBagMinutes,
        lastBagMinutes,
        scanWindowMinutes,
        updatedAt: serverTimestamp(),
      });

      setStatusMessage("Record updated successfully.");
      setEditingId("");
      setEditDraft(null);
    } catch (error) {
      console.error("Error updating BSO record:", error);
      setStatusMessage("Could not update the record.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleDelete(itemId) {
    const ok = window.confirm("Delete this BSO record permanently?");
    if (!ok) return;

    try {
      setWorkingId(itemId);
      await deleteDoc(doc(db, "bso_operations", itemId));
      setStatusMessage("Record deleted successfully.");

      if (editingId === itemId) {
        setEditingId("");
        setEditDraft(null);
      }
    } catch (error) {
      console.error("Error deleting BSO record:", error);
      setStatusMessage("Could not delete the record.");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)",
          border: "1px solid #dbeafe",
          borderRadius: 24,
          padding: isMobile ? 16 : 22,
          color: "#0f172a",
          boxShadow: "0 16px 34px rgba(15,23,42,0.06)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#64748b",
              }}
            >
              TPA OPS · BSO
            </div>

            <h1
              style={{
                margin: "8px 0 6px",
                fontSize: isMobile ? 28 : 36,
                lineHeight: 1,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              <span
                style={{
                  background: "#fde047",
                  padding: "0 8px",
                  marginRight: 6,
                }}
              >
                TPA
              </span>
              BSO Scorecard
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: 14,
                maxWidth: 800,
                lineHeight: 1.6,
                color: "#475569",
                fontWeight: 700,
              }}
            >
              Responsive management dashboard for On-Hand bags, files, first bag,
              last bag, and scan window. Includes date search, editing, and delete.
            </p>
          </div>

          <div
            style={{
              justifySelf: isMobile ? "start" : "end",
              textAlign: isMobile ? "left" : "right",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#64748b",
                marginBottom: 8,
              }}
            >
              Overall Grade
            </div>
            <div
              style={{
                fontSize: isMobile ? 34 : 48,
                fontWeight: 900,
                color: getGradeStyles(overallGrade).color,
              }}
            >
              {overallGrade}
            </div>
          </div>
        </div>
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

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <FieldLabel>Range</FieldLabel>
            <SelectInput value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom</option>
            </SelectInput>
          </div>

          <div>
            <FieldLabel>From</FieldLabel>
            <TextInput
              type="date"
              value={fromDate}
              onChange={(e) => {
                setRange("custom");
                setFromDate(e.target.value);
              }}
            />
          </div>

          <div>
            <FieldLabel>To</FieldLabel>
            <TextInput
              type="date"
              value={toDate}
              onChange={(e) => {
                setRange("custom");
                setToDate(e.target.value);
              }}
            />
          </div>

          <div>
            <FieldLabel>Search Exact Date</FieldLabel>
            <TextInput
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Station</FieldLabel>
            <SelectInput
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
            >
              <option value="all">All</option>
              {stationOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={selectedAirline}
              onChange={(e) => setSelectedAirline(e.target.value)}
            >
              <option value="all">All</option>
              {airlineOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
      </PageCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : isTablet
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(4, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <MetricTile
          title="First Bag"
          value={`${avgFirstBagMinutes.toFixed(1)} min`}
          subtitle="Average first bag delivery"
          grade={gradeFirstBag}
        />
        <MetricTile
          title="Last Bag"
          value={`${avgLastBagMinutes.toFixed(1)} min`}
          subtitle="Average last bag delivery"
          grade={gradeLastBag}
        />
        <MetricTile
          title="Scan Window"
          value={`${avgScanWindowMinutes.toFixed(1)} min`}
          subtitle="Average scan duration"
          grade={gradeScanWindow}
        />
        <MetricTile
          title="On-Hand"
          value={`${percentFlightsWithOnHand.toFixed(1)}%`}
          subtitle={`${avgOnHandBagsPerFlight.toFixed(2)} avg bags / flight`}
          grade={gradeOhdPercent}
        />
        <MetricTile
          title="Files Created"
          value={`${percentFlightsWithFiles.toFixed(1)}%`}
          subtitle={`${avgFilesPerFlight.toFixed(2)} avg files / flight`}
          grade={gradeFilesPercent}
        />
        <MetricTile
          title="Flights"
          value={String(totalFlights)}
          subtitle="Total records in selected range"
        />
        <MetricTile
          title="Avg OHD / Flight"
          value={avgOnHandBagsPerFlight.toFixed(2)}
          subtitle="On-hand bags average"
          grade={gradeOhdBags}
        />
        <MetricTile
          title="Avg Files / Flight"
          value={avgFilesPerFlight.toFixed(2)}
          subtitle="Files average"
          grade={gradeFiles}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14,
        }}
      >
        <PageCard style={{ padding: 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Flights by Agent
          </h2>
          <BarList rows={agentRows} />
        </PageCard>

        <PageCard style={{ padding: 20 }}>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Flights by Airline
          </h2>
          <BarList rows={airlineRows} />
        </PageCard>
      </div>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
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
            BSO Operations Detail
          </h2>

          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {searchDate ? `Showing date ${searchDate}` : "Showing selected date range"}
          </div>
        </div>

        {isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredRows.length === 0 ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                {loading ? "Loading..." : "No records found."}
              </div>
            ) : (
              filteredRows.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: 16,
                    padding: 14,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                      marginBottom: 10,
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
                        {item.airline || "—"} {item.flightNumber || ""}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        {item.station || "—"} · {item.origin || "—"} · {item.date || "—"}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      fontSize: 13,
                      color: "#334155",
                    }}
                  >
                    <div><strong>Agent:</strong> {item.agentName || "—"}</div>
                    <div><strong>Belt:</strong> {item.beltNumber || "—"}</div>
                    <div><strong>Arrival:</strong> {item.actualArrivalTime || "—"}</div>
                    <div><strong>First Bag:</strong> {item.firstBagTime || "—"}</div>
                    <div><strong>Last Bag:</strong> {item.lastBagTime || "—"}</div>
                    <div><strong>Scan Window:</strong> {safeNumber(item.scanWindowMinutes).toFixed(2)}</div>
                    <div><strong>OHD:</strong> {safeNumber(item.onHandBags)}</div>
                    <div><strong>Files:</strong> {safeNumber(item.filesCreated)}</div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 14,
                    }}
                  >
                    <ActionButton
                      variant="secondary"
                      onClick={() => startEditing(item)}
                    >
                      Edit
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      onClick={() => handleDelete(item.id)}
                      disabled={workingId === item.id}
                    >
                      {workingId === item.id ? "Deleting..." : "Delete"}
                    </ActionButton>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div
            style={{
              width: "100%",
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
                minWidth: 1400,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  {[
                    "Date",
                    "Station",
                    "Airline",
                    "Flight",
                    "Origin",
                    "Belt",
                    "Agent",
                    "Actual Arrival",
                    "First Bag",
                    "Last Bag",
                    "Scan Start",
                    "Scan End",
                    "First Bag Min",
                    "Last Bag Min",
                    "Scan Window",
                    "OHD Bags",
                    "Files",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: 14,
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#475569",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        textAlign: "left",
                        borderBottom: "1px solid #e2e8f0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={18}
                      style={{ padding: 14, fontSize: 14, color: "#0f172a" }}
                    >
                      {loading ? "Loading..." : "No records found."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((item) => (
                    <tr key={item.id}>
                      <td style={cellStyle}>{item.date || "—"}</td>
                      <td style={cellStyle}>{item.station || "—"}</td>
                      <td style={cellStyle}>{item.airline || "—"}</td>
                      <td style={cellStyle}>{item.flightNumber || "—"}</td>
                      <td style={cellStyle}>{item.origin || "—"}</td>
                      <td style={cellStyle}>{item.beltNumber || "—"}</td>
                      <td style={cellStyle}>{item.agentName || "—"}</td>
                      <td style={cellStyle}>{item.actualArrivalTime || "—"}</td>
                      <td style={cellStyle}>{item.firstBagTime || "—"}</td>
                      <td style={cellStyle}>{item.lastBagTime || "—"}</td>
                      <td style={cellStyle}>{item.scanStartTime || "—"}</td>
                      <td style={cellStyle}>{item.scanEndTime || "—"}</td>
                      <td style={cellStyle}>{safeNumber(item.firstBagMinutes).toFixed(2)}</td>
                      <td style={cellStyle}>{safeNumber(item.lastBagMinutes).toFixed(2)}</td>
                      <td style={cellStyle}>{safeNumber(item.scanWindowMinutes).toFixed(2)}</td>
                      <td style={cellStyle}>{safeNumber(item.onHandBags)}</td>
                      <td style={cellStyle}>{safeNumber(item.filesCreated)}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="secondary"
                            onClick={() => startEditing(item)}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            variant="danger"
                            onClick={() => handleDelete(item.id)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? "Deleting..." : "Delete"}
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      {editingId && editDraft && (
        <PageCard style={{ padding: isMobile ? 14 : 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 14,
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
              Edit BSO Record
            </h2>

            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Editing date {editDraft.date || "—"}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={editDraft.date}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, date: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Station</FieldLabel>
              <TextInput
                value={editDraft.station}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, station: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Airline</FieldLabel>
              <TextInput
                value={editDraft.airline}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, airline: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={editDraft.flightNumber}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, flightNumber: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Origin</FieldLabel>
              <TextInput
                value={editDraft.origin}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, origin: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Belt Number</FieldLabel>
              <TextInput
                value={editDraft.beltNumber}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, beltNumber: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Agent</FieldLabel>
              <TextInput
                value={editDraft.agentName}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, agentName: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Actual Arrival</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.actualArrivalTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    actualArrivalTime: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>First Bag</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.firstBagTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, firstBagTime: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Last Bag</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.lastBagTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, lastBagTime: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Scan Start</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.scanStartTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, scanStartTime: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Scan End</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.scanEndTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, scanEndTime: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>On-Hand Bags</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={editDraft.onHandBags}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, onHandBags: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Files Created</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={editDraft.filesCreated}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, filesCreated: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Total Bags Handled</FieldLabel>
              <TextInput
                type="number"
                min="0"
                value={editDraft.totalBagsHandled}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    totalBagsHandled: e.target.value,
                  }))
                }
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>Notes</FieldLabel>
              <TextArea
                value={editDraft.notes}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <ActionButton
              variant="success"
              onClick={handleSaveEdit}
              disabled={workingId === editingId}
            >
              {workingId === editingId ? "Saving..." : "Save Changes"}
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={cancelEditing}
              disabled={workingId === editingId}
            >
              Cancel
            </ActionButton>
          </div>
        </PageCard>
      )}
    </div>
  );
}

const cellStyle = {
  padding: 14,
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};
