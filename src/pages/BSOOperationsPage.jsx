import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowTimeValue() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Arial, Helvetica, sans-serif",
        width: "100%",
        maxWidth: 1100,
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
          TPA OPS · BSO
        </div>

        <h1
          style={{
            margin: "10px 0 6px",
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 900,
          }}
        >
          BSO OPERATIONS
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
          Register On-Hand bags, files, first bag time, last bag time, and scan window by flight.
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
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
    </div>
  );
}
