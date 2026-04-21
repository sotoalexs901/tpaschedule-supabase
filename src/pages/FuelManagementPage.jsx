// src/pages/FuelManagementPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
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

function formatDateTime(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
  return d.toLocaleString();
}

function formatInputDate(value) {
  const d = toDateSafe(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
  if (range === "today") {
    return { start: startOfToday(), end: endOfToday() };
  }
  if (range === "week") {
    return { start: startOfWeek(), end: endOfWeek() };
  }
  if (range === "month") {
    return { start: startOfMonth(), end: endOfMonth() };
  }
  return { start: null, end: null };
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatFixed(value, decimals = 2) {
  return safeNumber(value).toFixed(decimals);
}

function getEmployeeName(item) {
  return (
    normalizeText(item.employeeName) ||
    normalizeText(item.employee_name) ||
    normalizeText(item.employeeLogin) ||
    normalizeText(item.employee_login) ||
    "Unknown"
  );
}

function getAirlineUse(item) {
  return (
    normalizeText(item.airlineUse) ||
    normalizeText(item.airline_use) ||
    "Unknown"
  );
}

function getPhotoStatus(item) {
  return normalizeText(item.photoCheckStatus || item.photo_check_status || "—");
}

function getOcrStart(item) {
  const value = item.ocrStartReading ?? item.ocr_start_reading;
  return value === null || value === undefined ? null : safeNumber(value);
}

function getOcrEnd(item) {
  const value = item.ocrEndReading ?? item.ocr_end_reading;
  return value === null || value === undefined ? null : safeNumber(value);
}

function getStartDiff(item) {
  const value = item.photoCheckStartDiff ?? item.photo_check_start_diff;
  return value === null || value === undefined ? null : safeNumber(value);
}

function getEndDiff(item) {
  const value = item.photoCheckEndDiff ?? item.photo_check_end_diff;
  return value === null || value === undefined ? null : safeNumber(value);
}

function getPhotoNotes(item) {
  return normalizeText(item.photoCheckNotes || item.photo_check_notes || "");
}

function matchesRange(item, startDate, endDate) {
  const createdAt = toDateSafe(item.createdAt || item.updatedAt);
  if (!createdAt) return false;
  if (startDate && createdAt < startDate) return false;
  if (endDate && createdAt > endDate) return false;
  return true;
}

function buildTopEntity(items, getKey, getValue) {
  const map = {};

  items.forEach((item) => {
    const key = getKey(item) || "Unknown";
    const value = getValue(item);
    if (!map[key]) {
      map[key] = 0;
    }
    map[key] += value;
  });

  let bestLabel = "—";
  let bestValue = 0;

  Object.entries(map).forEach(([label, value]) => {
    if (value > bestValue) {
      bestLabel = label;
      bestValue = value;
    }
  });

  return { label: bestLabel, value: bestValue };
}

function buildCountRows(items, getKey, getValue) {
  const map = {};

  items.forEach((item) => {
    const key = getKey(item) || "Unknown";
    if (!map[key]) {
      map[key] = 0;
    }
    map[key] += getValue(item);
  });

  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildDailyRows(items) {
  const map = {};

  items.forEach((item) => {
    const key = item.date || formatInputDate(item.createdAt) || "Unknown";
    if (!map[key]) {
      map[key] = {
        date: key,
        records: 0,
        gallons: 0,
      };
    }

    map[key].records += 1;
    map[key].gallons += safeNumber(item.totalGallons);
  });

  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

function buildOcrSummary(items) {
  let match = 0;
  let mismatch = 0;
  let pending = 0;
  let missing = 0;

  items.forEach((item) => {
    const status = getPhotoStatus(item).toLowerCase();

    if (status === "match") match += 1;
    else if (status === "mismatch") mismatch += 1;
    else if (status === "missing") missing += 1;
    else pending += 1;
  });

  return { match, mismatch, pending, missing };
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

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbeafe",
        borderRadius: 20,
        boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
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
        minWidth: 0,
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
        minWidth: 0,
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
        opacity: disabled ? 0.7 : 1,
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, tone = "default" }) {
  const tones = {
    default: {
      bg: "#f8fbff",
      border: "#dbeafe",
      color: "#0f172a",
    },
    blue: {
      bg: "#edf7ff",
      border: "#cfe7fb",
      color: "#1769aa",
    },
    green: {
      bg: "#ecfdf5",
      border: "#a7f3d0",
      color: "#166534",
    },
    amber: {
      bg: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412",
    },
    red: {
      bg: "#fff1f2",
      border: "#fecdd3",
      color: "#be123c",
    },
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
          fontSize: 24,
          fontWeight: 900,
          color: current.color,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const value = normalizeText(status).toLowerCase();

  const map = {
    match: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534", label: "MATCH" },
    mismatch: { bg: "#fff1f2", border: "#fecdd3", color: "#be123c", label: "MISMATCH" },
    pending_review: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412", label: "PENDING REVIEW" },
    missing: { bg: "#f8fafc", border: "#cbd5e1", color: "#334155", label: "MISSING" },
  };

  const current = map[value] || {
    bg: "#f8fafc",
    border: "#cbd5e1",
    color: "#334155",
    label: status || "—",
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: current.bg,
        border: `1px solid ${current.border}`,
        color: current.color,
        whiteSpace: "nowrap",
      }}
    >
      {current.label}
    </span>
  );
}

const tableWrapStyle = {
  width: "100%",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  WebkitOverflowScrolling: "touch",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1500,
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
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  color: "#0f172a",
  verticalAlign: "top",
};

export default function FuelManagementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState("today");
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedAirlineUse, setSelectedAirlineUse] = useState("all");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "fuel_logs"),
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setRows(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading fuel logs:", error);
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

  const employeeOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => getEmployeeName(item))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const airlineUseOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => getAirlineUse(item))))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const activeStartDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const activeEndDate = toDate ? endOfDay(`${toDate}T00:00:00`) : null;

  const filteredRows = useMemo(() => {
    return rows
      .filter((item) => matchesRange(item, activeStartDate, activeEndDate))
      .filter((item) => {
        if (selectedEmployee !== "all" && getEmployeeName(item) !== selectedEmployee) {
          return false;
        }

        if (selectedAirlineUse !== "all" && getAirlineUse(item) !== selectedAirlineUse) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const A = toDateSafe(a.createdAt)?.getTime() || 0;
        const B = toDateSafe(b.createdAt)?.getTime() || 0;
        return B - A;
      });
  }, [rows, activeStartDate, activeEndDate, selectedEmployee, selectedAirlineUse]);

  const totalRecords = filteredRows.length;
  const totalGallons = filteredRows.reduce(
    (sum, item) => sum + safeNumber(item.totalGallons),
    0
  );

  const topAgentByGallons = useMemo(
    () =>
      buildTopEntity(
        filteredRows,
        (item) => getEmployeeName(item),
        (item) => safeNumber(item.totalGallons)
      ),
    [filteredRows]
  );

  const topAgentByEntries = useMemo(
    () =>
      buildTopEntity(
        filteredRows,
        (item) => getEmployeeName(item),
        () => 1
      ),
    [filteredRows]
  );

  const topAirlineByGallons = useMemo(
    () =>
      buildTopEntity(
        filteredRows,
        (item) => getAirlineUse(item),
        (item) => safeNumber(item.totalGallons)
      ),
    [filteredRows]
  );

  const gallonsByAgent = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => getEmployeeName(item),
        (item) => safeNumber(item.totalGallons)
      ).slice(0, 10),
    [filteredRows]
  );

  const gallonsByAirlineUse = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => getAirlineUse(item),
        (item) => safeNumber(item.totalGallons)
      ).slice(0, 10),
    [filteredRows]
  );

  const dailyRows = useMemo(() => buildDailyRows(filteredRows), [filteredRows]);
  const ocrSummary = useMemo(() => buildOcrSummary(filteredRows), [filteredRows]);

  function handleExportCsv() {
    const csvRows = [
      ["FUEL MANAGEMENT REPORT"],
      ["Range", range],
      ["From", fromDate || "—"],
      ["To", toDate || "—"],
      ["Employee", selectedEmployee],
      ["Airline/Use", selectedAirlineUse],
      [],
      ["SUMMARY"],
      ["Total Records", totalRecords],
      ["Total Gallons", totalGallons.toFixed(2)],
      ["Top Agent by Gallons", topAgentByGallons.label],
      ["Top Agent Gallons", topAgentByGallons.value.toFixed(2)],
      ["Top Agent by Entries", topAgentByEntries.label],
      ["Top Agent Entries", topAgentByEntries.value],
      ["Top Airline/Use", topAirlineByGallons.label],
      ["Top Airline/Use Gallons", topAirlineByGallons.value.toFixed(2)],
      ["OCR Match", ocrSummary.match],
      ["OCR Mismatch", ocrSummary.mismatch],
      ["OCR Pending Review", ocrSummary.pending],
      ["OCR Missing", ocrSummary.missing],
      [],
      ["DETAILS"],
      [
        "Date",
        "Time",
        "Equipment",
        "Employee",
        "Airline/Use",
        "Start Reading",
        "End Reading",
        "Total Gallons",
        "Photo Status",
        "OCR Start",
        "OCR End",
        "Start Diff",
        "End Diff",
        "Photo URL",
        "Photo Notes",
        "Notes",
        "Created At",
      ],
      ...filteredRows.map((item) => [
        item.date || "",
        item.time || "",
        item.equipmentNumber || "",
        getEmployeeName(item),
        getAirlineUse(item),
        formatFixed(item.startReading),
        formatFixed(item.endReading),
        formatFixed(item.totalGallons),
        getPhotoStatus(item),
        getOcrStart(item) === null ? "" : formatFixed(getOcrStart(item)),
        getOcrEnd(item) === null ? "" : formatFixed(getOcrEnd(item)),
        getStartDiff(item) === null ? "" : formatFixed(getStartDiff(item)),
        getEndDiff(item) === null ? "" : formatFixed(getEndDiff(item)),
        item.photoUrl || "",
        getPhotoNotes(item),
        item.notes || "",
        formatDateTime(item.createdAt),
      ]),
    ];

    downloadCsv("fuel-management-report.csv", csvRows);
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        maxWidth: 1320,
        margin: "0 auto",
      }}
    >
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
          TPA OPS · Fuel Control
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          Fuel Management Dashboard
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 14,
            maxWidth: 900,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          Daily, weekly and monthly control of fuel usage by employee and airline/use, including OCR photo validation.
        </p>
      </div>

      <PageCard style={{ padding: 20 }}>
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
            <ActionButton variant="secondary" onClick={handleExportCsv}>
              Export CSV
            </ActionButton>
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
            <FieldLabel>Range</FieldLabel>
            <SelectInput
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
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
            <FieldLabel>Employee</FieldLabel>
            <SelectInput
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              <option value="all">All</option>
              {employeeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline / Use</FieldLabel>
            <SelectInput
              value={selectedAirlineUse}
              onChange={(e) => setSelectedAirlineUse(e.target.value)}
            >
              <option value="all">All</option>
              {airlineUseOptions.map((item) => (
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
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <StatCard label="Total Records" value={String(totalRecords)} />
        <StatCard label="Total Gallons" value={totalGallons.toFixed(2)} tone="blue" />
        <StatCard
          label="Top Agent by Gallons"
          value={`${topAgentByGallons.label} (${topAgentByGallons.value.toFixed(2)})`}
          tone="green"
        />
        <StatCard
          label="Top Agent by Entries"
          value={`${topAgentByEntries.label} (${topAgentByEntries.value})`}
          tone="amber"
        />
        <StatCard
          label="Top Airline / Use"
          value={`${topAirlineByGallons.label} (${topAirlineByGallons.value.toFixed(2)})`}
          tone="blue"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        <StatCard label="OCR Match" value={String(ocrSummary.match)} tone="green" />
        <StatCard label="OCR Mismatch" value={String(ocrSummary.mismatch)} tone="red" />
        <StatCard label="Pending Review" value={String(ocrSummary.pending)} tone="amber" />
        <StatCard label="Missing Photo" value={String(ocrSummary.missing)} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
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
            Gallons by Agent
          </h2>

          {gallonsByAgent.length === 0 ? (
            <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {gallonsByAgent.map((row) => {
                const max = Math.max(...gallonsByAgent.map((x) => x.value), 1);
                return (
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
                      <span>{row.value.toFixed(2)}</span>
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
                          background:
                            "linear-gradient(135deg, #0f4c81 0%, #1769aa 100%)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
            Gallons by Airline / Use
          </h2>

          {gallonsByAirlineUse.length === 0 ? (
            <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {gallonsByAirlineUse.map((row) => {
                const max = Math.max(...gallonsByAirlineUse.map((x) => x.value), 1);
                return (
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
                      <span>{row.value.toFixed(2)}</span>
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
                          background:
                            "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PageCard>
      </div>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Daily Summary
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={{ ...tableStyle, minWidth: 700 }}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Records</th>
                <th style={thStyle}>Gallons</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={tdStyle}>
                    {loading ? "Loading..." : "No data found."}
                  </td>
                </tr>
              ) : (
                dailyRows.map((item) => (
                  <tr key={item.date}>
                    <td style={tdStyle}>{item.date}</td>
                    <td style={tdStyle}>{item.records}</td>
                    <td style={tdStyle}>{item.gallons.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Fuel Records
          </h2>
        </div>

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#f8fbff" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Equipment</th>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Airline / Use</th>
                <th style={thStyle}>Start</th>
                <th style={thStyle}>End</th>
                <th style={thStyle}>Gallons</th>
                <th style={thStyle}>OCR Status</th>
                <th style={thStyle}>OCR Start</th>
                <th style={thStyle}>OCR End</th>
                <th style={thStyle}>Start Diff</th>
                <th style={thStyle}>End Diff</th>
                <th style={thStyle}>Photo</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>OCR Notes</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={17} style={tdStyle}>
                    {loading ? "Loading..." : "No records found."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{item.date || "—"}</td>
                    <td style={tdStyle}>{item.time || "—"}</td>
                    <td style={tdStyle}>{item.equipmentNumber || "—"}</td>
                    <td style={tdStyle}>{getEmployeeName(item)}</td>
                    <td style={tdStyle}>{getAirlineUse(item)}</td>
                    <td style={tdStyle}>{formatFixed(item.startReading)}</td>
                    <td style={tdStyle}>{formatFixed(item.endReading)}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>
                      {formatFixed(item.totalGallons)}
                    </td>
                    <td style={tdStyle}>
                      <StatusPill status={getPhotoStatus(item)} />
                    </td>
                    <td style={tdStyle}>
                      {getOcrStart(item) === null ? "—" : formatFixed(getOcrStart(item))}
                    </td>
                    <td style={tdStyle}>
                      {getOcrEnd(item) === null ? "—" : formatFixed(getOcrEnd(item))}
                    </td>
                    <td style={tdStyle}>
                      {getStartDiff(item) === null ? "—" : formatFixed(getStartDiff(item))}
                    </td>
                    <td style={tdStyle}>
                      {getEndDiff(item) === null ? "—" : formatFixed(getEndDiff(item))}
                    </td>
                    <td style={tdStyle}>
                      {item.photoUrl ? (
                        <a
                          href={item.photoUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#1769aa", fontWeight: 700 }}
                        >
                          Open Photo
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                    <td style={tdStyle}>{getPhotoNotes(item) || "—"}</td>
                    <td style={tdStyle}>{item.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </div>
  );
}
