// src/pages/WCHRScan.jsx
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
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

function pad2(n) {
  return String(n).padStart(2, "0");
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

function yyyymmdd(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function buildFlightKey({ airline, flight_number, flight_date }) {
  const d = flight_date instanceof Date ? flight_date : new Date(flight_date);
  const iso = Number.isNaN(d.getTime())
    ? "unknown-date"
    : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  return `${(airline || "UNK").trim()}-${(flight_number || "UNK")
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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return String(value || "").trim().toUpperCase();
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

function PreviewInput({ label, value, onChange, placeholder = "" }) {
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
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [wchType, setWchType] = useState("WCHR");
  const [parsed, setParsed] = useState(null);

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const canScan = useMemo(() => Boolean(imageFile), [imageFile]);

  // ✅ Ahora permitimos submit con campos corregidos manualmente
  const canSubmit = useMemo(() => {
    if (!imageUrl) return false;
    if (!parsed) return false;

    const required = [
      parsed.airline,
      parsed.flight_number,
      parsed.flight_date,
      parsed.origin,
      parsed.destination,
      parsed.seat,
      parsed.gate,
      wchType,
    ];

    return required.every((v) => String(v || "").trim().length > 0);
  }, [imageUrl, parsed, wchType]);

  const handlePickFile = (file) => {
    setError("");
    setMessage("");
    setParsed(null);
    setImageUrl("");
    setImageFile(file || null);
  };

  const updateParsedField = (field, value) => {
    setParsed((prev) => ({
      ...(prev || {}),
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
    setMessage("");

    if (!imageFile) {
      setError("Please select a boarding pass photo.");
      return;
    }

    try {
      setStep("scanning");

      const url = await uploadToStorage(imageFile);
      setImageUrl(url);

      const scanResult = await callScanService(url);

      const normalized = {
        passenger_name: normalizeText(
          scanResult.passenger_name ||
            scanResult.passenger ||
            scanResult.name ||
            ""
        ),
        airline: normalizeUpper(scanResult.airline || ""),
        flight_number: normalizeUpper(
          scanResult.flight_number || scanResult.flight || ""
        ),
        flight_date: normalizeText(scanResult.flight_date || scanResult.date || ""),
        origin: normalizeUpper(scanResult.origin || scanResult.from || ""),
        destination: normalizeUpper(
          scanResult.destination || scanResult.to || ""
        ),
        seat: normalizeUpper(scanResult.seat || ""),
        gate: normalizeUpper(scanResult.gate || ""),
        time_at_gate: normalizeText(scanResult.time_at_gate || ""),
        boarding_group: normalizeUpper(scanResult.boarding_group || ""),
        pnr: normalizeUpper(
          scanResult.pnr ||
            scanResult.record_locator ||
            scanResult.locator ||
            scanResult.booking ||
            scanResult.booking_number ||
            scanResult.reservation ||
            ""
        ),
        operator: normalizeUpper(scanResult.operator || ""),
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
    setMessage("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (!canSubmit) {
      setError("Please complete the required fields before submitting.");
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

      const docRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "",
        employee_id: user.id || "",
        employee_name: user.username || "",
        submitted_at: serverTimestamp(),

        passenger_name: normalizeText(parsed.passenger_name),
        airline: normalizeUpper(parsed.airline),
        flight_number: normalizeUpper(parsed.flight_number),
        flight_date: flightDateObj,
        origin: normalizeUpper(parsed.origin),
        destination: normalizeUpper(parsed.destination),
        seat: normalizeUpper(parsed.seat),
        gate: normalizeUpper(parsed.gate),
        time_at_gate: normalizeText(parsed.time_at_gate),
        boarding_group: normalizeUpper(parsed.boarding_group),
        pnr: normalizeUpper(parsed.pnr),
        operator: normalizeUpper(parsed.operator),

        wch_type: wchType,
        status,
        flight_key,
        image_url: imageUrl,
      });

      const short = docRef.id.slice(-6).toUpperCase();
      const report_id = `WCHR-${yyyymmdd()}-${short}`;

      await updateDoc(doc(db, "wch_reports", docRef.id), { report_id });

      setMessage("Report submitted successfully.");
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
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: 14,
            fontWeight: 600,
          }}
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
              Scan a boarding pass, review the parsed details and submit a WCHR
              report.
            </p>
          </div>

          <ActionButton
            onClick={() => navigate("/dashboard")}
            variant="secondary"
          >
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

      {message && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#065f46",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 22 }}>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Scan Boarding Pass
          </h2>
        </div>

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
                outline: "none",
              }}
            >
              <option value="WCHR">WCHR</option>
              <option value="WCHS">WCHS</option>
              <option value="WCHC">WCHC</option>
            </select>
          </div>

          {imageFile && (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Selected: <b>{imageFile.name}</b>
            </p>
          )}

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
          <div style={{ marginBottom: 16 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Preview / Edit
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Review and fix any field before submitting.
            </p>
          </div>

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
            <PreviewInput
              label="Passenger Name"
              value={parsed.passenger_name}
              onChange={(v) => updateParsedField("passenger_name", v)}
            />

            <PreviewInput
              label="Airline"
              value={parsed.airline}
              onChange={(v) => updateParsedField("airline", v.toUpperCase())}
            />

            <PreviewInput
              label="Flight Number"
              value={parsed.flight_number}
              onChange={(v) => updateParsedField("flight_number", v.toUpperCase())}
            />

            <PreviewInput
              label="Flight Date"
              value={parsed.flight_date}
              onChange={(v) => updateParsedField("flight_date", v)}
              placeholder="Mar 27, 2026"
            />

            <PreviewInput
              label="Origin"
              value={parsed.origin}
              onChange={(v) => updateParsedField("origin", v.toUpperCase())}
            />

            <PreviewInput
              label="Destination"
              value={parsed.destination}
              onChange={(v) => updateParsedField("destination", v.toUpperCase())}
            />

            <PreviewInput
              label="Seat"
              value={parsed.seat}
              onChange={(v) => updateParsedField("seat", v.toUpperCase())}
            />

            <PreviewInput
              label="Gate"
              value={parsed.gate}
              onChange={(v) => updateParsedField("gate", v.toUpperCase())}
            />

            <PreviewInput
              label="Time at Gate"
              value={parsed.time_at_gate}
              onChange={(v) => updateParsedField("time_at_gate", v)}
              placeholder="14:55"
            />

            <PreviewInput
              label="Boarding Group"
              value={parsed.boarding_group}
              onChange={(v) => updateParsedField("boarding_group", v.toUpperCase())}
            />

            <PreviewInput
              label="PNR / Booking"
              value={parsed.pnr}
              onChange={(v) => updateParsedField("pnr", v.toUpperCase())}
            />

            <PreviewInput
              label="Operator"
              value={parsed.operator}
              onChange={(v) => updateParsedField("operator", v.toUpperCase())}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 16,
              flexWrap: "wrap",
            }}
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

          <p
            style={{
              marginTop: 12,
              marginBottom: 0,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Passenger name and PNR can now be corrected manually if the scan
            misses them.
          </p>
        </PageCard>
      )}
    </div>
  );
}
