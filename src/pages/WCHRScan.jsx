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

function valueFromMany(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function getRawText(scanResult) {
  return [
    scanResult?.raw_text,
    scanResult?.ocr_text,
    scanResult?.text,
    scanResult?.full_text,
    scanResult?.rawText,
    scanResult?.ocrText,
  ]
    .filter(Boolean)
    .join("\n");
}

function cleanOperator(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanFlightNumber(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanAirportCode(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanSeat(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanGate(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanBoardingGroup(value) {
  return String(value || "").trim().toUpperCase();
}

function cleanTimeAtGate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function cleanPassengerName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim()
    .toUpperCase();
}

function extractPassengerName(scanResult) {
  const direct = cleanPassengerName(
    valueFromMany(scanResult, [
      "passenger_name",
      "passengerName",
      "passenger",
      "name",
      "full_name",
      "fullName",
      "traveler_name",
      "travelerName",
      "pax_name",
      "paxName",
      "last_first_name",
      "name_text",
    ])
  );

  if (direct) return direct;

  const rawText = getRawText(scanResult);
  if (rawText) {
    const match = rawText.match(/\b([A-Z]{2,}\/[A-Z]{2,})\b/);
    if (match?.[1]) return cleanPassengerName(match[1]);
  }

  return "";
}

function extractPNR(scanResult) {
  const direct = valueFromMany(scanResult, [
    "pnr",
    "record_locator",
    "recordLocator",
    "locator",
    "booking",
    "booking_number",
    "bookingNumber",
    "reservation",
    "reservation_number",
    "reservationNumber",
    "booking_code",
    "bookingCode",
    "confirmation_code",
    "confirmationCode",
  ]);

  const normalizedDirect = String(direct || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (
    normalizedDirect &&
    normalizedDirect.length >= 5 &&
    normalizedDirect !== "MEMBER" &&
    normalizedDirect !== "BOOKING" &&
    normalizedDirect !== "RESERVA"
  ) {
    return normalizedDirect;
  }

  const rawText = getRawText(scanResult).toUpperCase();

  const patterns = [
    /BOOKING[:\s]*([A-Z0-9]{5,8})/,
    /RESERVA[:\s]*([A-Z0-9]{5,8})/,
    /PNR[:\s]*([A-Z0-9]{5,8})/,
    /LOCATOR[:\s]*([A-Z0-9]{5,8})/,
    /RECORD[\s_-]*LOCATOR[:\s]*([A-Z0-9]{5,8})/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      const val = match[1].replace(/[^A-Z0-9]/g, "");
      if (val && val !== "MEMBER") return val;
    }
  }

  const genericCandidates = rawText.match(/\b[A-Z0-9]{6}\b/g) || [];
  const filtered = genericCandidates.find(
    (x) =>
      ![
        "MEMBER",
        "AVIANCA",
        "BOGOTA",
        "FLIGHT",
        "OPERAD",
        "RESERV",
        "BOOKIN",
      ].includes(x)
  );

  return filtered || "";
}

function extractFlightDate(scanResult) {
  return valueFromMany(scanResult, [
    "flight_date",
    "flightDate",
    "date",
    "departure_date",
    "travel_date",
  ]);
}

function extractTimeAtGate(scanResult) {
  const direct = valueFromMany(scanResult, [
    "time_at_gate",
    "timeAtGate",
    "gate_time",
    "gateTime",
    "boarding_time",
    "boardingTime",
  ]);

  if (direct) return cleanTimeAtGate(direct);

  const rawText = getRawText(scanResult);
  const match = rawText.match(/\b(\d{1,2}:\d{2})\b/);
  return match?.[1] ? cleanTimeAtGate(match[1]) : "";
}

function extractBoardingGroup(scanResult) {
  const direct = valueFromMany(scanResult, [
    "boarding_group",
    "boardingGroup",
    "group",
    "grupo",
  ]);

  if (direct) return cleanBoardingGroup(direct);

  const rawText = getRawText(scanResult).toUpperCase();
  const match = rawText.match(/GROUP[:\s]*([A-Z0-9]+)/) || rawText.match(/GRUPO[:\s]*([A-Z0-9]+)/);
  return match?.[1] ? cleanBoardingGroup(match[1]) : "";
}

function extractOperator(scanResult) {
  const direct = valueFromMany(scanResult, [
    "operator",
    "operated_by",
    "operatedBy",
    "carrier",
  ]);

  if (direct) return cleanOperator(direct);

  const rawText = getRawText(scanResult).toUpperCase();
  if (rawText.includes("AVIANCA")) return "AVIANCA";

  return "";
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
        passenger_name: extractPassengerName(scanResult),
        airline: cleanOperator(
          valueFromMany(scanResult, [
            "airline",
            "carrier_code",
            "carrierCode",
            "marketing_carrier",
            "marketingCarrier",
          ])
        ),
        flight_number: cleanFlightNumber(
          valueFromMany(scanResult, [
            "flight_number",
            "flightNumber",
            "flight",
          ])
        ),
        flight_date: extractFlightDate(scanResult),
        origin: cleanAirportCode(
          valueFromMany(scanResult, ["origin", "from", "departure_airport"])
        ),
        destination: cleanAirportCode(
          valueFromMany(scanResult, ["destination", "to", "arrival_airport"])
        ),
        seat: cleanSeat(valueFromMany(scanResult, ["seat", "seat_number"])),
        gate: cleanGate(valueFromMany(scanResult, ["gate", "gate_number"])),
        pnr: extractPNR(scanResult),
        time_at_gate: extractTimeAtGate(scanResult),
        boarding_group: extractBoardingGroup(scanResult),
        operator: extractOperator(scanResult),
      };

      setParsed(normalized);
      setStep("preview");
    } catch (e) {
      console.error(e);
      setStep("upload");
      setError(e?.message || "Unexpected error while scanning.");
    }
  };

  const updateParsedField = (field, value) => {
    setParsed((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    setError("");
    setMessage("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (!canSubmit) {
      setError("Missing required fields from scan. Please complete the missing fields before submitting.");
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
        pnr: parsed.pnr || "",
        time_at_gate: parsed.time_at_gate || "",
        boarding_group: parsed.boarding_group || "",
        operator: parsed.operator || "",

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
              report. Any logged-in user can access this screen.
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
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: "#64748b",
              }}
            >
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
              Preview & Edit
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              Confirm or correct the scan details before submitting the report.
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
            <div>
              <FieldLabel>Passenger Name</FieldLabel>
              <TextInput
                value={parsed.passenger_name || ""}
                onChange={(e) => updateParsedField("passenger_name", e.target.value.toUpperCase())}
                placeholder="VERGARA/CLAUDIA"
              />
            </div>

            <div>
              <FieldLabel>Airline</FieldLabel>
              <TextInput
                value={parsed.airline || ""}
                onChange={(e) => updateParsedField("airline", e.target.value.toUpperCase())}
                placeholder="AV"
              />
            </div>

            <div>
              <FieldLabel>Flight Number</FieldLabel>
              <TextInput
                value={parsed.flight_number || ""}
                onChange={(e) => updateParsedField("flight_number", e.target.value.toUpperCase())}
                placeholder="195"
              />
            </div>

            <div>
              <FieldLabel>Flight Date</FieldLabel>
              <TextInput
                value={parsed.flight_date || ""}
                onChange={(e) => updateParsedField("flight_date", e.target.value)}
                placeholder="2026-03-27"
              />
            </div>

            <div>
              <FieldLabel>Origin</FieldLabel>
              <TextInput
                value={parsed.origin || ""}
                onChange={(e) => updateParsedField("origin", e.target.value.toUpperCase())}
                placeholder="TPA"
              />
            </div>

            <div>
              <FieldLabel>Destination</FieldLabel>
              <TextInput
                value={parsed.destination || ""}
                onChange={(e) => updateParsedField("destination", e.target.value.toUpperCase())}
                placeholder="BOG"
              />
            </div>

            <div>
              <FieldLabel>Seat</FieldLabel>
              <TextInput
                value={parsed.seat || ""}
                onChange={(e) => updateParsedField("seat", e.target.value.toUpperCase())}
                placeholder="2A"
              />
            </div>

            <div>
              <FieldLabel>Gate</FieldLabel>
              <TextInput
                value={parsed.gate || ""}
                onChange={(e) => updateParsedField("gate", e.target.value.toUpperCase())}
                placeholder="F87"
              />
            </div>

            <div>
              <FieldLabel>Time at Gate</FieldLabel>
              <TextInput
                value={parsed.time_at_gate || ""}
                onChange={(e) => updateParsedField("time_at_gate", e.target.value)}
                placeholder="14:55"
              />
            </div>

            <div>
              <FieldLabel>Boarding Group</FieldLabel>
              <TextInput
                value={parsed.boarding_group || ""}
                onChange={(e) => updateParsedField("boarding_group", e.target.value.toUpperCase())}
                placeholder="A"
              />
            </div>

            <div>
              <FieldLabel>PNR / Booking</FieldLabel>
              <TextInput
                value={parsed.pnr || ""}
                onChange={(e) => updateParsedField("pnr", e.target.value.toUpperCase())}
                placeholder="A7LLFB"
              />
            </div>

            <div>
              <FieldLabel>Operator</FieldLabel>
              <TextInput
                value={parsed.operator || ""}
                onChange={(e) => updateParsedField("operator", e.target.value.toUpperCase())}
                placeholder="AVIANCA"
              />
            </div>

            <div>
              <FieldLabel>WCHR Type</FieldLabel>
              <TextInput value={wchType} readOnly />
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
            After submission, Duty Managers and Station Manager will be notified
            automatically.
          </p>
        </PageCard>
      )}
    </div>
  );
}
