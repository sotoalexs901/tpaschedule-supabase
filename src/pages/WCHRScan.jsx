import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  setDoc,
  increment,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function yyyymmdd(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function formatMMDDYYYY(dateLike) {
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
  } catch {
    return "";
  }
}

function buildFlightKey({ airline, flight_number, flight_date }) {
  const d = flight_date instanceof Date ? flight_date : new Date(flight_date);
  const iso = Number.isNaN(d.getTime())
    ? "unknown-date"
    : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  return `${String(airline || "UNK").trim()}-${String(flight_number || "UNK")
    .trim()
    .replace(/\s+/g, "")}-${iso}`;
}

async function isFlightClosed(flight_key) {
  const flightRef = doc(db, "wch_flights", flight_key);
  const snap = await getDoc(flightRef);
  if (!snap.exists()) return false;
  const data = snap.data();
  return Boolean(data?.closed_at);
}

function safeText(v) {
  return String(v || "").trim();
}

function safeUpper(v) {
  return safeText(v).toUpperCase();
}

function cleanPnr(value) {
  return safeUpper(value).replace(/[^A-Z0-9]/g, "");
}

function cleanWheelchairNumber(value) {
  return safeUpper(value).replace(/[^A-Z0-9-]/g, "");
}

function normalizePassengerName(value) {
  const clean = safeText(value);
  if (!clean) return "";

  if (clean.includes("/")) {
    return clean
      .split("/")
      .map((part) =>
        part
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim()
      )
      .join(" / ");
  }

  return clean
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getRawScanText(scanResult) {
  return String(
    scanResult?.raw_text ||
      scanResult?.ocr_text ||
      scanResult?.text ||
      scanResult?.full_text ||
      scanResult?.rawText ||
      scanResult?.ocr ||
      ""
  );
}

function tryExtractPassengerFromText(rawText) {
  const text = String(rawText || "");

  const patterns = [
    /(?:PASSENGER NAME|PASSENGER|PAX NAME|NAME)\s*[:\-]?\s*([A-Z]{2,}\/[A-Z\s]{2,})/i,
    /\b([A-Z]{2,}\/[A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function tryExtractPnrFromText(rawText) {
  const text = String(rawText || "");

  const patterns = [
    /(?:RESERVATION|BOOKING|BOOKING NUMBER|RESERVATION NUMBER|RECORD LOCATOR|LOCATOR|PNR)\s*[:\-]?\s*([A-Z0-9]{5,8})/i,
    /(?:RESERVATION|BOOKING|RECORD LOCATOR|LOCATOR|PNR)[^\n]*\n\s*([A-Z0-9]{5,8})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = cleanPnr(match?.[1] || "");
    if (candidate) return candidate;
  }

  const possible = text.match(/\b[A-Z0-9]{5,8}\b/g) || [];
  for (const item of possible) {
    const candidate = cleanPnr(item);
    if (candidate) return candidate;
  }

  return "";
}

function guessPassengerName(scanResult, rawText) {
  const candidates = [
    scanResult?.passenger_name,
    scanResult?.passenger,
    scanResult?.name,
    scanResult?.full_name,
    scanResult?.fullName,
    scanResult?.pax_name,
    scanResult?.passengerName,
    tryExtractPassengerFromText(rawText),
  ];

  for (const item of candidates) {
    const cleaned = safeText(item);
    if (cleaned) return normalizePassengerName(cleaned);
  }

  return "";
}

function guessPnr(scanResult, rawText) {
  const candidates = [
    scanResult?.pnr,
    scanResult?.record_locator,
    scanResult?.locator,
    scanResult?.booking,
    scanResult?.booking_number,
    scanResult?.bookingNumber,
    scanResult?.reservation,
    scanResult?.reservation_number,
    scanResult?.reservationNumber,
    scanResult?.recordLocator,
    tryExtractPnrFromText(rawText),
  ];

  for (const item of candidates) {
    const cleaned = cleanPnr(item);
    if (cleaned) return cleaned;
  }

  return "";
}

function toStatsDateKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sanitizeStatsKey(value, fallback = "UNKNOWN") {
  const clean = String(value || "")
    .trim()
    .replace(/[./#[\]$]/g, "_");

  return clean || fallback;
}

function sanitizeAirlineKey(value) {
  return safeUpper(value).replace(/[./#[\]$]/g, "_") || "UNKNOWN";
}

function sanitizeWheelchairKey(value) {
  return cleanWheelchairNumber(value).replace(/[./#[\]$]/g, "_") || "";
}

async function updateDailyWchrStats({
  submittedAtDate,
  airline,
  wchType,
  employeeLogin,
  wheelchairNumber,
}) {
  const dateKey = toStatsDateKey(submittedAtDate);
  const statsRef = doc(db, "wch_stats_daily", dateKey);

  const hourKey = String(submittedAtDate.getHours()).padStart(2, "0");
  const airlineKey = sanitizeAirlineKey(airline);
  const wchTypeKey = sanitizeStatsKey(safeUpper(wchType), "UNKNOWN");
  const employeeKey = sanitizeStatsKey(
    String(employeeLogin || "").trim().toLowerCase(),
    "unknown"
  );
  const wheelchairKey = sanitizeWheelchairKey(wheelchairNumber);

  const payload = {
    date: dateKey,
    updated_at: serverTimestamp(),
    total_reports: increment(1),
    [`by_airline.${airlineKey}`]: increment(1),
    [`by_wch_type.${wchTypeKey}`]: increment(1),
    [`by_employee.${employeeKey}`]: increment(1),
    [`by_hour.${hourKey}`]: increment(1),
  };

  if (wheelchairKey) {
    payload[`by_wheelchair.${wheelchairKey}`] = increment(1);
    payload[`wheelchair_by_airline.${airlineKey}.${wheelchairKey}`] = increment(1);
  }

  await setDoc(statsRef, payload, { merge: true });
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
        opacity: disabled ? 0.65 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }) {
  return (
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
      {children}
    </label>
  );
}

function EditInput({ label, value, onChange, placeholder = "" }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
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
  );
}

export default function WCHRScan() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [step, setStep] = useState("upload");
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [wchType, setWchType] = useState("WCHR");
  const [parsed, setParsed] = useState(null);

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const canScan = useMemo(() => Boolean(imageFile), [imageFile]);

  const canSubmit = useMemo(() => {
    if (!imageUrl || !parsed) return false;

    return [
      parsed.passenger_name,
      parsed.airline,
      parsed.flight_number,
      parsed.flight_date,
      parsed.destination,
      parsed.seat,
      parsed.gate,
      parsed.pnr,
      wchType,
    ].every((v) => String(v || "").trim().length > 0);
  }, [imageUrl, parsed, wchType]);

  const handlePickFile = (file) => {
    setError("");
    setParsed(null);
    setImageUrl("");
    setImageFile(file || null);
  };

  const handleParsedChange = (field, value) => {
    setParsed((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const uploadToStorage = async (file) => {
    const safeUser = (user?.username || user?.id || "unknown").toString();
    const path = `wch_reports/${safeUser}/${yyyymmdd()}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });
    return await getDownloadURL(storageRef);
  };

  const callScanService = async (url) => {
    if (!scanUrl) {
      throw new Error(
        "Missing VITE_WCHR_SCAN_URL. Configure your scan endpoint to enable parsing."
      );
    }

    const res = await fetch(scanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: url }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Scan failed (${res.status}). ${txt}`.trim());
    }

    return await res.json();
  };

  const handleScan = async () => {
    setError("");

    if (!imageFile) {
      setError("Please select a boarding pass photo.");
      return;
    }

    try {
      setStep("scanning");

      const url = await uploadToStorage(imageFile);
      setImageUrl(url);

      const scanResult = await callScanService(url);
      const rawText = getRawScanText(scanResult);

      const normalized = {
        passenger_name: guessPassengerName(scanResult, rawText),
        airline: safeUpper(scanResult?.airline || ""),
        flight_number: safeUpper(
          scanResult?.flight_number || scanResult?.flight || ""
        ),
        flight_date: safeText(scanResult?.flight_date || scanResult?.date || ""),
        destination: safeUpper(scanResult?.destination || scanResult?.to || ""),
        seat: safeUpper(scanResult?.seat || ""),
        gate: safeUpper(scanResult?.gate || ""),
        pnr: guessPnr(scanResult, rawText),
        wheelchair_number: safeText(scanResult?.wheelchair_number || ""),
        raw_text: rawText,
      };

      setParsed(normalized);
      setStep("preview");
    } catch (e) {
      console.error(e);
      setStep("upload");
      setError(e?.message || "Unexpected error while scanning.");
    }
  };

  const handleSubmit = async () => {
    setError("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (!canSubmit) {
      setError(
        "Please complete Passenger Name, Airline, Flight Number, Flight Date, Destination, Seat, Gate, Reservation Code and WCHR Type before submit."
      );
      return;
    }

    try {
      setStep("submitting");

      const flightDateObj = new Date(parsed.flight_date);
      const flight_key = buildFlightKey({
        airline: parsed.airline,
        flight_number: parsed.flight_number,
        flight_date: flightDateObj,
      });

      const closed = await isFlightClosed(flight_key);
      const status = closed ? "LATE" : "NEW";

      const finalPassengerName = safeText(parsed.passenger_name);
      const finalPnr = safeText(parsed.pnr).toUpperCase();
      const finalWheelchairNumber = cleanWheelchairNumber(parsed.wheelchair_number);
      const employeeLogin =
        user.username || user.loginUsername || user.email || "";
      const employeeName =
        user.displayName || user.fullName || user.username || "";

      const docRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "",
        employee_id: user.id || "",
        employee_name: employeeName,
        employee_login: employeeLogin,
        employee_role: user.role || "",
        submitted_at: serverTimestamp(),

        passenger_name: finalPassengerName,
        airline: safeUpper(parsed.airline),
        flight_number: safeUpper(parsed.flight_number),
        flight_date: flightDateObj,
        destination: safeUpper(parsed.destination),
        seat: safeUpper(parsed.seat),
        gate: safeUpper(parsed.gate),
        pnr: finalPnr,
        wheelchair_number: finalWheelchairNumber,

        wch_type: wchType,
        status,
        flight_key,
        image_url: imageUrl,
        raw_text: parsed.raw_text || "",
      });

      const short = docRef.id.slice(-6).toUpperCase();
      const report_id = `WCHR-${yyyymmdd()}-${short}`;

      await updateDoc(doc(db, "wch_reports", docRef.id), { report_id });

      await updateDailyWchrStats({
        submittedAtDate: new Date(),
        airline: parsed.airline,
        wchType,
        employeeLogin,
        wheelchairNumber: finalWheelchairNumber,
      });

      navigate("/wchr/my-reports");
    } catch (e) {
      console.error(e);
      setStep("preview");
      setError(e?.message || "Unexpected error while submitting.");
    }
  };

  if (!user) {
    return (
      <PageCard style={{ padding: 22, maxWidth: 900, margin: "0 auto" }}>
        <p
          style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 600 }}
        >
          You must be logged in to scan and submit a WCHR report.
        </p>
      </PageCard>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        maxWidth: 980,
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
        }}
      >
        <div
          style={{
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
              }}
            >
              WCHR Scan
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Scan a boarding pass and keep only the required fields for the WCHR
              report.
            </p>
          </div>

          <ActionButton onClick={() => navigate("/dashboard")} variant="secondary">
            Back
          </ActionButton>
        </div>
      </div>

      {error && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Boarding Pass Photo</FieldLabel>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePickFile(e.target.files?.[0])}
              style={{
                width: "100%",
                border: "1px solid #dbeafe",
                background: "#ffffff",
                borderRadius: 14,
                padding: "12px 14px",
                fontSize: 14,
                color: "#0f172a",
              }}
            />
          </div>

          <div style={{ maxWidth: 260 }}>
            <FieldLabel>WCHR Type</FieldLabel>
            <select
              value={wchType}
              onChange={(e) => setWchType(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #dbeafe",
                background: "#ffffff",
                borderRadius: 14,
                padding: "12px 14px",
                fontSize: 14,
                color: "#0f172a",
              }}
            >
              <option value="WCHR">WCHR</option>
              <option value="WCHS">WCHS</option>
              <option value="WCHC">WCHC</option>
            </select>
          </div>

          <div>
            <ActionButton
              onClick={handleScan}
              variant="primary"
              disabled={!canScan || step === "scanning" || step === "submitting"}
            >
              {step === "scanning" ? "Scanning..." : "Scan & Preview"}
            </ActionButton>
          </div>
        </div>
      </PageCard>

      {step === "preview" && parsed && (
        <PageCard style={{ padding: 22 }}>
          {imageUrl && (
            <div style={{ marginBottom: 16 }}>
              <img
                src={imageUrl}
                alt="Boarding pass"
                style={{
                  width: "100%",
                  maxHeight: 340,
                  objectFit: "contain",
                  borderRadius: 18,
                  border: "1px solid #e2e8f0",
                  background: "#f8fbff",
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <EditInput
              label="Passenger Name"
              value={parsed.passenger_name}
              onChange={(value) => handleParsedChange("passenger_name", value)}
              placeholder="VERGARA / CLAUDIA"
            />
            <EditInput
              label="Airline"
              value={parsed.airline}
              onChange={(value) => handleParsedChange("airline", value)}
            />
            <EditInput
              label="Flight Number"
              value={parsed.flight_number}
              onChange={(value) => handleParsedChange("flight_number", value)}
            />
            <EditInput
              label="Flight Date"
              value={parsed.flight_date}
              onChange={(value) => handleParsedChange("flight_date", value)}
              placeholder="2026-03-29"
            />
            <EditInput
              label="Destination"
              value={parsed.destination}
              onChange={(value) => handleParsedChange("destination", value)}
            />
            <EditInput
              label="Seat"
              value={parsed.seat}
              onChange={(value) => handleParsedChange("seat", value)}
            />
            <EditInput
              label="Gate"
              value={parsed.gate}
              onChange={(value) => handleParsedChange("gate", value)}
            />
            <EditInput
              label="PNR / Reservation Code"
              value={parsed.pnr}
              onChange={(value) => handleParsedChange("pnr", value)}
              placeholder="A7ILFB"
            />
            <EditInput
              label="WCHR Number"
              value={parsed.wheelchair_number}
              onChange={(value) => handleParsedChange("wheelchair_number", value)}
              placeholder="EAR23 or 23"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <FieldLabel>Detected Date Preview</FieldLabel>
            <div
              style={{
                background: "#f8fbff",
                border: "1px solid #dbeafe",
                borderRadius: 14,
                padding: "12px 14px",
                fontSize: 14,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {formatMMDDYYYY(parsed.flight_date) || "—"}
            </div>
          </div>

          <div
            style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}
          >
            <ActionButton
              onClick={() => {
                setParsed(null);
                setImageUrl("");
                setStep("upload");
              }}
              variant="secondary"
            >
              Retake / Upload Again
            </ActionButton>

            <ActionButton
              onClick={handleSubmit}
              variant="success"
              disabled={!canSubmit || step === "submitting"}
            >
              {step === "submitting" ? "Submitting..." : "Submit Report"}
            </ActionButton>
          </div>
        </PageCard>
      )}
    </div>
  );
}
