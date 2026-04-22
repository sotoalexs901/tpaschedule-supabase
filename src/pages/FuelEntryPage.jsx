import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  runFuelPhotoOcr,
  compareFuelPhotoReadings,
} from "../utils/fuelPhotoOcr";

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

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function getWeekKey(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);

  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const dayOfMonth = pad2(d.getDate());

  return `${year}-${month}-${dayOfMonth}`;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

const AIRLINE_USE_OPTIONS = [
  { value: "", label: "Select option" },
  { value: "SY", label: "SUN COUNTRY (SY)" },
  { value: "AV", label: "AVIANCA (AV)" },
  { value: "WL", label: "WORLD ATLANTIC (WL)" },
  { value: "Oficina", label: "Oficina" },
  { value: "Mantenimiento", label: "Mantenimiento" },
  { value: "Otro", label: "Otro" },
];

function createInitialForm(user) {
  return {
    date: todayInputValue(),
    time: nowTimeValue(),
    equipmentNumber: "",
    employeeName: getVisibleUserName(user),
    airlineUse: "",
    startReading: "",
    endReading: "",
    totalGallons: "",
    notes: "",
  };
}

export default function FuelEntryPage() {
  const { user } = useUser();

  const [form, setForm] = useState(() => createInitialForm(user));
  const [startPhotoFile, setStartPhotoFile] = useState(null);
  const [endPhotoFile, setEndPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const calculatedGallons = useMemo(() => {
    const start = safeNumber(form.startReading);
    const end = safeNumber(form.endReading);

    if (!form.startReading || !form.endReading) return "";
    if (end < start) return "";

    return (end - start).toFixed(2);
  }, [form.startReading, form.endReading]);

  const canSave =
    !!form.date &&
    !!form.time &&
    !!form.equipmentNumber &&
    !!form.employeeName &&
    !!form.airlineUse &&
    form.startReading !== "" &&
    form.endReading !== "" &&
    calculatedGallons !== "";

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "startReading" || field === "endReading"
        ? { totalGallons: "" }
        : {}),
    }));
  }

  async function uploadPhoto(file, label) {
    const safeUser = (user?.username || user?.id || "unknown").toString();
    const path = `fuel_logs/${safeUser}/${form.date}/${label}-${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });

    return await getDownloadURL(storageRef);
  }

  async function runSinglePhotoValidation({ photoUrl, expectedReading, label }) {
    let rawText = "";
    let matchedReading = null;
    let numbersDetected = [];
    let diff = null;
    let status = "pending_review";
    let notes = "";
    let providerResult = null;

    try {
      const ocrResult = await runFuelPhotoOcr(photoUrl);
      providerResult = ocrResult?.providerResult || null;

      const comparison = compareFuelPhotoReadings({
        startReading: expectedReading,
        endReading: expectedReading,
        rawText: ocrResult?.rawText || "",
        tolerance: 5,
      });

      rawText = comparison.rawText || "";
      numbersDetected = comparison.numbersDetected || [];

      if (label === "start") {
        matchedReading = comparison.matchedStart;
        diff = comparison.startDiff;
      } else {
        matchedReading = comparison.matchedEnd;
        diff = comparison.endDiff;
      }

      if (matchedReading !== null && matchedReading !== undefined) {
        if (diff !== null && diff !== undefined && diff <= 5) {
          status = "match";
          notes = `${label === "start" ? "Start" : "End"} photo matched reading.`;
        } else {
          status = "mismatch";
          notes = `${label === "start" ? "Start" : "End"} photo did not match entered reading.`;
        }
      } else {
        status = "pending_review";
        notes = `${label === "start" ? "Start" : "End"} photo needs manual review.`;
      }
    } catch (error) {
      console.error(`Fuel OCR error (${label}):`, error);
      status = "pending_review";
      notes =
        error?.message ||
        `${label === "start" ? "Start" : "End"} photo could not be validated.`;
    }

    return {
      rawText,
      matchedReading,
      numbersDetected,
      diff,
      status,
      notes,
      providerResult,
    };
  }

  async function handleSave() {
    if (!canSave) {
      setStatusMessage("Please complete all required fields.");
      return;
    }

    const start = safeNumber(form.startReading);
    const end = safeNumber(form.endReading);

    if (end < start) {
      setStatusMessage("End reading cannot be less than start reading.");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      let startPhotoUrl = "";
      let endPhotoUrl = "";

      let startPhotoCheckStatus = "missing";
      let endPhotoCheckStatus = "missing";

      let startOcrRawText = "";
      let endOcrRawText = "";

      let ocrStartReading = null;
      let ocrEndReading = null;

      let startPhotoCheckNotes = "";
      let endPhotoCheckNotes = "";

      let startPhotoNumbersDetected = [];
      let endPhotoNumbersDetected = [];

      let startPhotoDiff = null;
      let endPhotoDiff = null;

      let startOcrProviderResult = null;
      let endOcrProviderResult = null;

      if (startPhotoFile) {
        startPhotoUrl = await uploadPhoto(startPhotoFile, "start");

        const startValidation = await runSinglePhotoValidation({
          photoUrl: startPhotoUrl,
          expectedReading: start,
          label: "start",
        });

        startPhotoCheckStatus = startValidation.status;
        startOcrRawText = startValidation.rawText;
        ocrStartReading = startValidation.matchedReading;
        startPhotoCheckNotes = startValidation.notes;
        startPhotoNumbersDetected = startValidation.numbersDetected;
        startPhotoDiff = startValidation.diff;
        startOcrProviderResult = startValidation.providerResult;
      }

      if (endPhotoFile) {
        endPhotoUrl = await uploadPhoto(endPhotoFile, "end");

        const endValidation = await runSinglePhotoValidation({
          photoUrl: endPhotoUrl,
          expectedReading: end,
          label: "end",
        });

        endPhotoCheckStatus = endValidation.status;
        endOcrRawText = endValidation.rawText;
        ocrEndReading = endValidation.matchedReading;
        endPhotoCheckNotes = endValidation.notes;
        endPhotoNumbersDetected = endValidation.numbersDetected;
        endPhotoDiff = endValidation.diff;
        endOcrProviderResult = endValidation.providerResult;
      }

      let overallPhotoCheckStatus = "missing";
      const hasAnyPhoto = !!startPhotoUrl || !!endPhotoUrl;

      if (!hasAnyPhoto) {
        overallPhotoCheckStatus = "missing";
      } else if (
        startPhotoUrl &&
        endPhotoUrl &&
        startPhotoCheckStatus === "match" &&
        endPhotoCheckStatus === "match"
      ) {
        overallPhotoCheckStatus = "match";
      } else if (
        startPhotoCheckStatus === "mismatch" ||
        endPhotoCheckStatus === "mismatch"
      ) {
        overallPhotoCheckStatus = "mismatch";
      } else {
        overallPhotoCheckStatus = "pending_review";
      }

      const totalGallons = Number((end - start).toFixed(2));

      await addDoc(collection(db, "fuel_logs"), {
        date: form.date,
        time: form.time,
        dayKey: form.date,
        weekKey: getWeekKey(form.date),
        monthKey: String(form.date || "").slice(0, 7),

        equipmentNumber: form.equipmentNumber || "",
        employeeId: user?.id || "",
        employeeName: form.employeeName || "",
        employeeLogin: user?.username || user?.email || "",
        employeeRole: user?.role || "",

        airlineUse: form.airlineUse || "",
        startReading: start,
        endReading: end,
        totalGallons,
        notes: form.notes || "",

        startPhotoUrl,
        endPhotoUrl,
        photoUrl: endPhotoUrl || startPhotoUrl || "",

        photoCheckStatus: overallPhotoCheckStatus,

        startPhotoCheckStatus,
        endPhotoCheckStatus,

        startPhotoCheckNotes,
        endPhotoCheckNotes,

        startOcrRawText,
        endOcrRawText,
        ocrRawText: `${startOcrRawText || ""}\n\n${endOcrRawText || ""}`.trim(),

        ocrStartReading,
        ocrEndReading,

        startPhotoNumbersDetected,
        endPhotoNumbersDetected,
        photoCheckNumbersDetected: [
          ...startPhotoNumbersDetected,
          ...endPhotoNumbersDetected,
        ],

        startPhotoDiff,
        endPhotoDiff,
        photoCheckStartDiff: startPhotoDiff,
        photoCheckEndDiff: endPhotoDiff,

        startOcrProviderResult,
        endOcrProviderResult,
        ocrProviderResult: {
          start: startOcrProviderResult,
          end: endOcrProviderResult,
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(createInitialForm(user));
      setStartPhotoFile(null);
      setEndPhotoFile(null);

      if (overallPhotoCheckStatus === "match") {
        setStatusMessage(
          "Fuel record saved successfully. Start and end photos matched OCR."
        );
      } else if (hasAnyPhoto) {
        setStatusMessage(
          "Fuel record saved successfully. One or both photos need manual review."
        );
      } else {
        setStatusMessage("Fuel record saved successfully.");
      }
    } catch (error) {
      console.error("Error saving fuel log:", error);
      setStatusMessage("Could not save fuel record.");
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
          Fuel Entry
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
          Register daily fuel usage by equipment, employee and airline/use.
          Upload one photo for the start reading and another photo for the end reading.
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
            <FieldLabel>Time</FieldLabel>
            <TextInput
              type="time"
              value={form.time}
              onChange={(e) => updateField("time", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Equipment Number</FieldLabel>
            <TextInput
              value={form.equipmentNumber}
              onChange={(e) => updateField("equipmentNumber", e.target.value)}
              placeholder="Example: EQ-12"
            />
          </div>

          <div>
            <FieldLabel>Employee Name</FieldLabel>
            <TextInput
              value={form.employeeName}
              onChange={(e) => updateField("employeeName", e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>Airline / Use</FieldLabel>
            <SelectInput
              value={form.airlineUse}
              onChange={(e) => updateField("airlineUse", e.target.value)}
            >
              {AIRLINE_USE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>Start Reading</FieldLabel>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.startReading}
              onChange={(e) => updateField("startReading", e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <FieldLabel>End Reading</FieldLabel>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.endReading}
              onChange={(e) => updateField("endReading", e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <FieldLabel>Total Gallons</FieldLabel>
            <TextInput
              value={calculatedGallons}
              disabled
              placeholder="Calculated automatically"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Start Photo</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) => setStartPhotoFile(e.target.files?.[0] || null)}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>End Photo</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) => setEndPhotoFile(e.target.files?.[0] || null)}
            />
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

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 18,
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            variant="success"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? "Saving..." : "Save Fuel Record"}
          </ActionButton>

          <ActionButton
            variant="secondary"
            onClick={() => {
              setForm(createInitialForm(user));
              setStartPhotoFile(null);
              setEndPhotoFile(null);
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
