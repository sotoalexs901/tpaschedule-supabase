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
  // dateLike puede venir como string del scanner o Date
  // Intentamos convertir con robustez.
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
  // flight_date se guarda internamente como Date (o string ISO).
  // Para flight_key usamos YYYY-MM-DD (estable para keys)
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

export default function WCHRScan() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [step, setStep] = useState("upload"); // upload | scanning | preview | submitting
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [wchType, setWchType] = useState("WCHR");

  const [parsed, setParsed] = useState(null);
  // parsed esperado:
  // {
  //   passenger_name, airline, flight_number, flight_date, origin, destination, seat, gate, pnr
  // }

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL; // ej: https://.../api/wchr/scan  ó /api/wchr/scan

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
    setParsed(null);
    setImageUrl("");
    setImageFile(file || null);
  };

  const uploadToStorage = async (file) => {
    // guardamos por usuario/fecha para trazabilidad
    const safeUser = (user?.username || user?.id || "unknown").toString();
    const path = `wch_reports/${safeUser}/${yyyymmdd()}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
    return await getDownloadURL(storageRef);
  };

  const callScanService = async (url) => {
    // Servicio externo/backend que hace PDF417 + OCR fallback
    // Espera recibir { image_url } y devolver { fields... }
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

      // 1) upload
      const url = await uploadToStorage(imageFile);
      setImageUrl(url);

      // 2) scan/parse
      const scanResult = await callScanService(url);

      // Normalizamos nombres de campos (por si backend devuelve algo ligeramente distinto)
      const normalized = {
        passenger_name:
          scanResult.passenger_name || scanResult.passenger || scanResult.name || "",
        airline: scanResult.airline || "",
        flight_number: scanResult.flight_number || scanResult.flight || "",
        flight_date: scanResult.flight_date || scanResult.date || "",
        origin: scanResult.origin || scanResult.from || "",
        destination: scanResult.destination || scanResult.to || "",
        seat: scanResult.seat || "",
        gate: scanResult.gate || "",
        pnr: scanResult.pnr || scanResult.record_locator || scanResult.locator || "",
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
      setError("Missing required fields from scan. Please rescan a clearer photo.");
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

      // 1) crear doc
      const docRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "", // lo llenamos después
        employee_id: user.id || "",
        employee_name: user.username || "",
        submitted_at: serverTimestamp(),

        passenger_name: parsed.passenger_name,
        airline: parsed.airline,
        flight_number: parsed.flight_number,
        flight_date: flightDateObj, // Firestore lo guarda como Timestamp
        origin: parsed.origin,
        destination: parsed.destination,
        seat: parsed.seat,
        gate: parsed.gate,
        pnr: parsed.pnr,

        wch_type: wchType,
        status,
        flight_key,
        image_url: imageUrl,
      });

      // 2) report_id humano (simple y único)
      const short = docRef.id.slice(-6).toUpperCase();
      const report_id = `WCHR-${yyyymmdd()}-${short}`;

      await updateDoc(doc(db, "wch_reports", docRef.id), { report_id });

      // 3) navegar a una pantalla “My Reports” o detalle (ajusta ruta según tu app)
      navigate("/wchr/my-reports");
    } catch (e) {
      console.error(e);
      setStep("preview");
      setError(e?.message || "Unexpected error while submitting.");
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>WCHR Reports</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Scan a boarding pass and submit a WCHR report.
          </p>
        </div>

        <button
          onClick={() => navigate("/dashboard")}
          style={{
            height: 36,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Back
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: "rgba(255,0,0,0.12)",
            border: "1px solid rgba(255,0,0,0.25)",
          }}
        >
          <div style={{ fontSize: 14 }}>{error}</div>
        </div>
      )}

      {/* UPLOAD */}
      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 13, opacity: 0.9 }}>
            Boarding Pass Photo
          </label>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handlePickFile(e.target.files?.[0])}
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 220 }}>
              <label style={{ fontSize: 13, opacity: 0.9 }}>WCHR Type</label>
              <select
                value={wchType}
                onChange={(e) => setWchType(e.target.value)}
                style={{
                  width: "100%",
                  height: 38,
                  marginTop: 6,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(0,0,0,0.25)",
                  color: "inherit",
                  padding: "0 10px",
                }}
              >
                <option value="WCHR">WCHR</option>
                <option value="WCHS">WCHS</option>
                <option value="WCHC">WCHC</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "end" }}>
              <button
                onClick={handleScan}
                disabled={!canScan || step === "scanning" || step === "submitting"}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background:
                    !canScan || step === "scanning" || step === "submitting"
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.14)",
                  color: "inherit",
                  cursor:
                    !canScan || step === "scanning" || step === "submitting"
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {step === "scanning" ? "Scanning..." : "Scan & Preview"}
              </button>
            </div>
          </div>

          {imageFile && (
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Selected: {imageFile.name}
            </div>
          )}

          {!scanUrl && (
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              ⚠️ Scan endpoint not configured. Add <b>VITE_WCHR_SCAN_URL</b> to enable parsing.
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW */}
      {step === "preview" && parsed && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Preview</h3>

          {imageUrl && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={imageUrl}
                alt="Boarding pass"
                style={{
                  width: "100%",
                  maxHeight: 320,
                  objectFit: "contain",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.2)",
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              fontSize: 13,
            }}
          >
            <Field label="Passenger" value={parsed.passenger_name} />
            <Field label="Airline" value={parsed.airline} />
            <Field label="Flight" value={parsed.flight_number} />
            <Field label="Date (MM-DD-YYYY)" value={formatMMDDYYYY(parsed.flight_date)} />
            <Field label="Origin" value={parsed.origin} />
            <Field label="Destination" value={parsed.destination} />
            <Field label="Seat" value={parsed.seat} />
            <Field label="Gate" value={parsed.gate} />
            <Field label="PNR/Record Locator" value={parsed.pnr} />
            <Field label="WCHR Type" value={wchType} />
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              onClick={() => {
                setParsed(null);
                setImageUrl("");
                setStep("upload");
              }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              Retake / Upload Again
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || step === "submitting"}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background:
                  !canSubmit || step === "submitting"
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.18)",
                color: "inherit",
                cursor:
                  !canSubmit || step === "submitting" ? "not-allowed" : "pointer",
              }}
            >
              {step === "submitting" ? "Submitting..." : "Submit Report"}
            </button>
          </div>

          <p style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            After submission, Duty Managers and Station Manager will be notified automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.75 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13 }}>
        {String(value || "").trim() ? value : <span style={{ opacity: 0.6 }}>—</span>}
      </div>
    </div>
  );
}
