import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

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

function getPhotoStatus(item) {
  return normalizeText(item.photoCheckStatus || item.photo_check_status || "—");
}

function getMonthKeyFromItem(item) {
  return (
    normalizeText(item.monthKey) ||
    String(item.date || "").slice(0, 7) ||
    formatInputDate(item.createdAt || item.updatedAt).slice(0, 7) ||
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
      map[key] = { key, label: key, records: 0, gallons: 0 };
    }
    map[key].records += 1;
    map[key].gallons += safeNumber(item.totalGallons);
  });

  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function buildWeeklyRows(items) {
  const map = {};

  items.forEach((item) => {
    const key = item.weekKey || "Unknown";
    if (!map[key]) {
      map[key] = { key, label: key, records: 0, gallons: 0 };
    }
    map[key].records += 1;
    map[key].gallons += safeNumber(item.totalGallons);
  });

  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function buildMonthlyRows(items) {
  const map = {};

  items.forEach((item) => {
    const key = getMonthKeyFromItem(item) || "Unknown";
    if (!map[key]) {
      map[key] = {
        key,
        label: key,
        records: 0,
        gallons: 0,
        closed: false,
        closedAt: null,
      };
    }

    map[key].records += 1;
    map[key].gallons += safeNumber(item.totalGallons);

    if (item.monthClosed) {
      map[key].closed = true;
      map[key].closedAt = item.monthClosedAt || map[key].closedAt;
    }
  });

  return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
}

function getMissingItems(item) {
  const missing = [];

  if (!normalizeText(item.date)) missing.push("Date");
  if (!normalizeText(item.time)) missing.push("Time");
  if (!normalizeText(item.equipmentNumber)) missing.push("Equipment");
  if (!normalizeText(getEmployeeName(item)) || getEmployeeName(item) === "Unknown") {
    missing.push("Employee");
  }
  if (!normalizeText(getAirlineUse(item)) || getAirlineUse(item) === "Unknown") {
    missing.push("Airline / Use");
  }
  if (item.startReading === undefined || item.startReading === null || item.startReading === "") {
    missing.push("Start Reading");
  }
  if (item.endReading === undefined || item.endReading === null || item.endReading === "") {
    missing.push("End Reading");
  }
  if (!item.photoUrl) missing.push("Photo");

  return missing;
}

function isPendingReview(item) {
  const status = getPhotoStatus(item).toLowerCase();
  if (status === "pending_review" || status === "missing") return true;
  if (getMissingItems(item).length > 0) return true;
  return false;
}

function createEditDraft(item) {
  return {
    id: item.id,
    date: item.date || "",
    time: item.time || "",
    equipmentNumber: item.equipmentNumber || "",
    employeeName: getEmployeeName(item),
    airlineUse: getAirlineUse(item),
    startReading:
      item.startReading !== undefined && item.startReading !== null
        ? String(item.startReading)
        : "",
    endReading:
      item.endReading !== undefined && item.endReading !== null
        ? String(item.endReading)
        : "",
    totalGallons:
      item.totalGallons !== undefined && item.totalGallons !== null
        ? String(item.totalGallons)
        : "",
    notes: item.notes || "",
    photoCheckStatus: getPhotoStatus(item),
    photoCheckNotes: item.photoCheckNotes || "",
    photoUrl: item.photoUrl || "",
    ocrStartReading:
      item.ocrStartReading !== undefined && item.ocrStartReading !== null
        ? String(item.ocrStartReading)
        : "",
    ocrEndReading:
      item.ocrEndReading !== undefined && item.ocrEndReading !== null
        ? String(item.ocrEndReading)
        : "",
    monthClosed: !!item.monthClosed,
  };
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

export default function FuelManagementPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState("today");
  const [fromDate, setFromDate] = useState(todayDateInput());
  const [toDate, setToDate] = useState(todayDateInput());
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedAirlineUse, setSelectedAirlineUse] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const [statusMessage, setStatusMessage] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [editingRow, setEditingRow] = useState(null);
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
    () => buildTopEntity(filteredRows, (item) => getEmployeeName(item), () => 1),
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
  const weeklyRows = useMemo(() => buildWeeklyRows(filteredRows), [filteredRows]);
  const monthlyRows = useMemo(() => buildMonthlyRows(filteredRows), [filteredRows]);

  const pendingRows = useMemo(() => {
    return filteredRows.filter((item) => isPendingReview(item));
  }, [filteredRows]);

  async function uploadEditPhoto(file, itemId) {
    const path = `fuel_logs/manual-review/${itemId}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    return await getDownloadURL(storageRef);
  }

  function handleOpenEdit(item) {
    setEditingRow(createEditDraft(item));
    setEditPhotoFile(null);
    setStatusMessage("");
  }

  function handleEditChange(field, value) {
    setEditingRow((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSaveEdit() {
    if (!editingRow?.id) return;

    const start = safeNumber(editingRow.startReading);
    const end = safeNumber(editingRow.endReading);
    const totalGallons = end >= start ? Number((end - start).toFixed(2)) : 0;

    try {
      setWorkingId(editingRow.id);

      let nextPhotoUrl = editingRow.photoUrl || "";
      if (editPhotoFile) {
        nextPhotoUrl = await uploadEditPhoto(editPhotoFile, editingRow.id);
      }

      const monthKey = String(editingRow.date || "").slice(0, 7);

      await updateDoc(doc(db, "fuel_logs", editingRow.id), {
        date: editingRow.date || "",
        time: editingRow.time || "",
        equipmentNumber: editingRow.equipmentNumber || "",
        employeeName: editingRow.employeeName || "",
        airlineUse: editingRow.airlineUse || "",
        startReading: start,
        endReading: end,
        totalGallons,
        notes: editingRow.notes || "",
        photoUrl: nextPhotoUrl,
        photoCheckStatus: editingRow.photoCheckStatus || (nextPhotoUrl ? "pending_review" : "missing"),
        photoCheckNotes: editingRow.photoCheckNotes || "",
        ocrStartReading:
          editingRow.ocrStartReading === "" ? null : safeNumber(editingRow.ocrStartReading),
        ocrEndReading:
          editingRow.ocrEndReading === "" ? null : safeNumber(editingRow.ocrEndReading),
        monthKey,
        updatedAt: serverTimestamp(),
      });

      setEditingRow(null);
      setEditPhotoFile(null);
      setStatusMessage("Fuel record updated successfully.");
    } catch (error) {
      console.error("Error updating fuel record:", error);
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
    } catch (error) {
      console.error("Error deleting fuel record:", error);
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
        photoCheckNotes: item.photoCheckNotes || "Approved manually from management.",
        updatedAt: serverTimestamp(),
      });
      setStatusMessage("Fuel record approved successfully.");
    } catch (error) {
      console.error("Error approving fuel record:", error);
      setStatusMessage("Could not approve fuel record.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleCloseMonth(monthKey) {
    const monthItems = rows.filter((item) => getMonthKeyFromItem(item) === monthKey);
    if (!monthItems.length) {
      setStatusMessage("No records found for that month.");
      return;
    }

    const ok = window.confirm(`Close month ${monthKey} for ${monthItems.length} fuel records?`);
    if (!ok) return;

    try {
      setWorkingId(monthKey);

      await Promise.all(
        monthItems.map((item) =>
          updateDoc(doc(db, "fuel_logs", item.id), {
            monthClosed: true,
            monthClosedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );

      setStatusMessage(`Month ${monthKey} closed successfully.`);
    } catch (error) {
      console.error("Error closing month:", error);
      setStatusMessage("Could not close month.");
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
      ["Total Gallons", totalGallons.toFixed(2)],
      ["Top Agent by Gallons", topAgentByGallons.label],
      ["Top Agent Gallons", topAgentByGallons.value.toFixed(2)],
      ["Top Airline/Use", topAirlineByGallons.label],
      ["Top Airline/Use Gallons", topAirlineByGallons.value.toFixed(2)],
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
        "OCR Start",
        "OCR End",
        "Photo Status",
        "Month Closed",
        "Photo URL",
        "Notes",
        "Created At",
      ],
      ...filteredRows.map((item) => [
        item.date || "",
        item.time || "",
        item.equipmentNumber || "",
        getEmployeeName(item),
        getAirlineUse(item),
        safeNumber(item.startReading).toFixed(2),
        safeNumber(item.endReading).toFixed(2),
        safeNumber(item.totalGallons).toFixed(2),
        item.ocrStartReading ?? "",
        item.ocrEndReading ?? "",
        getPhotoStatus(item),
        item.monthClosed ? "YES" : "NO",
        item.photoUrl || "",
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
          Daily, weekly and monthly control of fuel usage by employee and airline/use.
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
          <TabButton active={activeTab === "records"} onClick={() => setActiveTab("records")}>
            All Records
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
            <StatCard
              label="Pending Review"
              value={String(pendingRows.length)}
              tone={pendingRows.length > 0 ? "red" : "green"}
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
              <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
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
              <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
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
        </>
      )}

      {activeTab === "daily" && (
        <PageCard style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Daily Summary
          </h2>

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
                    <tr key={item.key}>
                      <td style={tdStyle}>{item.label}</td>
                      <td style={tdStyle}>{item.records}</td>
                      <td style={tdStyle}>{item.gallons.toFixed(2)}</td>
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
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Weekly Summary
          </h2>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 700 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Week Start</th>
                  <th style={thStyle}>Records</th>
                  <th style={thStyle}>Gallons</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={tdStyle}>
                      {loading ? "Loading..." : "No data found."}
                    </td>
                  </tr>
                ) : (
                  weeklyRows.map((item) => (
                    <tr key={item.key}>
                      <td style={tdStyle}>{item.label}</td>
                      <td style={tdStyle}>{item.records}</td>
                      <td style={tdStyle}>{item.gallons.toFixed(2)}</td>
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
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            Monthly Summary
          </h2>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Month</th>
                  <th style={thStyle}>Records</th>
                  <th style={thStyle}>Gallons</th>
                  <th style={thStyle}>Closed</th>
                  <th style={thStyle}>Closed At</th>
                  <th style={thStyle}>Action</th>
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
                      <td style={tdStyle}>{item.gallons.toFixed(2)}</td>
                      <td style={tdStyle}>{item.closed ? "YES" : "NO"}</td>
                      <td style={tdStyle}>{formatDateTime(item.closedAt)}</td>
                      <td style={tdStyle}>
                        <ActionButton
                          variant="warning"
                          onClick={() => handleCloseMonth(item.key)}
                          disabled={workingId === item.key || item.closed}
                        >
                          {item.closed
                            ? "Closed"
                            : workingId === item.key
                            ? "Closing..."
                            : "Close Month"}
                        </ActionButton>
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
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14, fontWeight: 700 }}>
              Review missing data, add or replace photos, edit records, or approve them to remove from pending.
            </p>
          </div>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1400 }}>
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Employee</th>
                  <th style={thStyle}>Airline / Use</th>
                  <th style={thStyle}>Entered Start</th>
                  <th style={thStyle}>Entered End</th>
                  <th style={thStyle}>Gallons</th>
                  <th style={thStyle}>Photo Status</th>
                  <th style={thStyle}>Missing</th>
                  <th style={thStyle}>Photo</th>
                  <th style={thStyle}>Notes</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={tdStyle}>
                      {loading ? "Loading..." : "No pending review items."}
                    </td>
                  </tr>
                ) : (
                  pendingRows.map((item) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.date || "—"}</td>
                      <td style={tdStyle}>{getEmployeeName(item)}</td>
                      <td style={tdStyle}>{getAirlineUse(item)}</td>
                      <td style={tdStyle}>{safeNumber(item.startReading).toFixed(2)}</td>
                      <td style={tdStyle}>{safeNumber(item.endReading).toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {safeNumber(item.totalGallons).toFixed(2)}
                      </td>
                      <td style={tdStyle}>{getPhotoStatus(item)}</td>
                      <td style={tdStyle}>{getMissingItems(item).join(", ") || "Complete"}</td>
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
                          "No photo"
                        )}
                      </td>
                      <td style={tdStyle}>{item.photoCheckNotes || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="secondary"
                            onClick={() => handleOpenEdit(item)}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            variant="success"
                            onClick={() => handleApprove(item)}
                            disabled={workingId === item.id}
                          >
                            {workingId === item.id ? "Approving..." : "Approve"}
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

      {activeTab === "records" && (
        <PageCard style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#0f172a" }}>
            All Fuel Records
          </h2>

          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1400 }}>
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
                  <th style={thStyle}>Photo Status</th>
                  <th style={thStyle}>Month Closed</th>
                  <th style={thStyle}>Created</th>
                  <th style={thStyle}>Notes</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={tdStyle}>
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
                      <td style={tdStyle}>{safeNumber(item.startReading).toFixed(2)}</td>
                      <td style={tdStyle}>{safeNumber(item.endReading).toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        {safeNumber(item.totalGallons).toFixed(2)}
                      </td>
                      <td style={tdStyle}>
                        {item.photoUrl ? (
                          <a
                            href={item.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#1769aa", fontWeight: 700 }}
                          >
                            {getPhotoStatus(item)}
                          </a>
                        ) : (
                          getPhotoStatus(item)
                        )}
                      </td>
                      <td style={tdStyle}>{item.monthClosed ? "YES" : "NO"}</td>
                      <td style={tdStyle}>{formatDateTime(item.createdAt)}</td>
                      <td style={tdStyle}>{item.notes || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton
                            variant="secondary"
                            onClick={() => handleOpenEdit(item)}
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

      {editingRow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 900,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 22,
              padding: 20,
              boxShadow: "0 24px 60px rgba(15,23,42,0.20)",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: 16,
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Edit Fuel Record
            </h2>

            {editingRow.monthClosed && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "#fff7ed",
                  border: "1px solid #fdba74",
                  color: "#9a3412",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                This record belongs to a closed month.
              </div>
            )}

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
                  value={editingRow.date}
                  onChange={(e) => handleEditChange("date", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Time</FieldLabel>
                <TextInput
                  value={editingRow.time}
                  onChange={(e) => handleEditChange("time", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Equipment</FieldLabel>
                <TextInput
                  value={editingRow.equipmentNumber}
                  onChange={(e) => handleEditChange("equipmentNumber", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Employee</FieldLabel>
                <TextInput
                  value={editingRow.employeeName}
                  onChange={(e) => handleEditChange("employeeName", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Airline / Use</FieldLabel>
                <TextInput
                  value={editingRow.airlineUse}
                  onChange={(e) => handleEditChange("airlineUse", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Start Reading</FieldLabel>
                <TextInput
                  type="number"
                  step="0.01"
                  value={editingRow.startReading}
                  onChange={(e) => handleEditChange("startReading", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>End Reading</FieldLabel>
                <TextInput
                  type="number"
                  step="0.01"
                  value={editingRow.endReading}
                  onChange={(e) => handleEditChange("endReading", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Total Gallons</FieldLabel>
                <TextInput
                  disabled
                  value={(
                    safeNumber(editingRow.endReading) - safeNumber(editingRow.startReading)
                  ).toFixed(2)}
                />
              </div>

              <div>
                <FieldLabel>OCR Start</FieldLabel>
                <TextInput
                  type="number"
                  step="0.01"
                  value={editingRow.ocrStartReading}
                  onChange={(e) => handleEditChange("ocrStartReading", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>OCR End</FieldLabel>
                <TextInput
                  type="number"
                  step="0.01"
                  value={editingRow.ocrEndReading}
                  onChange={(e) => handleEditChange("ocrEndReading", e.target.value)}
                />
              </div>

              <div>
                <FieldLabel>Photo Status</FieldLabel>
                <SelectInput
                  value={editingRow.photoCheckStatus}
                  onChange={(e) => handleEditChange("photoCheckStatus", e.target.value)}
                >
                  <option value="">Select status</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="missing">Missing</option>
                  <option value="mismatch">Mismatch</option>
                </SelectInput>
              </div>

              <div>
                <FieldLabel>Add / Replace Photo</FieldLabel>
                <TextInput
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditPhotoFile(e.target.files?.[0] || null)}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Review Notes</FieldLabel>
                <TextArea
                  value={editingRow.photoCheckNotes}
                  onChange={(e) => handleEditChange("photoCheckNotes", e.target.value)}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Notes</FieldLabel>
                <TextArea
                  value={editingRow.notes}
                  onChange={(e) => handleEditChange("notes", e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 18,
              }}
            >
              <ActionButton
                variant="success"
                onClick={handleSaveEdit}
                disabled={workingId === editingRow.id}
              >
                {workingId === editingRow.id ? "Saving..." : "Save Changes"}
              </ActionButton>

              <ActionButton
                variant="secondary"
                onClick={() => {
                  setEditingRow(null);
                  setEditPhotoFile(null);
                }}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
