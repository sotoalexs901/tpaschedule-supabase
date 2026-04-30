import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  runFuelPhotoOcr,
  compareSingleFuelReading,
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

function PhotoPreviewCard({ title, file, previewUrl }) {
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

const AIRLINE_USE_OPTIONS = [
  { value: "", label: "Select option" },
  { value: "SY", label: "SUN COUNTRY (SY)" },
  { value: "AV", label: "AVIANCA (AV)" },
  { value: "WL", label: "WORLD ATLANTIC (WL)" },
  { value: "Oficina", label: "Oficina" },
  { value: "Mantenimiento", label: "Mantenimiento" },
  { value: "Otro", label: "Otro" },
];

function createInitialForm(user, pricePerGallon = "") {
  return {
    date: todayInputValue(),
    time: nowTimeValue(),
    equipmentNumber: "",
    employeeName: getVisibleUserName(user),
    airlineUse: "",
    finalReading: "",
    pricePerGallon: pricePerGallon ? String(pricePerGallon) : "",
    notes: "",
  };
}

export default function FuelEntryPage() {
  const { user } = useUser();

  const [fuelPrice, setFuelPrice] = useState("");
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceMessage, setPriceMessage] = useState("");

  const [form, setForm] = useState(() => createInitialForm(user, ""));
  const [finalPhotoFile, setFinalPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadFuelPrice() {
      try {
        setLoadingPrice(true);
        setPriceMessage("");

        const settingsRef = doc(db, "fuel_settings", "current");
        const snap = await getDoc(settingsRef);

        if (!mounted) return;

        if (!snap.exists()) {
          setFuelPrice("");
          setPriceMessage("Fuel price is not configured yet in management.");
          setForm((prev) => ({
            ...prev,
            pricePerGallon: "",
          }));
          return;
        }

        const data = snap.data();
        const price = safeNumber(data?.pricePerGallon);

        if (!price || price <= 0) {
          setFuelPrice("");
          setPriceMessage("Fuel price is missing or invalid in management settings.");
          setForm((prev) => ({
            ...prev,
            pricePerGallon: "",
          }));
          return;
        }

        setFuelPrice(String(price));
        setForm((prev) => ({
          ...prev,
          pricePerGallon: String(price),
        }));
      } catch (error) {
        console.error("Error loading fuel price:", error);
        if (!mounted) return;
        setFuelPrice("");
        setPriceMessage("Could not load fuel price from management settings.");
      } finally {
        if (mounted) setLoadingPrice(false);
      }
    }

    loadFuelPrice();

    return () => {
      mounted = false;
    };
  }, []);

  const finalPhotoPreview = useMemo(
    () => createPreviewUrl(finalPhotoFile),
    [finalPhotoFile]
  );

  function updateField(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function uploadPhoto(file) {
    const safeUser = (user?.username || user?.id || "unknown").toString();
    const path = `fuel_logs/${safeUser}/${form.date}/final-${Date.now()}-${file.name}`;
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
      console.error("Fuel OCR error (final):", error);
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

  const canSave =
    !!form.date &&
    !!form.time &&
    !!form.equipmentNumber &&
    !!form.employeeName &&
    !!form.airlineUse &&
    form.finalReading !== "" &&
    form.pricePerGallon !== "" &&
    !!finalPhotoFile &&
    !loadingPrice;

  async function handleSave() {
    if (!canSave) {
      if (loadingPrice) {
        setStatusMessage("Fuel price is still loading. Please wait a moment.");
        return;
      }

      if (!form.pricePerGallon) {
        setStatusMessage("Fuel price is not configured in management.");
        return;
      }

      if (!finalPhotoFile) {
        setStatusMessage("Please upload the final reading photo.");
        return;
      }

      setStatusMessage("Please complete all required fields.");
      return;
    }

    const finalReading = safeNumber(form.finalReading);
    const pricePerGallon = safeNumber(form.pricePerGallon);

    try {
      setSaving(true);
      setStatusMessage("");

      const finalPhotoUrl = await uploadPhoto(finalPhotoFile);

      const finalValidation = await runFinalPhotoValidation({
        photoUrl: finalPhotoUrl,
        expectedReading: finalReading,
      });

      const overallPhotoCheckStatus =
        finalValidation.status === "match" ? "approved" : "pending_review";

      const pendingPhotoItems =
        finalValidation.status === "match" ? [] : ["review_final_photo"];

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

        finalReading,
        endReading: finalReading,
        startReading: 0,

        totalGallons: 0,
        pricePerGallon,
        totalCost: 0,

        notes: form.notes || "",

        finalPhotoUrl,
        endPhotoUrl: finalPhotoUrl,
        photoUrl: finalPhotoUrl,

        photoCheckStatus: overallPhotoCheckStatus,
        pendingPhotoItems,
        missingFinalPhoto: !finalPhotoUrl,
        missingEndPhoto: !finalPhotoUrl,

        finalPhotoCheckStatus: finalValidation.status,
        endPhotoCheckStatus: finalValidation.status,

        finalPhotoCheckNotes: finalValidation.notes,
        endPhotoCheckNotes: finalValidation.notes,

        finalOcrRawText: finalValidation.rawText,
        endOcrRawText: finalValidation.rawText,
        ocrRawText: finalValidation.rawText || "",

        ocrFinalReading: finalValidation.matchedReading,
        ocrEndReading: finalValidation.matchedReading,

        finalPhotoNumbersDetected: finalValidation.numbersDetected,
        endPhotoNumbersDetected: finalValidation.numbersDetected,
        photoCheckNumbersDetected: [...finalValidation.numbersDetected],

        finalPhotoDiff: finalValidation.diff,
        endPhotoDiff: finalValidation.diff,
        photoCheckEndDiff: finalValidation.diff,

        finalConfidenceScore: finalValidation.confidenceScore,
        endConfidenceScore: finalValidation.confidenceScore,

        finalOcrProviderResult: finalValidation.providerResult,
        endOcrProviderResult: finalValidation.providerResult,
        ocrProviderResult: {
          final: finalValidation.providerResult,
        },

        monthClosed: false,
        monthClosedAt: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setForm(createInitialForm(user, fuelPrice));
      setFinalPhotoFile(null);

      if (overallPhotoCheckStatus === "approved") {
        setStatusMessage(
          "Fuel record saved successfully. Final reading matched OCR and was approved automatically."
        );
      } else {
        setStatusMessage(
          "Fuel record saved successfully. Final reading is pending review."
        );
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
          Register final fuel reading by equipment, employee and airline/use.
          Upload one final reading photo and enter the final total.
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

      {priceMessage && (
        <PageCard style={{ padding: 14 }}>
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              background: "#fff7ed",
              border: "1px solid #fdba74",
              color: "#9a3412",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {priceMessage}
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
            <FieldLabel>Final Reading</FieldLabel>
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.finalReading}
              onChange={(e) => updateField("finalReading", e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <FieldLabel>Price Per Gallon</FieldLabel>
            <TextInput
              value={form.pricePerGallon}
              disabled
              placeholder={loadingPrice ? "Loading..." : "Managed from dashboard"}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Final Reading Photo</FieldLabel>
            <TextInput
              type="file"
              accept="image/*"
              onChange={(e) => setFinalPhotoFile(e.target.files?.[0] || null)}
            />
          </div>

          {finalPhotoFile && (
            <div
              style={{
                gridColumn: "1 / -1",
              }}
            >
              <PhotoPreviewCard
                title="Final Reading Photo"
                file={finalPhotoFile}
                previewUrl={finalPhotoPreview}
              />
            </div>
          )}

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
              setForm(createInitialForm(user, fuelPrice));
              setFinalPhotoFile(null);
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
