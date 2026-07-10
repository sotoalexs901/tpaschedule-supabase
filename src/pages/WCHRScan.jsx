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
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

const START_LOCATIONS = [
  "Counter",
  "AV Ticket Counter",
  "SY Ticket Counter",
  "TSA",
  "Outside TSA",
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
  "Outside CBP",
  "Main Terminal",
  "Wheelchair Storage",
  "Maintenance",
  "Other",
];

const HANDOFF_PICKUP_LOCATIONS = [
  "TSA",
  "Outside TSA",
  "CBP",
  "Outside CBP",
  "Main Terminal",
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
  "TSA",
  "Outside TSA",
  "CBP",
  "Outside CBP",
  "Main Terminal",
];

const INVENTORY_COLLECTION = "wchr_inventory";
const REPORTS_COLLECTION = "wch_reports";
const TRACKING_EVENTS_COLLECTION = "wch_tracking_events";
const AGENT_SESSIONS_COLLECTION = "wchr_agent_sessions";

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

function normalizeLocation(value) {
  return safeText(value).toLowerCase();
}

function cleanPnr(value) {
  return safeUpper(value).replace(/[^A-Z0-9]/g, "");
}

function cleanWheelchairNumber(value) {
  return safeUpper(value).replace(/[^A-Z0-9-]/g, "");
}

function getWheelchairDocumentId(value) {
  return cleanWheelchairNumber(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "_");
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

function getAgentSessionId(user) {
  return safeText(
    user?.id ||
      user?.uid ||
      user?.username ||
      user?.email
  );
}

function isDeliveryLocation(location) {
  return DELIVERY_DESTINATIONS.some(
    (item) => normalizeLocation(item) === normalizeLocation(location)
  );
}

function isHandoffLocation(location) {
  return HANDOFF_PICKUP_LOCATIONS.some(
    (item) => normalizeLocation(item) === normalizeLocation(location)
  );
}

function inventoryRowMatchesLocation(row, location) {
  return (
    normalizeLocation(row?.location) === normalizeLocation(location) &&
    row?.is_available !== false &&
    safeUpper(row?.status || "STORED") !== "IN_USE"
  );
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

    if (candidate) return candidate;
  }

  const possibleValues = text.match(/\b[A-Z0-9]{5,8}\b/g) || [];

  for (const item of possibleValues) {
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

function buildInventoryFromReport(report, inventoryRow = {}) {
  return {
    id: inventoryRow.id || "",
    wheelchair_number:
      cleanWheelchairNumber(
        inventoryRow.wheelchair_number || report.wheelchair_number
      ) || "",

    location:
      inventoryRow.location ||
      report.current_location ||
      report.delivered_location ||
      "",

    status: inventoryRow.status || "AVAILABLE_HANDOFF",
    is_available: inventoryRow.is_available !== false,

    report_doc_id:
      inventoryRow.report_doc_id ||
      inventoryRow.assigned_report_doc_id ||
      report.id ||
      "",

    report_id:
      inventoryRow.report_id ||
      inventoryRow.assigned_report_id ||
      report.report_id ||
      "",

    passenger_name:
      inventoryRow.passenger_name ||
      report.passenger_name ||
      "",

    airline:
      inventoryRow.airline ||
      report.airline ||
      "",

    flight_number:
      inventoryRow.flight_number ||
      report.flight_number ||
      "",

    pnr:
      inventoryRow.pnr ||
      report.pnr ||
      "",

    wch_type:
      inventoryRow.wch_type ||
      report.wch_type ||
      "WCHR",

    original_pickup_at:
      inventoryRow.original_pickup_at ||
      report.pickup_at ||
      report.submitted_at ||
      null,

    previous_agent_id:
      inventoryRow.previous_agent_id ||
      report.wchr_agent_id ||
      report.employee_id ||
      "",

    previous_agent_name:
      inventoryRow.previous_agent_name ||
      report.wchr_agent_name ||
      report.employee_name ||
      "",
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
      <FieldLabel>{label}</FieldLabel>

      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          border: "1px solid #dbeafe",
          background: disabled ? "#f8fafc" : "#ffffff",
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
      <FieldLabel>{label}</FieldLabel>

      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          border: "1px solid #dbeafe",
          background: disabled ? "#f8fafc" : "#ffffff",
          borderRadius: 14,
          padding: "12px 14px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          boxSizing: "border-box",
          opacity: disabled ? 0.75 : 1,
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
          wordBreak: "break-word",
          ...tones[tone],
        }}
      >
        {value || "—"}
      </div>
    </div>
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

  const wheelchairList = rows
    .map((row) => row.wheelchair_number)
    .filter(Boolean);

  return (
    <PageCard
      style={{
        padding: 18,
        border: rows.length
          ? "1px solid #bfdbfe"
          : "1px solid #fde68a",
        background: rows.length
          ? "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)"
          : "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)",
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
              color: rows.length ? "#1d4ed8" : "#92400e",
            }}
          >
            Wheelchairs Available at This Location
          </p>

          <h2
            style={{
              margin: "8px 0 4px",
              fontSize: 20,
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
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            {loading
              ? "Checking available wheelchairs..."
              : rows.length
              ? `At ${startLocation}, wheelchair${rows.length === 1 ? "" : "s"} ${wheelchairList.join(
                  ", "
                )} ${rows.length === 1 ? "is" : "are"} available. Which one will you take?`
              : `No available wheelchairs were found at ${startLocation}.`}
          </p>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "8px 12px",
            background: rows.length ? "#dbeafe" : "#fef3c7",
            color: rows.length ? "#1d4ed8" : "#92400e",
            border: rows.length
              ? "1px solid #93c5fd"
              : "1px solid #fde68a",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          {loading ? "CHECKING" : `${rows.length} AVAILABLE`}
        </span>
      </div>

      {!loading && rows.length > 0 && (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gap: 10,
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
                  borderRadius: 16,
                  background: selected ? "#edf7ff" : "#ffffff",
                  padding: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: selected
                    ? "0 12px 24px rgba(23,105,170,0.12)"
                    : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
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
                        lineHeight: 1.5,
                      }}
                    >
                      {row.passenger_name
                        ? `Passenger: ${row.passenger_name}`
                        : "No passenger information"}

                      {row.flight_number
                        ? ` · Flight ${row.airline || ""} ${
                            row.flight_number
                          }`
                        : ""}
                    </div>
                  </div>

                  <span
                    style={{
                      borderRadius: 999,
                      padding: "7px 10px",
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
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                  }}
                >
                  <StatusPill
                    label="Location"
                    value={row.location || startLocation}
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
              color: "#15803d",
            }}
          >
            Existing Service Selected
          </p>

          <h2
            style={{
              margin: "8px 0 4px",
              fontSize: 21,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Continue Wheelchair {wheelchair.wheelchair_number || "—"}
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.6,
            }}
          >
            Passenger and flight information were loaded automatically. Your
            service time will begin from {wheelchair.location || "this location"}.
          </p>
        </div>

        <ActionButton
          variant="secondary"
          onClick={onClear}
        >
          Choose Another
        </ActionButton>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
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
              ? `${wheelchair.airline || ""} ${wheelchair.flight_number}`
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
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
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
              ? `${service.airline || ""} ${service.flight_number}`
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
          The wheelchair appears to be at a final destination. Please click
          “Passenger Delivered” as soon as the passenger is handed off at the
          gate or destination.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
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
          disabled={delivering || !deliveryLocation}
          style={{
            width: "100%",
            minHeight: 44,
          }}
        >
          {delivering
            ? "Saving Delivery..."
            : "Passenger Delivered"}
        </ActionButton>
      </div>
    </PageCard>
  );
}

function StatusCard({
  parsed,
  user,
  startLocation,
  isContinuingService = false,
}) {
  const agentName =
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "—";

  return (
    <PageCard style={{ padding: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <StatusPill
          label="Current Location"
          value={`📍 ${startLocation || "Counter"}`}
          tone="blue"
        />

        <StatusPill
          label="Status"
          value={
            isContinuingService
              ? "🟢 Continuing Service"
              : "🟢 New Service"
          }
          tone="green"
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
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 16,
          padding: "12px 14px",
          color: "#92400e",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.55,
        }}
      >
        {isContinuingService
          ? "This is an existing passenger service transferred from another employee. Your individual service time begins when you take the wheelchair."
          : "This wheelchair remains assigned to you until the passenger is marked as delivered."}
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

  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [availableWheelchairs, setAvailableWheelchairs] = useState([]);
  const [selectedInventory, setSelectedInventory] = useState(null);

  const [deliveryLocation, setDeliveryLocation] =
    useState("Main Terminal");

  const [delivering, setDelivering] = useState(false);
  const [takingHandoff, setTakingHandoff] = useState(false);

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

  const isContinuingExistingService = Boolean(
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

          const sessionIsActive =
            sessionData?.is_active === true &&
            safeUpper(sessionData?.tracking_status) !== "COMPLETED";

          if (!sessionIsActive) {
            setActiveService(null);
            setSessionLoading(false);
            return;
          }

          if (sessionData.report_doc_id) {
            const reportRef = doc(
              db,
              REPORTS_COLLECTION,
              sessionData.report_doc_id
            );

            const reportSnapshot = await getDoc(reportRef);

            if (reportSnapshot.exists()) {
              const reportData = {
                id: reportSnapshot.id,
                ...reportSnapshot.data(),
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

                airline:
                  reportData.airline ||
                  sessionData.airline ||
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

                started_at:
                  sessionData.started_at ||
                  reportData.current_segment_started_at ||
                  reportData.pickup_at ||
                  reportData.submitted_at ||
                  null,
              });

              setSessionLoading(false);
              return;
            }
          }

          setActiveService(sessionData);
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
  }, [activeService?.current_location]);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableWheelchairs() {
      setSelectedInventory(null);
      setAvailableWheelchairs([]);

      if (
        hasActiveService ||
        sessionLoading ||
        !isHandoffLocation(startLocation)
      ) {
        setInventoryLoading(false);
        return;
      }

      try {
        setInventoryLoading(true);
        setError("");

        const inventoryQuery = query(
          collection(db, INVENTORY_COLLECTION),
          where("location", "==", startLocation)
        );

        const inventorySnapshot = await getDocs(inventoryQuery);

        const directInventoryRows = inventorySnapshot.docs
          .map((inventoryDoc) => ({
            id: inventoryDoc.id,
            ...inventoryDoc.data(),
          }))
          .filter((row) =>
            inventoryRowMatchesLocation(row, startLocation)
          );

        const hydratedRows = [];

        for (const inventoryRow of directInventoryRows) {
          let reportData = null;

          const reportDocId =
            inventoryRow.report_doc_id ||
            inventoryRow.assigned_report_doc_id ||
            "";

          if (reportDocId) {
            try {
              const reportSnapshot = await getDoc(
                doc(db, REPORTS_COLLECTION, reportDocId)
              );

              if (reportSnapshot.exists()) {
                reportData = {
                  id: reportSnapshot.id,
                  ...reportSnapshot.data(),
                };
              }
            } catch (reportError) {
              console.error(
                "Unable to hydrate wheelchair report:",
                reportError
              );
            }
          }

          hydratedRows.push(
            reportData
              ? buildInventoryFromReport(reportData, inventoryRow)
              : {
                  ...inventoryRow,
                  id: inventoryRow.id,
                }
          );
        }

        if (!cancelled) {
          setAvailableWheelchairs(
            hydratedRows.sort((a, b) =>
              safeText(a.wheelchair_number).localeCompare(
                safeText(b.wheelchair_number),
                undefined,
                {
                  numeric: true,
                  sensitivity: "base",
                }
              )
            )
          );
        }
      } catch (inventoryError) {
        console.error(
          "Failed to load wheelchairs by location:",
          inventoryError
        );

        if (!cancelled) {
          setError(
            inventoryError?.message ||
              "Unable to load the available wheelchairs at this location."
          );
        }
      } finally {
        if (!cancelled) {
          setInventoryLoading(false);
        }
      }
    }

    loadAvailableWheelchairs();

    return () => {
      cancelled = true;
    };
  }, [
    startLocation,
    hasActiveService,
    sessionLoading,
  ]);

  const handleSelectAvailableWheelchair = (inventoryRow) => {
    const normalizedRow = {
      ...inventoryRow,

      wheelchair_number:
        cleanWheelchairNumber(
          inventoryRow.wheelchair_number
        ),

      passenger_name:
        normalizePassengerName(
          inventoryRow.passenger_name
        ),

      airline:
        safeUpper(inventoryRow.airline),

      flight_number:
        safeUpper(inventoryRow.flight_number),

      pnr:
        cleanPnr(inventoryRow.pnr),

      wch_type:
        safeUpper(
          inventoryRow.wch_type || "WCHR"
        ),

      location:
        safeText(
          inventoryRow.location || startLocation
        ),
    };

    setSelectedInventory(normalizedRow);

    setParsed({
      passenger_name:
        normalizedRow.passenger_name || "",

      airline:
        normalizedRow.airline || "",

      flight_number:
        normalizedRow.flight_number || "",

      pnr:
        normalizedRow.pnr || "",

      wheelchair_number:
        normalizedRow.wheelchair_number || "",

      raw_text: "",
    });

    setWchType(
      normalizedRow.wch_type || "WCHR"
    );

    setMode("manual");
    setStep("handoff");
    setImageFile(null);
    setImageUrl("");

    setError("");
    setMessage(
      `Wheelchair ${normalizedRow.wheelchair_number} selected at ${normalizedRow.location}. Passenger information was loaded automatically.`
    );
  };

  const handleClearSelectedWheelchair = () => {
    setSelectedInventory(null);
    setParsed(emptyParsed());
    setWchType("WCHR");
    setMode("scan");
    setStep("upload");
    setImageFile(null);
    setImageUrl("");
    setError("");
    setMessage("");
  };
    const canScan = useMemo(() => {
    return (
      Boolean(imageFile) &&
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

  const canSubmit = useMemo(() => {
    if (hasActiveService || sessionLoading) {
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

    const requiredFieldsComplete = requiredValues.every(
      (value) => safeText(value).length > 0
    );

    if (!requiredFieldsComplete) {
      return false;
    }

    if (selectedInventory) {
      return Boolean(
        selectedInventory.id &&
          selectedInventory.report_doc_id &&
          selectedInventory.wheelchair_number
      );
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
    selectedInventory,
    mode,
    imageUrl,
  ]);

  const resetEntryForm = () => {
    setParsed(emptyParsed());
    setImageFile(null);
    setImageUrl("");
    setSelectedInventory(null);
    setWchType("WCHR");
    setStep(mode === "scan" ? "upload" : "manual");
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
        } assigned. Mark the passenger as delivered before taking another wheelchair.`
      );
      return;
    }

    if (selectedInventory) {
      setError(
        "You already selected an available wheelchair. Clear that selection before scanning a new boarding pass."
      );
      return;
    }

    if (!imageFile) {
      setError("Please select a boarding pass photo.");
      return;
    }

    try {
      setStep("scanning");

      const uploadedImageUrl = await uploadToStorage(
        imageFile
      );

      setImageUrl(uploadedImageUrl);

      const scanResult = await callScanService(
        uploadedImageUrl
      );

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
      console.error(
        "WCHR scan failed:",
        scanError
      );

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
    wheelchairNumber,
    passengerName,
    airline,
    pnr,
    flightNumber,
    currentLocation,
    inventoryDocId = "",
    serviceSegmentId = "",
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
        pickup_location: currentLocation,

        tracking_status: "IN_PROGRESS",
        passenger_delivered: false,

        is_active: true,
        alerts_enabled: true,
        alert_after_minutes: 30,

        started_at: serverTimestamp(),
        last_location_update_at:
          serverTimestamp(),

        updated_at: serverTimestamp(),
      },
      {
        merge: true,
      }
    );
  };

  const handleTakeAvailableWheelchair = async () => {
    setError("");
    setMessage("");

    if (!user) {
      setError("You must be logged in.");
      return;
    }

    if (sessionLoading) {
      setError(
        "Please wait while your active service is verified."
      );
      return;
    }

    if (hasActiveService) {
      setError(
        `You already have wheelchair ${
          activeService?.wheelchair_number || ""
        } assigned. Deliver that passenger before taking another wheelchair.`
      );
      return;
    }

    if (!selectedInventory?.id) {
      setError(
        "Please select an available wheelchair."
      );
      return;
    }

    if (!selectedInventory?.report_doc_id) {
      setError(
        "The selected wheelchair is not connected to an active passenger report."
      );
      return;
    }

    const selectedWheelchairNumber =
      cleanWheelchairNumber(
        selectedInventory.wheelchair_number
      );

    const selectedPickupLocation = safeText(
      selectedInventory.location ||
        startLocation
    );

    if (
      normalizeLocation(
        selectedPickupLocation
      ) !== normalizeLocation(startLocation)
    ) {
      setError(
        `Wheelchair ${selectedWheelchairNumber} is registered at ${selectedPickupLocation}, not ${startLocation}.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Take wheelchair ${selectedWheelchairNumber} at ${selectedPickupLocation} and continue the service for ${
        selectedInventory.passenger_name ||
        "this passenger"
      }?`
    );

    if (!confirmed) return;

    try {
      setTakingHandoff(true);

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
        collection(
          db,
          REPORTS_COLLECTION,
          selectedInventory.report_doc_id,
          "service_segments"
        )
      );

      const segmentId = segmentRef.id;

      const transactionResult =
        await runTransaction(
          db,
          async (transaction) => {
            const inventorySnapshot =
              await transaction.get(
                inventoryRef
              );

            if (!inventorySnapshot.exists()) {
              throw new Error(
                "This wheelchair is no longer available."
              );
            }

            const inventoryData =
              inventorySnapshot.data();

            const currentlyAvailable =
              inventoryData.is_available !==
                false &&
              safeUpper(
                inventoryData.status ||
                  "STORED"
              ) !== "IN_USE";

            if (!currentlyAvailable) {
              throw new Error(
                `Wheelchair ${selectedWheelchairNumber} was already taken by another employee.`
              );
            }

            if (
              normalizeLocation(
                inventoryData.location
              ) !==
              normalizeLocation(
                selectedPickupLocation
              )
            ) {
              throw new Error(
                `Wheelchair ${selectedWheelchairNumber} is no longer at ${selectedPickupLocation}.`
              );
            }

            const reportSnapshot =
              await transaction.get(reportRef);

            if (!reportSnapshot.exists()) {
              throw new Error(
                "The passenger report connected to this wheelchair no longer exists."
              );
            }

            const reportData =
              reportSnapshot.data();

            const alreadyDelivered =
              reportData.passenger_delivered ===
                true ||
              safeUpper(
                reportData.tracking_status
              ) === "COMPLETED";

            if (alreadyDelivered) {
              throw new Error(
                "This passenger was already marked as delivered."
              );
            }

            transaction.update(
              inventoryRef,
              {
                status: "IN_USE",
                is_available: false,

                current_agent_id:
                  currentAgentId,

                current_agent_name:
                  currentAgentName,

                checked_out_at:
                  serverTimestamp(),

                previous_location:
                  inventoryData.location ||
                  selectedPickupLocation,

                updated_at:
                  serverTimestamp(),

                updated_by_id:
                  currentAgentId,

                updated_by_name:
                  currentAgentName,
              }
            );

            transaction.update(
              reportRef,
              {
                tracking_status:
                  "IN_PROGRESS",

                passenger_delivered: false,
                is_active: true,
                alerts_enabled: true,

                current_location:
                  selectedPickupLocation,

                last_location:
                  reportData.current_location ||
                  selectedPickupLocation,

                current_segment_id:
                  segmentId,

                current_segment_started_at:
                  serverTimestamp(),

                current_segment_start_location:
                  selectedPickupLocation,

                current_segment_agent_id:
                  currentAgentId,

                current_segment_agent_name:
                  currentAgentName,

                wchr_agent_id:
                  currentAgentId,

                wchr_agent_name:
                  currentAgentName,

                assigned_wchr_agent:
                  currentAgentName,

                activity_agent_name:
                  currentAgentName,

                previous_wchr_agent_id:
                  reportData.wchr_agent_id ||
                  reportData.employee_id ||
                  "",

                previous_wchr_agent_name:
                  reportData.wchr_agent_name ||
                  reportData.employee_name ||
                  "",

                handoff_pickup_at:
                  serverTimestamp(),

                handoff_pickup_location:
                  selectedPickupLocation,

                last_location_update_at:
                  serverTimestamp(),

                last_updated_at:
                  serverTimestamp(),

                last_updated_by:
                  currentAgentName,

                last_updated_by_id:
                  currentAgentId,
              }
            );

            transaction.set(
              segmentRef,
              {
                segment_id: segmentId,

                report_doc_id:
                  reportRef.id,

                report_id:
                  reportData.report_id ||
                  selectedInventory.report_id ||
                  "",

                wheelchair_number:
                  selectedWheelchairNumber,

                passenger_name:
                  reportData.passenger_name ||
                  selectedInventory.passenger_name ||
                  "",

                airline:
                  reportData.airline ||
                  selectedInventory.airline ||
                  "",

                flight_number:
                  reportData.flight_number ||
                  selectedInventory.flight_number ||
                  "",

                pnr:
                  reportData.pnr ||
                  selectedInventory.pnr ||
                  "",

                agent_id:
                  currentAgentId,

                agent_name:
                  currentAgentName,

                start_location:
                  selectedPickupLocation,

                started_at:
                  serverTimestamp(),

                end_location: "",
                ended_at: null,

                segment_status:
                  "IN_PROGRESS",

                passenger_delivered: false,

                created_at:
                  serverTimestamp(),

                updated_at:
                  serverTimestamp(),
              }
            );

            transaction.set(
              sessionRef,
              {
                agent_id:
                  currentAgentId,

                agent_name:
                  currentAgentName,

                agent_username:
                  user?.username ||
                  user?.loginUsername ||
                  user?.email ||
                  "",

                report_doc_id:
                  reportRef.id,

                active_report_id:
                  reportRef.id,

                report_id:
                  reportData.report_id ||
                  selectedInventory.report_id ||
                  "",

                inventory_doc_id:
                  inventoryRef.id,

                service_segment_id:
                  segmentId,

                wheelchair_number:
                  selectedWheelchairNumber,

                passenger_name:
                  reportData.passenger_name ||
                  selectedInventory.passenger_name ||
                  "",

                airline:
                  reportData.airline ||
                  selectedInventory.airline ||
                  "",

                pnr:
                  reportData.pnr ||
                  selectedInventory.pnr ||
                  "",

                flight_number:
                  reportData.flight_number ||
                  selectedInventory.flight_number ||
                  "",

                current_location:
                  selectedPickupLocation,

                pickup_location:
                  selectedPickupLocation,

                tracking_status:
                  "IN_PROGRESS",

                passenger_delivered: false,

                is_active: true,
                alerts_enabled: true,
                alert_after_minutes: 30,

                started_at:
                  serverTimestamp(),

                last_location_update_at:
                  serverTimestamp(),

                updated_at:
                  serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            return {
              reportId:
                reportData.report_id ||
                selectedInventory.report_id ||
                "",

              passengerName:
                reportData.passenger_name ||
                selectedInventory.passenger_name ||
                "",

              airline:
                reportData.airline ||
                selectedInventory.airline ||
                "",

              flightNumber:
                reportData.flight_number ||
                selectedInventory.flight_number ||
                "",

              pnr:
                reportData.pnr ||
                selectedInventory.pnr ||
                "",
            };
          }
        );

      await addDoc(
        collection(
          db,
          TRACKING_EVENTS_COLLECTION
        ),
        {
          report_doc_id:
            selectedInventory.report_doc_id,

          report_id:
            transactionResult.reportId,

          wheelchair_number:
            selectedWheelchairNumber,

          passenger_name:
            transactionResult.passengerName,

          airline:
            transactionResult.airline,

          pnr:
            transactionResult.pnr,

          flight_number:
            transactionResult.flightNumber,

          event_type:
            "AGENT_HANDOFF_PICKUP",

          location:
            selectedPickupLocation,

          previous_location:
            selectedPickupLocation,

          notes: `Wheelchair ${selectedWheelchairNumber} picked up by ${currentAgentName} at ${selectedPickupLocation}`,

          service_segment_id:
            segmentId,

          tracking_status:
            "IN_PROGRESS",

          passenger_delivered: false,

          is_active: true,
          alerts_enabled: true,

          employee_id:
            currentAgentId,

          employee_name:
            currentAgentName,

          previous_employee_id:
            selectedInventory.previous_agent_id ||
            "",

          previous_employee_name:
            selectedInventory.previous_agent_name ||
            "",

          created_at:
            serverTimestamp(),
        }
      );

      setActiveService({
        is_active: true,

        report_doc_id:
          selectedInventory.report_doc_id,

        report_id:
          transactionResult.reportId,

        inventory_doc_id:
          selectedInventory.id,

        service_segment_id:
          segmentId,

        wheelchair_number:
          selectedWheelchairNumber,

        passenger_name:
          transactionResult.passengerName,

        airline:
          transactionResult.airline,

        flight_number:
          transactionResult.flightNumber,

        pnr:
          transactionResult.pnr,

        current_location:
          selectedPickupLocation,

        tracking_status:
          "IN_PROGRESS",

        passenger_delivered: false,

        started_at: new Date(),
      });

      setAvailableWheelchairs(
        (previous) =>
          previous.filter(
            (row) =>
              row.id !==
              selectedInventory.id
          )
      );

      setSelectedInventory(null);
      setParsed(emptyParsed());
      setImageFile(null);
      setImageUrl("");
      setStep("upload");

      setMessage(
        `Wheelchair ${selectedWheelchairNumber} is now assigned to you. Your time started at ${selectedPickupLocation}.`
      );
    } catch (handoffError) {
      console.error(
        "Error taking available wheelchair:",
        handoffError
      );

      setError(
        handoffError?.message ||
          "Unable to assign this wheelchair. It may already have been taken."
      );
    } finally {
      setTakingHandoff(false);
    }
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
        "Please wait while your active wheelchair service is verified."
      );
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

    if (selectedInventory) {
      await handleTakeAvailableWheelchair();
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

      const flightNumber = safeUpper(
        parsed.flight_number
      );

      const airline = safeUpper(
        parsed.airline || "WCHR"
      );

      const initialLocation = safeText(
        startLocation || "Counter"
      );

      const wheelchairDocumentId =
        getWheelchairDocumentId(
          finalWheelchairNumber
        );

      if (!wheelchairDocumentId) {
        throw new Error(
          "The wheelchair number is invalid."
        );
      }

      const flightKey = `${airline}-${
        flightNumber || "UNK"
      }-${yyyymmdd(now)}`;

      const reportRef = doc(
        collection(db, REPORTS_COLLECTION)
      );

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        wheelchairDocumentId
      );

      const sessionRef = doc(
        db,
        AGENT_SESSIONS_COLLECTION,
        currentAgentId
      );

      const segmentRef = doc(
        collection(
          db,
          REPORTS_COLLECTION,
          reportRef.id,
          "service_segments"
        )
      );

      const shortId = reportRef.id
        .slice(-6)
        .toUpperCase();

      const reportId = `WCHR-${yyyymmdd()}-${shortId}`;
      const segmentId = segmentRef.id;

      await runTransaction(
        db,
        async (transaction) => {
          const inventorySnapshot =
            await transaction.get(
              inventoryRef
            );

          if (inventorySnapshot.exists()) {
            const inventoryData =
              inventorySnapshot.data();

            const wheelchairIsInUse =
              inventoryData.is_available ===
                false ||
              safeUpper(
                inventoryData.status
              ) === "IN_USE";

            if (wheelchairIsInUse) {
              throw new Error(
                `Wheelchair ${finalWheelchairNumber} is already assigned or in use.`
              );
            }
          }

          transaction.set(
            reportRef,
            {
              report_id: reportId,

              employee_id:
                currentAgentId,

              employee_name:
                currentAgentName,

              employee_login:
                user?.username ||
                user?.loginUsername ||
                user?.email ||
                "",

              employee_role:
                user?.role || "",

              submitted_at:
                serverTimestamp(),

              passenger_name:
                finalPassengerName,

              airline,
              flight_number:
                flightNumber,

              pnr:
                finalPnr,

              wheelchair_number:
                finalWheelchairNumber,

              wch_type:
                wchType,

              status: "NEW",
              flight_key:
                flightKey,

              image_url:
                mode === "scan"
                  ? imageUrl
                  : "",

              raw_text:
                parsed.raw_text || "",

              entry_mode:
                mode,

              wchr_agent_id:
                currentAgentId,

              wchr_agent_name:
                currentAgentName,

              assigned_wchr_agent:
                currentAgentName,

              activity_agent_name:
                currentAgentName,

              billing_ready:
                true,

              billing_date:
                serverTimestamp(),

              billing_passenger_name:
                finalPassengerName,

              billing_pnr:
                finalPnr,

              billing_wheelchair_number:
                finalWheelchairNumber,

              tracking_enabled:
                true,

              tracking_status:
                "IN_PROGRESS",

              passenger_delivered:
                false,

              current_location:
                initialLocation,

              last_location:
                initialLocation,

              pickup_location:
                initialLocation,

              pickup_at:
                serverTimestamp(),

              original_pickup_at:
                serverTimestamp(),

              gate_location: "",
              gate_arrived_at: null,

              delivered_location: "",
              delivered_at: null,

              dropoff_location: "",
              dropoff_at: null,

              stored_location: "",
              stored_at: null,

              current_segment_id:
                segmentId,

              current_segment_started_at:
                serverTimestamp(),

              current_segment_start_location:
                initialLocation,

              current_segment_agent_id:
                currentAgentId,

              current_segment_agent_name:
                currentAgentName,

              is_active: true,
              alerts_enabled: true,
              alert_after_minutes: 30,
              last_alert_at: null,

              last_location_update_at:
                serverTimestamp(),

              last_updated_by:
                currentAgentName,

              last_updated_by_id:
                currentAgentId,

              last_updated_at:
                serverTimestamp(),

              tracking_type:
                "MANUAL",

              tracking_device_id: "",
              tracking_device_label: "",

              created_at:
                serverTimestamp(),
            }
          );

          transaction.set(
            segmentRef,
            {
              segment_id:
                segmentId,

              report_doc_id:
                reportRef.id,

              report_id:
                reportId,

              wheelchair_number:
                finalWheelchairNumber,

              passenger_name:
                finalPassengerName,

              airline,
              flight_number:
                flightNumber,

              pnr:
                finalPnr,

              agent_id:
                currentAgentId,

              agent_name:
                currentAgentName,

              start_location:
                initialLocation,

              started_at:
                serverTimestamp(),

              end_location: "",
              ended_at: null,

              segment_status:
                "IN_PROGRESS",

              passenger_delivered:
                false,

              created_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),
            }
          );

          transaction.set(
            inventoryRef,
            {
              wheelchair_number:
                finalWheelchairNumber,

              location:
                initialLocation,

              previous_location:
                initialLocation,

              status:
                "IN_USE",

              is_available:
                false,

              report_doc_id:
                reportRef.id,

              assigned_report_doc_id:
                reportRef.id,

              report_id:
                reportId,

              assigned_report_id:
                reportId,

              passenger_name:
                finalPassengerName,

              airline,
              flight_number:
                flightNumber,

              pnr:
                finalPnr,

              wch_type:
                wchType,

              current_agent_id:
                currentAgentId,

              current_agent_name:
                currentAgentName,

              previous_agent_id: "",
              previous_agent_name: "",

              original_pickup_at:
                serverTimestamp(),

              checked_out_at:
                serverTimestamp(),

              stored_by_id: "",
              stored_by_name: "",

              updated_at:
                serverTimestamp(),

              updated_by_id:
                currentAgentId,

              updated_by_name:
                currentAgentName,
            },
            {
              merge: true,
            }
          );

          transaction.set(
            sessionRef,
            {
              agent_id:
                currentAgentId,

              agent_name:
                currentAgentName,

              agent_username:
                user?.username ||
                user?.loginUsername ||
                user?.email ||
                "",

              report_doc_id:
                reportRef.id,

              active_report_id:
                reportRef.id,

              report_id:
                reportId,

              inventory_doc_id:
                inventoryRef.id,

              service_segment_id:
                segmentId,

              wheelchair_number:
                finalWheelchairNumber,

              passenger_name:
                finalPassengerName,

              airline,
              pnr:
                finalPnr,

              flight_number:
                flightNumber,

              current_location:
                initialLocation,

              pickup_location:
                initialLocation,

              tracking_status:
                "IN_PROGRESS",

              passenger_delivered:
                false,

              is_active: true,
              alerts_enabled: true,
              alert_after_minutes: 30,

              started_at:
                serverTimestamp(),

              last_location_update_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );
        }
      );

      await addDoc(
        collection(
          db,
          TRACKING_EVENTS_COLLECTION
        ),
        {
          report_doc_id:
            reportRef.id,

          report_id:
            reportId,

          wheelchair_number:
            finalWheelchairNumber,

          passenger_name:
            finalPassengerName,

          airline,
          pnr:
            finalPnr,

          flight_number:
            flightNumber,

          event_type:
            "START_SERVICE",

          location:
            initialLocation,

          previous_location: "",

          notes: `Wheelchair service started at ${initialLocation}`,

          service_segment_id:
            segmentId,

          tracking_status:
            "IN_PROGRESS",

          passenger_delivered:
            false,

          is_active: true,
          alerts_enabled: true,

          employee_id:
            currentAgentId,

          employee_name:
            currentAgentName,

          created_at:
            serverTimestamp(),
        }
      );

      setActiveService({
        is_active: true,

        report_doc_id:
          reportRef.id,

        report_id:
          reportId,

        inventory_doc_id:
          inventoryRef.id,

        service_segment_id:
          segmentId,

        wheelchair_number:
          finalWheelchairNumber,

        passenger_name:
          finalPassengerName,

        airline,

        flight_number:
          flightNumber,

        pnr:
          finalPnr,

        current_location:
          initialLocation,

        tracking_status:
          "IN_PROGRESS",

        passenger_delivered:
          false,

        started_at:
          new Date(),
      });

      setMessage(
        `Wheelchair ${finalWheelchairNumber} is now assigned to your profile.`
      );

      resetEntryForm();
    } catch (submitError) {
      console.error(
        "Error starting WCHR service:",
        submitError
      );

      setStep(
        mode === "scan"
          ? "preview"
          : "manual"
      );

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
      setError(
        "The active wheelchair report could not be identified."
      );
      return;
    }

    const finalDestination = safeText(
      deliveryLocation
    );

    if (
      !DELIVERY_DESTINATIONS.includes(
        finalDestination
      )
    ) {
      setError(
        "Please select the location where the passenger was delivered."
      );
      return;
    }

    const confirmDelivery =
      window.confirm(
        `Confirm passenger delivery for wheelchair ${
          activeService.wheelchair_number ||
          ""
        } at ${finalDestination}?`
      );

    if (!confirmDelivery) return;

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

      const inventoryDocId =
        activeService.inventory_doc_id ||
        getWheelchairDocumentId(
          activeService.wheelchair_number
        );

      const inventoryRef = doc(
        db,
        INVENTORY_COLLECTION,
        inventoryDocId
      );

      const segmentId =
        activeService.service_segment_id ||
        "";

      const segmentRef = segmentId
        ? doc(
            db,
            REPORTS_COLLECTION,
            activeService.report_doc_id,
            "service_segments",
            segmentId
          )
        : null;

      const currentLocation =
        activeService.current_location ||
        finalDestination;

      const destinationIsGate =
        finalDestination.startsWith(
          "Gate "
        );

      const destinationIsHandoff =
        isHandoffLocation(
          finalDestination
        );

      await runTransaction(
        db,
        async (transaction) => {
          const reportSnapshot =
            await transaction.get(
              reportRef
            );

          if (!reportSnapshot.exists()) {
            throw new Error(
              "The active wheelchair report no longer exists."
            );
          }

          const reportData =
            reportSnapshot.data();

          const reportAlreadyDelivered =
            reportData.passenger_delivered ===
              true ||
            safeUpper(
              reportData.tracking_status
            ) === "COMPLETED";

          if (reportAlreadyDelivered) {
            throw new Error(
              "This passenger has already been marked as delivered."
            );
          }

          const reportPayload = {
            passenger_delivered:
              true,

            tracking_status:
              "COMPLETED",

            delivered_location:
              finalDestination,

            delivered_at:
              serverTimestamp(),

            dropoff_location:
              finalDestination,

            dropoff_at:
              serverTimestamp(),

            current_location:
              finalDestination,

            last_location:
              currentLocation,

            is_active: false,
            alerts_enabled: false,

            last_location_update_at:
              serverTimestamp(),

            last_updated_at:
              serverTimestamp(),

            last_updated_by:
              currentAgentName,

            last_updated_by_id:
              currentAgentId,

            current_segment_id: "",

            current_segment_ended_at:
              serverTimestamp(),

            current_segment_end_location:
              finalDestination,
          };

          if (
            destinationIsGate &&
            !reportData.gate_arrived_at
          ) {
            reportPayload.gate_location =
              finalDestination;

            reportPayload.gate_arrived_at =
              serverTimestamp();
          }

          transaction.update(
            reportRef,
            reportPayload
          );

          if (segmentRef) {
            transaction.set(
              segmentRef,
              {
                end_location:
                  finalDestination,

                ended_at:
                  serverTimestamp(),

                segment_status:
                  "COMPLETED",

                passenger_delivered:
                  true,

                updated_at:
                  serverTimestamp(),
              },
              {
                merge: true,
              }
            );
          }

          transaction.set(
            inventoryRef,
            {
              wheelchair_number:
                cleanWheelchairNumber(
                  activeService.wheelchair_number
                ),

              location:
                finalDestination,

              previous_location:
                currentLocation,

              status:
                destinationIsHandoff
                  ? "AVAILABLE_HANDOFF"
                  : "AVAILABLE",

              is_available:
                true,

              report_doc_id:
                reportRef.id,

              assigned_report_doc_id:
                reportRef.id,

              report_id:
                reportData.report_id ||
                activeService.report_id ||
                "",

              assigned_report_id:
                reportData.report_id ||
                activeService.report_id ||
                "",

              passenger_name:
                reportData.passenger_name ||
                activeService.passenger_name ||
                "",

              airline:
                reportData.airline ||
                activeService.airline ||
                "",

              flight_number:
                reportData.flight_number ||
                activeService.flight_number ||
                "",

              pnr:
                reportData.pnr ||
                activeService.pnr ||
                "",

              wch_type:
                reportData.wch_type ||
                "WCHR",

              previous_agent_id:
                currentAgentId,

              previous_agent_name:
                currentAgentName,

              current_agent_id: "",
              current_agent_name: "",

              available_for_handoff:
                destinationIsHandoff,

              delivered_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),

              updated_by_id:
                currentAgentId,

              updated_by_name:
                currentAgentName,
            },
            {
              merge: true,
            }
          );

          transaction.set(
            sessionRef,
            {
              is_active: false,

              tracking_status:
                "COMPLETED",

              passenger_delivered:
                true,

              delivered_location:
                finalDestination,

              delivered_at:
                serverTimestamp(),

              current_location:
                finalDestination,

              active_report_id: "",
              report_doc_id: "",

              inventory_doc_id: "",
              service_segment_id: "",

              completed_at:
                serverTimestamp(),

              updated_at:
                serverTimestamp(),
            },
            {
              merge: true,
            }
          );
        }
      );

      await addDoc(
        collection(
          db,
          TRACKING_EVENTS_COLLECTION
        ),
        {
          report_doc_id:
            activeService.report_doc_id,

          report_id:
            activeService.report_id ||
            "",

          wheelchair_number:
            activeService.wheelchair_number ||
            "",

          passenger_name:
            activeService.passenger_name ||
            "",

          airline:
            activeService.airline ||
            "",

          pnr:
            activeService.pnr ||
            "",

          flight_number:
            activeService.flight_number ||
            "",

          event_type:
            destinationIsHandoff
              ? "PASSENGER_DELIVERED_HANDOFF_AVAILABLE"
              : "PASSENGER_DELIVERED",

          location:
            finalDestination,

          previous_location:
            currentLocation,

          notes:
            destinationIsHandoff
              ? `Passenger delivered at ${finalDestination}. Wheelchair is available for another employee.`
              : `Passenger delivered at ${finalDestination}`,

          service_segment_id:
            segmentId,

          tracking_status:
            "COMPLETED",

          passenger_delivered:
            true,

          is_active: false,
          alerts_enabled: false,

          wheelchair_available:
            true,

          available_for_handoff:
            destinationIsHandoff,

          employee_id:
            currentAgentId,

          employee_name:
            currentAgentName,

          created_at:
            serverTimestamp(),
        }
      );

      setActiveService(null);
      setDeliveryLocation(
        "Main Terminal"
      );

      setMode("scan");
      setStep("upload");
      setParsed(emptyParsed());
      setSelectedInventory(null);
      setImageFile(null);
      setImageUrl("");

      setMessage(
        destinationIsHandoff
          ? `Passenger delivered at ${finalDestination}. Wheelchair ${
              activeService.wheelchair_number ||
              ""
            } is now available there for another employee.`
          : `Passenger delivered at ${finalDestination}. You may now take another wheelchair.`
      );
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
  if (!user) {
  ...
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
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            top: -85,
            right: -45,
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
              Start a new wheelchair service or continue an existing service
              from TSA, CBP, Main Terminal or another approved handoff
              location.
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
              onClick={() => navigate("/wchr/my-reports")}
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
            Delivered before starting or accepting another service.
          </div>
        </PageCard>
      )}

      {!hasActiveService && !sessionLoading && (
        <>
          <PageCard style={{ padding: 22 }}>
            <div
              style={{
                display: "grid",
                gap: 16,
              }}
            >
              <div>
                <FieldLabel>Pickup Location</FieldLabel>

                <SelectInput
                  label=""
                  value={startLocation}
                  onChange={(value) => {
                    setStartLocation(value);
                    setSelectedInventory(null);
                    setParsed(emptyParsed());
                    setImageFile(null);
                    setImageUrl("");
                    setError("");
                    setMessage("");

                    if (isHandoffLocation(value)) {
                      setMode("manual");
                      setStep("handoff");
                    } else {
                      setMode("scan");
                      setStep("upload");
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
                  Wheelchairs left at this location will appear below. Select
                  the wheelchair you are taking so the passenger information
                  and previous report can continue without being entered again.
                </div>
              )}

              {!isHandoffLocation(startLocation) && (
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
                        setSelectedInventory(null);
                        setParsed(emptyParsed());
                        setImageFile(null);
                        setImageUrl("");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Scan Boarding Pass
                    </ActionButton>

                    <ActionButton
                      variant={mode === "manual" ? "primary" : "secondary"}
                      onClick={() => {
                        setMode("manual");
                        setStep("manual");
                        setSelectedInventory(null);
                        setImageFile(null);
                        setImageUrl("");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Manual Entry
                    </ActionButton>
                  </div>
                </div>
              )}

              {!selectedInventory && (
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
                </div>
              )}

              {mode === "scan" &&
                !isHandoffLocation(startLocation) &&
                !selectedInventory && (
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
                        style={{
                          width: "100%",
                          border: "1px solid #dbeafe",
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

          <AvailableWheelchairsCard
            startLocation={startLocation}
            loading={inventoryLoading}
            rows={availableWheelchairs}
            selectedInventoryId={selectedInventory?.id || ""}
            onSelect={handleSelectAvailableWheelchair}
          />

          <SelectedHandoffCard
            wheelchair={selectedInventory}
            onClear={handleClearSelectedWheelchair}
          />

          {selectedInventory && (
            <>
              <StatusCard
                parsed={parsed}
                user={user}
                startLocation={
                  selectedInventory.location || startLocation
                }
                isContinuingService
              />

              <PageCard style={{ padding: 22 }}>
                <div
                  style={{
                    background: "#f8fbff",
                    border: "1px solid #dbeafe",
                    borderRadius: 18,
                    padding: 16,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 900,
                      color: "#0f172a",
                    }}
                  >
                    Continue Existing Passenger Service
                  </h3>

                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      color: "#64748b",
                      lineHeight: 1.6,
                    }}
                  >
                    The original passenger report will remain the same. A new
                    employee service segment will be created for your portion
                    of the trip.
                  </p>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(190px, 1fr))",
                    gap: 12,
                  }}
                >
                  <StatusPill
                    label="Wheelchair"
                    value={selectedInventory.wheelchair_number || "—"}
                    tone="blue"
                  />

                  <StatusPill
                    label="Passenger"
                    value={selectedInventory.passenger_name || "—"}
                    tone="slate"
                  />

                  <StatusPill
                    label="Flight"
                    value={
                      selectedInventory.flight_number
                        ? `${selectedInventory.airline || ""} ${
                            selectedInventory.flight_number
                          }`
                        : "—"
                    }
                    tone="slate"
                  />

                  <StatusPill
                    label="PNR"
                    value={selectedInventory.pnr || "—"}
                    tone="slate"
                  />

                  <StatusPill
                    label="Pickup Point"
                    value={selectedInventory.location || startLocation}
                    tone="green"
                  />

                  <StatusPill
                    label="Previous Agent"
                    value={selectedInventory.previous_agent_name || "—"}
                    tone="slate"
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: 18,
                  }}
                >
                  <ActionButton
                    variant="success"
                    onClick={handleTakeAvailableWheelchair}
                    disabled={takingHandoff || !canSubmit}
                  >
                    {takingHandoff
                      ? "Assigning Wheelchair..."
                      : `Take Wheelchair ${
                          selectedInventory.wheelchair_number || ""
                        }`}
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    onClick={handleClearSelectedWheelchair}
                    disabled={takingHandoff}
                  >
                    Cancel Selection
                  </ActionButton>
                </div>
              </PageCard>
            </>
          )}

          {!selectedInventory &&
            mode === "manual" &&
            !isHandoffLocation(startLocation) && (
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

          {!selectedInventory &&
            mode === "scan" &&
            step === "preview" &&
            parsed &&
            !isHandoffLocation(startLocation) && (
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

          {isHandoffLocation(startLocation) &&
            !inventoryLoading &&
            availableWheelchairs.length === 0 &&
            !selectedInventory && (
              <PageCard style={{ padding: 18 }}>
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: 16,
                    padding: "14px 16px",
                    color: "#92400e",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1.6,
                  }}
                >
                  No available wheelchairs are currently registered at{" "}
                  <b>{startLocation}</b>. Select another pickup location or
                  confirm that the previous employee correctly released the
                  wheelchair.
                </div>
              </PageCard>
            )}
        </>
      )}
    </div>
  );
}
