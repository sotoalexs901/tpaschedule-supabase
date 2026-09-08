// src/pages/WCHRScan.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

// ============================================================
// COLLECTIONS
// ============================================================

const REPORTS_COLLECTION = "wch_reports";
const TRACKING_EVENTS_COLLECTION = "wch_tracking_events";
const INVENTORY_COLLECTION = "wchr_inventory";
const DAILY_FLIGHTS_COLLECTION = "wchr_daily_flights";

// ============================================================
// CONSTANTS
// ============================================================

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
  "Main Terminal",
  "Other",
];

const WCHR_TYPES = [
  "WCHR",
  "WCHS",
  "WCHC",
];

// ============================================================
// HELPERS
// ============================================================

function pad2(number) {
  return String(number).padStart(2, "0");
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(date.getDate())}`;
}

function compactDateKey(date = new Date()) {
  return `${date.getFullYear()}${pad2(
    date.getMonth() + 1
  )}${pad2(date.getDate())}`;
}

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
}

function cleanPnr(value) {
  return safeUpper(value).replace(
    /[^A-Z0-9]/g,
    ""
  );
}

function cleanWheelchairNumber(value) {
  return safeUpper(value).replace(
    /[^A-Z0-9-]/g,
    ""
  );
}

function normalizePassengerName(value) {
  const clean = safeText(value);

  if (!clean) {
    return "";
  }

  if (clean.includes("/")) {
    return clean
      .split("/")
      .map((part) =>
        part
          .toLowerCase()
          .replace(
            /\b\w/g,
            (character) =>
              character.toUpperCase()
          )
          .trim()
      )
      .join(" / ");
  }

  return clean
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    )
    .trim();
}

function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    user?.email ||
    "WCHR Supervisor"
  );
}

function getUserId(user) {
  return safeText(
    user?.id ||
      user?.uid ||
      user?.username ||
      user?.email
  );
}

function getWheelchairDocumentId(
  wheelchairNumber
) {
  const cleanNumber =
    cleanWheelchairNumber(
      wheelchairNumber
    );

  if (!cleanNumber) {
    return "";
  }

  return cleanNumber
    .toLowerCase()
    .replace(
      /[^a-z0-9-]/g,
      "-"
    )
    .replace(
      /-+/g,
      "-"
    );
}

function buildFlightKey(
  airline,
  flightNumber,
  serviceDate = new Date()
) {
  return `${safeUpper(
    airline
  )}-${safeUpper(
    flightNumber
  )}-${compactDateKey(
    serviceDate
  )}`;
}

function getMillis(value) {
  if (!value) return 0;

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? 0
    : parsed.getTime();
}

function formatFlightTime(value) {
  if (!value) return "";

  if (
    typeof value === "string" &&
    /^\d{1,2}:\d{2}$/.test(value)
  ) {
    return value;
  }

  const millis =
    getMillis(value);

  if (!millis) {
    return safeText(value);
  }

  return new Date(
    millis
  ).toLocaleTimeString(
    undefined,
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function getDailyFlightLabel(flight) {
  const airline =
    safeUpper(
      flight.airline
    );

  const flightNumber =
    safeUpper(
      flight.flight_number
    );

  const time =
    formatFlightTime(
      flight.departure_time ||
        flight.flight_time ||
        flight.scheduled_time
    );

  const destination =
    safeUpper(
      flight.destination
    );

  const gate =
    safeUpper(
      flight.gate
    );

  return [
    `${airline} ${flightNumber}`.trim(),
    time,
    destination,
    gate,
  ]
    .filter(Boolean)
    .join(" · ");
}

function isInventoryUnavailable(data) {
  if (!data) {
    return false;
  }

  const status =
    safeUpper(
      data.status
    );

  const activeStatuses = [
    "READY_FOR_PICKUP",
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "AT_GATE",
    "BOARDING",
    "BOARDED",
    "PENDING_STORAGE",
    "IN_USE",
  ];

  if (
    activeStatuses.includes(status)
  ) {
    return true;
  }

  if (
    data.is_available === false &&
    status !== "AVAILABLE" &&
    status !== "STORED"
  ) {
    return true;
  }

  return false;
}

// ============================================================
// VIEWPORT
// ============================================================

function useViewport() {
  const [width, setWidth] =
    useState(() =>
      typeof window !==
      "undefined"
        ? window.innerWidth
        : 1280
    );

  useEffect(() => {
    const handleResize =
      () => {
        setWidth(
          window.innerWidth
        );
      };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, []);

  return {
    width,
    isMobile:
      width < 768,
    isTablet:
      width >= 768 &&
      width < 1100,
  };
}

// ============================================================
// UI COMPONENTS
// ============================================================

function PageCard({
  children,
  style = {},
}) {
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        background:
          "rgba(255,255,255,0.96)",
        border:
          "1px solid #e2e8f0",
        borderRadius: 22,
        boxShadow:
          "0 16px 38px rgba(15,23,42,0.07)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  children,
  required = false,
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 900,
        color: "#64748b",
        textTransform:
          "uppercase",
        letterSpacing:
          "0.07em",
      }}
    >
      {children}

      {required && (
        <span
          style={{
            color: "#dc2626",
            marginLeft: 4,
          }}
        >
          *
        </span>
      )}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder = "",
  disabled = false,
  required = false,
}) {
  return (
    <div>
      <FieldLabel
        required={required}
      >
        {label}
      </FieldLabel>

      <input
        type="text"
        value={value || ""}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={
          placeholder
        }
        disabled={disabled}
        style={{
          width: "100%",
          minWidth: 0,
          boxSizing:
            "border-box",
          border:
            "1px solid #dbeafe",
          background:
            disabled
              ? "#f8fafc"
              : "#ffffff",
          borderRadius: 13,
          padding:
            "11px 13px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          fontFamily:
            "inherit",
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
  required = false,
  placeholder = "Select",
}) {
  return (
    <div>
      <FieldLabel
        required={required}
      >
        {label}
      </FieldLabel>

      <select
        value={value || ""}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        disabled={disabled}
        style={{
          width: "100%",
          minWidth: 0,
          boxSizing:
            "border-box",
          border:
            "1px solid #dbeafe",
          background:
            disabled
              ? "#f8fafc"
              : "#ffffff",
          borderRadius: 13,
          padding:
            "11px 13px",
          fontSize: 14,
          color: "#0f172a",
          outline: "none",
          fontFamily:
            "inherit",
        }}
      >
        <option value="">
          {placeholder}
        </option>

        {options.map(
          (option) => {
            if (
              typeof option ===
              "string"
            ) {
              return (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              );
            }

            return (
              <option
                key={
                  option.value
                }
                value={
                  option.value
                }
              >
                {option.label}
              </option>
            );
          }
        )}
      </select>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  style = {},
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
      border:
        "1px solid #cfe7fb",
    },

    success: {
      background:
        "#16a34a",
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
        borderRadius: 13,
        padding:
          "11px 15px",
        fontSize: 13,
        fontWeight: 850,
        fontFamily:
          "inherit",
        cursor: disabled
          ? "not-allowed"
          : "pointer",
        opacity: disabled
          ? 0.55
          : 1,
        boxSizing:
          "border-box",
        ...variants[
          variant
        ],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StatusPill({
  label,
  value,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background:
        "#eff6ff",
      border:
        "1px solid #bfdbfe",
      color:
        "#1d4ed8",
    },

    green: {
      background:
        "#ecfdf5",
      border:
        "1px solid #bbf7d0",
      color:
        "#166534",
    },

    slate: {
      background:
        "#f8fafc",
      border:
        "1px solid #e2e8f0",
      color:
        "#334155",
    },

    amber: {
      background:
        "#fffbeb",
      border:
        "1px solid #fde68a",
      color:
        "#92400e",
    },
  };

  return (
    <div
      style={{
        padding:
          "11px 12px",
        borderRadius: 14,
        ...tones[tone],
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          textTransform:
            "uppercase",
          letterSpacing:
            "0.06em",
          opacity: 0.76,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 3,
          fontSize: 13,
          fontWeight: 850,
          lineHeight: 1.4,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function WCHRScan() {
  const navigate =
    useNavigate();

  const { user } =
    useUser();

  const {
    isMobile,
    isTablet,
  } = useViewport();

  const today =
    dateKey();

  // ============================================================
  // FORM
  // ============================================================

  const [
    passengerName,
    setPassengerName,
  ] = useState("");

  const [
    pnr,
    setPnr,
  ] = useState("");

  const [
    wheelchairNumber,
    setWheelchairNumber,
  ] = useState("");

  const [
    wchType,
    setWchType,
  ] = useState("WCHR");

  const [
    startLocation,
    setStartLocation,
  ] = useState("Counter");

  const [
    selectedFlightId,
    setSelectedFlightId,
  ] = useState("");

  // ============================================================
  // DAILY FLIGHTS
  // ============================================================

  const [
    dailyFlights,
    setDailyFlights,
  ] = useState([]);

  const [
    flightsLoading,
    setFlightsLoading,
  ] = useState(true);

  // ============================================================
  // SUBMIT STATE
  // ============================================================

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    lastCreatedService,
    setLastCreatedService,
  ] = useState(null);

  // ============================================================
  // USER
  // ============================================================

  const currentUserId =
    getUserId(user);

  const currentUserName =
    getVisibleUserName(
      user
    );

  // ============================================================
  // LOAD TODAY'S FLIGHTS FROM DISPATCH
  // ============================================================

  useEffect(() => {
    setFlightsLoading(
      true
    );

    setSelectedFlightId(
      ""
    );

    const flightsQuery =
      query(
        collection(
          db,
          DAILY_FLIGHTS_COLLECTION
        ),
        where(
          "service_date",
          "==",
          today
        )
      );

    const unsubscribe =
      onSnapshot(
        flightsQuery,
        (snapshot) => {
          const rows =
            snapshot.docs
              .map(
                (item) => ({
                  id: item.id,
                  ...item.data(),
                })
              )
              .filter(
                (flight) =>
                  flight.enabled !==
                    false &&
                  flight.active !==
                    false &&
                  safeText(
                    flight.airline
                  ) &&
                  safeText(
                    flight.flight_number
                  )
              )
              .sort(
                (a, b) => {
                  const timeA =
                    safeText(
                      a.departure_time ||
                        a.flight_time ||
                        a.scheduled_time
                    );

                  const timeB =
                    safeText(
                      b.departure_time ||
                        b.flight_time ||
                        b.scheduled_time
                    );

                  if (
                    timeA !==
                    timeB
                  ) {
                    return timeA.localeCompare(
                      timeB
                    );
                  }

                  return getDailyFlightLabel(
                    a
                  ).localeCompare(
                    getDailyFlightLabel(
                      b
                    )
                  );
                }
              );

          setDailyFlights(
            rows
          );

          setFlightsLoading(
            false
          );
        },
        (err) => {
          console.error(
            "Daily WCHR flights listener error:",
            err
          );

          setDailyFlights(
            []
          );

          setFlightsLoading(
            false
          );

          setError(
            "Today's WCHR flight list could not be loaded."
          );
        }
      );

    return () =>
      unsubscribe();
  }, [today]);

  // ============================================================
  // SELECTED FLIGHT
  // ============================================================

  const selectedFlight =
    useMemo(
      () =>
        dailyFlights.find(
          (flight) =>
            flight.id ===
            selectedFlightId
        ) || null,
      [
        dailyFlights,
        selectedFlightId,
      ]
    );

  const airline =
    safeUpper(
      selectedFlight?.airline
    );

  const flightNumber =
    safeUpper(
      selectedFlight?.flight_number
    );

  // ============================================================
  // FLIGHT OPTIONS
  // ============================================================

  const flightOptions =
    useMemo(
      () =>
        dailyFlights.map(
          (flight) => ({
            value:
              flight.id,
            label:
              getDailyFlightLabel(
                flight
              ),
          })
        ),
      [dailyFlights]
    );

  // ============================================================
  // FORM VALIDATION
  // ============================================================

  const formValid =
    useMemo(() => {
      return Boolean(
        safeText(
          passengerName
        ) &&
          cleanPnr(pnr) &&
          cleanWheelchairNumber(
            wheelchairNumber
          ) &&
          safeText(
            wchType
          ) &&
          safeText(
            startLocation
          ) &&
          selectedFlight &&
          airline &&
          flightNumber
      );
    }, [
      passengerName,
      pnr,
      wheelchairNumber,
      wchType,
      startLocation,
      selectedFlight,
      airline,
      flightNumber,
    ]);

  // ============================================================
  // RESET
  // ============================================================

  const resetForm =
    () => {
      setPassengerName(
        ""
      );

      setPnr(
        ""
      );

      setWheelchairNumber(
        ""
      );

      setWchType(
        "WCHR"
      );

      setStartLocation(
        "Counter"
      );

      setSelectedFlightId(
        ""
      );
    };

  // ============================================================
  // CREATE READY SERVICE
  // ============================================================

  const handleSubmit =
    async (
      event
    ) => {
      event?.preventDefault?.();

      setError("");
      setMessage("");

      if (!user) {
        setError(
          "You must be logged in."
        );
        return;
      }

      if (
        !selectedFlight
      ) {
        setError(
          "Please select one of today's approved WCHR flights."
        );
        return;
      }

      if (
        !airline ||
        !flightNumber
      ) {
        setError(
          "Airline and Flight Number are required."
        );
        return;
      }

      if (!formValid) {
        setError(
          "Please complete Passenger Name, Flight, PNR, WCHR Number, WCHR Type and Pickup Location."
        );
        return;
      }

      const finalPassengerName =
        normalizePassengerName(
          passengerName
        );

      const finalPnr =
        cleanPnr(pnr);

      const finalWheelchairNumber =
        cleanWheelchairNumber(
          wheelchairNumber
        );

      const finalStartLocation =
        safeText(
          startLocation
        );

      const inventoryDocumentId =
        getWheelchairDocumentId(
          finalWheelchairNumber
        );

      if (
        !inventoryDocumentId
      ) {
        setError(
          "Please enter a valid wheelchair number."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Declare WCHR ${finalWheelchairNumber} READY FOR PICKUP?\n\n` +
            `Passenger: ${finalPassengerName}\n` +
            `Flight: ${airline} ${flightNumber}\n` +
            `Location: ${finalStartLocation}\n\n` +
            `The service timer will start immediately.`
        );

      if (!confirmed) {
        return;
      }

      try {
        setSubmitting(
          true
        );

        const now =
          new Date();

        const reportRef =
          doc(
            collection(
              db,
              REPORTS_COLLECTION
            )
          );

        const inventoryRef =
          doc(
            db,
            INVENTORY_COLLECTION,
            inventoryDocumentId
          );

        const trackingEventRef =
          doc(
            collection(
              db,
              TRACKING_EVENTS_COLLECTION
            )
          );

        const reportId =
          `WCHR-${compactDateKey(
            now
          )}-${reportRef.id
            .slice(-6)
            .toUpperCase()}`;

        const flightKey =
          buildFlightKey(
            airline,
            flightNumber,
            now
          );

        await runTransaction(
          db,
          async (
            transaction
          ) => {
            // ==================================================
            // CHECK WHEELCHAIR
            // ==================================================

            const inventorySnapshot =
              await transaction.get(
                inventoryRef
              );

            if (
              inventorySnapshot.exists()
            ) {
              const inventoryData =
                inventorySnapshot.data();

              if (
                isInventoryUnavailable(
                  inventoryData
                )
              ) {
                const currentPassenger =
                  safeText(
                    inventoryData.passenger_name
                  );

                const currentFlight =
                  [
                    safeUpper(
                      inventoryData.airline
                    ),
                    safeUpper(
                      inventoryData.flight_number
                    ),
                  ]
                    .filter(
                      Boolean
                    )
                    .join(" ");

                throw new Error(
                  `Wheelchair ${finalWheelchairNumber} is already active` +
                    `${
                      currentPassenger
                        ? ` for ${currentPassenger}`
                        : ""
                    }` +
                    `${
                      currentFlight
                        ? ` on ${currentFlight}`
                        : ""
                    }.`
                );
              }
            }

            // ==================================================
            // CREATE REPORT
            // ==================================================

            transaction.set(
              reportRef,
              {
                report_id:
                  reportId,

                service_date:
                  today,

                // ----------------------------------------------
                // Passenger
                // ----------------------------------------------

                passenger_name:
                  finalPassengerName,

                pnr:
                  finalPnr,

                wch_type:
                  safeUpper(
                    wchType
                  ),

                wheelchair_number:
                  finalWheelchairNumber,

                // ----------------------------------------------
                // Flight
                // ----------------------------------------------

                daily_flight_id:
                  selectedFlight.id,

                airline,

                flight_number:
                  flightNumber,

                flight_key:
                  flightKey,

                destination:
                  safeUpper(
                    selectedFlight.destination
                  ),

                gate:
                  safeUpper(
                    selectedFlight.gate
                  ),

                scheduled_time:
                  selectedFlight.departure_time ||
                  selectedFlight.flight_time ||
                  selectedFlight.scheduled_time ||
                  "",

                // ----------------------------------------------
                // Creation
                // ----------------------------------------------

                created_at:
                  serverTimestamp(),

                submitted_at:
                  serverTimestamp(),

                created_by_user_id:
                  currentUserId,

                created_by_username:
                  user?.username ||
                  user?.loginUsername ||
                  "",

                created_by_name:
                  currentUserName,

                created_by_role:
                  user?.role ||
                  "",

                entry_mode:
                  "MANUAL",

                // ----------------------------------------------
                // READY FOR PICKUP
                // ----------------------------------------------

                status:
                  "NEW",

                service_status:
                  "READY_FOR_PICKUP",

                tracking_status:
                  "READY_FOR_PICKUP",

                ready_for_pickup:
                  true,

                ready_for_pickup_at:
                  serverTimestamp(),

                timer_started_at:
                  serverTimestamp(),

                ready_location:
                  finalStartLocation,

                pickup_location:
                  finalStartLocation,

                current_location:
                  finalStartLocation,

                last_location:
                  finalStartLocation,

                last_location_update_at:
                  serverTimestamp(),

                // ----------------------------------------------
                // Assignment - EMPTY UNTIL DISPATCH
                // ----------------------------------------------

                wchr_agent_id:
                  "",

                wchr_agent_name:
                  "",

                assigned_agent_id:
                  "",

                assigned_wchr_agent:
                  "",

                assigned_at:
                  null,

                assigned_by_user_id:
                  "",

                assigned_by_name:
                  "",

                assignment_status:
                  "UNASSIGNED",

                // ----------------------------------------------
                // Journey
                // ----------------------------------------------

                pickup_at:
                  null,

                gate_location:
                  "",

                gate_arrived_at:
                  null,

                delivered_location:
                  "",

                delivered_at:
                  null,

                boarded_at:
                  null,

                boarded_by_name:
                  "",

                stored_location:
                  "",

                stored_at:
                  null,

                passenger_delivered:
                  false,

                passenger_boarded:
                  false,

                // ----------------------------------------------
                // Active tracking
                // ----------------------------------------------

                is_active:
                  true,

                alerts_enabled:
                  true,

                alert_after_minutes:
                  30,

                last_alert_at:
                  null,

                // ----------------------------------------------
                // Billing
                // ----------------------------------------------

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

                // ----------------------------------------------
                // Misc
                // ----------------------------------------------

                inventory_doc_id:
                  inventoryDocumentId,

                last_updated_at:
                  serverTimestamp(),

                last_updated_by:
                  currentUserName,

                last_updated_by_id:
                  currentUserId,
              }
            );

            // ==================================================
            // RESERVE WHEELCHAIR
            // ==================================================

            transaction.set(
              inventoryRef,
              {
                wheelchair_number:
                  finalWheelchairNumber,

                status:
                  "READY_FOR_PICKUP",

                is_available:
                  false,

                available_for_handoff:
                  false,

                location:
                  finalStartLocation,

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
                  safeUpper(
                    wchType
                  ),

                current_agent_id:
                  "",

                current_agent_name:
                  "",

                previous_agent_id:
                  "",

                previous_agent_name:
                  "",

                ready_for_pickup_at:
                  serverTimestamp(),

                updated_at:
                  serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            // ==================================================
            // TIMELINE EVENT
            // ==================================================

            transaction.set(
              trackingEventRef,
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

                flight_number:
                  flightNumber,

                pnr:
                  finalPnr,

                event_type:
                  "READY_FOR_PICKUP",

                location:
                  finalStartLocation,

                previous_location:
                  "",

                notes:
                  `WCHR ${finalWheelchairNumber} declared Ready for Pickup at ${finalStartLocation}.`,

                service_status:
                  "READY_FOR_PICKUP",

                tracking_status:
                  "READY_FOR_PICKUP",

                passenger_delivered:
                  false,

                passenger_boarded:
                  false,

                is_active:
                  true,

                alerts_enabled:
                  true,

                employee_id:
                  currentUserId,

                employee_name:
                  currentUserName,

                employee_role:
                  user?.role ||
                  "",

                created_at:
                  serverTimestamp(),
              }
            );
          }
        );

        setLastCreatedService(
          {
            reportId,
            wheelchairNumber:
              finalWheelchairNumber,
            passengerName:
              finalPassengerName,
            airline,
            flightNumber,
            location:
              finalStartLocation,
          }
        );

        setMessage(
          `WCHR ${finalWheelchairNumber} is READY FOR PICKUP. The timer is running and the service is now available in WCHR Dispatch.`
        );

        resetForm();
      } catch (
        submitError
      ) {
        console.error(
          "WCHR Ready for Pickup error:",
          submitError
        );

        setError(
          submitError?.message ||
            "Unable to create the wheelchair service."
        );
      } finally {
        setSubmitting(
          false
        );
      }
    };

  // ============================================================
  // NOT LOGGED IN
  // ============================================================

  if (!user) {
    return (
      <PageCard
        style={{
          padding: 22,
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        You must be logged in to create a WCHR service.
      </PageCard>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1050,
        margin: "0 auto",
        display: "grid",
        gap:
          isMobile
            ? 12
            : 18,
        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
        boxSizing:
          "border-box",
      }}
    >
      {/* ====================================================== */}
      {/* HERO */}
      {/* ====================================================== */}

      <div
        style={{
          position:
            "relative",
          overflow:
            "hidden",
          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",
          borderRadius:
            isMobile
              ? 20
              : 28,
          padding:
            isMobile
              ? 17
              : 23,
          color:
            "#ffffff",
          boxShadow:
            "0 22px 55px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            position:
              "absolute",
            width: 220,
            height: 220,
            borderRadius: 999,
            background:
              "rgba(255,255,255,0.07)",
            right: -70,
            top: -90,
          }}
        />

        <div
          style={{
            position:
              "relative",
            display: "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            justifyContent:
              "space-between",
            alignItems:
              isMobile
                ? "stretch"
                : "center",
            gap: 15,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: 13,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                flex:
                  "0 0 52px",
                borderRadius: 16,
                background:
                  "#ffffff",
                overflow:
                  "hidden",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={APP_NAME}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit:
                    "contain",
                }}
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  color:
                    "rgba(255,255,255,0.72)",
                  textTransform:
                    "uppercase",
                  letterSpacing:
                    "0.14em",
                }}
              >
                {APP_NAME} · WCHR Intake
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",
                  fontSize:
                    isMobile
                      ? 23
                      : 29,
                  lineHeight: 1.08,
                  fontWeight: 900,
                  letterSpacing:
                    "-0.035em",
                }}
              >
                New Wheelchair Service
              </h1>

              <div
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color:
                    "rgba(255,255,255,0.86)",
                }}
              >
                Enter the passenger information manually and declare the
                wheelchair Ready for Pickup.
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: 10,
                  color:
                    "rgba(255,255,255,0.66)",
                  fontWeight: 700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap:
                "wrap",
            }}
          >
            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/wchr/admin/flights"
                )
              }
            >
              WCHR Reports
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/dashboard"
                )
              }
            >
              Back
            </ActionButton>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* MESSAGES */}
      {/* ====================================================== */}

      {error && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              background:
                "#fff1f2",
              border:
                "1px solid #fecdd3",
              color:
                "#9f1239",
              padding:
                "12px 14px",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.55,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard
          style={{
            padding: 14,
          }}
        >
          <div
            style={{
              background:
                "#ecfdf5",
              border:
                "1px solid #a7f3d0",
              color:
                "#065f46",
              padding:
                "12px 14px",
              borderRadius: 14,
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.55,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* FLIGHT STATUS */}
      {/* ====================================================== */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 19,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection:
              isMobile
                ? "column"
                : "row",
            justifyContent:
              "space-between",
            alignItems:
              isMobile
                ? "stretch"
                : "center",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                color:
                  "#1769aa",
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.07em",
              }}
            >
              Today's WCHR Operation
            </div>

            <h2
              style={{
                margin:
                  "4px 0 3px",
                fontSize:
                  isMobile
                    ? 18
                    : 20,
                color:
                  "#0f172a",
                fontWeight: 900,
              }}
            >
              {today}
            </h2>

            <div
              style={{
                fontSize: 12,
                color:
                  "#64748b",
              }}
            >
              Only flights activated by WCHR Dispatch can receive new
              wheelchair services.
            </div>
          </div>

          <div
            style={{
              padding:
                "8px 11px",
              borderRadius: 999,
              background:
                dailyFlights.length
                  ? "#ecfdf5"
                  : "#fff7ed",
              border:
                dailyFlights.length
                  ? "1px solid #bbf7d0"
                  : "1px solid #fed7aa",
              color:
                dailyFlights.length
                  ? "#166534"
                  : "#9a3412",
              fontSize: 11,
              fontWeight: 900,
              width:
                "fit-content",
            }}
          >
            {flightsLoading
              ? "Loading Flights..."
              : `${dailyFlights.length} Active Flight${
                  dailyFlights.length ===
                  1
                    ? ""
                    : "s"
                }`}
          </div>
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* NO DAILY FLIGHTS */}
      {/* ====================================================== */}

      {!flightsLoading &&
        dailyFlights.length ===
          0 && (
          <PageCard
            style={{
              padding:
                isMobile
                  ? 16
                  : 20,
              border:
                "1px solid #fed7aa",
            }}
          >
            <div
              style={{
                background:
                  "#fff7ed",
                border:
                  "1px solid #fed7aa",
                borderRadius: 16,
                padding:
                  "14px 15px",
                color:
                  "#9a3412",
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.6,
              }}
            >
              No WCHR flights have been opened for today. WCHR Dispatch must
              create today's flight operation before passenger wheelchair
              services can be entered.
            </div>
          </PageCard>
        )}

      {/* ====================================================== */}
      {/* FORM */}
      {/* ====================================================== */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 16
              : 22,
        }}
      >
        <form
          onSubmit={
            handleSubmit
          }
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize:
                  isMobile
                    ? 18
                    : 21,
                fontWeight: 900,
                color:
                  "#0f172a",
              }}
            >
              Passenger & Service Information
            </h2>

            <p
              style={{
                margin:
                  "5px 0 0",
                color:
                  "#64748b",
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            >
              All fields marked with * are required. Airline and flight number
              are controlled by today's WCHR Dispatch flight list.
            </p>
          </div>

          {/* ================================================== */}
          {/* FLIGHT */}
          {/* ================================================== */}

          <div
            style={{
              padding:
                isMobile
                  ? 13
                  : 16,
              borderRadius: 17,
              background:
                "#f8fbff",
              border:
                "1px solid #dbeafe",
            }}
          >
            <SelectInput
              label="Airline / Flight"
              required
              value={
                selectedFlightId
              }
              onChange={
                setSelectedFlightId
              }
              options={
                flightOptions
              }
              placeholder={
                flightsLoading
                  ? "Loading today's flights..."
                  : dailyFlights.length
                  ? "Select today's flight"
                  : "No flights available"
              }
              disabled={
                submitting ||
                flightsLoading ||
                !dailyFlights.length
              }
            />

            {selectedFlight && (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr 1fr"
                      : "repeat(4, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <StatusPill
                  label="Airline"
                  value={
                    airline
                  }
                  tone="blue"
                />

                <StatusPill
                  label="Flight"
                  value={
                    flightNumber
                  }
                  tone="blue"
                />

                <StatusPill
                  label="Destination"
                  value={
                    selectedFlight.destination ||
                    "—"
                  }
                  tone="slate"
                />

                <StatusPill
                  label="Gate"
                  value={
                    selectedFlight.gate ||
                    "—"
                  }
                  tone="slate"
                />
              </div>
            )}
          </div>

          {/* ================================================== */}
          {/* PASSENGER */}
          {/* ================================================== */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                isMobile ||
                isTablet
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <TextInput
              label="Passenger Name"
              required
              value={
                passengerName
              }
              onChange={
                setPassengerName
              }
              placeholder="CLAUDIA VERGARA"
              disabled={
                submitting
              }
            />

            <TextInput
              label="PNR / Reservation Code"
              required
              value={pnr}
              onChange={
                setPnr
              }
              placeholder="A7ILFB"
              disabled={
                submitting
              }
            />

            <TextInput
              label="WCHR Number"
              required
              value={
                wheelchairNumber
              }
              onChange={
                setWheelchairNumber
              }
              placeholder="023"
              disabled={
                submitting
              }
            />

            <SelectInput
              label="WCHR Type"
              required
              value={
                wchType
              }
              onChange={
                setWchType
              }
              options={
                WCHR_TYPES
              }
              disabled={
                submitting
              }
            />

            <SelectInput
              label="Pickup Location"
              required
              value={
                startLocation
              }
              onChange={
                setStartLocation
              }
              options={
                START_LOCATIONS
              }
              disabled={
                submitting
              }
            />
          </div>

          {/* ================================================== */}
          {/* IMPORTANT INFO */}
          {/* ================================================== */}

          <div
            style={{
              background:
                "#eff6ff",
              border:
                "1px solid #bfdbfe",
              borderRadius: 15,
              padding:
                "12px 14px",
              color:
                "#1d4ed8",
              fontSize: 12,
              lineHeight: 1.6,
              fontWeight: 750,
            }}
          >
            When you select <b>Declare Ready for Pickup</b>, the wheelchair
            becomes unavailable for other passengers, the service timer starts,
            and the wheelchair immediately appears in the WCHR Dispatch Center
            waiting for an agent assignment.
          </div>

          {/* ================================================== */}
          {/* PREVIEW */}
          {/* ================================================== */}

          {selectedFlight &&
            cleanWheelchairNumber(
              wheelchairNumber
            ) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    isMobile
                      ? "1fr 1fr"
                      : "repeat(4, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                <StatusPill
                  label="Wheelchair"
                  value={
                    cleanWheelchairNumber(
                      wheelchairNumber
                    )
                  }
                  tone="slate"
                />

                <StatusPill
                  label="Flight"
                  value={`${airline} ${flightNumber}`}
                  tone="slate"
                />

                <StatusPill
                  label="Pickup"
                  value={
                    startLocation
                  }
                  tone="blue"
                />

                <StatusPill
                  label="Next Status"
                  value="Ready for Pickup"
                  tone="green"
                />
              </div>
            )}

          {/* ================================================== */}
          {/* BUTTON */}
          {/* ================================================== */}

          <ActionButton
            type="submit"
            variant="success"
            disabled={
              submitting ||
              flightsLoading ||
              !dailyFlights.length ||
              !formValid
            }
            style={{
              width: "100%",
              minHeight: 48,
              fontSize: 14,
            }}
          >
            {submitting
              ? "Creating WCHR Service..."
              : "Declare Ready for Pickup"}
          </ActionButton>
        </form>
      </PageCard>

      {/* ====================================================== */}
      {/* LAST CREATED */}
      {/* ====================================================== */}

      {lastCreatedService && (
        <PageCard
          style={{
            padding:
              isMobile
                ? 16
                : 20,
            border:
              "1px solid #bbf7d0",
            background:
              "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              textTransform:
                "uppercase",
              letterSpacing:
                "0.08em",
              color:
                "#166534",
            }}
          >
            Last Service Created
          </div>

          <h2
            style={{
              margin:
                "5px 0 12px",
              fontSize:
                isMobile
                  ? 19
                  : 22,
              fontWeight: 900,
              color:
                "#0f172a",
            }}
          >
            WCHR{" "}
            {
              lastCreatedService.wheelchairNumber
            }{" "}
            · READY FOR PICKUP
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                isMobile
                  ? "1fr 1fr"
                  : "repeat(4, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            <StatusPill
              label="Passenger"
              value={
                lastCreatedService.passengerName
              }
              tone="slate"
            />

            <StatusPill
              label="Flight"
              value={`${lastCreatedService.airline} ${lastCreatedService.flightNumber}`}
              tone="slate"
            />

            <StatusPill
              label="Location"
              value={
                lastCreatedService.location
              }
              tone="blue"
            />

            <StatusPill
              label="Status"
              value="Waiting for Agent"
              tone="green"
            />
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* FOOTER */}
      {/* ====================================================== */}

      <div
        style={{
          textAlign:
            "center",
          padding:
            "2px 8px 10px",
          fontSize: 10,
          color:
            "#94a3b8",
        }}
      >
        {APP_NAME} ·{" "}
        {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WCHRScan.jsx
