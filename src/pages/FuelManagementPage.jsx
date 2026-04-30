import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import {
  runFuelPhotoOcr,
  compareSingleFuelReading,
} from "../utils/fuelPhotoOcr";

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
  if (range === "today") return { start: startOfToday(), end: endOfToday() };
  if (range === "week") return { start: startOfWeek(), end: endOfWeek() };
  if (range === "month") return { start: startOfMonth(), end: endOfMonth() };
  return { start: null, end: null };
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatMoney(value) {
  return `$${safeNumber(value).toFixed(2)}`;
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
  return normalizeText(item.airlineUse) || normalizeText(item.airline_use) || "Unknown";
}

function getFinalReading(item) {
  const direct = item.finalReading;
  if (direct !== undefined && direct !== null && direct !== "") return safeNumber(direct);
  if (item.endReading !== undefined && item.endReading !== null && item.endReading !== "") {
    return safeNumber(item.endReading);
  }
  return 0;
}

function getFuelConsumed(item) {
  if (item.fuelConsumed !== undefined && item.fuelConsumed !== null && item.fuelConsumed !== "") {
    return safeNumber(item.fuelConsumed);
  }
  if (item.totalGallons !== undefined && item.totalGallons !== null && item.totalGallons !== "") {
    return safeNumber(item.totalGallons);
  }
  return 0;
}

function getPricePerGallon(item) {
  if (
    item.pricePerGallon !== undefined &&
    item.pricePerGallon !== null &&
    item.pricePerGallon !== ""
  ) {
    return safeNumber(item.pricePerGallon);
  }
  return 0;
}

function getTotalCost(item) {
  if (item.totalCost !== undefined && item.totalCost !== null && item.totalCost !== "") {
    return safeNumber(item.totalCost);
  }
  return Number((getFuelConsumed(item) * getPricePerGallon(item)).toFixed(2));
}

function getOcrFinalReading(item) {
  if (item.ocrFinalReading !== undefined && item.ocrFinalReading !== null) {
    return item.ocrFinalReading;
  }
  if (item.ocrEndReading !== undefined && item.ocrEndReading !== null) {
    return item.ocrEndReading;
  }
  return null;
}

function getFinalPhotoUrl(item) {
  return (
    normalizeText(item.finalPhotoUrl) ||
    normalizeText(item.endPhotoUrl) ||
    normalizeText(item.photoUrl) ||
    ""
  );
}

function getFinalPhotoStatus(item) {
  return (
    normalizeText(item.finalPhotoCheckStatus) ||
    normalizeText(item.endPhotoCheckStatus) ||
    normalizeText(item.photoCheckStatus) ||
    "—"
  );
}

function getOverallPhotoStatus(item) {
  return normalizeText(item.photoCheckStatus || "—");
}

function getFinalPhotoNotes(item) {
  return (
    normalizeText(item.finalPhotoCheckNotes) ||
    normalizeText(item.endPhotoCheckNotes) ||
    normalizeText(item.photoCheckNotes) ||
    ""
  );
}

function getFinalPhotoDiff(item) {
  if (item.finalPhotoDiff !== undefined && item.finalPhotoDiff !== null) return item.finalPhotoDiff;
  if (item.endPhotoDiff !== undefined && item.endPhotoDiff !== null) return item.endPhotoDiff;
  return null;
}

function getMonthKey(item) {
  return (
    normalizeText(item.monthKey) ||
    String(item.date || "").slice(0, 7) ||
    formatInputDate(item.createdAt).slice(0, 7) ||
    ""
  );
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
    if (!map[key]) map[key] = 0;
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
    if (!map[key]) map[key] = 0;
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
        key,
        label: key,
        records: 0,
        totalFinalReading: 0,
        totalConsumed: 0,
        totalCost: 0,
      };
    }

    map[key].records += 1;
    map[key].totalFinalReading += getFinalReading(item);
    map[key].totalConsumed += getFuelConsumed(item);
    map[key].totalCost += getTotalCost(item);
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      avgFinalReading: item.records ? item.totalFinalReading / item.records : 0,
      avgConsumed: item.records ? item.totalConsumed / item.records : 0,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function buildWeeklyRows(items) {
  const map = {};

  items.forEach((item) => {
    const key = item.weekKey || "Unknown";
    if (!map[key]) {
      map[key] = {
        key,
        label: key,
        records: 0,
        totalFinalReading: 0,
        totalConsumed: 0,
        totalCost: 0,
      };
    }

    map[key].records += 1;
    map[key].totalFinalReading += getFinalReading(item);
    map[key].totalConsumed += getFuelConsumed(item);
    map[key].totalCost += getTotalCost(item);
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      avgFinalReading: item.records ? item.totalFinalReading / item.records : 0,
      avgConsumed: item.records ? item.totalConsumed / item.records : 0,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

function buildMonthlyRows(items) {
  const map = {};

  items.forEach((item) => {
    const key = getMonthKey(item) || "Unknown";
    if (!map[key]) {
      map[key] = {
        key,
        label: key,
        records: 0,
        totalFinalReading: 0,
        totalConsumed: 0,
        totalCost: 0,
      };
    }

    map[key].records += 1;
    map[key].totalFinalReading += getFinalReading(item);
    map[key].totalConsumed += getFuelConsumed(item);
    map[key].totalCost += getTotalCost(item);
  });

  return Object.values(map)
    .map((item) => ({
      ...item,
      avgFinalReading: item.records ? item.totalFinalReading / item.records : 0,
      avgConsumed: item.records ? item.totalConsumed / item.records : 0,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
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

function createPreviewUrl(file) {
  if (!file) return "";
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
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
        minWidth: 0,
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
    dark: {
      background: "#0f172a",
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
    default: { bg: "#f8fbff", border: "#dbeafe", color: "#0f172a" },
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
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

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        border: active ? "none" : "1px solid #cfe7fb",
        background: active
          ? "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)"
          : "#ffffff",
        color: active ? "#ffffff" : "#1769aa",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function statusTone(status) {
  const value = normalizeText(status).toLowerCase();

  if (value === "match" || value === "approved") return "green";
  if (value === "mismatch") return "red";
  if (value === "pending_review") return "amber";
  if (value === "closed") return "blue";
  return "default";
}

function StatusBadge({ status }) {
  const tone = statusTone(status);

  const tones = {
    default: { bg: "#f8fafc", border: "#cbd5e1", color: "#334155" },
    green: { bg: "#dcfce7", border: "#86efac", color: "#166534" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    red: { bg: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    blue: { bg: "#dbeafe", border: "#93c5fd", color: "#1d4ed8" },
  };

  const current = tones[tone] || tones.default;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: current.bg,
        color: current.color,
        border: `1px solid ${current.border}`,
        textTransform: "uppercase",
      }}
    >
      {status || "—"}
    </span>
  );
}

function PhotoPreviewCard({ title, file, previewUrl, currentUrl }) {
  return (
    <div
      style={{
        border: "1px solid #dbeafe",
        borderRadius: 16,
        padding: 14,
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#1769aa",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      {file ? (
        <>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 10,
              wordBreak: "break-word",
            }}
          >
            {file.name}
          </div>

          {previewUrl ? (
            <img
              src={previewUrl}
              alt={title}
              style={{
                width: "100%",
                maxHeight: 220,
                objectFit: "contain",
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "#fff",
              }}
            />
          ) : null}
        </>
      ) : currentUrl ? (
        <div>
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#1769aa", fontWeight: 800 }}
          >
            Open current photo
          </a>
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#64748b",
          }}
        >
          No photo selected.
        </div>
      )}
    </div>
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
  minWidth: 1000,
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

function createEditDraft(item) {
  return {
    date: item.date || "",
    time: item.time || "",
    equipmentNumber: item.equipmentNumber || "",
    employeeName: getEmployeeName(item),
    airlineUse: getAirlineUse(item),
    finalReading: String(getFinalReading(item)),
    fuelConsumed: String(getFuelConsumed(item)),
    pricePerGallon: String(getPricePerGallon(item)),
    notes: item.notes || "",
    photoCheckNotes: item.photoCheckNotes || "",
    finalPhotoCheckNotes: getFinalPhotoNotes(item),
  };
}

async function uploadFuelManagementPhoto({ file, dateKey, rowId }) {
  const path = `fuel_logs/management/${dateKey || "no-date"}/${rowId}-${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });

  return await getDownloadURL(storageRef);
}

async function runFinalPhotoValidation({ photoUrl, expectedReading }) {
  let rawText = "";
  let matchedReading = null;
  let numbersDetected = [];
  let diff = null;
  let status = "pending_review";
  let notes = "";
  let providerResult = null;
  let confidenceScore = 0;

  try {
    const ocrResult = await runFuelPhotoOcr(photoUrl);
    providerResult = ocrResult?.providerResult || null;

    const comparison = compareSingleFuelReading({
      reading: expectedReading,
      rawText: ocrResult?.rawText || "",
      tolerance: 5,
    });

    rawText = comparison.rawText || "";
    numbersDetected = comparison.numbersDetected || [];
    matchedReading = comparison.matchedValue;
    diff = comparison.diff;
    confidenceScore = comparison.confidenceScore || 0;
    status = comparison.status || "pending_review";

    if (status === "match") {
      notes = "Final photo matched entered reading.";
    } else if (status === "near_match") {
      status = "pending_review";
      notes = "Final photo is close, but needs manual review.";
    } else if (status === "mismatch") {
      notes = "Final photo did not match entered reading.";
    } else {
      notes = "Final photo needs manual review.";
    }
  } catch (error) {
    console.error("Fuel OCR error (management final):", error);
    status = "pending_review";
    notes = error?.message || "Final photo could not be validated.";
  }

  return {
    rawText,
    matchedReading,
    numbersDetected,
    diff,
    status,
    notes,
    providerResult,
    confidenceScore,
  };
}

export default function FuelManagementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [range, setRange] = useState("today");
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedAirlineUse, setSelectedAirlineUse] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const [editingRowId, setEditingRowId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [editPhotoFile, setEditPhotoFile] = useState(null);

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

  const pendingReviewRows = useMemo(() => {
    return filteredRows.filter((item) => {
      const overall = getOverallPhotoStatus(item).toLowerCase();
      const finalStatus = getFinalPhotoStatus(item).toLowerCase();

      return (
        overall === "pending_review" ||
        overall === "mismatch" ||
        finalStatus === "pending_review" ||
        finalStatus === "mismatch"
      );
    });
  }, [filteredRows]);

  const totalRecords = filteredRows.length;
  const approvedCount = filteredRows.filter(
    (item) => getOverallPhotoStatus(item).toLowerCase() === "approved"
  ).length;
  const pendingCount = filteredRows.filter(
    (item) => getOverallPhotoStatus(item).toLowerCase() === "pending_review"
  ).length;
  const avgFinalReading =
    totalRecords > 0
      ? filteredRows.reduce((sum, item) => sum + getFinalReading(item), 0) / totalRecords
      : 0;

  const totalConsumed = filteredRows.reduce((sum, item) => sum + getFuelConsumed(item), 0);
  const totalCost = filteredRows.reduce((sum, item) => sum + getTotalCost(item), 0);
  const avgConsumed =
    totalRecords > 0
      ? filteredRows.reduce((sum, item) => sum + getFuelConsumed(item), 0) / totalRecords
      : 0;
  const avgPricePerGallon =
    totalRecords > 0
      ? filteredRows.reduce((sum, item) => sum + getPricePerGallon(item), 0) / totalRecords
      : 0;

  const topAgentByEntries = useMemo(
    () => buildTopEntity(filteredRows, (item) => getEmployeeName(item), () => 1),
    [filteredRows]
  );

  const topAirlineByEntries = useMemo(
    () => buildTopEntity(filteredRows, (item) => getAirlineUse(item), () => 1),
    [filteredRows]
  );

  const readingsByAgent = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => getEmployeeName(item),
        (item) => getFinalReading(item)
      ).slice(0, 10),
    [filteredRows]
  );

  const readingsByAirlineUse = useMemo(
    () =>
      buildCountRows(
        filteredRows,
        (item) => getAirlineUse(item),
        (item) => getFinalReading(item)
      ).slice(0, 10),
    [filteredRows]
  );

  const dailyRows = useMemo(() => buildDailyRows(filteredRows), [filteredRows]);
  const weeklyRows = useMemo(() => buildWeeklyRows(filteredRows), [filteredRows]);
  const monthlyRows = useMemo(() => buildMonthlyRows(filteredRows), [filteredRows]);

  function startEditing(item) {
    setEditingRowId(item.id);
    setEditDraft(createEditDraft(item));
    setEditPhotoFile(null);
    setStatusMessage("");
  }

  function cancelEditing() {
    setEditingRowId("");
    setEditDraft(null);
    setEditPhotoFile(null);
  }

  async function saveEditing(item) {
    if (!editDraft) return;

    const finalReading = safeNumber(editDraft.finalReading);
    const fuelConsumed = safeNumber(editDraft.fuelConsumed);
    const pricePerGallon = safeNumber(editDraft.pricePerGallon);
    const totalCostValue = Number((fuelConsumed * pricePerGallon).toFixed(2));

    try {
      setWorkingId(item.id);

      let finalPhotoUrl = getFinalPhotoUrl(item);

      if (editPhotoFile) {
        finalPhotoUrl = await uploadFuelManagementPhoto({
          file: editPhotoFile,
          dateKey: editDraft.date,
          rowId: item.id,
        });
      }

      let validationStatus = "pending_review";
      let validationNotes = editDraft.finalPhotoCheckNotes || "";
      let validationRawText = item.finalOcrRawText || item.endOcrRawText || "";
      let validationMatchedReading = getOcrFinalReading(item);
      let validationNumbersDetected =
        item.finalPhotoNumbersDetected || item.endPhotoNumbersDetected || [];
      let validationDiff = getFinalPhotoDiff(item);
      let validationConfidenceScore =
        item.finalConfidenceScore || item.endConfidenceScore || 0;
      let validationProviderResult =
        item.finalOcrProviderResult || item.endOcrProviderResult || null;

      if (finalPhotoUrl) {
        const validation = await runFinalPhotoValidation({
          photoUrl: finalPhotoUrl,
          expectedReading: finalReading,
        });

        validationStatus = validation.status === "match" ? "approved" : "pending_review";
        validationNotes = validation.notes;
        validationRawText = validation.rawText;
        validationMatchedReading = validation.matchedReading;
        validationNumbersDetected = validation.numbersDetected;
        validationDiff = validation.diff;
        validationConfidenceScore = validation.confidenceScore;
        validationProviderResult = validation.providerResult;
      }

      await updateDoc(doc(db, "fuel_logs", item.id), {
        date: editDraft.date || "",
        time: editDraft.time || "",
        dayKey: editDraft.date || "",
        monthKey: String(editDraft.date || "").slice(0, 7),
        equipmentNumber: editDraft.equipmentNumber || "",
        employeeName: editDraft.employeeName || "",
        airlineUse: editDraft.airlineUse || "",

        finalReading,
        endReading: finalReading,

        fuelConsumed,
        totalGallons: fuelConsumed,
        pricePerGallon,
        totalCost: totalCostValue,

        notes: editDraft.notes || "",

        finalPhotoUrl,
        endPhotoUrl: finalPhotoUrl || "",
        photoUrl: finalPhotoUrl || "",

        photoCheckStatus: validationStatus,
        finalPhotoCheckStatus: validationStatus,
        endPhotoCheckStatus: validationStatus,

        photoCheckNotes: editDraft.photoCheckNotes || validationNotes,
        finalPhotoCheckNotes: validationNotes,
        endPhotoCheckNotes: validationNotes,

        finalOcrRawText: validationRawText,
        endOcrRawText: validationRawText,
        ocrRawText: validationRawText || "",

        ocrFinalReading: validationMatchedReading,
        ocrEndReading: validationMatchedReading,

        finalPhotoNumbersDetected: validationNumbersDetected,
        endPhotoNumbersDetected: validationNumbersDetected,
        photoCheckNumbersDetected: [...validationNumbersDetected],

        finalPhotoDiff: validationDiff,
        endPhotoDiff: validationDiff,
        photoCheckEndDiff: validationDiff,

        finalConfidenceScore: validationConfidenceScore,
        endConfidenceScore: validationConfidenceScore,

        finalOcrProviderResult: validationProviderResult,
        endOcrProviderResult: validationProviderResult,
        ocrProviderResult: {
          final: validationProviderResult,
        },

        updatedAt: serverTimestamp(),
      });

      setStatusMessage(
        validationStatus === "approved"
          ? "Fuel record updated and auto approved."
          : "Fuel record updated and left pending review."
      );
      setEditingRowId("");
      setEditDraft(null);
      setEditPhotoFile(null);
    } catch (error) {
      console.error("Error updating fuel log:", error);
      setStatusMessage("Could not update fuel record.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleDelete(itemId) {
    const ok = window.confirm("Delete this fuel record permanently?");
    if (!ok) return;

    try {
      setWorkingId(itemId);
      await deleteDoc(doc(db, "fuel_logs", itemId));
      setStatusMessage("Fuel record deleted successfully.");

      if (editingRowId === itemId) {
        setEditingRowId("");
        setEditDraft(null);
        setEditPhotoFile(null);
      }
    } catch (error) {
      console.error("Error deleting fuel log:", error);
      setStatusMessage("Could not delete fuel record.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleApprove(item) {
    try {
      setWorkingId(item.id);
      await updateDoc(doc(db, "fuel_logs", item.id), {
        photoCheckStatus: "approved",
        finalPhotoCheckStatus: "approved",
        endPhotoCheckStatus: "approved",
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Fuel photo review approved.");
    } catch (error) {
      console.error("Error approving fuel review:", error);
      setStatusMessage("Could not approve this record.");
    } finally {
      setWorkingId("");
    }
  }

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
      ["Approved", approvedCount],
      ["Pending Review", pendingCount],
      ["Average Final Reading", avgFinalReading.toFixed(2)],
      ["Total Fuel Consumed", totalConsumed.toFixed(2)],
      ["Average Fuel Consumed", avgConsumed.toFixed(2)],
      ["Average Price Per Gallon", avgPricePerGallon.toFixed(2)],
      ["Total Cost", totalCost.toFixed(2)],
      ["Top Agent by Entries", topAgentByEntries.label],
      ["Top Airline/Use by Entries", topAirlineByEntries.label],
      [],
      ["DETAILS"],
      [
        "Date",
        "Time",
        "Equipment",
        "Employee",
        "Airline/Use",
        "Final Reading",
        "Fuel Consumed",
        "Price Per Gallon",
        "Total Cost",
        "OCR Final Reading",
        "Photo Diff",
        "Overall Status",
        "Final Photo Status",
        "Final Photo URL",
        "Notes",
        "Created At",
      ],
      ...filteredRows.map((item) => [
        item.date || "",
        item.time || "",
        item.equipmentNumber || "",
        getEmployeeName(item),
        getAirlineUse(item),
        getFinalReading(item).toFixed(2),
        getFuelConsumed(item).toFixed(2),
        getPricePerGallon(item).toFixed(2),
        getTotalCost(item).toFixed(2),
        getOcrFinalReading(item) ?? "",
        getFinalPhotoDiff(item) ?? "",
        getOverallPhotoStatus(item),
        getFinalPhotoStatus(item),
        getFinalPhotoUrl(item),
        item.notes || "",
        formatDateTime(item.createdAt),
      ]),
    ];

    downloadCsv("fuel-management-report.csv", csvRows);
  }

  const editPhotoPreview = useMemo(() => createPreviewUrl(editPhotoFile), [editPhotoFile]);

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
          Control final fuel readings, fuel consumed, price per gallon, total cost,
          photo validation, auto approval, pending review, edit and delete.
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

      <PageCard style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
            Overview
          </TabButton>
          <TabButton active={activeTab === "daily"} onClick={() => setActiveTab("daily")}>
            Daily
          </TabButton>
          <TabButton active={activeTab === "weekly"} onClick={() => setActiveTab("weekly")}>
            Weekly
          </TabButton>
          <TabButton active={activeTab === "monthly"} onClick={() => setActiveTab("monthly")}>
            Monthly
          </TabButton>
          <TabButton active={activeTab === "pending"} onClick={() => setActiveTab("pending")}>
            Pending Review
          </TabButton>
        </div>
      </PageCard>

      {activeTab === "overview" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <StatCard label="Total Records" value={String(totalRecords)} />
            <StatCard label="Approved" value={String(approvedCount)} tone="green" />
            <StatCard label="Pending Review" value={String(pendingCount)} tone="amber" />
            <StatCard label="Avg Final Reading" value={avgFinalReading.toFixed(2)} tone="blue" />
            <StatCard label="Fuel Consumed" value={totalConsumed.toFixed(2)} tone="amber" />
            <StatCard label="Total Cost" value={formatMoney(totalCost)} tone="green" />
            <StatCard
              label="Avg Price Per Gallon"
              value={formatMoney(avgPricePerGallon)}
              tone="blue"
            />
            <StatCard
              label="Top Agent by Entries"
              value={`${topAgentByEntries.label} (${topAgentByEntries.value})`}
              tone="green"
            />
            <StatCard
              label="Top Airline / Use"
              value={`${topAirlineByEntries.label} (${topAirlineByEntries.value})`}
              tone="blue"
            />
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
                Final Reading by Agent
              </h2>

              {readingsByAgent.length === 0 ? (
                <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {readingsByAgent.map((row) => {
                    const max = Math.max(...readingsByAgent.map((x) => x.value), 1);
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
                Final Reading by Airline / Use
              </h2>

              {readingsByAirlineUse.length === 0 ? (
                <div style={{ color: "#64748b", fontWeight: 700 }}>No data found.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {readingsByAirlineUse.map((row) => {
                    const max = Math.max(...readingsByAirlineUse.map((x) => x.value), 1);
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
                All Fuel Records
              </h2>
            </div>

            <div style={tableWrapStyle}>
              <table style={{ ...tableStyle, minWidth: 1700 }}>
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Equipment</th>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Airline / Use</th>
                    <th style={thStyle}>Final Reading</th>
                    <th style={thStyle}>Fuel Consumed</th>
                    <th style={thStyle}>Price / Gallon</th>
                    <th style={thStyle}>Total Cost</th>
                    <th style={thStyle}>OCR Final</th>
                    <th style={thStyle}>Diff</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Photo</th>
                    <th style={thStyle}>Created</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={15} style={tdStyle}>
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
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {getFinalReading(item).toFixed(2)}
                        </td>
                        <td style={tdStyle}>{getFuelConsumed(item).toFixed(2)}</td>
                        <td style={tdStyle}>{formatMoney(getPricePerGallon(item))}</td>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {formatMoney(getTotalCost(item))}
                        </td>
                        <td style={tdStyle}>
                          {getOcrFinalReading(item) !== null && getOcrFinalReading(item) !== undefined
                            ? getOcrFinalReading(item)
                            : "—"}
                        </td>
                        <td style={tdStyle}>
                          {getFinalPhotoDiff(item) !== null && getFinalPhotoDiff(item) !== undefined
                            ? getFinalPhotoDiff(item)
                            : "—"}
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge status={getOverallPhotoStatus(item)} />
                        </td>
                        <td style={tdStyle}>
                          {getFinalPhotoUrl(item) ? (
                            <a
                              href={getFinalPhotoUrl(item)}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#1769aa", fontWeight: 700 }}
                            >
                              Open Photo
                            </a>
                          ) : (
                            "No photo"
                          )}
                        </td>
                        <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                        <td style={tdStyle}>
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
          </PageCard>
        </>
      )}

      {activeTab === "daily" && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
              Daily Summary
            </h2>
          </div>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Records</th>
                  <th style={thStyle}>Total Final Reading</th>
                  <th style={thStyle}>Fuel Consumed</th>
                  <th style={thStyle}>Avg Consumed</th>
                  <th style={thStyle}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={tdStyle}>
                      {loading ? "Loading..." : "No data found."}
                    </td>
                  </tr>
                ) : (
                  dailyRows.map((item) => (
                    <tr key={item.key}>
                      <td style={tdStyle}>{item.label}</td>
                      <td style={tdStyle}>{item.records}</td>
                      <td style={tdStyle}>{item.totalFinalReading.toFixed(2)}</td>
                      <td style={tdStyle}>{item.totalConsumed.toFixed(2)}</td>
                      <td style={tdStyle}>{item.avgConsumed.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {formatMoney(item.totalCost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      {activeTab === "weekly" && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
              Weekly Summary
            </h2>
          </div>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Week Start</th>
                  <th style={thStyle}>Records</th>
                  <th style={thStyle}>Total Final Reading</th>
                  <th style={thStyle}>Fuel Consumed</th>
                  <th style={thStyle}>Avg Consumed</th>
                  <th style={thStyle}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={tdStyle}>
                      {loading ? "Loading..." : "No data found."}
                    </td>
                  </tr>
                ) : (
                  weeklyRows.map((item) => (
                    <tr key={item.key}>
                      <td style={tdStyle}>{item.label}</td>
                      <td style={tdStyle}>{item.records}</td>
                      <td style={tdStyle}>{item.totalFinalReading.toFixed(2)}</td>
                      <td style={tdStyle}>{item.totalConsumed.toFixed(2)}</td>
                      <td style={tdStyle}>{item.avgConsumed.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {formatMoney(item.totalCost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      {activeTab === "monthly" && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
              Monthly Summary
            </h2>
          </div>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Month</th>
                  <th style={thStyle}>Records</th>
                  <th style={thStyle}>Total Final Reading</th>
                  <th style={thStyle}>Fuel Consumed</th>
                  <th style={thStyle}>Avg Consumed</th>
                  <th style={thStyle}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={tdStyle}>
                      {loading ? "Loading..." : "No data found."}
                    </td>
                  </tr>
                ) : (
                  monthlyRows.map((item) => (
                    <tr key={item.key}>
                      <td style={tdStyle}>{item.label}</td>
                      <td style={tdStyle}>{item.records}</td>
                      <td style={tdStyle}>{item.totalFinalReading.toFixed(2)}</td>
                      <td style={tdStyle}>{item.totalConsumed.toFixed(2)}</td>
                      <td style={tdStyle}>{item.avgConsumed.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {formatMoney(item.totalCost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}

      {activeTab === "pending" && (
        <PageCard style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
              Pending Review
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                color: "#64748b",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              If photo and entered value match, it can remain auto approved. If not, it stays pending review.
            </p>
          </div>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1700 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Employee</th>
                  <th style={thStyle}>Airline / Use</th>
                  <th style={thStyle}>Final Reading</th>
                  <th style={thStyle}>Fuel Consumed</th>
                  <th style={thStyle}>Price / Gallon</th>
                  <th style={thStyle}>Total Cost</th>
                  <th style={thStyle}>OCR Final</th>
                  <th style={thStyle}>Diff</th>
                  <th style={thStyle}>Photo</th>
                  <th style={thStyle}>Photo Status</th>
                  <th style={thStyle}>Overall</th>
                  <th style={thStyle}>Notes</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingReviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} style={tdStyle}>
                      {loading ? "Loading..." : "No pending review records."}
                    </td>
                  </tr>
                ) : (
                  pendingReviewRows.map((item) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.date || "—"}</td>
                      <td style={tdStyle}>{getEmployeeName(item)}</td>
                      <td style={tdStyle}>{getAirlineUse(item)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {getFinalReading(item).toFixed(2)}
                      </td>
                      <td style={tdStyle}>{getFuelConsumed(item).toFixed(2)}</td>
                      <td style={tdStyle}>{formatMoney(getPricePerGallon(item))}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {formatMoney(getTotalCost(item))}
                      </td>
                      <td style={tdStyle}>
                        {getOcrFinalReading(item) !== null && getOcrFinalReading(item) !== undefined
                          ? getOcrFinalReading(item)
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        {getFinalPhotoDiff(item) !== null && getFinalPhotoDiff(item) !== undefined
                          ? getFinalPhotoDiff(item)
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        {getFinalPhotoUrl(item) ? (
                          <a
                            href={getFinalPhotoUrl(item)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#1769aa", fontWeight: 700 }}
                          >
                            Open Photo
                          </a>
                        ) : (
                          "No photo"
                        )}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={getFinalPhotoStatus(item)} />
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={getOverallPhotoStatus(item)} />
                      </td>
                      <td style={tdStyle}>
                        <div>{item.photoCheckNotes || "—"}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                          Final: {getFinalPhotoNotes(item) || "—"}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="success"
                            onClick={() => handleApprove(item)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? "Approving..." : "Approve"}
                          </ActionButton>

                          <ActionButton
                            variant="secondary"
                            onClick={() => startEditing(item)}
                            disabled={workingId === item.id}
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
        </PageCard>
      )}

      {editingRowId && editDraft && (
        <PageCard style={{ padding: 18 }}>
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: 18,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Edit Fuel Record
          </h3>

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
              <FieldLabel>Time</FieldLabel>
              <TextInput
                value={editDraft.time}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, time: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Equipment</FieldLabel>
              <TextInput
                value={editDraft.equipmentNumber}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    equipmentNumber: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Employee</FieldLabel>
              <TextInput
                value={editDraft.employeeName}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    employeeName: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Airline / Use</FieldLabel>
              <TextInput
                value={editDraft.airlineUse}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    airlineUse: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Final Reading</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                value={editDraft.finalReading}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    finalReading: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Fuel Consumed</FieldLabel>
              <TextInput
                type="number"
                step="0.01"
                value={editDraft.fuelConsumed}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    fuelConsumed: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Price Per Gallon</FieldLabel>
              <TextInput
                type="number"
                step="0.0001"
                value={editDraft.pricePerGallon}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    pricePerGallon: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <FieldLabel>Total Cost</FieldLabel>
              <TextInput
                value={formatMoney(
                  safeNumber(editDraft.fuelConsumed) * safeNumber(editDraft.pricePerGallon)
                )}
                disabled
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>Replace Final Photo</FieldLabel>
              <TextInput
                type="file"
                accept="image/*"
                onChange={(e) => setEditPhotoFile(e.target.files?.[0] || null)}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <PhotoPreviewCard
                title="Final Photo"
                file={editPhotoFile}
                previewUrl={editPhotoPreview}
                currentUrl={
                  rows.find((r) => r.id === editingRowId)
                    ? getFinalPhotoUrl(rows.find((r) => r.id === editingRowId))
                    : ""
                }
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>General Review Notes</FieldLabel>
              <TextArea
                value={editDraft.photoCheckNotes}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    photoCheckNotes: e.target.value,
                  }))
                }
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>Final Photo Notes</FieldLabel>
              <TextArea
                value={editDraft.finalPhotoCheckNotes}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    finalPhotoCheckNotes: e.target.value,
                  }))
                }
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>Notes</FieldLabel>
              <TextArea
                value={editDraft.notes}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <ActionButton
              variant="success"
              onClick={() => {
                const currentItem = rows.find((r) => r.id === editingRowId);
                if (currentItem) saveEditing(currentItem);
              }}
              disabled={workingId === editingRowId}
            >
              {workingId === editingRowId ? "Saving..." : "Save Changes"}
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={cancelEditing}
              disabled={workingId === editingRowId}
            >
              Cancel
            </ActionButton>
          </div>
        </PageCard>
      )}
    </div>
  );
}
