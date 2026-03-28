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

function toInputDateValue(dateLike) {
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch {
    return "";
  }
}

function normalizeFlightDate(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    return String(value).trim();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(
      parsed.getDate()
    )}`;
  }

  return "";
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

function safeUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function extractFlightNumber(value) {
  const str = String(value || "").trim();
  if (!str) return "";

  const match = str.match(/([A-Z]{1,3})?\s*0*([0-9]{1,4})/i);
  if (!match) return str;

  return match[2] || str;
}

function extractAirlineCode(value) {
  const str = String(value || "").trim();
  if (!str) return "";

  const match = str.match(/^([A-Z]{1,3})/i);
  return match ? safeUpper(match[1]) : safeUpper(str);
}

function normalizeScanPayload(scanResult = {}) {
  const rawFlight =
    scanResult.flight ||
    scanResult.flight_number ||
    scanResult.vuelo ||
    scanResult.flightNo ||
    "";

  const rawAirline =
    scanResult.airline ||
    scanResult.airline_code ||
    scanResult.carrier ||
    scanResult.operating_carrier ||
    extractAirlineCode(rawFlight) ||
    "";

  const rawFlightNumber =
    scanResult.flight_number ||
    scanResult.flightNo ||
    scanResult.flight_num ||
    extractFlightNumber(rawFlight) ||
    "";

  const rawDate =
    scanResult.flight_date ||
    scanResult.date ||
    scanResult.departure_date ||
    scanResult.travel_date ||
    "";

  return {
    passenger_name:
      scanResult.passenger_name ||
      scanResult.passenger ||
      scanResult.name ||
      scanResult.full_name ||
      "",

    airline: safeUpper(rawAirline),

    flight_number: rawFlightNumber,

    flight_date: normalizeFlightDate(rawDate),

    origin:
      scanResult.origin ||
      scanResult.from ||
      scanResult.departure_airport ||
      "",

    destination:
      scanResult.destination ||
      scanResult.to ||
      scanResult.arrival_airport ||
      "",

    seat: scanResult.seat || "",

    gate: scanResult.gate || scanResult.sala || "",

    time_at_gate:
      scanResult.time_at_gate ||
      scanResult.gate_time ||
      scanResult.boarding_time ||
      scanResult.hora_en_sala ||
      "",

    boarding_group:
      scanResult.boarding_group ||
      scanResult.group ||
      scanResult.boardingGroup ||
      scanResult.grupo ||
      "",

    pnr:
      scanResult.pnr ||
      scanResult.record_locator ||
      scanResult.locator ||
      scanResult.booking ||
      scanResult.reservation ||
      scanResult.booking_code ||
      "",

    operator:
      scanResult.operator ||
      scanResult.operated_by ||
      scanResult.operating_carrier ||
      scanResult.operado_por ||
      "",

    raw_text: scanResult.raw_text || scanResult.text || "",
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

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 14,
        padding: "12px 14px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        ...props.style,
      }}
    />
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
  const [scanRaw, setScanRaw] = useState(null);

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const canScan = useMemo(() => Boolean(imageFile), [imageFile]);

  const canSubmit = useMemo(() => {
    if (!imageUrl) return false;
    if (!parsed) return false;

    const required = [
      parsed.passenger_name,
      parsed.airline,
      parsed.flight_number,
      parsed.flight_date,
      parsed.origin,
      parsed.destination,
      parsed.seat,
      parsed.gate,
      parsed.pnr,
    ];

    return required.every((v) => String(v || "").trim().length > 0);
  }, [imageUrl, parsed]);

  const handlePickFile = (file) => {
    setError("");
    setMessage("");
    setParsed(null);
    setScanRaw(null);
    setImageUrl("");
    setImageFile(file || null);
  };

  const handleParsedChange = (field, value) => {
    setParsed((prev) => ({
      ...(prev || {}),
      [field]: value,
    }));
  };

  const uploadToStorage = async (file) => {
    const safeUser = (user?.username || user?.id || "unknown").toString();
    const safeName = file.name.replace(/\s+/g, "_");
    const path = `wch_reports/${safeUser}/${yyyymmdd()}/${Date.now()}-${safeName}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });

    return {
      imageUrl: await getDownloadURL(storageRef),
      storagePath: path,
    };
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

      const uploadResult = await uploadToStorage(imageFile);
      setImageUrl(uploadResult.imageUrl);

      let scanResult = {};
      try {
        scanResult = await callScanService(uploadResult.imageUrl);
      } catch (scanErr) {
        console.error(scanErr);
        setMessage(
          "The automatic scan could not read everything. You can complete the fields manually and still save the report."
        );
      }

      setScanRaw(scanResult || {});
      setParsed(normalizeScanPayload(scanResult || {}));
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
      setError(
        "Please complete the required fields before submitting the report."
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

      const docRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "",
        employee_id: user.id || "",
        employee_name: user.username || "",
        submitted_at: serverTimestamp(),

        passenger_name: parsed.passenger_name || "",
        airline: parsed.airline || "",
        flight_number: parsed.flight_number || "",
        flight_date: flightDateObj,
        origin: parsed.origin || "",
        destination: parsed.destination || "",
        seat: parsed.seat || "",
        gate: parsed.gate || "",
        time_at_gate: parsed.time_at_gate || "",
        boarding_group: parsed.boarding_group || "",
        pnr: parsed.pnr || "",
        operator: parsed.operator || "",

        wch_type: wchType,
        status,
        flight_key,

        image_url: imageUrl,
        boarding_pass_file_name: imageFile?.name || "",
        scan_raw: scanRaw || {},
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
              Scan a boarding pass, review the parsed details, correct anything
              needed, and save both the report and the boarding pass image.
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
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Upload a boarding pass image and select the wheelchair service type.
          </p>
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

          {!scanUrl && (
            <div
              style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 16,
                padding: "14px 16px",
                color: "#9a3412",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Scan endpoint not configured. Add <b>VITE_WCHR_SCAN_URL</b> to
              enable parsing.
            </div>
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
              Preview & Correct Details
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Review the scan and fix anything before saving. The boarding pass
              image will also remain stored.
            </p>
          </div>

          {imageUrl && (
            <div style={{ marginBottom: 16 }}>
              <img
                src={imageUrl}
                alt="Boarding pass"
                style={{
                  width: "100%",
                  maxHeight: 380,
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
            <div>
              <FieldLabel>Passenger Name</FieldLabel>
              <TextInput
                value={parsed.passenger_name || ""}
                onChange={(e) =>
                  handleParsedChange("passenger_name", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Airline</FieldLabel>
              <TextInput
                value={parsed.airline || ""}
                onChange={(e) => handleParsedChange("airline", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={parsed.flight_number || ""}
                onChange={(e) =>
                  handleParsedChange("flight_number", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Flight Date</FieldLabel>
              <TextInput
                type="date"
                value={toInputDateValue(parsed.flight_date)}
                onChange={(e) =>
                  handleParsedChange("flight_date", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Origin</FieldLabel>
              <TextInput
                value={parsed.origin || ""}
                onChange={(e) => handleParsedChange("origin", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Destination</FieldLabel>
              <TextInput
                value={parsed.destination || ""}
                onChange={(e) =>
                  handleParsedChange("destination", e.target.value)
                }
              />
            </div>

            <div>
              <FieldLabel>Seat</FieldLabel>
              <TextInput
                value={parsed.seat || ""}
                onChange={(e) => handleParsedChange("seat", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Gate</FieldLabel>
              <TextInput
                value={parsed.gate || ""}
                onChange={(e) => handleParsedChange("gate", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Time at Gate</FieldLabel>
              <TextInput
                value={parsed.time_at_gate || ""}
                onChange={(e) =>
                  handleParsedChange("time_at_gate", e.target.value)
                }
                placeholder="14:55"
              />
            </div>

            <div>
              <FieldLabel>Boarding Group</FieldLabel>
              <TextInput
                value={parsed.boarding_group || ""}
                onChange={(e) =>
                  handleParsedChange("boarding_group", e.target.value)
                }
                placeholder="A"
              />
            </div>

            <div>
              <FieldLabel>PNR / Booking</FieldLabel>
              <TextInput
                value={parsed.pnr || ""}
                onChange={(e) => handleParsedChange("pnr", e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Operator</FieldLabel>
              <TextInput
                value={parsed.operator || ""}
                onChange={(e) => handleParsedChange("operator", e.target.value)}
                placeholder="AVIANCA"
              />
            </div>
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
                setScanRaw(null);
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
            Saved report includes the boarding pass image, the corrected fields,
            and the raw scan output for later troubleshooting.
          </p>
        </PageCard>
      )}
    </div>
  );
}
