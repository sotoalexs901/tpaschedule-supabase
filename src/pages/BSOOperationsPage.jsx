import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getWeekKey(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getMinutesBetween(dateStr, startTime, endTime) {
  const start = combineDateAndTime(dateStr, startTime);
  const end = combineDateAndTime(dateStr, endTime);
  if (!start || !end) return 0;
  const diff = (end.getTime() - start.getTime()) / 60000;
  return diff > 0 ? Number(diff.toFixed(2)) : 0;
}

function createEditDraft(item) {
  return {
    date: item.date || "",
    station: item.station || "TPA",
    airline: item.airline || "",
    flightNumber: item.flightNumber || "",
    origin: item.origin || "",
    beltNumber: item.beltNumber || "",
    shift: item.shift || "",
    agentName: item.agentName || "",
    scheduledArrivalTime: item.scheduledArrivalTime || "",
    actualArrivalTime: item.actualArrivalTime || "",
    firstBagTime: item.firstBagTime || "",
    lastBagTime: item.lastBagTime || "",
    scanStartTime: item.scanStartTime || "",
    scanEndTime: item.scanEndTime || "",
    totalBagsHandled: String(item.totalBagsHandled ?? ""),
    onHandBags: String(item.onHandBags ?? ""),
    filesCreated: String(item.filesCreated ?? ""),
    notes: item.notes || "",
  };
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
        boxSizing: "border-box",
        overflow: "hidden",
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
        opacity: disabled ? 0.7 : 1,
        whiteSpace: "nowrap",
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value, tone = "blue" }) {
  const tones = {
    blue: { bg: "#edf7ff", border: "#cfe7fb", color: "#1769aa" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", color: "#166534" },
    amber: { bg: "#fff7ed", border: "#fdba74", color: "#9a3412" },
    slate: { bg: "#f8fafc", border: "#cbd5e1", color: "#334155" },
  };

  const current = tones[tone] || tones.blue;

  return (
    <div
      style={{
        background: current.bg,
        border: `1px solid ${current.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#64748b",
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

const STATION_OPTIONS = ["TPA"];
const AIRLINE_OPTIONS = ["AA", "SY", "AV", "WL", "Other"];
const SHIFT_OPTIONS = ["AM", "PM", "MID", "Other"];

function createInitialForm(user) {
  return {
    date: todayInputValue(),
    station: "TPA",
    airline: "",
    flightNumber: "",
    origin: "",
    beltNumber: "",
    shift: "",
    agentName: getVisibleUserName(user),
    scheduledArrivalTime: "",
    actualArrivalTime: "",
    firstBagTime: "",
    lastBagTime: "",
    scanStartTime: "",
    scanEndTime: "",
    totalBagsHandled: "",
    onHandBags: "",
    filesCreated: "",
    notes: "",
  };
}

export default function BSOOperationsPage() {
  const { user } = useUser();

  const [form, setForm] = useState(() => createInitialForm(user));
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [selectedAirline, setSelectedAirline] = useState("all");
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState(null);
  const [workingId, setWorkingId] = useState("");
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

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
      },
      (error) => {
        console.error("Error loading BSO operations:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  const firstBagMinutes = useMemo(() => {
    return getMinutesBetween(form.date, form.actualArrivalTime, form.firstBagTime);
  }, [form.date, form.actualArrivalTime, form.firstBagTime]);

  const lastBagMinutes = useMemo(() => {
    return getMinutesBetween(form.date, form.actualArrivalTime, form.lastBagTime);
  }, [form.date, form.actualArrivalTime, form.lastBagTime]);

  const scanWindowMinutes = useMemo(() => {
    return getMinutesBetween(form.date, form.scanStartTime, form.scanEndTime);
  }, [form.date, form.scanStartTime, form.scanEndTime]);

  const filteredRows = useMemo(() => {
    return rows
      .filter((item) => {
        if (searchDate && item.date !== searchDate) return false;
        if (selectedAirline !== "all" && item.airline !== selectedAirline) return false;
        return true;
      })
      .sort((a, b) => {
        const A = toDateSafe(a.createdAt)?.getTime() || 0;
        const B = toDateSafe(b.createdAt)?.getTime() || 0;
        return B - A;
      });
  }, [rows, searchDate, selectedAirline]);

  const airlineOptions = useMemo(() => {
    return Array.from(new Set(rows.map((item) => String(item.airline || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const totalFlights = filteredRows.length;
  const totalOnHand = filteredRows.reduce((sum, item) => sum + safeNumber(item.onHandBags), 0);
  const totalFiles = filteredRows.reduce((sum, item) => sum + safeNumber(item.filesCreated), 0);
  const avgFirstBag = filteredRows.length
    ? filteredRows.reduce((sum, item) => sum + safeNumber(item.firstBagMinutes), 0) /
      filteredRows.length
    : 0;

  const canSave =
    !!form.date &&
    !!form.station &&
    !!form.airline &&
    !!form.flightNumber &&
    !!form.agentName &&
    !!form.actualArrivalTime &&
    !!form.firstBagTime &&
    !!form.lastBagTime &&
    !!form.scanStartTime &&
    !!form.scanEndTime;

  async function handleSave() {
    if (!canSave) {
      setStatusMessage("Please complete all required fields.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      const totalBagsHandled = safeNumber(form.totalBagsHandled);
      const onHandBags = safeNumber(form.onHandBags);
      const filesCreated = safeNumber(form.filesCreated);

      await addDoc(collection(db, "bso_operations"), {
        date: form.date,
        dayKey: form.date,
        weekKey: getWeekKey(form.date),
        monthKey: String(form.date || "").slice(0, 7),
        station: form.station || "",
        airline: form.airline || "",
        flightNumber: form.flightNumber || "",
        origin: form.origin || "",
        beltNumber: form.beltNumber || "",
        shift: form.shift || "",
        agentId: user?.id || "",
        agentName: form.agentName || "",
        agentLogin: user?.username || user?.email || "",
        agentRole: user?.role || "",
        scheduledArrivalTime: form.scheduledArrivalTime || "",
        actualArrivalTime: form.actualArrivalTime || "",
        firstBagTime: form.firstBagTime || "",
        lastBagTime: form.lastBagTime || "",
        scanStartTime: form.scanStartTime || "",
        scanEndTime: form.scanEndTime || "",
        firstBagMinutes,
        lastBagMinutes,
        scanWindowMinutes,
        totalBagsHandled,
        onHandBags,
        filesCreated,
        hasOnHand: onHandBags > 0,
        hasFiles: filesCreated > 0,
        notes: form.notes || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(createInitialForm(user));
      setStatusMessage("BSO operation saved successfully.");
    } catch (error) {
      console.error("Error saving BSO operation:", error);
      setStatusMessage("Could not save BSO operation.");
    } finally {
      setSaving(false);
    }
  }

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

    const nextFirstBagMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.firstBagTime
    );
    const nextLastBagMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.lastBagTime
    );
    const nextScanWindowMinutes = getMinutesBetween(
      editDraft.date,
      editDraft.scanStartTime,
      editDraft.scanEndTime
    );

    try {
      setWorkingId(editingId);

      await updateDoc(doc(db, "bso_operations", editingId), {
        ...editDraft,
        totalBagsHandled: safeNumber(editDraft.totalBagsHandled),
        onHandBags: safeNumber(editDraft.onHandBags),
        filesCreated: safeNumber(editDraft.filesCreated),
        firstBagMinutes: nextFirstBagMinutes,
        lastBagMinutes: nextLastBagMinutes,
        scanWindowMinutes: nextScanWindowMinutes,
        hasOnHand: safeNumber(editDraft.onHandBags) > 0,
        hasFiles: safeNumber(editDraft.filesCreated) > 0,
        updatedAt: serverTimestamp(),
      });

      setStatusMessage("BSO operation updated successfully.");
      setEditingId("");
      setEditDraft(null);
    } catch (error) {
      console.error("Error updating BSO operation:", error);
      setStatusMessage("Could not update BSO operation.");
    } finally {
      setWorkingId("");
    }
  }

  async function handleDelete(itemId) {
    const ok = window.confirm("Delete this BSO operation permanently?");
    if (!ok) return;

    try {
      setWorkingId(itemId);
      await deleteDoc(doc(db, "bso_operations", itemId));

      if (editingId === itemId) {
        setEditingId("");
        setEditDraft(null);
      }

      setStatusMessage("BSO operation deleted successfully.");
    } catch (error) {
      console.error("Error deleting BSO operation:", error);
      setStatusMessage("Could not delete BSO operation.");
    } finally {
      setWorkingId("");
    }
  }

  const editFirstBagMinutes = useMemo(() => {
    if (!editDraft) return 0;
    return getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.firstBagTime
    );
  }, [editDraft]);

  const editLastBagMinutes = useMemo(() => {
    if (!editDraft) return 0;
    return getMinutesBetween(
      editDraft.date,
      editDraft.actualArrivalTime,
      editDraft.lastBagTime
    );
  }, [editDraft]);

  const editScanWindowMinutes = useMemo(() => {
    if (!editDraft) return 0;
    return getMinutesBetween(
      editDraft.date,
      editDraft.scanStartTime,
      editDraft.scanEndTime
    );
  }, [editDraft]);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        overflowX: "hidden",
        boxSizing: "border-box",
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
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
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
          <div style={{ minWidth: 0 }}>
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
                fontSize: isMobile ? 26 : 36,
                lineHeight: 1.05,
                fontWeight: 900,
                color: "#0f172a",
                wordBreak: "break-word",
              }}
            >
              <span
                style={{
                  background: "#fde047",
                  padding: "0 8px",
                  marginRight: 6,
                  display: "inline-block",
                }}
              >
                TPA
              </span>
              BSO OPERATIONS
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
              Register On-Hand bags, files, first bag time, last bag time, and scan window by flight.
            </p>
          </div>

          <div
            style={{
              justifySelf: isMobile ? "start" : "end",
              display: "grid",
              gap: 8,
              minWidth: isMobile ? "100%" : 220,
            }}
          >
            <MiniStat label="Flights" value={String(totalFlights)} tone="slate" />
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : isTablet
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(4, minmax(0, 1fr))",
          gap: 14,
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <MiniStat label="Total Flights" value={String(totalFlights)} tone="slate" />
        <MiniStat label="On-Hand Bags" value={String(totalOnHand)} tone="amber" />
        <MiniStat label="Files Created" value={String(totalFiles)} tone="blue" />
        <MiniStat label="Avg First Bag" value={`${avgFirstBag.toFixed(2)} min`} tone="green" />
      </div>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : isTablet
              ? "1fr 1fr"
              : "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <FieldLabel>Search Exact Date</FieldLabel>
            <TextInput
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 0 }}>
            <FieldLabel>Airline Filter</FieldLabel>
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

          <div
            style={{
              display: "flex",
              alignItems: isMobile ? "stretch" : "end",
              minWidth: 0,
            }}
          >
            <ActionButton
              variant="secondary"
              onClick={() => {
                setSearchDate("");
                setSelectedAirline("all");
              }}
            >
              Clear Filters
            </ActionButton>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: isMobile ? 14 : 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            New BSO Operation
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <div>
            <FieldLabel>Date</FieldLabel>
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Station</FieldLabel>
            <SelectInput
              value={form.station}
              onChange={(e) => updateField("station", e.target.value)}
            >
              {STATION_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Airline</FieldLabel>
            <SelectInput
              value={form.airline}
              onChange={(e) => updateField("airline", e.target.value)}
            >
              <option value="">Select airline</option>
              {AIRLINE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Flight Number</FieldLabel>
            <TextInput
              value={form.flightNumber}
              onChange={(e) => updateField("flightNumber", e.target.value)}
              placeholder="Example: 1234"
            />
          </div>

          <div>
            <FieldLabel>Origin</FieldLabel>
            <TextInput
              value={form.origin}
              onChange={(e) => updateField("origin", e.target.value)}
              placeholder="Example: MIA"
            />
          </div>

          <div>
            <FieldLabel>Belt Number</FieldLabel>
            <TextInput
              value={form.beltNumber}
              onChange={(e) => updateField("beltNumber", e.target.value)}
              placeholder="Example: 4"
            />
          </div>

          <div>
            <FieldLabel>Shift</FieldLabel>
            <SelectInput
              value={form.shift}
              onChange={(e) => updateField("shift", e.target.value)}
            >
              <option value="">Select shift</option>
              {SHIFT_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Agent Name</FieldLabel>
            <TextInput
              value={form.agentName}
              onChange={(e) => updateField("agentName", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Scheduled Arrival</FieldLabel>
            <TextInput
              type="time"
              value={form.scheduledArrivalTime}
              onChange={(e) => updateField("scheduledArrivalTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Actual Arrival</FieldLabel>
            <TextInput
              type="time"
              value={form.actualArrivalTime}
              onChange={(e) => updateField("actualArrivalTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>First Bag Time</FieldLabel>
            <TextInput
              type="time"
              value={form.firstBagTime}
              onChange={(e) => updateField("firstBagTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Last Bag Time</FieldLabel>
            <TextInput
              type="time"
              value={form.lastBagTime}
              onChange={(e) => updateField("lastBagTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Scan Start</FieldLabel>
            <TextInput
              type="time"
              value={form.scanStartTime}
              onChange={(e) => updateField("scanStartTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Scan End</FieldLabel>
            <TextInput
              type="time"
              value={form.scanEndTime}
              onChange={(e) => updateField("scanEndTime", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Total Bags Handled</FieldLabel>
            <TextInput
              type="number"
              min="0"
              value={form.totalBagsHandled}
              onChange={(e) => updateField("totalBagsHandled", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>On-Hand Bags</FieldLabel>
            <TextInput
              type="number"
              min="0"
              value={form.onHandBags}
              onChange={(e) => updateField("onHandBags", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Files Created</FieldLabel>
            <TextInput
              type="number"
              min="0"
              value={form.filesCreated}
              onChange={(e) => updateField("filesCreated", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>First Bag Minutes</FieldLabel>
            <TextInput value={String(firstBagMinutes || 0)} disabled />
          </div>

          <div>
            <FieldLabel>Last Bag Minutes</FieldLabel>
            <TextInput value={String(lastBagMinutes || 0)} disabled />
          </div>

          <div>
            <FieldLabel>Scan Window Minutes</FieldLabel>
            <TextInput value={String(scanWindowMinutes || 0)} disabled />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Notes</FieldLabel>
            <TextArea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <ActionButton
            variant="success"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Saving..." : "Save BSO Operation"}
          </ActionButton>

          <ActionButton
            variant="secondary"
            onClick={() => {
              setForm(createInitialForm(user));
              setStatusMessage("");
            }}
            disabled={saving}
          >
            Reset
          </ActionButton>
        </div>
      </PageCard>

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
            Saved BSO Operations
          </h2>

          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            {searchDate ? `Filtered by ${searchDate}` : "Showing all records"}
          </div>
        </div>

        {isMobile ? (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredRows.length === 0 ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>No records found.</div>
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
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: "#0f172a",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.airline || "—"} {item.flightNumber || ""}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          fontWeight: 700,
                          marginTop: 4,
                          wordBreak: "break-word",
                        }}
                      >
                        {item.date || "—"} · {item.station || "—"} · {item.origin || "—"}
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
                    <div><strong>On-Hand:</strong> {safeNumber(item.onHandBags)}</div>
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
                    <ActionButton variant="secondary" onClick={() => startEditing(item)}>
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
              maxWidth: "100%",
              overflowX: "auto",
              overflowY: "hidden",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1500,
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
                    "Scheduled Arrival",
                    "Actual Arrival",
                    "First Bag",
                    "Last Bag",
                    "Scan Start",
                    "Scan End",
                    "First Bag Min",
                    "Last Bag Min",
                    "Scan Window",
                    "On-Hand",
                    "Files",
                    "Created",
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
                    <td colSpan={20} style={cellStyle}>
                      No records found.
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
                      <td style={cellStyle}>{item.scheduledArrivalTime || "—"}</td>
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
                      <td style={cellStyle}>{formatDateTime(item.createdAt)}</td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <ActionButton variant="secondary" onClick={() => startEditing(item)}>
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
              Edit BSO Operation
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
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
              <FieldLabel>Shift</FieldLabel>
              <TextInput
                value={editDraft.shift}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, shift: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Agent Name</FieldLabel>
              <TextInput
                value={editDraft.agentName}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, agentName: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Scheduled Arrival</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.scheduledArrivalTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({
                    ...prev,
                    scheduledArrivalTime: e.target.value,
                  }))
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
              <FieldLabel>First Bag Time</FieldLabel>
              <TextInput
                type="time"
                value={editDraft.firstBagTime}
                onChange={(e) =>
                  setEditDraft((prev) => ({ ...prev, firstBagTime: e.target.value }))
                }
              />
            </div>

            <div>
              <FieldLabel>Last Bag Time</FieldLabel>
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
              <FieldLabel>First Bag Minutes</FieldLabel>
              <TextInput value={String(editFirstBagMinutes || 0)} disabled />
            </div>

            <div>
              <FieldLabel>Last Bag Minutes</FieldLabel>
              <TextInput value={String(editLastBagMinutes || 0)} disabled />
            </div>

            <div>
              <FieldLabel>Scan Window Minutes</FieldLabel>
              <TextInput value={String(editScanWindowMinutes || 0)} disabled />
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

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
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
  whiteSpace: "nowrap",
};
