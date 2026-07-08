// src/pages/WCHRScan.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function yyyymmdd(d = new Date()) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
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

function emptyParsed() {
  return {
    passenger_name: "",
    airline: "",
    flight_number: "",
    pnr: "",
    wheelchair_number: "",
    raw_text: "",
  };
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

function EditInput({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
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

function StatusCard({ parsed, user }) {
  const agentName =
    user?.displayName || user?.fullName || user?.name || user?.username || "—";

  return (
    <PageCard style={{ padding: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <div>
          <FieldLabel>Current Location</FieldLabel>
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 15,
              fontWeight: 900,
              color: "#1d4ed8",
            }}
          >
            📍 Counter
          </div>
        </div>

        <div>
          <FieldLabel>Status</FieldLabel>
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #bbf7d0",
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 15,
              fontWeight: 900,
              color: "#15803d",
            }}
          >
            🟢 In Progress
          </div>
        </div>

        <div>
          <FieldLabel>Assigned Agent</FieldLabel>
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {agentName}
          </div>
        </div>

        <div>
          <FieldLabel>Wheelchair</FieldLabel>
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "12px 14px",
              fontSize: 14,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            {parsed?.wheelchair_number || "—"}
          </div>
        </div>
      </div>
    </PageCard>
  );
}
export default function WCHRScan() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [mode, setMode] = useState("scan");
  const [step, setStep] = useState("upload");
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [wchType, setWchType] = useState("WCHR");
  const [parsed, setParsed] = useState(emptyParsed());

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const currentAgentName =
    user?.displayName || user?.fullName || user?.name || user?.username || "";

  const currentAgentId = user?.id || user?.uid || "";

  const canScan = useMemo(() => Boolean(imageFile), [imageFile]);

  const canSubmit = useMemo(() => {
    const required = [
      parsed.passenger_name,
      parsed.flight_number,
      parsed.pnr,
      parsed.wheelchair_number,
      wchType,
    ];

    if (mode === "scan") {
      if (!imageUrl || !parsed) return false;
      return required.every((v) => String(v || "").trim().length > 0);
    }

    return required.every((v) => String(v || "").trim().length > 0);
  }, [imageUrl, parsed, wchType, mode]);

  const handlePickFile = (file) => {
    setError("");
    setParsed(emptyParsed());
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
      console.log("WCHR scan result:", scanResult);

      const rawText = getRawScanText(scanResult);

      const normalized = {
        passenger_name: guessPassengerName(scanResult, rawText),
        airline: safeUpper(scanResult?.airline || ""),
        flight_number: safeUpper(
          scanResult?.flight_number || scanResult?.flight || ""
        ),
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
        "Please complete Passenger Name, Flight Number, PNR and WCHR Number before submit."
      );
      return;
    }

    try {
      setStep("submitting");

      const now = new Date();

      const finalPassengerName = normalizePassengerName(parsed.passenger_name);
      const finalPnr = cleanPnr(parsed.pnr);
      const finalWheelchairNumber = cleanWheelchairNumber(
        parsed.wheelchair_number
      );

      const flightNumber = safeUpper(parsed.flight_number);
      const airline = safeUpper(parsed.airline || "WCHR");

      const flight_key = `${airline}-${flightNumber || "UNK"}-${yyyymmdd(now)}`;

      const docRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "",

        employee_id: currentAgentId,
        employee_name: currentAgentName,
        employee_login:
          user.username || user.loginUsername || user.email || "",
        employee_role: user.role || "",
        submitted_at: serverTimestamp(),

        passenger_name: finalPassengerName,
        airline,
        flight_number: flightNumber,
        pnr: finalPnr,
        wheelchair_number: finalWheelchairNumber,
        wch_type: wchType,

        status: "NEW",
        flight_key,
        image_url: mode === "scan" ? imageUrl : "",
        raw_text: parsed.raw_text || "",
        entry_mode: mode,

        // Agent fields for WCHR reports
        wchr_agent_id: currentAgentId,
        wchr_agent_name: currentAgentName,
        assigned_wchr_agent: currentAgentName,
        activity_agent_name: currentAgentName,

        // Billing fields
        billing_ready: true,
        billing_date: serverTimestamp(),
        billing_passenger_name: finalPassengerName,
        billing_pnr: finalPnr,
        billing_wheelchair_number: finalWheelchairNumber,

        // Wheelchair tracking fields
        tracking_enabled: true,
        tracking_status: "IN_PROGRESS",
        current_location: "Counter",
        last_location: "Counter",
        pickup_location: "Counter",
        pickup_at: serverTimestamp(),
        dropoff_location: "",
        dropoff_at: null,
        last_updated_by: currentAgentName,
        last_updated_by_id: currentAgentId,
        last_updated_at: serverTimestamp(),

        // For future hardware support
        tracking_type: "MANUAL",
        tracking_device_id: "",
        tracking_device_label: "",
      });

      const short = docRef.id.slice(-6).toUpperCase();
      const report_id = `WCHR-${yyyymmdd()}-${short}`;

      await updateDoc(doc(db, "wch_reports", docRef.id), { report_id });

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: docRef.id,
        report_id,
        wheelchair_number: finalWheelchairNumber,
        passenger_name: finalPassengerName,
        pnr: finalPnr,
        flight_number: flightNumber,
        event_type: "PICKUP",
        location: "Counter",
        previous_location: "",
        notes: "Wheelchair picked up at counter",
        tracking_status: "IN_PROGRESS",
        employee_id: currentAgentId,
        employee_name: currentAgentName,
        created_at: serverTimestamp(),
      });

      navigate("/wchr/my-reports");
    } catch (e) {
      console.error(e);
      setStep(mode === "scan" ? "preview" : "manual");
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
              TPA OPS · WCHR TRACKING
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
              }}
            >
              Wheelchair Service
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Start a wheelchair service, identify the assigned chair, and begin
              tracking from the counter.
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

      <PageCard style={{ padding: 22 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Entry Method</FieldLabel>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ActionButton
                variant={mode === "scan" ? "primary" : "secondary"}
                onClick={() => {
                  setMode("scan");
                  setStep("upload");
                  setError("");
                }}
              >
                Scan Boarding Pass
              </ActionButton>

              <ActionButton
                variant={mode === "manual" ? "primary" : "secondary"}
                onClick={() => {
                  setMode("manual");
                  setStep("manual");
                  setError("");
                  setImageFile(null);
                  setImageUrl("");
                }}
              >
                Manual Entry
              </ActionButton>
            </div>
          </div>

          <div>
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

          {mode === "scan" && (
            <>
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

              <div>
                <ActionButton
                  onClick={handleScan}
                  variant="primary"
                  disabled={
                    !canScan || step === "scanning" || step === "submitting"
                  }
                >
                  {step === "scanning" ? "Scanning..." : "Scan & Preview"}
                </ActionButton>
              </div>
            </>
          )}
        </div>
      </PageCard>

      {mode === "manual" && (
        <>
          <StatusCard parsed={parsed} user={user} />

          <PageCard style={{ padding: 22 }}>
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
                onChange={(value) =>
                  handleParsedChange("passenger_name", value)
                }
                placeholder="VERGARA / CLAUDIA"
              />

              <EditInput
                label="Flight Number"
                value={parsed.flight_number}
                onChange={(value) =>
                  handleParsedChange("flight_number", value)
                }
                placeholder="1234"
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
                onChange={(value) =>
                  handleParsedChange("wheelchair_number", value)
                }
                placeholder="WCHR-023 or 023"
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <ActionButton
                onClick={handleSubmit}
                variant="success"
                disabled={!canSubmit || step === "submitting"}
              >
                {step === "submitting"
                  ? "Starting Service..."
                  : "Start WCHR Service"}
              </ActionButton>
            </div>
          </PageCard>
        </>
      )}

      {mode === "scan" && step === "preview" && parsed && (
        <>
          <StatusCard parsed={parsed} user={user} />

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
                onChange={(value) =>
                  handleParsedChange("passenger_name", value)
                }
                placeholder="VERGARA / CLAUDIA"
              />

              <EditInput
                label="Flight Number"
                value={parsed.flight_number}
                onChange={(value) =>
                  handleParsedChange("flight_number", value)
                }
                placeholder="1234"
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
                onChange={(value) =>
                  handleParsedChange("wheelchair_number", value)
                }
                placeholder="WCHR-023 or 023"
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
                  setParsed(emptyParsed());
                  setImageUrl("");
                  setImageFile(null);
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
                {step === "submitting"
                  ? "Starting Service..."
                  : "Start WCHR Service"}
              </ActionButton>
            </div>
          </PageCard>
        </>
      )}
    </div>
  );
}
