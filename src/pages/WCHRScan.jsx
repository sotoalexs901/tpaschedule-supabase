// src/pages/WCHRScan.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

const START_LOCATIONS = [
  "Counter",
  "TSA",
  "Security",
  "Train",
  "Airside F",
  "Gate F78",
  "Gate F79",
  "Gate F80",
  "Gate F81",
  "Gate F82",
  "Gate F83",
  "Gate F84",
  "Gate F85",
  "Gate F86",
  "Gate F87",
  "Gate F88",
  "Gate F89",
  "Gate F90",
  "Jet Bridge",
  "Aircraft",
  "Baggage Claim",
  "Customs",
  "CBP",
  "Main Terminal",
  "Wheelchair Storage",
  "Maintenance",
  "Other",
];

const DELIVERY_DESTINATIONS = [
  "Gate F78",
  "Gate F79",
  "Gate F80",
  "Gate F81",
  "Gate F82",
  "Gate F83",
  "Gate F84",
  "Gate F85",
  "Gate F86",
  "Gate F87",
  "Gate F88",
  "Gate F89",
  "Gate F90",
  "Main Terminal",
];

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

function timestampToDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "—";

  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDeliveryLocation(location) {
  return DELIVERY_DESTINATIONS.includes(safeText(location));
}

function getAgentSessionId(user) {
  return safeText(user?.id || user?.uid || user?.username || user?.email);
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
    warning: {
      background: "#f59e0b",
      color: "#fff",
      border: "none",
      boxShadow: "0 12px 24px rgba(245,158,11,0.18)",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecdd3",
      boxShadow: "none",
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
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function SelectInput({ label, value, onChange, options = [] }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>

      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          border: "1px solid #dbeafe",
          background: "#ffffff",
          borderRadius: 14,
          padding: "12px 14px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          boxSizing: "border-box",
        }}
      >
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusPill({ label, value, tone = "blue" }) {
  const tones = {
    blue: {
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1d4ed8",
    },
    green: {
      background: "#ecfdf5",
      border: "1px solid #bbf7d0",
      color: "#15803d",
    },
    slate: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      color: "#0f172a",
    },
    amber: {
      background: "#fffbeb",
      border: "1px solid #fde68a",
      color: "#92400e",
    },
    red: {
      background: "#fff1f2",
      border: "1px solid #fecdd3",
      color: "#be123c",
    },
  };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>

      <div
        style={{
          borderRadius: 16,
          padding: "12px 14px",
          fontSize: 14,
          fontWeight: 900,
          ...tones[tone],
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function ActiveServiceCard({
  service,
  deliveryLocation,
  setDeliveryLocation,
  onDelivered,
  delivering,
}) {
  if (!service?.is_active) return null;

  const currentLocation = service.current_location || "Unknown";

  return (
    <PageCard
      style={{
        padding: 18,
        border: "1px solid #fde68a",
        background:
          "linear-gradient(135deg, rgba(255,251,235,0.98) 0%, rgba(255,255,255,0.98) 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#92400e",
            }}
          >
            Active WCHR Service
          </p>

          <h2
            style={{
              margin: "8px 0 4px",
              fontSize: 22,
              color: "#0f172a",
              fontWeight: 900,
            }}
          >
            Wheelchair {service.wheelchair_number || "—"}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            You cannot take another wheelchair until this passenger is marked
            as delivered.
          </p>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #bfdbfe",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          IN PROGRESS
        </span>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatusPill
          label="Passenger"
          value={service.passenger_name || "—"}
          tone="slate"
        />

        <StatusPill
          label="Flight"
          value={service.flight_number || "—"}
          tone="slate"
        />

        <StatusPill
          label="Current Location"
          value={currentLocation}
          tone="blue"
        />

        <StatusPill
          label="Started At"
          value={formatDateTime(service.started_at)}
          tone="slate"
        />
      </div>

      {isDeliveryLocation(currentLocation) && (
        <div
          style={{
            marginTop: 14,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 16,
            padding: "13px 14px",
            color: "#be123c",
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.55,
          }}
        >
          The wheelchair appears to be at a final destination. Please click
          “Passenger Delivered” as soon as the passenger is handed off at the
          gate or destination.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <SelectInput
          label="Delivered At"
          value={deliveryLocation}
          onChange={setDeliveryLocation}
          options={DELIVERY_DESTINATIONS}
        />

        <ActionButton
          variant="success"
          onClick={onDelivered}
          disabled={delivering || !deliveryLocation}
        >
          {delivering ? "Saving Delivery..." : "Passenger Delivered"}
        </ActionButton>
      </div>
    </PageCard>
  );
}

function StatusCard({ parsed, user, startLocation }) {
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
        <StatusPill
          label="Current Location"
          value={`📍 ${startLocation || "Counter"}`}
          tone="blue"
        />

        <StatusPill label="Status" value="🟢 In Progress" tone="green" />

        <StatusPill label="Assigned Agent" value={agentName} tone="slate" />

        <StatusPill
          label="Wheelchair"
          value={parsed?.wheelchair_number || "—"}
          tone="slate"
        />
      </div>

      <div
        style={{
          marginTop: 14,
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 16,
          padding: "12px 14px",
          color: "#92400e",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        This wheelchair remains assigned to the employee until the passenger is
        marked as delivered. Stored / Not In Use is managed separately.
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
  const [message, setMessage] = useState("");

  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");

  const [wchType, setWchType] = useState("WCHR");
  const [startLocation, setStartLocation] = useState("Counter");
  const [parsed, setParsed] = useState(emptyParsed());

  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeService, setActiveService] = useState(null);

  const [deliveryLocation, setDeliveryLocation] = useState("Main Terminal");
  const [delivering, setDelivering] = useState(false);

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const currentAgentName =
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "";

  const currentAgentId = getAgentSessionId(user);

  const hasActiveService = Boolean(
    activeService?.is_active &&
      safeUpper(activeService?.tracking_status) !== "COMPLETED"
  );

  useEffect(() => {
    if (!currentAgentId) {
      setSessionLoading(false);
      setActiveService(null);
      return undefined;
    }

    setSessionLoading(true);

    const sessionRef = doc(db, "wchr_agent_sessions", currentAgentId);

    const unsubscribe = onSnapshot(
      sessionRef,
      async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            setActiveService(null);
            setSessionLoading(false);
            return;
          }

          const sessionData = {
            id: snapshot.id,
            ...snapshot.data(),
          };

          const sessionIsActive =
            sessionData?.is_active === true &&
            safeUpper(sessionData?.tracking_status) !== "COMPLETED";

          if (!sessionIsActive) {
            setActiveService(null);
            setSessionLoading(false);
            return;
          }

          if (sessionData.report_doc_id) {
            try {
              const reportRef = doc(
                db,
                "wch_reports",
                sessionData.report_doc_id
              );

              const reportSnap = await getDoc(reportRef);

              if (reportSnap.exists()) {
                const reportData = {
                  id: reportSnap.id,
                  ...reportSnap.data(),
                };

                const reportIsDelivered =
                  reportData?.passenger_delivered === true ||
                  safeUpper(reportData?.tracking_status) === "COMPLETED";

                if (reportIsDelivered) {
                  await setDoc(
                    sessionRef,
                    {
                      is_active: false,
                      tracking_status: "COMPLETED",
                      active_report_id: "",
                      report_doc_id: "",
                      completed_at:
                        reportData.delivered_at || serverTimestamp(),
                      updated_at: serverTimestamp(),
                    },
                    { merge: true }
                  );

                  setActiveService(null);
                  setSessionLoading(false);
                  return;
                }

                setActiveService({
                  ...sessionData,
                  passenger_name:
                    reportData.passenger_name ||
                    sessionData.passenger_name ||
                    "",
                  wheelchair_number:
                    reportData.wheelchair_number ||
                    sessionData.wheelchair_number ||
                    "",
                  flight_number:
                    reportData.flight_number ||
                    sessionData.flight_number ||
                    "",
                  current_location:
                    reportData.current_location ||
                    sessionData.current_location ||
                    "",
                  tracking_status:
                    reportData.tracking_status ||
                    sessionData.tracking_status ||
                    "IN_PROGRESS",
                  started_at:
                    reportData.pickup_at ||
                    reportData.submitted_at ||
                    sessionData.started_at ||
                    null,
                });

                setSessionLoading(false);
                return;
              }
            } catch (reportError) {
              console.error(
                "Error validating active WCHR report:",
                reportError
              );
            }
          }

          setActiveService(sessionData);
          setSessionLoading(false);
        } catch (sessionError) {
          console.error("Error reading WCHR agent session:", sessionError);
          setError(
            sessionError?.message ||
              "Unable to load the active wheelchair service."
          );
          setSessionLoading(false);
        }
      },
      (snapshotError) => {
        console.error("WCHR agent session listener failed:", snapshotError);
        setError(
          snapshotError?.message ||
            "Unable to monitor the active wheelchair service."
        );
        setSessionLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentAgentId]);

  useEffect(() => {
    const currentLocation = safeText(activeService?.current_location);

    if (isDeliveryLocation(currentLocation)) {
      setDeliveryLocation(currentLocation);
    }
  }, [activeService?.current_location]);

  const canScan = useMemo(() => {
    return Boolean(imageFile) && !hasActiveService && !sessionLoading;
  }, [imageFile, hasActiveService, sessionLoading]);

  const canSubmit = useMemo(() => {
    if (hasActiveService || sessionLoading) return false;

    const required = [
      parsed.passenger_name,
      parsed.flight_number,
      parsed.pnr,
      parsed.wheelchair_number,
      wchType,
      startLocation,
    ];

    if (!required.every((value) => safeText(value).length > 0)) {
      return false;
    }

    if (mode === "scan") {
      return Boolean(imageUrl);
    }

    return true;
  }, [
    hasActiveService,
    sessionLoading,
    parsed,
    wchType,
    startLocation,
    mode,
    imageUrl,
  ]);

  const resetEntryForm = () => {
    setParsed(emptyParsed());
    setImageFile(null);
    setImageUrl("");
    setStep(mode === "scan" ? "upload" : "manual");
  };

  const handlePickFile = (file) => {
    setError("");
    setMessage("");
    setParsed(emptyParsed());
    setImageUrl("");
    setImageFile(file || null);
  };

  const handleParsedChange = (field, value) => {
    setParsed((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const uploadToStorage = async (file) => {
    const safeUser = (
      user?.username ||
      user?.id ||
      user?.uid ||
      "unknown"
    ).toString();

    const safeFileName = String(file?.name || "boarding-pass.jpg").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const path = `wch_reports/${safeUser}/${yyyymmdd()}/${Date.now()}-${safeFileName}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, {
      contentType: file?.type || "image/jpeg",
    });

    return getDownloadURL(storageRef);
  };

  const callScanService = async (url) => {
    if (!scanUrl) {
      throw new Error(
        "Missing VITE_WCHR_SCAN_URL. Configure the scanning endpoint before using boarding pass scan."
      );
    }

    const response = await fetch(scanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: url,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");

      throw new Error(
        `Scan failed (${response.status}). ${responseText}`.trim()
      );
    }

    return response.json();
  };

  const handleScan = async () => {
    setError("");
    setMessage("");

    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Mark the passenger as delivered before taking another wheelchair.`
      );
      return;
    }

    if (!imageFile) {
      setError("Please select a boarding pass photo.");
      return;
    }

    try {
      setStep("scanning");

      const uploadedImageUrl = await uploadToStorage(imageFile);
      setImageUrl(uploadedImageUrl);

      const scanResult = await callScanService(uploadedImageUrl);
      const rawText = getRawScanText(scanResult);

      const normalized = {
        passenger_name: guessPassengerName(scanResult, rawText),
        airline: safeUpper(scanResult?.airline || ""),
        flight_number: safeUpper(
          scanResult?.flight_number || scanResult?.flight || ""
        ),
        pnr: guessPnr(scanResult, rawText),
        wheelchair_number: cleanWheelchairNumber(
          scanResult?.wheelchair_number || ""
        ),
        raw_text: rawText,
      };

      setParsed(normalized);
      setStep("preview");
    } catch (scanError) {
      console.error("WCHR scan failed:", scanError);
      setStep("upload");
      setError(
        scanError?.message || "Unexpected error while scanning the boarding pass."
      );
    }
  };

  const createAgentSession = async ({
    reportDocId,
    reportId,
    wheelchairNumber,
    passengerName,
    pnr,
    flightNumber,
    currentLocation,
  }) => {
    if (!currentAgentId) {
      throw new Error(
        "The employee profile does not have a valid user ID or username."
      );
    }

    const sessionRef = doc(db, "wchr_agent_sessions", currentAgentId);

    await setDoc(
      sessionRef,
      {
        agent_id: currentAgentId,
        agent_name: currentAgentName,
        agent_username:
          user?.username || user?.loginUsername || user?.email || "",

        report_doc_id: reportDocId,
        active_report_id: reportDocId,
        report_id: reportId,

        wheelchair_number: wheelchairNumber,
        passenger_name: passengerName,
        pnr,
        flight_number: flightNumber,

        current_location: currentLocation,
        tracking_status: "IN_PROGRESS",
        passenger_delivered: false,

        is_active: true,
        alerts_enabled: true,
        alert_after_minutes: 30,

        started_at: serverTimestamp(),
        last_location_update_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
  };
    const handleSubmit = async () => {
    setError("");
    setMessage("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (sessionLoading) {
      setError("Please wait while the active wheelchair service is verified.");
      return;
    }

    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Mark the passenger as delivered before taking another wheelchair.`
      );
      return;
    }

    if (!canSubmit) {
      setError(
        "Please complete Passenger Name, Flight Number, PNR, WCHR Number, WCHR Type and Start Location before submitting."
      );
      return;
    }

    try {
      setStep("submitting");

      const now = new Date();

      const finalPassengerName = normalizePassengerName(
        parsed.passenger_name
      );
      const finalPnr = cleanPnr(parsed.pnr);
      const finalWheelchairNumber = cleanWheelchairNumber(
        parsed.wheelchair_number
      );

      const flightNumber = safeUpper(parsed.flight_number);
      const airline = safeUpper(parsed.airline || "WCHR");
      const initialLocation = safeText(startLocation || "Counter");

      const flightKey = `${airline}-${flightNumber || "UNK"}-${yyyymmdd(now)}`;

      const reportRef = await addDoc(collection(db, "wch_reports"), {
        report_id: "",

        employee_id: currentAgentId,
        employee_name: currentAgentName,
        employee_login:
          user?.username ||
          user?.loginUsername ||
          user?.email ||
          "",
        employee_role: user?.role || "",
        submitted_at: serverTimestamp(),

        passenger_name: finalPassengerName,
        airline,
        flight_number: flightNumber,
        pnr: finalPnr,
        wheelchair_number: finalWheelchairNumber,
        wch_type: wchType,

        status: "NEW",
        flight_key: flightKey,
        image_url: mode === "scan" ? imageUrl : "",
        raw_text: parsed.raw_text || "",
        entry_mode: mode,

        wchr_agent_id: currentAgentId,
        wchr_agent_name: currentAgentName,
        assigned_wchr_agent: currentAgentName,
        activity_agent_name: currentAgentName,

        billing_ready: true,
        billing_date: serverTimestamp(),
        billing_passenger_name: finalPassengerName,
        billing_pnr: finalPnr,
        billing_wheelchair_number: finalWheelchairNumber,

        tracking_enabled: true,
        tracking_status: "IN_PROGRESS",
        passenger_delivered: false,

        current_location: initialLocation,
        last_location: initialLocation,

        pickup_location: initialLocation,
        pickup_at: serverTimestamp(),

        gate_location: "",
        gate_arrived_at: null,

        delivered_location: "",
        delivered_at: null,

        dropoff_location: "",
        dropoff_at: null,

        stored_location: "",
        stored_at: null,

        is_active: true,
        alerts_enabled: true,
        alert_after_minutes: 30,
        last_alert_at: null,
        last_location_update_at: serverTimestamp(),

        last_updated_by: currentAgentName,
        last_updated_by_id: currentAgentId,
        last_updated_at: serverTimestamp(),

        tracking_type: "MANUAL",
        tracking_device_id: "",
        tracking_device_label: "",
      });

      const shortId = reportRef.id.slice(-6).toUpperCase();
      const reportId = `WCHR-${yyyymmdd()}-${shortId}`;

      await updateDoc(doc(db, "wch_reports", reportRef.id), {
        report_id: reportId,
      });

      await createAgentSession({
        reportDocId: reportRef.id,
        reportId,
        wheelchairNumber: finalWheelchairNumber,
        passengerName: finalPassengerName,
        pnr: finalPnr,
        flightNumber,
        currentLocation: initialLocation,
      });

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: reportRef.id,
        report_id: reportId,

        wheelchair_number: finalWheelchairNumber,
        passenger_name: finalPassengerName,
        pnr: finalPnr,
        flight_number: flightNumber,

        event_type: "START_SERVICE",
        location: initialLocation,
        previous_location: "",

        notes: `Wheelchair service started at ${initialLocation}`,

        tracking_status: "IN_PROGRESS",
        passenger_delivered: false,

        is_active: true,
        alerts_enabled: true,

        employee_id: currentAgentId,
        employee_name: currentAgentName,

        created_at: serverTimestamp(),
      });

      setMessage(
        `Wheelchair ${finalWheelchairNumber} is now assigned to your profile.`
      );

      resetEntryForm();
    } catch (submitError) {
      console.error("Error starting WCHR service:", submitError);

      setStep(mode === "scan" ? "preview" : "manual");

      setError(
        submitError?.message ||
          "Unexpected error while starting the wheelchair service."
      );
    }
  };

  const handlePassengerDelivered = async () => {
    setError("");
    setMessage("");

    if (!activeService?.report_doc_id) {
      setError("The active wheelchair report could not be identified.");
      return;
    }

    const finalDestination = safeText(deliveryLocation);

    if (!DELIVERY_DESTINATIONS.includes(finalDestination)) {
      setError(
        "Please select the gate or Main Terminal where the passenger was delivered."
      );
      return;
    }

    const confirmDelivery = window.confirm(
      `Confirm passenger delivery for wheelchair ${
        activeService.wheelchair_number || ""
      } at ${finalDestination}?`
    );

    if (!confirmDelivery) return;

    try {
      setDelivering(true);

      const reportRef = doc(
        db,
        "wch_reports",
        activeService.report_doc_id
      );

      const sessionRef = doc(
        db,
        "wchr_agent_sessions",
        currentAgentId
      );

      const currentLocation =
        activeService.current_location || finalDestination;

      const reportSnapshot = await getDoc(reportRef);

      if (!reportSnapshot.exists()) {
        throw new Error("The active wheelchair report no longer exists.");
      }

      const reportData = reportSnapshot.data();
      const existingGateArrival = reportData?.gate_arrived_at || null;
      const destinationIsGate = finalDestination.startsWith("Gate ");

      const reportPayload = {
        passenger_delivered: true,
        tracking_status: "COMPLETED",

        delivered_location: finalDestination,
        delivered_at: serverTimestamp(),

        dropoff_location: finalDestination,
        dropoff_at: serverTimestamp(),

        current_location: finalDestination,
        last_location: currentLocation,

        is_active: false,
        alerts_enabled: false,

        last_location_update_at: serverTimestamp(),
        last_updated_at: serverTimestamp(),
        last_updated_by: currentAgentName,
        last_updated_by_id: currentAgentId,
      };

      if (destinationIsGate && !existingGateArrival) {
        reportPayload.gate_location = finalDestination;
        reportPayload.gate_arrived_at = serverTimestamp();
      }

      await updateDoc(reportRef, reportPayload);

      await addDoc(collection(db, "wch_tracking_events"), {
        report_doc_id: activeService.report_doc_id,
        report_id: activeService.report_id || "",

        wheelchair_number: activeService.wheelchair_number || "",
        passenger_name: activeService.passenger_name || "",
        pnr: activeService.pnr || "",
        flight_number: activeService.flight_number || "",

        event_type: "PASSENGER_DELIVERED",
        location: finalDestination,
        previous_location: currentLocation,

        notes: `Passenger delivered at ${finalDestination}`,

        tracking_status: "COMPLETED",
        passenger_delivered: true,

        is_active: false,
        alerts_enabled: false,

        employee_id: currentAgentId,
        employee_name: currentAgentName,

        created_at: serverTimestamp(),
      });

      await setDoc(
        sessionRef,
        {
          is_active: false,
          tracking_status: "COMPLETED",
          passenger_delivered: true,

          delivered_location: finalDestination,
          delivered_at: serverTimestamp(),

          current_location: finalDestination,

          active_report_id: "",
          report_doc_id: "",

          completed_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true }
      );

      setActiveService(null);
      setDeliveryLocation("Main Terminal");

      setMessage(
        `Passenger delivered at ${finalDestination}. You may now take another wheelchair.`
      );

      setMode("scan");
      setStep("upload");
      setParsed(emptyParsed());
      setImageFile(null);
      setImageUrl("");
    } catch (deliveryError) {
      console.error(
        "Error marking passenger as delivered:",
        deliveryError
      );

      setError(
        deliveryError?.message ||
          "Unable to mark the passenger as delivered."
      );
    } finally {
      setDelivering(false);
    }
  };

  if (!user) {
    return (
      <PageCard
        style={{
          padding: 22,
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
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
                lineHeight: 1.6,
              }}
            >
              Start one wheelchair service at a time. The active wheelchair
              must be marked as delivered before another service can begin.
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

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error ? "#fff1f2" : "#ecfdf5",
              border: `1px solid ${error ? "#fecdd3" : "#a7f3d0"}`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error ? "#9f1239" : "#065f46",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.55,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      {sessionLoading ? (
        <PageCard style={{ padding: 20 }}>
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "14px 16px",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Checking your active wheelchair service...
          </div>
        </PageCard>
      ) : (
        <ActiveServiceCard
          service={activeService}
          deliveryLocation={deliveryLocation}
          setDeliveryLocation={setDeliveryLocation}
          onDelivered={handlePassengerDelivered}
          delivering={delivering}
        />
      )}

      {hasActiveService && (
        <PageCard
          style={{
            padding: 18,
            border: "1px solid #fecdd3",
            background:
              "linear-gradient(135deg, rgba(255,241,242,0.98) 0%, rgba(255,255,255,0.98) 100%)",
          }}
        >
          <div
            style={{
              color: "#be123c",
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1.6,
            }}
          >
            New wheelchair assignments are blocked. Please mark wheelchair{" "}
            <b>{activeService?.wheelchair_number || "—"}</b> as Passenger
            Delivered before starting another service.
          </div>
        </PageCard>
      )}

      {!hasActiveService && !sessionLoading && (
        <>
          <PageCard style={{ padding: 22 }}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <FieldLabel>Entry Method</FieldLabel>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant={mode === "scan" ? "primary" : "secondary"}
                    onClick={() => {
                      setMode("scan");
                      setStep("upload");
                      setError("");
                      setMessage("");
                    }}
                    disabled={hasActiveService}
                  >
                    Scan Boarding Pass
                  </ActionButton>

                  <ActionButton
                    variant={mode === "manual" ? "primary" : "secondary"}
                    onClick={() => {
                      setMode("manual");
                      setStep("manual");
                      setError("");
                      setMessage("");
                      setImageFile(null);
                      setImageUrl("");
                    }}
                    disabled={hasActiveService}
                  >
                    Manual Entry
                  </ActionButton>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                <SelectInput
                  label="WCHR Type"
                  value={wchType}
                  onChange={setWchType}
                  options={["WCHR", "WCHS", "WCHC"]}
                />

                <SelectInput
                  label="Start Location"
                  value={startLocation}
                  onChange={setStartLocation}
                  options={START_LOCATIONS}
                />
              </div>

              {isDeliveryLocation(startLocation) && (
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 16,
                    padding: "13px 14px",
                    color: "#92400e",
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1.55,
                  }}
                >
                  This service is starting at a possible delivery location.
                  Remember to click Passenger Delivered immediately after the
                  passenger is handed off.
                </div>
              )}

              {mode === "scan" && (
                <>
                  <div>
                    <FieldLabel>Boarding Pass Photo</FieldLabel>

                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) =>
                        handlePickFile(event.target.files?.[0])
                      }
                      disabled={hasActiveService}
                      style={{
                        width: "100%",
                        border: "1px solid #dbeafe",
                        background: "#ffffff",
                        borderRadius: 14,
                        padding: "12px 14px",
                        fontSize: 14,
                        color: "#0f172a",
                        boxSizing: "border-box",
                        opacity: hasActiveService ? 0.6 : 1,
                      }}
                    />
                  </div>

                  <div>
                    <ActionButton
                      onClick={handleScan}
                      variant="primary"
                      disabled={
                        !canScan ||
                        step === "scanning" ||
                        step === "submitting" ||
                        hasActiveService
                      }
                    >
                      {step === "scanning"
                        ? "Scanning..."
                        : "Scan & Preview"}
                    </ActionButton>
                  </div>
                </>
              )}
            </div>
          </PageCard>

          {mode === "manual" && (
            <>
              <StatusCard
                parsed={parsed}
                user={user}
                startLocation={startLocation}
              />

              <PageCard style={{ padding: 22 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
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
                    label="Airline"
                    value={parsed.airline}
                    onChange={(value) =>
                      handleParsedChange("airline", value)
                    }
                    placeholder="AV"
                  />

                  <EditInput
                    label="Flight Number"
                    value={parsed.flight_number}
                    onChange={(value) =>
                      handleParsedChange("flight_number", value)
                    }
                    placeholder="581"
                  />

                  <EditInput
                    label="PNR / Reservation Code"
                    value={parsed.pnr}
                    onChange={(value) =>
                      handleParsedChange("pnr", value)
                    }
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
                    disabled={
                      !canSubmit ||
                      step === "submitting" ||
                      hasActiveService
                    }
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
              <StatusCard
                parsed={parsed}
                user={user}
                startLocation={startLocation}
              />

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
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(220px, 1fr))",
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
                    label="Airline"
                    value={parsed.airline}
                    onChange={(value) =>
                      handleParsedChange("airline", value)
                    }
                    placeholder="AV"
                  />

                  <EditInput
                    label="Flight Number"
                    value={parsed.flight_number}
                    onChange={(value) =>
                      handleParsedChange("flight_number", value)
                    }
                    placeholder="581"
                  />

                  <EditInput
                    label="PNR / Reservation Code"
                    value={parsed.pnr}
                    onChange={(value) =>
                      handleParsedChange("pnr", value)
                    }
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
                      setError("");
                      setMessage("");
                    }}
                    variant="secondary"
                    disabled={step === "submitting"}
                  >
                    Retake / Upload Again
                  </ActionButton>

                  <ActionButton
                    onClick={handleSubmit}
                    variant="success"
                    disabled={
                      !canSubmit ||
                      step === "submitting" ||
                      hasActiveService
                    }
                  >
                    {step === "submitting"
                      ? "Starting Service..."
                      : "Start WCHR Service"}
                  </ActionButton>
                </div>
              </PageCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
