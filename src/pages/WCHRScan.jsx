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
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

const REPORTS_COLLECTION = "wch_reports";
const TRACKING_EVENTS_COLLECTION = "wch_tracking_events";
const AGENT_SESSIONS_COLLECTION = "wchr_agent_sessions";
const INVENTORY_COLLECTION = "wchr_inventory";
const SERVICE_SEGMENTS_COLLECTION = "service_segments";

const START_LOCATIONS = [
  "Counter",
  "AV Ticket Counter",
  "SY Ticket Counter",
  "Outside TSA",
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
  "Outside CBP",
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

const HANDOFF_LOCATIONS = [
  "Outside TSA",
  "TSA",
  "Outside CBP",
  "CBP",
];

const GATE_LOCATIONS = [
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
];

function pad2(number) {
  return String(number).padStart(2, "0");
}

function yyyymmdd(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(
    date.getDate()
  )}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
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
          .replace(/\b\w/g, (character) => character.toUpperCase())
          .trim()
      )
      .join(" / ");
  }

  return clean
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())
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

    if (match?.[1]) {
      return match[1].trim();
    }
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

    if (candidate) {
      return candidate;
    }
  }

  const possibleValues = text.match(/\b[A-Z0-9]{5,8}\b/g) || [];

  for (const possibleValue of possibleValues) {
    const candidate = cleanPnr(possibleValue);

    if (candidate) {
      return candidate;
    }
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

  for (const candidate of candidates) {
    const cleaned = safeText(candidate);

    if (cleaned) {
      return normalizePassengerName(cleaned);
    }
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

  for (const candidate of candidates) {
    const cleaned = cleanPnr(candidate);

    if (cleaned) {
      return cleaned;
    }
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

function isHandoffLocation(location) {
  return HANDOFF_LOCATIONS.includes(safeText(location));
}

function isGateLocation(location) {
  return GATE_LOCATIONS.includes(safeText(location));
}

function getAgentSessionId(user) {
  return safeText(
    user?.id || user?.uid || user?.username || user?.email
  );
}

function getAgentDisplayName(user) {
  return safeText(
    user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.username ||
      user?.email
  );
}

function getWheelchairDocumentId(wheelchairNumber) {
  const cleanNumber = cleanWheelchairNumber(wheelchairNumber);

  if (!cleanNumber) {
    return "";
  }

  return cleanNumber
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
}

function buildFlightKey(airline, flightNumber, date = new Date()) {
  const cleanAirline = safeUpper(airline || "WCHR");
  const cleanFlightNumber = safeUpper(flightNumber || "UNK");

  return `${cleanAirline}-${cleanFlightNumber}-${yyyymmdd(date)}`;
}

function buildInventoryStatus(item) {
  const status = safeUpper(item?.status);

  if (
    item?.available_for_handoff === true ||
    status === "AVAILABLE_HANDOFF"
  ) {
    return "AVAILABLE_HANDOFF";
  }

  if (
    item?.is_available === true ||
    status === "AVAILABLE" ||
    status === "STORED"
  ) {
    return "AVAILABLE";
  }

  if (
    item?.is_available === false ||
    status === "IN_USE" ||
    status === "ASSIGNED"
  ) {
    return "IN_USE";
  }

  return status || "UNKNOWN";
}

function inventoryIsAvailableAtLocation(item, location) {
  const inventoryLocation = safeText(item?.location);
  const requestedLocation = safeText(location);
  const status = buildInventoryStatus(item);

  if (!inventoryLocation || inventoryLocation !== requestedLocation) {
    return false;
  }

  return (
    item?.available_for_handoff === true ||
    item?.is_available === true ||
    status === "AVAILABLE_HANDOFF" ||
    status === "AVAILABLE"
  );
}

function getReportIsDelivered(report) {
  return (
    report?.passenger_delivered === true ||
    safeUpper(report?.tracking_status) === "COMPLETED"
  );
}

function getReportIsWaitingHandoff(report) {
  return (
    report?.available_for_handoff === true ||
    safeUpper(report?.tracking_status) === "WAITING_HANDOFF"
  );
}

function normalizeInventoryRow(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    wheelchair_number: cleanWheelchairNumber(
      data?.wheelchair_number || snapshot.id
    ),
    location: safeText(data?.location),
    passenger_name: safeText(data?.passenger_name),
    airline: safeUpper(data?.airline),
    flight_number: safeUpper(data?.flight_number),
    pnr: cleanPnr(data?.pnr),
    wch_type: safeUpper(data?.wch_type || "WCHR"),
    previous_agent_name: safeText(data?.previous_agent_name),
    previous_agent_id: safeText(data?.previous_agent_id),
    report_doc_id: safeText(
      data?.report_doc_id || data?.assigned_report_doc_id
    ),
    report_id: safeText(data?.report_id || data?.assigned_report_id),
    status: buildInventoryStatus(data),
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
  style = {},
}) {
  const styles = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
      color: "#ffffff",
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
      color: "#ffffff",
      border: "none",
      boxShadow: "0 12px 24px rgba(22,163,74,0.18)",
    },
    warning: {
      background: "#f59e0b",
      color: "#ffffff",
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
        opacity: disabled ? 0.6 : 1,
        ...styles[variant],
        ...style,
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

function EditInput({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  disabled = false,
}) {
  return (
    <div>
      {label ? <FieldLabel>{label}</FieldLabel> : null}

      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          border: "1px solid #dbeafe",
          background: disabled ? "#f1f5f9" : "#ffffff",
          borderRadius: 14,
          padding: "12px 14px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          boxSizing: "border-box",
          opacity: disabled ? 0.75 : 1,
        }}
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options = [],
  disabled = false,
}) {
  return (
    <div>
      {label ? <FieldLabel>{label}</FieldLabel> : null}

      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          border: "1px solid #dbeafe",
          background: disabled ? "#f1f5f9" : "#ffffff",
          borderRadius: 14,
          padding: "12px 14px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          boxSizing: "border-box",
          opacity: disabled ? 0.75 : 1,
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
          lineHeight: 1.4,
          wordBreak: "break-word",
          ...tones[tone],
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function StatusCard({
  parsed,
  user,
  startLocation,
  isContinuingService = false,
}) {
  const agentName = getAgentDisplayName(user) || "—";

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
          label="Pickup Location"
          value={`📍 ${startLocation || "Counter"}`}
          tone="blue"
        />

        <StatusPill
          label="Status"
          value={
            isContinuingService
              ? "🟠 Continuing Service"
              : "🟢 New Service"
          }
          tone={isContinuingService ? "amber" : "green"}
        />

        <StatusPill
          label="Assigned Agent"
          value={agentName}
          tone="slate"
        />

        <StatusPill
          label="Wheelchair"
          value={parsed?.wheelchair_number || "—"}
          tone="slate"
        />
      </div>

      <div
        style={{
          marginTop: 14,
          background: isContinuingService ? "#eff6ff" : "#fffbeb",
          border: isContinuingService
            ? "1px solid #bfdbfe"
            : "1px solid #fde68a",
          borderRadius: 16,
          padding: "12px 14px",
          color: isContinuingService ? "#1d4ed8" : "#92400e",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        {isContinuingService
          ? "The passenger information is linked to the original report. Your service time begins when you accept this wheelchair."
          : "The wheelchair remains assigned to your profile until you mark the passenger as delivered or leave the wheelchair at an approved handoff location."}
      </div>
    </PageCard>
  );
}

function ActiveServiceCard({
  service,
  deliveryLocation,
  setDeliveryLocation,
  onDelivered,
  delivering,
  handoffLocation,
  setHandoffLocation,
  onHandoff,
  savingHandoff,
}) {
  if (!service?.is_active) return null;

  const currentLocation = safeText(service.current_location) || "Unknown";
  const wheelchairNumber = service.wheelchair_number || "—";

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
            Wheelchair {wheelchairNumber}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            You cannot accept another wheelchair until this service is
            delivered or transferred at an approved handoff location.
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
          value={
            service.flight_number
              ? `${service.airline || ""} ${service.flight_number}`.trim()
              : "—"
          }
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
          This service appears to be at a final destination. Please click
          Passenger Delivered after the passenger is handed off.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 18,
          border: "1px solid #bbf7d0",
          background: "#f0fdf4",
        }}
      >
        <div
          style={{
            marginBottom: 12,
            color: "#166534",
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.55,
          }}
        >
          Use Passenger Delivered only when the passenger reaches the gate or
          Main Terminal.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
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
            disabled={delivering || savingHandoff || !deliveryLocation}
            style={{ minHeight: 45 }}
          >
            {delivering
              ? "Saving Delivery..."
              : "Passenger Delivered"}
          </ActionButton>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 18,
          border: "1px solid #bfdbfe",
          background: "#eff6ff",
        }}
      >
        <div
          style={{
            marginBottom: 12,
            color: "#1d4ed8",
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.55,
          }}
        >
          Use Leave for Next Employee when the wheelchair and passenger are
          transferred at Outside TSA, TSA, Outside CBP or CBP. This keeps the
          passenger report open.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            alignItems: "end",
          }}
        >
          <SelectInput
            label="Handoff Location"
            value={handoffLocation}
            onChange={setHandoffLocation}
            options={HANDOFF_LOCATIONS}
          />

          <ActionButton
            variant="warning"
            onClick={onHandoff}
            disabled={savingHandoff || delivering || !handoffLocation}
            style={{ minHeight: 45 }}
          >
            {savingHandoff
              ? "Saving Handoff..."
              : "Leave for Next Employee"}
          </ActionButton>
        </div>
      </div>
    </PageCard>
  );
}

function AvailableWheelchairsCard({
  startLocation,
  loading,
  rows,
  selectedInventoryId,
  onSelect,
}) {
  if (!isHandoffLocation(startLocation)) {
    return null;
  }

  return (
    <PageCard
      style={{
        padding: 18,
        border: "1px solid #bfdbfe",
        background:
          "linear-gradient(135deg, rgba(239,246,255,0.98) 0%, rgba(255,255,255,0.98) 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#1d4ed8",
            }}
          >
            Wheelchairs Available at This Location
          </p>

          <h2
            style={{
              margin: "8px 0 4px",
              fontSize: 22,
              color: "#0f172a",
              fontWeight: 900,
            }}
          >
            {startLocation}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            {loading
              ? "Checking available wheelchairs..."
              : rows.length
              ? `Wheelchairs ${rows
                  .map((row) => row.wheelchair_number)
                  .join(", ")} are available. Which one will you take?`
              : `No wheelchairs are currently available at ${startLocation}.`}
          </p>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "8px 12px",
            background: "#dbeafe",
            color: "#1d4ed8",
            border: "1px solid #93c5fd",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {loading ? "LOADING" : `${rows.length} AVAILABLE`}
        </span>
      </div>

      {!loading && rows.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 16,
          }}
        >
          {rows.map((row) => {
            const selected = selectedInventoryId === row.id;

            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row)}
                style={{
                  width: "100%",
                  border: selected
                    ? "2px solid #1769aa"
                    : "1px solid #dbeafe",
                  borderRadius: 18,
                  padding: 14,
                  background: selected ? "#eaf6ff" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      Wheelchair {row.wheelchair_number || "—"}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      Passenger: {row.passenger_name || "—"} · Flight:{" "}
                      {row.airline || "—"} {row.flight_number || ""}
                    </div>
                  </div>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "7px 11px",
                      background: selected ? "#1769aa" : "#ecfdf5",
                      color: selected ? "#ffffff" : "#15803d",
                      border: selected
                        ? "1px solid #1769aa"
                        : "1px solid #bbf7d0",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {selected ? "SELECTED" : "AVAILABLE"}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <StatusPill
                    label="Location"
                    value={row.location || "—"}
                    tone="blue"
                  />

                  <StatusPill
                    label="PNR"
                    value={row.pnr || "—"}
                    tone="slate"
                  />

                  <StatusPill
                    label="Previous Agent"
                    value={row.previous_agent_name || "—"}
                    tone="slate"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PageCard>
  );
}

function SelectedHandoffCard({ wheelchair, onClear }) {
  if (!wheelchair) return null;

  return (
    <PageCard
      style={{
        padding: 18,
        border: "1px solid #a7f3d0",
        background:
          "linear-gradient(135deg, rgba(236,253,245,0.98) 0%, rgba(255,255,255,0.98) 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#15803d",
            }}
          >
            Existing Service Selected
          </p>

          <h2
            style={{
              margin: "8px 0 4px",
              fontSize: 22,
              color: "#0f172a",
              fontWeight: 900,
            }}
          >
            Continue Wheelchair {wheelchair.wheelchair_number || "—"}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Passenger and flight information were loaded automatically. Your
            service time will begin from {wheelchair.location || "the pickup location"}.
          </p>
        </div>

        <ActionButton
          type="button"
          variant="secondary"
          onClick={onClear}
        >
          Choose Another
        </ActionButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginTop: 16,
        }}
      >
        <StatusPill
          label="Passenger"
          value={wheelchair.passenger_name || "—"}
          tone="slate"
        />

        <StatusPill
          label="Flight"
          value={
            wheelchair.flight_number
              ? `${wheelchair.airline || ""} ${
                  wheelchair.flight_number
                }`.trim()
              : "—"
          }
          tone="slate"
        />

        <StatusPill
          label="PNR"
          value={wheelchair.pnr || "—"}
          tone="slate"
        />

        <StatusPill
          label="Pickup Location"
          value={wheelchair.location || "—"}
          tone="blue"
        />
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

  const [deliveryLocation, setDeliveryLocation] =
    useState("Main Terminal");
  const [delivering, setDelivering] = useState(false);

  const [handoffLocation, setHandoffLocation] =
    useState("Outside TSA");
  const [savingHandoff, setSavingHandoff] = useState(false);

  const [availableWheelchairs, setAvailableWheelchairs] = useState([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState(null);
  const [acceptingInventory, setAcceptingInventory] = useState(false);

  const scanUrl = import.meta.env.VITE_WCHR_SCAN_URL;

  const currentAgentId = getAgentSessionId(user);
  const currentAgentName = getAgentDisplayName(user);

  const hasActiveService = Boolean(
    activeService?.is_active === true &&
      safeUpper(activeService?.tracking_status) !== "COMPLETED" &&
      safeUpper(activeService?.tracking_status) !== "HANDOFF"
  );

  const selectedInventoryId = selectedInventory?.id || "";

  const continuingExistingService = Boolean(
    selectedInventory?.report_doc_id
  );

  useEffect(() => {
    if (!currentAgentId) {
      setSessionLoading(false);
      setActiveService(null);
      return undefined;
    }

    setSessionLoading(true);

    const sessionRef = doc(
      db,
      AGENT_SESSIONS_COLLECTION,
      currentAgentId
    );

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

          const sessionStatus = safeUpper(
            sessionData?.tracking_status
          );

          const sessionIsActive =
            sessionData?.is_active === true &&
            sessionStatus !== "COMPLETED" &&
            sessionStatus !== "HANDOFF";

          if (!sessionIsActive) {
            setActiveService(null);
            setSessionLoading(false);
            return;
          }

          if (!sessionData.report_doc_id) {
            setActiveService(sessionData);
            setSessionLoading(false);
            return;
          }

          try {
            const reportRef = doc(
              db,
              REPORTS_COLLECTION,
              sessionData.report_doc_id
            );

            const reportSnapshot = await getDoc(reportRef);

            if (!reportSnapshot.exists()) {
              await setDoc(
                sessionRef,
                {
                  is_active: false,
                  tracking_status: "CANCELLED",
                  active_report_id: "",
                  report_doc_id: "",
                  inventory_doc_id: "",
                  service_segment_id: "",
                  updated_at: serverTimestamp(),
                },
                { merge: true }
              );

              setActiveService(null);
              setSessionLoading(false);
              return;
            }

            const reportData = {
              id: reportSnapshot.id,
              ...reportSnapshot.data(),
            };

            const reportDelivered = getReportIsDelivered(reportData);
            const reportWaitingHandoff =
              getReportIsWaitingHandoff(reportData);

            if (reportDelivered || reportWaitingHandoff) {
              await setDoc(
                sessionRef,
                {
                  is_active: false,
                  tracking_status: reportDelivered
                    ? "COMPLETED"
                    : "HANDOFF",
                  active_report_id: "",
                  report_doc_id: "",
                  inventory_doc_id: "",
                  service_segment_id: "",
                  completed_at: serverTimestamp(),
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

              report_doc_id: reportSnapshot.id,

              report_id:
                reportData.report_id ||
                sessionData.report_id ||
                "",

              inventory_doc_id:
                sessionData.inventory_doc_id ||
                reportData.inventory_doc_id ||
                getWheelchairDocumentId(
                  reportData.wheelchair_number ||
                    sessionData.wheelchair_number
                ),

              service_segment_id:
                sessionData.service_segment_id ||
                reportData.current_segment_id ||
                "",

              passenger_name:
                reportData.passenger_name ||
                sessionData.passenger_name ||
                "",

              airline:
                reportData.airline ||
                sessionData.airline ||
                "",

              wheelchair_number:
                reportData.wheelchair_number ||
                sessionData.wheelchair_number ||
                "",

              flight_number:
                reportData.flight_number ||
                sessionData.flight_number ||
                "",

              pnr:
                reportData.pnr ||
                sessionData.pnr ||
                "",

              current_location:
                reportData.current_location ||
                sessionData.current_location ||
                "",

              tracking_status:
                reportData.tracking_status ||
                sessionData.tracking_status ||
                "IN_PROGRESS",

              passenger_delivered:
                reportData.passenger_delivered === true,

              is_active: true,

              started_at:
                reportData.current_segment_started_at ||
                sessionData.started_at ||
                reportData.pickup_at ||
                reportData.submitted_at ||
                null,
            });
          } catch (reportError) {
            console.error(
              "Error validating active WCHR report:",
              reportError
            );

            setActiveService(sessionData);
          }

          setSessionLoading(false);
        } catch (sessionError) {
          console.error(
            "Error reading WCHR agent session:",
            sessionError
          );

          setError(
            sessionError?.message ||
              "Unable to load the active wheelchair service."
          );

          setSessionLoading(false);
        }
      },
      (snapshotError) => {
        console.error(
          "WCHR agent session listener failed:",
          snapshotError
        );

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
    const currentLocation = safeText(
      activeService?.current_location
    );

    if (isDeliveryLocation(currentLocation)) {
      setDeliveryLocation(currentLocation);
    }

    if (isHandoffLocation(currentLocation)) {
      setHandoffLocation(currentLocation);
    }
  }, [activeService?.current_location]);

  useEffect(() => {
    setSelectedInventory(null);
    setAvailableWheelchairs([]);

    if (
      !startLocation ||
      !isHandoffLocation(startLocation) ||
      hasActiveService ||
      sessionLoading
    ) {
      setAvailableLoading(false);
      return undefined;
    }

    setAvailableLoading(true);

    const inventoryQuery = query(
      collection(db, INVENTORY_COLLECTION),
      where("location", "==", startLocation)
    );

    const unsubscribe = onSnapshot(
      inventoryQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map(normalizeInventoryRow)
          .filter((row) =>
            inventoryIsAvailableAtLocation(row, startLocation)
          )
          .sort((first, second) =>
            String(first.wheelchair_number || "").localeCompare(
              String(second.wheelchair_number || ""),
              undefined,
              {
                numeric: true,
                sensitivity: "base",
              }
            )
          );

        setAvailableWheelchairs(rows);
        setAvailableLoading(false);

        setSelectedInventory((previous) => {
          if (!previous?.id) return null;

          const updatedRow =
            rows.find((row) => row.id === previous.id) || null;

          return updatedRow;
        });
      },
      (inventoryError) => {
        console.error(
          "Error loading wheelchairs by location:",
          inventoryError
        );

        setError(
          inventoryError?.message ||
            "Unable to load wheelchairs available at this location."
        );

        setAvailableWheelchairs([]);
        setAvailableLoading(false);
      }
    );

    return () => unsubscribe();
  }, [
    startLocation,
    hasActiveService,
    sessionLoading,
  ]);

  useEffect(() => {
    if (!selectedInventory) return;

    setMode("existing");
    setStep("existing-preview");

    setWchType(
      safeUpper(selectedInventory.wch_type || "WCHR")
    );

    setParsed({
      passenger_name:
        selectedInventory.passenger_name || "",
      airline:
        selectedInventory.airline || "",
      flight_number:
        selectedInventory.flight_number || "",
      pnr:
        selectedInventory.pnr || "",
      wheelchair_number:
        selectedInventory.wheelchair_number || "",
      raw_text: "",
    });

    if (
      selectedInventory.location &&
      selectedInventory.location !== startLocation
    ) {
      setStartLocation(selectedInventory.location);
    }

    setImageFile(null);
    setImageUrl("");
    setError("");
    setMessage("");
  }, [selectedInventoryId]);

  const canScan = useMemo(() => {
    return Boolean(
      imageFile &&
        !hasActiveService &&
        !sessionLoading &&
        !selectedInventory
    );
  }, [
    imageFile,
    hasActiveService,
    sessionLoading,
    selectedInventory,
  ]);

  const canSubmitNewService = useMemo(() => {
    if (
      hasActiveService ||
      sessionLoading ||
      selectedInventory
    ) {
      return false;
    }

    const requiredValues = [
      parsed.passenger_name,
      parsed.flight_number,
      parsed.pnr,
      parsed.wheelchair_number,
      wchType,
      startLocation,
    ];

    const fieldsComplete = requiredValues.every(
      (value) => safeText(value).length > 0
    );

    if (!fieldsComplete) {
      return false;
    }

    if (mode === "scan") {
      return Boolean(imageUrl);
    }

    return mode === "manual";
  }, [
    hasActiveService,
    sessionLoading,
    selectedInventory,
    parsed,
    wchType,
    startLocation,
    mode,
    imageUrl,
  ]);

  const canAcceptExistingService = useMemo(() => {
    return Boolean(
      selectedInventory?.id &&
        selectedInventory?.report_doc_id &&
        selectedInventory?.wheelchair_number &&
        startLocation &&
        !hasActiveService &&
        !sessionLoading &&
        !acceptingInventory
    );
  }, [
    selectedInventory,
    startLocation,
    hasActiveService,
    sessionLoading,
    acceptingInventory,
  ]);

  const resetNewEntryForm = (nextMode = mode) => {
    setParsed(emptyParsed());
    setImageFile(null);
    setImageUrl("");

    if (nextMode === "scan") {
      setStep("upload");
    } else if (nextMode === "manual") {
      setStep("manual");
    } else {
      setStep("upload");
    }
  };

  const clearSelectedInventory = () => {
    setSelectedInventory(null);
    setMode("scan");
    setStep("upload");
    setParsed(emptyParsed());
    setImageFile(null);
    setImageUrl("");
    setError("");
    setMessage("");
  };

  const handleSelectInventory = (inventoryRow) => {
    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Complete or transfer that service before accepting another wheelchair.`
      );
      return;
    }

    setSelectedInventory(inventoryRow);
  };

  const handlePickFile = (file) => {
    setError("");
    setMessage("");
    setSelectedInventory(null);
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

    const safeFileName = String(
      file?.name || "boarding-pass.jpg"
    ).replace(/[^a-zA-Z0-9._-]/g, "_");

    const path =
      `wch_reports/${safeUser}/${yyyymmdd()}/` +
      `${Date.now()}-${safeFileName}`;

    const storageReference = ref(storage, path);

    await uploadBytes(storageReference, file, {
      contentType: file?.type || "image/jpeg",
    });

    return getDownloadURL(storageReference);
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
      const responseText = await response
        .text()
        .catch(() => "");

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
        } assigned. Mark the passenger as delivered or transfer the service before taking another wheelchair.`
      );
      return;
    }

    if (!imageFile) {
      setError("Please select a boarding pass photo.");
      return;
    }

    try {
      setStep("scanning");

      const uploadedImageUrl =
        await uploadToStorage(imageFile);

      setImageUrl(uploadedImageUrl);

      const scanResult =
        await callScanService(uploadedImageUrl);

      const rawText = getRawScanText(scanResult);

      const normalized = {
        passenger_name: guessPassengerName(
          scanResult,
          rawText
        ),

        airline: safeUpper(
          scanResult?.airline || ""
        ),

        flight_number: safeUpper(
          scanResult?.flight_number ||
            scanResult?.flight ||
            ""
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
        scanError?.message ||
          "Unexpected error while scanning the boarding pass."
      );
    }
  };

  const createAgentSession = async ({
    reportDocId,
    reportId,
    inventoryDocId,
    serviceSegmentId,
    wheelchairNumber,
    passengerName,
    airline,
    pnr,
    flightNumber,
    currentLocation,
  }) => {
    if (!currentAgentId) {
      throw new Error(
        "The employee profile does not have a valid user ID or username."
      );
    }

    const sessionRef = doc(
      db,
      AGENT_SESSIONS_COLLECTION,
      currentAgentId
    );

    await setDoc(
      sessionRef,
      {
        agent_id: currentAgentId,
        agent_name: currentAgentName,

        agent_username:
          user?.username ||
          user?.loginUsername ||
          user?.email ||
          "",

        report_doc_id: reportDocId,
        active_report_id: reportDocId,
        report_id: reportId,

        inventory_doc_id: inventoryDocId,
        service_segment_id: serviceSegmentId,

        wheelchair_number: wheelchairNumber,
        passenger_name: passengerName,
        airline,
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
      setError(
        "Please wait while the active wheelchair service is verified."
      );
      return;
    }

    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Complete or transfer that service before taking another wheelchair.`
      );
      return;
    }

    if (selectedInventory) {
      setError(
        "An existing wheelchair service is selected. Use Continue Existing Service or choose another entry method."
      );
      return;
    }

    if (!canSubmitNewService) {
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

      const finalAirline = safeUpper(
        parsed.airline || "WCHR"
      );

      const finalFlightNumber = safeUpper(
        parsed.flight_number
      );

      const finalStartLocation = safeText(
        startLocation || "Counter"
      );

      const inventoryDocumentId =
        getWheelchairDocumentId(finalWheelchairNumber);

      if (!inventoryDocumentId) {
        throw new Error(
          "The wheelchair number is not valid."
        );
      }

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        inventoryDocumentId
      );

      const reportRef = doc(
        collection(db, REPORTS_COLLECTION)
      );

      const segmentRef = doc(
        collection(db, SERVICE_SEGMENTS_COLLECTION)
      );

      const trackingEventRef = doc(
        collection(db, TRACKING_EVENTS_COLLECTION)
      );

      const sessionRef = doc(
        db,
        AGENT_SESSIONS_COLLECTION,
        currentAgentId
      );

      const reportId = `WCHR-${yyyymmdd()}-${reportRef.id
        .slice(-6)
        .toUpperCase()}`;

      const flightKey = buildFlightKey(
        finalAirline,
        finalFlightNumber,
        now
      );

      await runTransaction(db, async (transaction) => {
        const sessionSnapshot =
          await transaction.get(sessionRef);

        if (sessionSnapshot.exists()) {
          const sessionData = sessionSnapshot.data();

          const sessionStillActive =
            sessionData?.is_active === true &&
            !["COMPLETED", "HANDOFF", "CANCELLED"].includes(
              safeUpper(sessionData?.tracking_status)
            );

          if (sessionStillActive) {
            throw new Error(
              `You already have wheelchair ${
                sessionData?.wheelchair_number || ""
              } assigned. Complete or transfer it before taking another wheelchair.`
            );
          }
        }

        const inventorySnapshot =
          await transaction.get(inventoryRef);

        if (inventorySnapshot.exists()) {
          const inventoryData =
            inventorySnapshot.data();

          const inventoryStatus =
            buildInventoryStatus(inventoryData);

          const unavailable =
            inventoryData?.is_available === false &&
            inventoryData?.available_for_handoff !== true &&
            inventoryStatus !== "AVAILABLE" &&
            inventoryStatus !== "AVAILABLE_HANDOFF";

          if (unavailable) {
            throw new Error(
              `Wheelchair ${finalWheelchairNumber} is already in use.`
            );
          }
        }

        transaction.set(reportRef, {
          report_id: reportId,

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
          airline: finalAirline,
          flight_number: finalFlightNumber,
          pnr: finalPnr,
          wheelchair_number: finalWheelchairNumber,
          wch_type: safeUpper(wchType || "WCHR"),

          status: "NEW",
          flight_key: flightKey,

          image_url:
            mode === "scan" ? imageUrl : "",

          raw_text: parsed.raw_text || "",
          entry_mode: mode,

          wchr_agent_id: currentAgentId,
          wchr_agent_name: currentAgentName,
          assigned_wchr_agent: currentAgentName,
          activity_agent_name: currentAgentName,

          original_agent_id: currentAgentId,
          original_agent_name: currentAgentName,

          billing_ready: true,
          billing_date: serverTimestamp(),
          billing_passenger_name: finalPassengerName,
          billing_pnr: finalPnr,
          billing_wheelchair_number:
            finalWheelchairNumber,

          tracking_enabled: true,
          tracking_status: "IN_PROGRESS",
          passenger_delivered: false,

          current_location: finalStartLocation,
          last_location: finalStartLocation,

          pickup_location: finalStartLocation,
          pickup_at: serverTimestamp(),

          initial_pickup_location:
            finalStartLocation,
          initial_pickup_at: serverTimestamp(),

          gate_location: "",
          gate_arrived_at: null,

          delivered_location: "",
          delivered_at: null,

          dropoff_location: "",
          dropoff_at: null,

          handoff_location: "",
          handed_off_at: null,
          available_for_handoff: false,

          stored_location: "",
          stored_at: null,

          inventory_doc_id:
            inventoryDocumentId,

          current_segment_id: segmentRef.id,
          current_segment_started_at:
            serverTimestamp(),
          current_segment_start_location:
            finalStartLocation,

          segment_count: 1,

          is_active: true,
          alerts_enabled: true,
          alert_after_minutes: 30,
          last_alert_at: null,

          last_location_update_at:
            serverTimestamp(),

          last_updated_by: currentAgentName,
          last_updated_by_id: currentAgentId,
          last_updated_at: serverTimestamp(),

          tracking_type: "MANUAL",
          tracking_device_id: "",
          tracking_device_label: "",
        });

        transaction.set(segmentRef, {
          report_doc_id: reportRef.id,
          report_id: reportId,

          segment_number: 1,

          wheelchair_number:
            finalWheelchairNumber,

          passenger_name: finalPassengerName,
          airline: finalAirline,
          flight_number: finalFlightNumber,
          pnr: finalPnr,

          agent_id: currentAgentId,
          agent_name: currentAgentName,

          start_location: finalStartLocation,
          started_at: serverTimestamp(),

          end_location: "",
          ended_at: null,

          segment_status: "IN_PROGRESS",
          segment_result: "",

          is_active: true,

          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.set(inventoryRef, {
          wheelchair_number:
            finalWheelchairNumber,

          status: "IN_USE",
          is_available: false,
          available_for_handoff: false,

          location: finalStartLocation,

          report_doc_id: reportRef.id,
          assigned_report_doc_id:
            reportRef.id,

          report_id: reportId,
          assigned_report_id: reportId,

          passenger_name: finalPassengerName,
          airline: finalAirline,
          flight_number: finalFlightNumber,
          pnr: finalPnr,
          wch_type: safeUpper(wchType || "WCHR"),

          current_agent_id: currentAgentId,
          current_agent_name:
            currentAgentName,

          previous_agent_id: "",
          previous_agent_name: "",

          assigned_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.set(sessionRef, {
          agent_id: currentAgentId,
          agent_name: currentAgentName,

          agent_username:
            user?.username ||
            user?.loginUsername ||
            user?.email ||
            "",

          report_doc_id: reportRef.id,
          active_report_id: reportRef.id,
          report_id: reportId,

          inventory_doc_id:
            inventoryDocumentId,

          service_segment_id:
            segmentRef.id,

          wheelchair_number:
            finalWheelchairNumber,

          passenger_name: finalPassengerName,
          airline: finalAirline,
          pnr: finalPnr,
          flight_number: finalFlightNumber,

          current_location:
            finalStartLocation,

          tracking_status: "IN_PROGRESS",
          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,
          alert_after_minutes: 30,

          started_at: serverTimestamp(),
          last_location_update_at:
            serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.set(trackingEventRef, {
          report_doc_id: reportRef.id,
          report_id: reportId,

          service_segment_id:
            segmentRef.id,

          wheelchair_number:
            finalWheelchairNumber,

          passenger_name: finalPassengerName,
          airline: finalAirline,
          pnr: finalPnr,
          flight_number: finalFlightNumber,

          event_type: "START_SERVICE",

          location: finalStartLocation,
          previous_location: "",

          notes: `Wheelchair service started at ${finalStartLocation}`,

          tracking_status: "IN_PROGRESS",
          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,

          employee_id: currentAgentId,
          employee_name: currentAgentName,

          created_at: serverTimestamp(),
        });
      });

      setMessage(
        `Wheelchair ${finalWheelchairNumber} is now assigned to your profile.`
      );

      resetNewEntryForm(mode);
    } catch (submitError) {
      console.error(
        "Error starting WCHR service:",
        submitError
      );

      setStep(
        mode === "scan" ? "preview" : "manual"
      );

      setError(
        submitError?.message ||
          "Unexpected error while starting the wheelchair service."
      );
    }
  };

  const handleAcceptExistingService = async () => {
    setError("");
    setMessage("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (sessionLoading) {
      setError(
        "Please wait while your active wheelchair service is verified."
      );
      return;
    }

    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Complete or transfer it before accepting another wheelchair.`
      );
      return;
    }

    if (!selectedInventory?.id) {
      setError(
        "Please select a wheelchair available at this location."
      );
      return;
    }

    if (!selectedInventory.report_doc_id) {
      setError(
        "This wheelchair is not linked to an active passenger report."
      );
      return;
    }

    if (!canAcceptExistingService) {
      setError(
        "The selected wheelchair cannot be accepted at this time."
      );
      return;
    }

    try {
      setAcceptingInventory(true);

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        selectedInventory.id
      );

      const reportRef = doc(
        db,
        REPORTS_COLLECTION,
        selectedInventory.report_doc_id
      );

      const sessionRef = doc(
        db,
        AGENT_SESSIONS_COLLECTION,
        currentAgentId
      );

      const segmentRef = doc(
        collection(db, SERVICE_SEGMENTS_COLLECTION)
      );

      const trackingEventRef = doc(
        collection(db, TRACKING_EVENTS_COLLECTION)
      );

      let acceptedService = null;

      await runTransaction(db, async (transaction) => {
        const [
          inventorySnapshot,
          reportSnapshot,
          sessionSnapshot,
        ] = await Promise.all([
          transaction.get(inventoryRef),
          transaction.get(reportRef),
          transaction.get(sessionRef),
        ]);

        if (!inventorySnapshot.exists()) {
          throw new Error(
            "This wheelchair is no longer available."
          );
        }

        if (!reportSnapshot.exists()) {
          throw new Error(
            "The passenger report linked to this wheelchair no longer exists."
          );
        }

        if (sessionSnapshot.exists()) {
          const sessionData =
            sessionSnapshot.data();

          const sessionStillActive =
            sessionData?.is_active === true &&
            !["COMPLETED", "HANDOFF", "CANCELLED"].includes(
              safeUpper(
                sessionData?.tracking_status
              )
            );

          if (sessionStillActive) {
            throw new Error(
              `You already have wheelchair ${
                sessionData?.wheelchair_number || ""
              } assigned.`
            );
          }
        }

        const inventoryData =
          inventorySnapshot.data();

        const reportData =
          reportSnapshot.data();

        if (
          !inventoryIsAvailableAtLocation(
            inventoryData,
            startLocation
          )
        ) {
          throw new Error(
            `Wheelchair ${
              inventoryData?.wheelchair_number ||
              selectedInventory.wheelchair_number
            } is no longer available at ${startLocation}.`
          );
        }

        if (getReportIsDelivered(reportData)) {
          throw new Error(
            "This passenger was already marked as delivered."
          );
        }

        if (!getReportIsWaitingHandoff(reportData)) {
          throw new Error(
            "This passenger report is not waiting for a new employee."
          );
        }

        const wheelchairNumber =
          cleanWheelchairNumber(
            inventoryData?.wheelchair_number ||
              reportData?.wheelchair_number ||
              selectedInventory.wheelchair_number
          );

        const passengerName =
          safeText(
            reportData?.passenger_name ||
              inventoryData?.passenger_name
          );

        const airline =
          safeUpper(
            reportData?.airline ||
              inventoryData?.airline
          );

        const flightNumber =
          safeUpper(
            reportData?.flight_number ||
              inventoryData?.flight_number
          );

        const pnr =
          cleanPnr(
            reportData?.pnr ||
              inventoryData?.pnr
          );

        const reportId =
          safeText(
            reportData?.report_id ||
              inventoryData?.report_id
          );

        const segmentNumber =
          Number(reportData?.segment_count || 1) + 1;

        transaction.set(segmentRef, {
          report_doc_id: reportSnapshot.id,
          report_id: reportId,

          segment_number: segmentNumber,

          wheelchair_number:
            wheelchairNumber,

          passenger_name: passengerName,
          airline,
          flight_number: flightNumber,
          pnr,

          agent_id: currentAgentId,
          agent_name: currentAgentName,

          previous_agent_id:
            safeText(
              inventoryData?.previous_agent_id
            ),

          previous_agent_name:
            safeText(
              inventoryData?.previous_agent_name
            ),

          start_location: startLocation,
          started_at: serverTimestamp(),

          end_location: "",
          ended_at: null,

          segment_status: "IN_PROGRESS",
          segment_result: "",

          is_active: true,

          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.update(reportRef, {
          wchr_agent_id: currentAgentId,
          wchr_agent_name:
            currentAgentName,
          assigned_wchr_agent:
            currentAgentName,
          activity_agent_name:
            currentAgentName,

          previous_wchr_agent_id:
            safeText(
              inventoryData?.previous_agent_id
            ),

          previous_wchr_agent_name:
            safeText(
              inventoryData?.previous_agent_name
            ),

          tracking_status: "IN_PROGRESS",
          passenger_delivered: false,

          available_for_handoff: false,
          handoff_location: "",
          handoff_accepted_at:
            serverTimestamp(),

          current_location: startLocation,
          last_location: startLocation,

          current_segment_id:
            segmentRef.id,

          current_segment_started_at:
            serverTimestamp(),

          current_segment_start_location:
            startLocation,

          segment_count: segmentNumber,

          is_active: true,
          alerts_enabled: true,

          last_location_update_at:
            serverTimestamp(),

          last_updated_by:
            currentAgentName,

          last_updated_by_id:
            currentAgentId,

          last_updated_at:
            serverTimestamp(),
        });

        transaction.update(inventoryRef, {
          status: "IN_USE",
          is_available: false,
          available_for_handoff: false,

          location: startLocation,

          current_agent_id:
            currentAgentId,

          current_agent_name:
            currentAgentName,

          previous_agent_id:
            safeText(
              inventoryData?.previous_agent_id
            ),

          previous_agent_name:
            safeText(
              inventoryData?.previous_agent_name
            ),

          accepted_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });

        transaction.set(sessionRef, {
          agent_id: currentAgentId,
          agent_name: currentAgentName,

          agent_username:
            user?.username ||
            user?.loginUsername ||
            user?.email ||
            "",

          report_doc_id:
            reportSnapshot.id,

          active_report_id:
            reportSnapshot.id,

          report_id: reportId,

          inventory_doc_id:
            inventorySnapshot.id,

          service_segment_id:
            segmentRef.id,

          wheelchair_number:
            wheelchairNumber,

          passenger_name:
            passengerName,

          airline,
          pnr,
          flight_number:
            flightNumber,

          current_location:
            startLocation,

          tracking_status: "IN_PROGRESS",
          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,
          alert_after_minutes: Number(
            reportData?.alert_after_minutes || 30
          ),

          started_at:
            serverTimestamp(),

          last_location_update_at:
            serverTimestamp(),

          updated_at:
            serverTimestamp(),
        });

        transaction.set(trackingEventRef, {
          report_doc_id:
            reportSnapshot.id,

          report_id: reportId,

          service_segment_id:
            segmentRef.id,

          wheelchair_number:
            wheelchairNumber,

          passenger_name:
            passengerName,

          airline,
          pnr,
          flight_number:
            flightNumber,

          event_type: "HANDOFF_ACCEPTED",

          location: startLocation,
          previous_location:
            startLocation,

          notes:
            `Wheelchair ${wheelchairNumber} accepted by ` +
            `${currentAgentName} at ${startLocation}`,

          tracking_status:
            "IN_PROGRESS",

          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,

          employee_id:
            currentAgentId,

          employee_name:
            currentAgentName,

          created_at:
            serverTimestamp(),
        });

        acceptedService = {
          report_doc_id:
            reportSnapshot.id,

          report_id: reportId,

          inventory_doc_id:
            inventorySnapshot.id,

          service_segment_id:
            segmentRef.id,

          wheelchair_number:
            wheelchairNumber,

          passenger_name:
            passengerName,

          airline,
          pnr,
          flight_number:
            flightNumber,

          current_location:
            startLocation,

          tracking_status:
            "IN_PROGRESS",

          passenger_delivered: false,
          is_active: true,

          started_at: Timestamp.now(),
        };
      });

      setActiveService(acceptedService);
      setSelectedInventory(null);
      setAvailableWheelchairs([]);

      setParsed(emptyParsed());
      setMode("scan");
      setStep("upload");

      setMessage(
        `Wheelchair ${
          acceptedService?.wheelchair_number || ""
        } is now assigned to you. Your service time started at ${startLocation}.`
      );
    } catch (acceptError) {
      console.error(
        "Error accepting existing WCHR service:",
        acceptError
      );

      setError(
        acceptError?.message ||
          "Unable to accept the selected wheelchair."
      );
    } finally {
      setAcceptingInventory(false);
    }
  };

  const handleLeaveForNextEmployee = async () => {
    setError("");
    setMessage("");

    if (!activeService?.report_doc_id) {
      setError(
        "The active wheelchair report could not be identified."
      );
      return;
    }

    const finalHandoffLocation =
      safeText(handoffLocation);

    if (!isHandoffLocation(finalHandoffLocation)) {
      setError(
        "Please select Outside TSA, TSA, Outside CBP or CBP as the handoff location."
      );
      return;
    }

    const confirmed = window.confirm(
      `Leave wheelchair ${
        activeService.wheelchair_number || ""
      } at ${finalHandoffLocation} for the next employee?\n\nThe passenger will remain active and will NOT be marked as delivered.`
    );

    if (!confirmed) return;

    try {
      setSavingHandoff(true);

      const reportRef = doc(
        db,
        REPORTS_COLLECTION,
        activeService.report_doc_id
      );

      const sessionRef = doc(
        db,
        AGENT_SESSIONS_COLLECTION,
        currentAgentId
      );

      const inventoryDocumentId =
        activeService.inventory_doc_id ||
        getWheelchairDocumentId(
          activeService.wheelchair_number
        );

      if (!inventoryDocumentId) {
        throw new Error(
          "The wheelchair inventory record could not be identified."
        );
      }

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        inventoryDocumentId
      );

      const trackingEventRef = doc(
        collection(db, TRACKING_EVENTS_COLLECTION)
      );

      const segmentRef = activeService.service_segment_id
        ? doc(
            db,
            SERVICE_SEGMENTS_COLLECTION,
            activeService.service_segment_id
          )
        : null;

      await runTransaction(db, async (transaction) => {
        const reportSnapshot =
          await transaction.get(reportRef);

        if (!reportSnapshot.exists()) {
          throw new Error(
            "The active passenger report no longer exists."
          );
        }

        const reportData =
          reportSnapshot.data();

        if (getReportIsDelivered(reportData)) {
          throw new Error(
            "This passenger was already marked as delivered."
          );
        }

        transaction.update(reportRef, {
          passenger_delivered: false,
          tracking_status: "WAITING_HANDOFF",

          available_for_handoff: true,

          handoff_location:
            finalHandoffLocation,

          handed_off_at:
            serverTimestamp(),

          handoff_by_agent_id:
            currentAgentId,

          handoff_by_agent_name:
            currentAgentName,

          current_location:
            finalHandoffLocation,

          last_location:
            safeText(
              activeService.current_location
            ),

          current_segment_id: "",

          is_active: true,
          alerts_enabled: true,

          last_location_update_at:
            serverTimestamp(),

          last_updated_by:
            currentAgentName,

          last_updated_by_id:
            currentAgentId,

          last_updated_at:
            serverTimestamp(),
        });

        transaction.set(
          inventoryRef,
          {
            wheelchair_number:
              cleanWheelchairNumber(
                activeService.wheelchair_number
              ),

            status: "AVAILABLE_HANDOFF",
            is_available: true,
            available_for_handoff: true,

            location:
              finalHandoffLocation,

            report_doc_id:
              activeService.report_doc_id,

            assigned_report_doc_id:
              activeService.report_doc_id,

            report_id:
              activeService.report_id || "",

            assigned_report_id:
              activeService.report_id || "",

            passenger_name:
              activeService.passenger_name || "",

            airline:
              activeService.airline || "",

            flight_number:
              activeService.flight_number || "",

            pnr:
              activeService.pnr || "",

            previous_agent_id:
              currentAgentId,

            previous_agent_name:
              currentAgentName,

            current_agent_id: "",
            current_agent_name: "",

            handed_off_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(
          sessionRef,
          {
            is_active: false,
            tracking_status: "HANDOFF",
            passenger_delivered: false,

            handoff_location:
              finalHandoffLocation,

            handed_off_at:
              serverTimestamp(),

            current_location:
              finalHandoffLocation,

            active_report_id: "",
            report_doc_id: "",
            inventory_doc_id: "",
            service_segment_id: "",

            completed_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),
          },
          { merge: true }
        );

        if (segmentRef) {
          transaction.update(segmentRef, {
            end_location:
              finalHandoffLocation,

            ended_at:
              serverTimestamp(),

            segment_status:
              "COMPLETED",

            segment_result:
              "HANDOFF",

            is_active: false,

            updated_at:
              serverTimestamp(),
          });
        }

        transaction.set(trackingEventRef, {
          report_doc_id:
            activeService.report_doc_id,

          report_id:
            activeService.report_id || "",

          service_segment_id:
            activeService.service_segment_id || "",

          wheelchair_number:
            activeService.wheelchair_number || "",

          passenger_name:
            activeService.passenger_name || "",

          airline:
            activeService.airline || "",

          pnr:
            activeService.pnr || "",

          flight_number:
            activeService.flight_number || "",

          event_type: "HANDOFF_AVAILABLE",

          location:
            finalHandoffLocation,

          previous_location:
            activeService.current_location || "",

          notes:
            `Wheelchair ${
              activeService.wheelchair_number || ""
            } left at ${finalHandoffLocation} for the next employee. Passenger remains active.`,

          tracking_status:
            "WAITING_HANDOFF",

          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,

          employee_id:
            currentAgentId,

          employee_name:
            currentAgentName,

          created_at:
            serverTimestamp(),
        });
      });

      setActiveService(null);

      setMessage(
        `Wheelchair ${
          activeService.wheelchair_number || ""
        } was left at ${finalHandoffLocation}. The passenger remains open for the next employee.`
      );

      setDeliveryLocation("Main Terminal");
      setHandoffLocation("Outside TSA");

      setMode("scan");
      setStep("upload");
      setParsed(emptyParsed());
      setImageFile(null);
      setImageUrl("");
    } catch (handoffError) {
      console.error(
        "Error leaving wheelchair for next employee:",
        handoffError
      );

      setError(
        handoffError?.message ||
          "Unable to leave the wheelchair for the next employee."
      );
    } finally {
      setSavingHandoff(false);
    }
  };
    const handlePassengerDelivered = async () => {
    setError("");
    setMessage("");

    if (!activeService?.report_doc_id) {
      setError(
        "The active wheelchair report could not be identified."
      );
      return;
    }

    const finalDestination = safeText(deliveryLocation);

    if (!isDeliveryLocation(finalDestination)) {
      setError(
        "Please select the gate or Main Terminal where the passenger was delivered."
      );
      return;
    }

    const confirmed = window.confirm(
      `Confirm passenger delivery for wheelchair ${
        activeService.wheelchair_number || ""
      } at ${finalDestination}?`
    );

    if (!confirmed) return;

    try {
      setDelivering(true);

      const reportRef = doc(
        db,
        REPORTS_COLLECTION,
        activeService.report_doc_id
      );

      const sessionRef = doc(
        db,
        AGENT_SESSIONS_COLLECTION,
        currentAgentId
      );

      const inventoryDocumentId =
        activeService.inventory_doc_id ||
        getWheelchairDocumentId(
          activeService.wheelchair_number
        );

      if (!inventoryDocumentId) {
        throw new Error(
          "The wheelchair inventory record could not be identified."
        );
      }

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        inventoryDocumentId
      );

      const trackingEventRef = doc(
        collection(db, TRACKING_EVENTS_COLLECTION)
      );

      const segmentRef = activeService.service_segment_id
        ? doc(
            db,
            SERVICE_SEGMENTS_COLLECTION,
            activeService.service_segment_id
          )
        : null;

      await runTransaction(db, async (transaction) => {
        const reportSnapshot = await transaction.get(reportRef);

        if (!reportSnapshot.exists()) {
          throw new Error(
            "The active wheelchair report no longer exists."
          );
        }

        const reportData = reportSnapshot.data();

        if (getReportIsDelivered(reportData)) {
          throw new Error(
            "This passenger was already marked as delivered."
          );
        }

        const previousLocation =
          safeText(
            reportData.current_location ||
              activeService.current_location
          ) || finalDestination;

        const reportPayload = {
          passenger_delivered: true,
          tracking_status: "COMPLETED",

          delivered_location: finalDestination,
          delivered_at: serverTimestamp(),

          dropoff_location: finalDestination,
          dropoff_at: serverTimestamp(),

          current_location: finalDestination,
          last_location: previousLocation,

          available_for_handoff: false,
          handoff_location: "",

          current_segment_id: "",

          is_active: false,
          alerts_enabled: false,

          last_location_update_at: serverTimestamp(),
          last_updated_at: serverTimestamp(),
          last_updated_by: currentAgentName,
          last_updated_by_id: currentAgentId,
        };

        if (
          isGateLocation(finalDestination) &&
          !reportData.gate_arrived_at
        ) {
          reportPayload.gate_location = finalDestination;
          reportPayload.gate_arrived_at = serverTimestamp();
        }

        transaction.update(reportRef, reportPayload);

        transaction.set(
          inventoryRef,
          {
            wheelchair_number: cleanWheelchairNumber(
              activeService.wheelchair_number
            ),

            status: "AVAILABLE",
            is_available: true,
            available_for_handoff: false,

            location: finalDestination,

            report_doc_id: "",
            assigned_report_doc_id: "",
            report_id: "",
            assigned_report_id: "",

            passenger_name: "",
            airline: "",
            flight_number: "",
            pnr: "",

            previous_agent_id: currentAgentId,
            previous_agent_name: currentAgentName,

            current_agent_id: "",
            current_agent_name: "",

            passenger_delivered_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(
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
            inventory_doc_id: "",
            service_segment_id: "",

            completed_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          },
          { merge: true }
        );

        if (segmentRef) {
          transaction.update(segmentRef, {
            end_location: finalDestination,
            ended_at: serverTimestamp(),

            segment_status: "COMPLETED",
            segment_result: "PASSENGER_DELIVERED",

            is_active: false,
            updated_at: serverTimestamp(),
          });
        }

        transaction.set(trackingEventRef, {
          report_doc_id: activeService.report_doc_id,
          report_id: activeService.report_id || "",

          service_segment_id:
            activeService.service_segment_id || "",

          wheelchair_number:
            activeService.wheelchair_number || "",

          passenger_name:
            activeService.passenger_name || "",

          airline: activeService.airline || "",
          pnr: activeService.pnr || "",
          flight_number:
            activeService.flight_number || "",

          event_type: "PASSENGER_DELIVERED",

          location: finalDestination,
          previous_location: previousLocation,

          notes: `Passenger delivered at ${finalDestination}`,

          tracking_status: "COMPLETED",
          passenger_delivered: true,

          is_active: false,
          alerts_enabled: false,

          employee_id: currentAgentId,
          employee_name: currentAgentName,

          created_at: serverTimestamp(),
        });
      });

      setActiveService(null);
      setDeliveryLocation("Main Terminal");
      setHandoffLocation("Outside TSA");

      setMessage(
        `Passenger delivered at ${finalDestination}. You may now accept another wheelchair.`
      );

      setMode("scan");
      setStep("upload");
      setParsed(emptyParsed());
      setImageFile(null);
      setImageUrl("");
      setSelectedInventory(null);
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
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
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
          color: "#ffffff",
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
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
              Start a new passenger service or continue a
              wheelchair left at TSA or CBP by another
              employee.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <ActionButton
              onClick={() =>
                navigate("/wchr/my-reports")
              }
              variant="secondary"
            >
              My Reports
            </ActionButton>

            <ActionButton
              onClick={() => navigate("/dashboard")}
              variant="secondary"
            >
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {(error || message) && (
        <PageCard style={{ padding: 16 }}>
          <div
            style={{
              background: error
                ? "#fff1f2"
                : "#ecfdf5",
              border: `1px solid ${
                error ? "#fecdd3" : "#a7f3d0"
              }`,
              borderRadius: 16,
              padding: "14px 16px",
              color: error
                ? "#9f1239"
                : "#065f46",
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
          handoffLocation={handoffLocation}
          setHandoffLocation={setHandoffLocation}
          onHandoff={handleLeaveForNextEmployee}
          savingHandoff={savingHandoff}
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
            New wheelchair assignments are blocked.
            Complete or transfer wheelchair{" "}
            <b>
              {activeService?.wheelchair_number ||
                "—"}
            </b>{" "}
            before accepting another service.
          </div>
        </PageCard>
      )}

      {!hasActiveService && !sessionLoading && (
        <>
          <PageCard style={{ padding: 22 }}>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <FieldLabel>Pickup Location</FieldLabel>

                <SelectInput
                  value={startLocation}
                  onChange={(value) => {
                    setStartLocation(value);
                    setSelectedInventory(null);

                    if (mode === "existing") {
                      setMode("scan");
                      setStep("upload");
                      setParsed(emptyParsed());
                    }
                  }}
                  options={START_LOCATIONS}
                />
              </div>

              {isHandoffLocation(startLocation) && (
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 16,
                    padding: "13px 14px",
                    color: "#1d4ed8",
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1.55,
                  }}
                >
                  Wheelchairs left at this location
                  will appear below. Select one to
                  continue the existing passenger
                  service without entering the
                  passenger information again.
                </div>
              )}
            </div>
          </PageCard>

          <AvailableWheelchairsCard
            startLocation={startLocation}
            loading={availableLoading}
            rows={availableWheelchairs}
            selectedInventoryId={
              selectedInventoryId
            }
            onSelect={handleSelectInventory}
          />

          {selectedInventory && (
            <>
              <SelectedHandoffCard
                wheelchair={selectedInventory}
                onClear={clearSelectedInventory}
              />

              <StatusCard
                parsed={parsed}
                user={user}
                startLocation={startLocation}
                isContinuingService
              />

              <PageCard style={{ padding: 22 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                  }}
                >
                  <StatusPill
                    label="Passenger"
                    value={
                      selectedInventory.passenger_name ||
                      "—"
                    }
                    tone="slate"
                  />

                  <StatusPill
                    label="Flight"
                    value={
                      selectedInventory.flight_number
                        ? `${
                            selectedInventory.airline ||
                            ""
                          } ${
                            selectedInventory.flight_number
                          }`.trim()
                        : "—"
                    }
                    tone="slate"
                  />

                  <StatusPill
                    label="PNR"
                    value={
                      selectedInventory.pnr || "—"
                    }
                    tone="slate"
                  />

                  <StatusPill
                    label="Wheelchair"
                    value={
                      selectedInventory.wheelchair_number ||
                      "—"
                    }
                    tone="blue"
                  />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <ActionButton
                    variant="success"
                    onClick={
                      handleAcceptExistingService
                    }
                    disabled={
                      !canAcceptExistingService
                    }
                  >
                    {acceptingInventory
                      ? "Accepting Service..."
                      : "Continue Existing Service"}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={clearSelectedInventory}
                    disabled={acceptingInventory}
                  >
                    Cancel
                  </ActionButton>
                </div>
              </PageCard>
            </>
          )}

          {!selectedInventory && (
            <>
              <PageCard style={{ padding: 22 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div>
                    <FieldLabel>
                      New Service Entry Method
                    </FieldLabel>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <ActionButton
                        variant={
                          mode === "scan"
                            ? "primary"
                            : "secondary"
                        }
                        onClick={() => {
                          setMode("scan");
                          setStep("upload");
                          setError("");
                          setMessage("");
                          setParsed(emptyParsed());
                          setImageUrl("");
                          setImageFile(null);
                        }}
                      >
                        Scan Boarding Pass
                      </ActionButton>

                      <ActionButton
                        variant={
                          mode === "manual"
                            ? "primary"
                            : "secondary"
                        }
                        onClick={() => {
                          setMode("manual");
                          setStep("manual");
                          setError("");
                          setMessage("");
                          setImageFile(null);
                          setImageUrl("");
                          setParsed(emptyParsed());
                        }}
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
                      options={[
                        "WCHR",
                        "WCHS",
                        "WCHC",
                      ]}
                    />

                    <StatusPill
                      label="Starting At"
                      value={startLocation}
                      tone="blue"
                    />
                  </div>

                  {mode === "scan" && (
                    <>
                      <div>
                        <FieldLabel>
                          Boarding Pass Photo
                        </FieldLabel>

                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(event) =>
                            handlePickFile(
                              event.target.files?.[0]
                            )
                          }
                          style={{
                            width: "100%",
                            border:
                              "1px solid #dbeafe",
                            background: "#ffffff",
                            borderRadius: 14,
                            padding: "12px 14px",
                            fontSize: 14,
                            color: "#0f172a",
                            boxSizing: "border-box",
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
                            step === "submitting"
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
                        value={
                          parsed.passenger_name
                        }
                        onChange={(value) =>
                          handleParsedChange(
                            "passenger_name",
                            value
                          )
                        }
                        placeholder="VERGARA / CLAUDIA"
                      />

                      <EditInput
                        label="Airline"
                        value={parsed.airline}
                        onChange={(value) =>
                          handleParsedChange(
                            "airline",
                            value
                          )
                        }
                        placeholder="AV"
                      />

                      <EditInput
                        label="Flight Number"
                        value={
                          parsed.flight_number
                        }
                        onChange={(value) =>
                          handleParsedChange(
                            "flight_number",
                            value
                          )
                        }
                        placeholder="581"
                      />

                      <EditInput
                        label="PNR / Reservation Code"
                        value={parsed.pnr}
                        onChange={(value) =>
                          handleParsedChange(
                            "pnr",
                            value
                          )
                        }
                        placeholder="A7ILFB"
                      />

                      <EditInput
                        label="WCHR Number"
                        value={
                          parsed.wheelchair_number
                        }
                        onChange={(value) =>
                          handleParsedChange(
                            "wheelchair_number",
                            value
                          )
                        }
                        placeholder="023"
                      />
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <ActionButton
                        onClick={handleSubmit}
                        variant="success"
                        disabled={
                          !canSubmitNewService ||
                          step === "submitting"
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

              {mode === "scan" &&
                step === "preview" && (
                  <>
                    <StatusCard
                      parsed={parsed}
                      user={user}
                      startLocation={
                        startLocation
                      }
                    />

                    <PageCard
                      style={{ padding: 22 }}
                    >
                      {imageUrl && (
                        <div
                          style={{
                            marginBottom: 16,
                          }}
                        >
                          <img
                            src={imageUrl}
                            alt="Boarding pass"
                            style={{
                              width: "100%",
                              maxHeight: 340,
                              objectFit:
                                "contain",
                              borderRadius: 18,
                              border:
                                "1px solid #e2e8f0",
                              background:
                                "#f8fbff",
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
                          value={
                            parsed.passenger_name
                          }
                          onChange={(value) =>
                            handleParsedChange(
                              "passenger_name",
                              value
                            )
                          }
                          placeholder="VERGARA / CLAUDIA"
                        />

                        <EditInput
                          label="Airline"
                          value={parsed.airline}
                          onChange={(value) =>
                            handleParsedChange(
                              "airline",
                              value
                            )
                          }
                          placeholder="AV"
                        />

                        <EditInput
                          label="Flight Number"
                          value={
                            parsed.flight_number
                          }
                          onChange={(value) =>
                            handleParsedChange(
                              "flight_number",
                              value
                            )
                          }
                          placeholder="581"
                        />

                        <EditInput
                          label="PNR / Reservation Code"
                          value={parsed.pnr}
                          onChange={(value) =>
                            handleParsedChange(
                              "pnr",
                              value
                            )
                          }
                          placeholder="A7ILFB"
                        />

                        <EditInput
                          label="WCHR Number"
                          value={
                            parsed.wheelchair_number
                          }
                          onChange={(value) =>
                            handleParsedChange(
                              "wheelchair_number",
                              value
                            )
                          }
                          placeholder="023"
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
                            setParsed(
                              emptyParsed()
                            );
                            setImageUrl("");
                            setImageFile(null);
                            setStep("upload");
                            setError("");
                            setMessage("");
                          }}
                          variant="secondary"
                          disabled={
                            step === "submitting"
                          }
                        >
                          Retake / Upload Again
                        </ActionButton>

                        <ActionButton
                          onClick={handleSubmit}
                          variant="success"
                          disabled={
                            !canSubmitNewService ||
                            step === "submitting"
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
        </>
      )}
    </div>
  );
}
