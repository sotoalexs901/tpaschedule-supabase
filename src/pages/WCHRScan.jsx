// src/pages/WCHRScan.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  APP_NAME,
  APP_SUBTITLE,
} from "../config/appConfig.js";

import {
  safeUpper,
  cleanText,
} from "../utils/wchrOperations.js";

// ============================================================
// COLLECTIONS
// ============================================================

const REPORTS_COLLECTION = "wch_reports";

const TRACKING_EVENTS_COLLECTION =
  "wchr_tracking_events";

const INVENTORY_COLLECTION =
  "wchr_inventory";

const DAILY_FLIGHTS_COLLECTION =
  "wchr_daily_flights";

// ============================================================
// CONSTANTS
// ============================================================

const WCHR_TYPES = [
  "WCHR",
  "WCHS",
  "WCHC",
];

const START_LOCATIONS = [
  "Counter",
  "AV Ticket Counter",
  "SY Ticket Counter",
  "AM Ticket Counter",
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
  "Wheelchair Storage",
  "Other",
];

const PERSONAL_WCHR_VALUE =
  "__PERSONAL_WCHR__";

// ============================================================
// DATE HELPERS
// ============================================================

function pad2(value) {
  return String(value).padStart(
    2,
    "0"
  );
}

function toDateKey(
  date = new Date()
) {
  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1
  )}-${pad2(
    date.getDate()
  )}`;
}

function toCompactDate(
  date = new Date()
) {
  return `${date.getFullYear()}${pad2(
    date.getMonth() + 1
  )}${pad2(
    date.getDate()
  )}`;
}

// ============================================================
// TEXT HELPERS
// ============================================================

function normalizePassengerName(
  value
) {
  const text =
    cleanText(value);

  if (!text) {
    return "";
  }

  return text
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function cleanPnr(value) {
  return safeUpper(value)
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
}

function cleanWheelchairNumber(
  value
) {
  return safeUpper(value)
    .replace(
      /[^A-Z0-9-]/g,
      ""
    );
}

function getVisibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Management"
  );
}

// ============================================================
// INVENTORY HELPERS
// ============================================================

function getInventoryNumber(
  item
) {
  return cleanWheelchairNumber(
    item?.wheelchair_number ||
      item?.number ||
      item?.id ||
      ""
  );
}

function getInventoryStatus(
  item
) {
  const status =
    safeUpper(
      item?.status
    );

  if (
    item?.maintenance ===
      true ||
    status ===
      "MAINTENANCE" ||
    status ===
      "OUT_OF_SERVICE"
  ) {
    return "MAINTENANCE";
  }

  if (
    item?.available_for_handoff ===
      true ||
    status ===
      "AVAILABLE_HANDOFF"
  ) {
    return "AVAILABLE_HANDOFF";
  }

  if (
    item?.is_available ===
      true ||
    status ===
      "AVAILABLE" ||
    status ===
      "STORED"
  ) {
    return "AVAILABLE";
  }

  if (
    item?.is_available ===
      false ||
    [
      "READY_FOR_PICKUP",
      "ASSIGNED",
      "IN_USE",
      "PICKED_UP",
      "IN_TRANSIT",
      "AT_GATE",
      "BOARDING",
      "BOARDED",
      "PENDING_STORAGE",
    ].includes(status)
  ) {
    return "IN_USE";
  }

  return status || "UNKNOWN";
}

function inventoryIsAvailable(
  item
) {
  const status =
    getInventoryStatus(
      item
    );

  return (
    status === "AVAILABLE" ||
    status ===
      "AVAILABLE_HANDOFF"
  );
}

// ============================================================
// FLIGHT HELPERS
// ============================================================

function getFlightLabel(
  flight
) {
  const airline =
    safeUpper(
      flight?.airline
    );

  const flightNumber =
    safeUpper(
      flight?.flight_number
    );

  const gate =
    cleanText(
      flight?.gate
    );

  return [
    `${airline} ${flightNumber}`.trim(),
    gate
      ? `Gate ${gate.replace(
          /^GATE\s*/i,
          ""
        )}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildFlightKey(
  airline,
  flightNumber,
  date = new Date()
) {
  return `${safeUpper(
    airline
  )}-${safeUpper(
    flightNumber
  )}-${toCompactDate(
    date
  )}`;
}

function getFlightDateKey(
  flight
) {
  return cleanText(
    flight?.service_date ||
      flight?.flight_date ||
      flight?.date ||
      ""
  );
}

function isWchrFlightEnabled(
  flight
) {
  if (!flight) {
    return false;
  }

  if (
    flight.active === false ||
    flight.wchr_enabled === false ||
    flight.enabled_for_wchr === false ||
    flight.wchr_active === false
  ) {
    return false;
  }

  return true;
}

function flightIsOpenForDate(
  flight,
  dateKey
) {
  return (
    getFlightDateKey(flight) === dateKey &&
    safeUpper(
      flight?.status || "OPEN"
    ) === "OPEN" &&
    isWchrFlightEnabled(flight)
  );
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
        boxSizing:
          "border-box",

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
}) {
  return (
    <label
      style={{
        display: "block",

        marginBottom: 6,

        fontSize: 10,

        fontWeight: 900,

        color: "#64748b",

        textTransform:
          "uppercase",

        letterSpacing:
          "0.07em",
      }}
    >
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder = "",
  disabled = false,
}) {
  return (
    <input
      type="text"
      value={value || ""}
      disabled={disabled}
      placeholder={
        placeholder
      }
      onChange={(event) =>
        onChange(
          event.target.value
        )
      }
      style={{
        width: "100%",
        minWidth: 0,

        boxSizing:
          "border-box",

        border:
          "1px solid #dbeafe",

        borderRadius: 13,

        padding:
          "11px 13px",

        background:
          disabled
            ? "#f8fafc"
            : "#ffffff",

        color: "#0f172a",

        fontSize: 14,

        fontFamily:
          "inherit",

        outline: "none",
      }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  disabled = false,
  children,
}) {
  return (
    <select
      value={value || ""}
      disabled={disabled}
      onChange={(event) =>
        onChange(
          event.target.value
        )
      }
      style={{
        width: "100%",
        minWidth: 0,

        boxSizing:
          "border-box",

        border:
          "1px solid #dbeafe",

        borderRadius: 13,

        padding:
          "11px 13px",

        background:
          disabled
            ? "#f8fafc"
            : "#ffffff",

        color: "#0f172a",

        fontSize: 14,

        fontFamily:
          "inherit",

        outline: "none",
      }}
    >
      {children}
    </select>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  style = {},
}) {
  const variants = {
    primary: {
      background:
        "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",

      color:
        "#ffffff",

      border:
        "none",

      boxShadow:
        "0 10px 20px rgba(23,105,170,0.18)",
    },

    secondary: {
      background:
        "#ffffff",

      color:
        "#1769aa",

      border:
        "1px solid #cfe7fb",

      boxShadow:
        "none",
    },

    success: {
      background:
        "#16a34a",

      color:
        "#ffffff",

      border:
        "none",

      boxShadow:
        "0 10px 20px rgba(22,163,74,0.16)",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 12,

        padding:
          "10px 14px",

        fontSize: 13,

        fontWeight: 850,

        fontFamily:
          "inherit",

        cursor:
          disabled
            ? "not-allowed"
            : "pointer",

        opacity:
          disabled
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

function InfoField({
  label,
  value,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background:
        "#f8fbff",

      border:
        "#dbeafe",

      label:
        "#64748b",

      value:
        "#0f172a",
    },

    green: {
      background:
        "#f0fdf4",

      border:
        "#bbf7d0",

      label:
        "#15803d",

      value:
        "#166534",
    },

    amber: {
      background:
        "#fffbeb",

      border:
        "#fde68a",

      label:
        "#92400e",

      value:
        "#854d0e",
    },
  };

  const selected =
    tones[tone] ||
    tones.blue;

  return (
    <div
      style={{
        minWidth: 0,

        padding:
          "10px 11px",

        borderRadius: 13,

        background:
          selected.background,

        border:
          `1px solid ${selected.border}`,
      }}
    >
      <div
        style={{
          fontSize: 9,

          color:
            selected.label,

          textTransform:
            "uppercase",

          fontWeight: 900,

          letterSpacing:
            "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,

          fontSize: 13,

          color:
            selected.value,

          fontWeight: 800,

          lineHeight: 1.4,

          wordBreak:
            "break-word",
        }}
      >
        {value || "-"}
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

  const todayKey =
    useMemo(
      () =>
        toDateKey(
          new Date()
        ),
      []
    );

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
    wchType,
    setWchType,
  ] = useState(
    "WCHR"
  );

  const [
    startLocation,
    setStartLocation,
  ] = useState(
    "Counter"
  );

  const [
    selectedFlightId,
    setSelectedFlightId,
  ] = useState("");

  const [
    selectedWheelchairId,
    setSelectedWheelchairId,
  ] = useState("");

  // ============================================================
  // DATA
  // ============================================================

  const [
    flights,
    setFlights,
  ] = useState([]);

  const [
    inventory,
    setInventory,
  ] = useState([]);

  const [
    loadingFlights,
    setLoadingFlights,
  ] = useState(true);

  const [
    loadingInventory,
    setLoadingInventory,
  ] = useState(true);

  // ============================================================
  // ACTION
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

  // ============================================================
  // LIVE OPEN FLIGHTS
  // ============================================================

  useEffect(() => {
    setLoadingFlights(
      true
    );

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          DAILY_FLIGHTS_COLLECTION
        ),

        (snapshot) => {
          const rows =
            snapshot.docs
              .map(
                (
                  item
                ) => ({
                  id:
                    item.id,
                  ...item.data(),
                })
              )
              .filter(
                (flight) =>
                  flightIsOpenForDate(
                    flight,
                    todayKey
                  )
              )
              .sort(
                (
                  first,
                  second
                ) => {
                  const airlineCompare =
                    safeUpper(
                      first.airline
                    ).localeCompare(
                      safeUpper(
                        second.airline
                      )
                    );

                  if (
                    airlineCompare !==
                    0
                  ) {
                    return airlineCompare;
                  }

                  return safeUpper(
                    first.flight_number
                  ).localeCompare(
                    safeUpper(
                      second.flight_number
                    ),
                    undefined,
                    {
                      numeric:
                        true,
                    }
                  );
                }
              );

          setFlights(
            rows
          );

          setSelectedFlightId(
            (
              previous
            ) => {
              if (
                previous &&
                rows.some(
                  (
                    row
                  ) =>
                    row.id ===
                    previous
                )
              ) {
                return previous;
              }

              return "";
            }
          );

          setLoadingFlights(
            false
          );
        },

        (
          listenerError
        ) => {
          console.error(
            "WCHR daily flights listener error:",
            listenerError
          );

          setFlights(
            []
          );

          setLoadingFlights(
            false
          );

          setError(
            "Unable to load today's WCHR flights."
          );
        }
      );

    return () =>
      unsubscribe();
  }, [
    todayKey,
  ]);

  // ============================================================
  // LIVE INVENTORY
  // ============================================================

  useEffect(() => {
    setLoadingInventory(
      true
    );

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          INVENTORY_COLLECTION
        ),

        (
          snapshot
        ) => {
          const rows =
            snapshot.docs
              .map(
                (
                  item
                ) => ({
                  id:
                    item.id,

                  ...item.data(),
                })
              )
              .filter(
                (
                  item
                ) =>
                  inventoryIsAvailable(
                    item
                  )
              )
              .sort(
                (
                  first,
                  second
                ) =>
                  getInventoryNumber(
                    first
                  ).localeCompare(
                    getInventoryNumber(
                      second
                    ),
                    undefined,
                    {
                      numeric:
                        true,

                      sensitivity:
                        "base",
                    }
                  )
              );

          setInventory(
            rows
          );

          setSelectedWheelchairId(
            (
              previous
            ) => {
              if (
                previous ===
                PERSONAL_WCHR_VALUE
              ) {
                return previous;
              }

              if (
                previous &&
                rows.some(
                  (
                    row
                  ) =>
                    row.id ===
                    previous
                )
              ) {
                return previous;
              }

              return "";
            }
          );

          setLoadingInventory(
            false
          );
        },

        (
          listenerError
        ) => {
          console.error(
            "WCHR inventory listener error:",
            listenerError
          );

          setInventory(
            []
          );

          setLoadingInventory(
            false
          );

          setError(
            "Unable to load wheelchair inventory."
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  // ============================================================
  // SELECTED FLIGHT
  // ============================================================

  const selectedFlight =
    useMemo(
      () =>
        flights.find(
          (
            flight
          ) =>
            flight.id ===
            selectedFlightId
        ) || null,

      [
        flights,
        selectedFlightId,
      ]
    );

  // ============================================================
  // SELECTED INVENTORY
  // ============================================================

  const isPersonalWheelchair =
    selectedWheelchairId ===
    PERSONAL_WCHR_VALUE;

  const selectedInventory =
    useMemo(() => {
      if (
        isPersonalWheelchair
      ) {
        return null;
      }

      return (
        inventory.find(
          (
            item
          ) =>
            item.id ===
            selectedWheelchairId
        ) || null
      );
    }, [
      inventory,
      selectedWheelchairId,
      isPersonalWheelchair,
    ]);

  const wheelchairNumber =
    isPersonalWheelchair
      ? "PERSONAL"
      : getInventoryNumber(
          selectedInventory
        );

  // ============================================================
  // FORM VALIDATION
  // ============================================================

  const formReady =
    useMemo(() => {
      return Boolean(
        cleanText(
          passengerName
        ) &&
          cleanPnr(
            pnr
          ) &&
          selectedFlight &&
          selectedWheelchairId &&
          cleanText(
            wchType
          ) &&
          cleanText(
            startLocation
          ) &&
          !loadingFlights &&
          !loadingInventory
      );
    }, [
      passengerName,
      pnr,
      selectedFlight,
      selectedWheelchairId,
      wchType,
      startLocation,
      loadingFlights,
      loadingInventory,
    ]);

  // ============================================================
  // RESET
  // ============================================================

  const resetForm = () => {
    setPassengerName("");
    setPnr("");

    setWchType(
      "WCHR"
    );

    setStartLocation(
      "Counter"
    );

    setSelectedFlightId(
      ""
    );

    setSelectedWheelchairId(
      ""
    );
  };

  // ============================================================
  // CREATE READY SERVICE
  // ============================================================

  const handleSubmit =
    async () => {
      setError("");
      setMessage("");

      if (!user) {
        setError(
          "You must be logged in."
        );

        return;
      }

      if (
        !cleanText(
          passengerName
        )
      ) {
        setError(
          "Passenger Name is required."
        );

        return;
      }

      if (
        !cleanPnr(
          pnr
        )
      ) {
        setError(
          "PNR / Reservation Code is required."
        );

        return;
      }

      if (
        !selectedFlight
      ) {
        setError(
          "Please select an airline and flight from today's open flights."
        );

        return;
      }

      if (
        !selectedWheelchairId
      ) {
        setError(
          "Please select a wheelchair from inventory or choose Personal WCHR."
        );

        return;
      }

      if (
        !isPersonalWheelchair &&
        !selectedInventory
      ) {
        setError(
          "The selected wheelchair is no longer available."
        );

        return;
      }

      const finalPassengerName =
        normalizePassengerName(
          passengerName
        );

      const finalPnr =
        cleanPnr(
          pnr
        );

      const finalAirline =
        safeUpper(
          selectedFlight.airline
        );

      const finalFlightNumber =
        safeUpper(
          selectedFlight.flight_number
        );

      const finalGate =
        safeUpper(
          selectedFlight.gate
        );

      const finalStartLocation =
        cleanText(
          startLocation
        );

      const finalWchrType =
        safeUpper(
          wchType
        );

      const finalWheelchairNumber =
        isPersonalWheelchair
          ? "PERSONAL"
          : cleanWheelchairNumber(
              getInventoryNumber(
                selectedInventory
              )
            );

      const confirmed =
        window.confirm(
          [
            "Create this WCHR service?",
            "",
            `Passenger: ${finalPassengerName}`,
            `Flight: ${finalAirline} ${finalFlightNumber}`,
            `Wheelchair: ${
              isPersonalWheelchair
                ? "Personal WCHR"
                : finalWheelchairNumber
            }`,
            `Pickup: ${finalStartLocation}`,
            "",
            "The service timer will start immediately and the wheelchair will appear in Dispatch as Ready for Pickup.",
          ].join("\n")
        );

      if (!confirmed) {
        return;
      }

      try {
        setSubmitting(
          true
        );

        const reportRef =
          doc(
            collection(
              db,
              REPORTS_COLLECTION
            )
          );

        const trackingEventRef =
          doc(
            collection(
              db,
              TRACKING_EVENTS_COLLECTION
            )
          );

        const flightRef =
          doc(
            db,
            DAILY_FLIGHTS_COLLECTION,
            selectedFlight.id
          );

        const inventoryRef =
          !isPersonalWheelchair &&
          selectedInventory
            ? doc(
                db,
                INVENTORY_COLLECTION,
                selectedInventory.id
              )
            : null;

        const reportId =
          `WCHR-${toCompactDate(
            new Date()
          )}-${reportRef.id
            .slice(-6)
            .toUpperCase()}`;

        const flightKey =
          cleanText(
            selectedFlight.flight_key
          ) ||
          buildFlightKey(
            finalAirline,
            finalFlightNumber,
            new Date()
          );

        await runTransaction(
          db,
          async (
            transaction
          ) => {
            // ==================================================
            // RECHECK FLIGHT
            // ==================================================

            const flightSnapshot =
              await transaction.get(
                flightRef
              );

            if (
              !flightSnapshot.exists()
            ) {
              throw new Error(
                "This flight is no longer available."
              );
            }

            const flightData =
              flightSnapshot.data();

            if (
              !flightIsOpenForDate(
                flightData,
                todayKey
              )
            ) {
              throw new Error(
                `${finalAirline} ${finalFlightNumber} is no longer open for today's WCHR operation.`
              );
            }

            const authoritativeFlightKey =
              cleanText(
                flightData.flight_key ||
                  selectedFlight.flight_key
              ) ||
              flightKey;

            // ==================================================
            // RECHECK COMPANY WHEELCHAIR
            // ==================================================

            if (
              inventoryRef
            ) {
              const inventorySnapshot =
                await transaction.get(
                  inventoryRef
                );

              if (
                !inventorySnapshot.exists()
              ) {
                throw new Error(
                  `Wheelchair ${finalWheelchairNumber} no longer exists in inventory.`
                );
              }

              const inventoryData =
                inventorySnapshot.data();

              if (
                !inventoryIsAvailable(
                  inventoryData
                )
              ) {
                throw new Error(
                  `Wheelchair ${finalWheelchairNumber} is no longer available. Please select another wheelchair.`
                );
              }
            }

            // ==================================================
            // REPORT
            // ==================================================

            transaction.set(
              reportRef,
              {
                report_id:
                  reportId,

                // ----------------------------------------------
                // CREATED BY
                // ----------------------------------------------

                created_by_user_id:
                  user?.id ||
                  user?.uid ||
                  "",

                created_by_username:
                  user?.username ||
                  user?.loginUsername ||
                  "",

                created_by_name:
                  getVisibleName(
                    user
                  ),

                created_by_role:
                  user?.role ||
                  "",

                employee_id:
                  "",

                employee_name:
                  "",

                employee_login:
                  "",

                employee_role:
                  "",

                submitted_at:
                  serverTimestamp(),

                created_at:
                  serverTimestamp(),

                // ----------------------------------------------
                // PASSENGER
                // ----------------------------------------------

                passenger_name:
                  finalPassengerName,

                pnr:
                  finalPnr,

                wch_type:
                  finalWchrType,

                // ----------------------------------------------
                // FLIGHT
                // ----------------------------------------------

                daily_flight_id:
                  selectedFlight.id,

                airline:
                  finalAirline,

                flight_number:
                  finalFlightNumber,

                service_date:
                  todayKey,

                flight_date:
                  todayKey,

                gate:
                  finalGate,

                flight_key:
                  authoritativeFlightKey,

                // ----------------------------------------------
                // WHEELCHAIR
                // ----------------------------------------------

                wheelchair_number:
                  finalWheelchairNumber,

                wheelchair_source:
                  isPersonalWheelchair
                    ? "PERSONAL"
                    : "COMPANY",

                personal_wheelchair:
                  isPersonalWheelchair,

                inventory_doc_id:
                  isPersonalWheelchair
                    ? ""
                    : selectedInventory?.id ||
                      "",

                // ----------------------------------------------
                // READY FOR PICKUP
                // ----------------------------------------------

                status:
                  "NEW",

                entry_mode:
                  "MANUAL",

                ready_for_pickup:
                  true,

                ready_for_pickup_at:
                  serverTimestamp(),

                ready_location:
                  finalStartLocation,

                timer_started_at:
                  serverTimestamp(),

                service_status:
                  "READY_FOR_PICKUP",

                tracking_status:
                  "READY_FOR_PICKUP",

                assignment_status:
                  "UNASSIGNED",

                // ----------------------------------------------
                // NO AGENT YET
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

                // ----------------------------------------------
                // TRACKING
                // ----------------------------------------------

                tracking_enabled:
                  true,

                passenger_delivered:
                  false,

                current_location:
                  finalStartLocation,

                last_location:
                  finalStartLocation,

                pickup_location:
                  finalStartLocation,

                pickup_at:
                  null,

                initial_pickup_location:
                  finalStartLocation,

                initial_pickup_at:
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

                boarding_started_at:
                  null,

                stored_location:
                  "",

                stored_at:
                  null,

                // ----------------------------------------------
                // 15 / 30 MINUTE MONITORING
                // ----------------------------------------------

                is_active:
                  true,

                alerts_enabled:
                  true,

                alert_after_minutes:
                  30,

                last_alert_at:
                  null,

                gate_check_required:
                  false,

                gate_check_interval_minutes:
                  15,

                last_gate_check_at:
                  null,

                // ----------------------------------------------
                // BILLING
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
                // SYSTEM
                // ----------------------------------------------

                last_location_update_at:
                  serverTimestamp(),

                last_updated_at:
                  serverTimestamp(),

                last_updated_by:
                  getVisibleName(
                    user
                  ),

                last_updated_by_id:
                  user?.id ||
                  user?.uid ||
                  "",

                tracking_type:
                  "MANUAL",
              }
            );

            // ==================================================
            // COMPANY INVENTORY
            // ==================================================

            if (
              inventoryRef
            ) {
              transaction.update(
                inventoryRef,
                {
                  status:
                    "READY_FOR_PICKUP",

                  is_available:
                    false,

                  available_for_handoff:
                    false,

                  ready_for_pickup:
                    true,

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

                  airline:
                    finalAirline,

                  flight_number:
                    finalFlightNumber,

                  pnr:
                    finalPnr,

                  wch_type:
                    finalWchrType,

                  current_agent_id:
                    "",

                  current_agent_name:
                    "",

                  assigned_agent_id:
                    "",

                  assigned_agent_name:
                    "",

                  ready_for_pickup_at:
                    serverTimestamp(),

                  updated_at:
                    serverTimestamp(),
                }
              );
            }

            // ==================================================
            // FIRST TIMELINE EVENT
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

                wheelchair_source:
                  isPersonalWheelchair
                    ? "PERSONAL"
                    : "COMPANY",

                passenger_name:
                  finalPassengerName,

                airline:
                  finalAirline,

                flight_number:
                  finalFlightNumber,

                pnr:
                  finalPnr,

                event_type:
                  "READY_FOR_PICKUP",

                location:
                  finalStartLocation,

                previous_location:
                  "",

                notes:
                  isPersonalWheelchair
                    ? `Personal wheelchair service created and ready for pickup at ${finalStartLocation}.`
                    : `Wheelchair ${finalWheelchairNumber} prepared and ready for pickup at ${finalStartLocation}.`,

                tracking_status:
                  "READY_FOR_PICKUP",

                passenger_delivered:
                  false,

                is_active:
                  true,

                alerts_enabled:
                  true,

                employee_id:
                  user?.id ||
                  user?.uid ||
                  "",

                employee_name:
                  getVisibleName(
                    user
                  ),

                employee_role:
                  user?.role ||
                  "",

                created_at:
                  serverTimestamp(),
              }
            );
          }
        );

        setMessage(
          `${
            isPersonalWheelchair
              ? "Personal WCHR"
              : `WCHR ${finalWheelchairNumber}`
          } for ${finalPassengerName} is Ready for Pickup. The service timer is now running and the request is available in WCHR Dispatch.`
        );

        resetForm();
      } catch (
        submitError
      ) {
        console.error(
          "WCHR intake error:",
          submitError
        );

        setError(
          submitError?.message ||
            "Unable to create the WCHR service."
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

          margin:
            "0 auto",
        }}
      >
        <div
          style={{
            color:
              "#64748b",

            fontSize: 14,

            fontWeight: 700,
          }}
        >
          You must be logged in to create a WCHR service.
        </div>
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

        maxWidth: 1100,

        margin:
          "0 auto",

        display:
          "grid",

        gap:
          isMobile
            ? 12
            : 18,

        boxSizing:
          "border-box",

        fontFamily:
          "Poppins, Inter, system-ui, sans-serif",
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

          background:
            "linear-gradient(135deg, #061f3d 0%, #0f4c81 48%, #1769aa 72%, #4fb6e9 100%)",

          boxShadow:
            "0 22px 55px rgba(23,105,170,0.22)",
        }}
      >
        <div
          style={{
            position:
              "absolute",

            width:
              220,

            height:
              220,

            borderRadius:
              999,

            background:
              "rgba(255,255,255,0.07)",

            right:
              -65,

            top:
              -95,
          }}
        />

        <div
          style={{
            position:
              "relative",

            display:
              "flex",

            flexDirection:
              isMobile
                ? "column"
                : "row",

            justifyContent:
              "space-between",

            gap:
              15,

            alignItems:
              isMobile
                ? "flex-start"
                : "center",
          }}
        >
          <div
            style={{
              display:
                "flex",

              gap:
                13,

              alignItems:
                "center",

              minWidth:
                0,
            }}
          >
            <div
              style={{
                width:
                  52,

                height:
                  52,

                flex:
                  "0 0 52px",

                borderRadius:
                  16,

                overflow:
                  "hidden",

                background:
                  "#ffffff",
              }}
            >
              <img
                src="/icons/aerostation-icon.png"
                alt={
                  APP_NAME
                }
                style={{
                  width:
                    "100%",

                  height:
                    "100%",

                  objectFit:
                    "contain",
                }}
              />
            </div>

            <div
              style={{
                minWidth:
                  0,
              }}
            >
              <div
                style={{
                  fontSize:
                    9.5,

                  fontWeight:
                    900,

                  color:
                    "rgba(255,255,255,0.72)",

                  textTransform:
                    "uppercase",

                  letterSpacing:
                    "0.14em",
                }}
              >
                {APP_NAME} | WCHR Intake
              </div>

              <h1
                style={{
                  margin:
                    "5px 0 3px",

                  fontSize:
                    isMobile
                      ? 23
                      : 29,

                  lineHeight:
                    1.08,

                  fontWeight:
                    900,

                  letterSpacing:
                    "-0.035em",
                }}
              >
                New WCHR Service
              </h1>

              <div
                style={{
                  color:
                    "rgba(255,255,255,0.86)",

                  fontSize:
                    12.5,

                  lineHeight:
                    1.5,
                }}
              >
                Prepare the passenger service, select an approved flight and
                reserve an available wheelchair for Dispatch.
              </div>

              <div
                style={{
                  marginTop:
                    3,

                  fontSize:
                    10,

                  color:
                    "rgba(255,255,255,0.66)",

                  fontWeight:
                    700,
                }}
              >
                {APP_SUBTITLE}
              </div>
            </div>
          </div>

          <div
            style={{
              display:
                "flex",

              gap:
                8,

              flexWrap:
                "wrap",

              width:
                isMobile
                  ? "100%"
                  : "auto",
            }}
          >
            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/wchr/admin/dispatch"
                )
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              WCHR Dispatch
            </ActionButton>

            <ActionButton
              variant="secondary"
              onClick={() =>
                navigate(
                  "/wchr/admin/flights"
                )
              }
              style={{
                width:
                  isMobile
                    ? "100%"
                    : "auto",
              }}
            >
              WCHR Reports
            </ActionButton>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* MESSAGE */}
      {/* ====================================================== */}

      {error && (
        <PageCard
          style={{
            padding:
              14,
          }}
        >
          <div
            style={{
              background:
                "#fff1f2",

              border:
                "1px solid #fecdd3",

              borderRadius:
                14,

              padding:
                "11px 13px",

              color:
                "#9f1239",

              fontSize:
                13,

              lineHeight:
                1.55,

              fontWeight:
                800,
            }}
          >
            {error}
          </div>
        </PageCard>
      )}

      {message && (
        <PageCard
          style={{
            padding:
              14,
          }}
        >
          <div
            style={{
              background:
                "#ecfdf5",

              border:
                "1px solid #a7f3d0",

              borderRadius:
                14,

              padding:
                "11px 13px",

              color:
                "#065f46",

              fontSize:
                13,

              lineHeight:
                1.55,

              fontWeight:
                800,
            }}
          >
            {message}
          </div>
        </PageCard>
      )}

      {/* ====================================================== */}
      {/* OPERATION STATUS */}
      {/* ====================================================== */}

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            isMobile
              ? "1fr"
              : "repeat(3, minmax(0, 1fr))",

          gap:
            9,
        }}
      >
        <InfoField
          label="Operation Date"
          value={
            todayKey
          }
        />

        <InfoField
          label="Open Flights"
          value={
            loadingFlights
              ? "Loading..."
              : flights.length
          }
          tone={
            flights.length
              ? "green"
              : "amber"
          }
        />

        <InfoField
          label="Available Company WCHRs"
          value={
            loadingInventory
              ? "Loading..."
              : inventory.length
          }
          tone={
            inventory.length
              ? "green"
              : "amber"
          }
        />
      </div>

      {/* ====================================================== */}
      {/* NO FLIGHTS WARNING */}
      {/* ====================================================== */}

      {!loadingFlights &&
        flights.length ===
          0 && (
          <PageCard
            style={{
              padding:
                isMobile
                  ? 15
                  : 18,

              background:
                "#fff7ed",

              border:
                "1px solid #fed7aa",
            }}
          >
            <div
              style={{
                color:
                  "#9a3412",

                fontSize:
                  13,

                fontWeight:
                  800,

                lineHeight:
                  1.6,
              }}
            >
              No flights are currently OPEN and enabled for today's WCHR operation.
              WCHR Dispatch must add, enable, or reopen a flight before a new passenger
              service can be created.
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
              : 21,
        }}
      >
        <div
          style={{
            marginBottom:
              17,
          }}
        >
          <div
            style={{
              fontSize:
                10,

              fontWeight:
                900,

              color:
                "#1769aa",

              textTransform:
                "uppercase",

              letterSpacing:
                "0.08em",
            }}
          >
            Passenger Intake
          </div>

          <h2
            style={{
              margin:
                "4px 0 4px",

              fontSize:
                isMobile
                  ? 19
                  : 22,

              color:
                "#0f172a",

              fontWeight:
                900,
            }}
          >
            Prepare WCHR for Pickup
          </h2>

          <p
            style={{
              margin:
                0,

              fontSize:
                12.5,

              color:
                "#64748b",

              lineHeight:
                1.55,
            }}
          >
            All required information must be completed before the wheelchair
            becomes available to Dispatch.
          </p>
        </div>

        {/* ==================================================== */}
        {/* PASSENGER */}
        {/* ==================================================== */}

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              isMobile ||
              isTablet
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",

            gap:
              12,
          }}
        >
          <div>
            <FieldLabel>
              Passenger Name *
            </FieldLabel>

            <TextInput
              value={
                passengerName
              }
              onChange={
                setPassengerName
              }
              placeholder="Passenger full name"
              disabled={
                submitting
              }
            />
          </div>

          <div>
            <FieldLabel>
              PNR / Reservation Code *
            </FieldLabel>

            <TextInput
              value={
                pnr
              }
              onChange={
                setPnr
              }
              placeholder="A7ILFB"
              disabled={
                submitting
              }
            />
          </div>
        </div>

        {/* ==================================================== */}
        {/* FLIGHT */}
        {/* ==================================================== */}

        <div
          style={{
            marginTop:
              17,

            padding:
              isMobile
                ? 13
                : 16,

            borderRadius:
              17,

            background:
              "#f8fbff",

            border:
              "1px solid #dbeafe",
          }}
        >
          <div
            style={{
              marginBottom:
                11,
            }}
          >
            <div
              style={{
                fontSize:
                  10,

                color:
                  "#1769aa",

                fontWeight:
                  900,

                textTransform:
                  "uppercase",

                letterSpacing:
                  "0.07em",
              }}
            >
              Required Flight Selection
            </div>

            <div
              style={{
                marginTop:
                  4,

                fontSize:
                  11.5,

                color:
                  "#64748b",

                lineHeight:
                  1.5,
              }}
            >
              Airlines and flight numbers cannot be entered manually. Only
              flights opened by WCHR Dispatch are permitted.
            </div>
          </div>

          <FieldLabel>
            Airline / Flight *
          </FieldLabel>

          <SelectInput
            value={
              selectedFlightId
            }
            onChange={
              setSelectedFlightId
            }
            disabled={
              submitting ||
              loadingFlights ||
              flights.length ===
                0
            }
          >
            <option value="">
              {loadingFlights
                ? "Loading today's flights..."
                : flights.length
                ? "Select airline and flight"
                : "No open flights available"}
            </option>

            {flights.map(
              (
                flight
              ) => (
                <option
                  key={
                    flight.id
                  }
                  value={
                    flight.id
                  }
                >
                  {getFlightLabel(
                    flight
                  )}
                </option>
              )
            )}
          </SelectInput>

          {selectedFlight && (
            <div
              style={{
                marginTop:
                  11,

                display:
                  "grid",

                gridTemplateColumns:
                  isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))",

                gap:
                  8,
              }}
            >
              <InfoField
                label="Airline"
                value={
                  safeUpper(
                    selectedFlight.airline
                  )
                }
              />

              <InfoField
                label="Flight Number"
                value={
                  safeUpper(
                    selectedFlight.flight_number
                  )
                }
              />

              <InfoField
                label="Gate"
                value={
                  selectedFlight.gate ||
                  "Not Assigned"
                }
              />
            </div>
          )}
        </div>

        {/* ==================================================== */}
        {/* WHEELCHAIR */}
        {/* ==================================================== */}

        <div
          style={{
            marginTop:
              17,

            padding:
              isMobile
                ? 13
                : 16,

            borderRadius:
              17,

            background:
              "#f0fdf4",

            border:
              "1px solid #bbf7d0",
          }}
        >
          <div
            style={{
              marginBottom:
                11,
            }}
          >
            <div
              style={{
                fontSize:
                  10,

                color:
                  "#15803d",

                fontWeight:
                  900,

                textTransform:
                  "uppercase",

                letterSpacing:
                  "0.07em",
              }}
            >
              Wheelchair Inventory
            </div>

            <div
              style={{
                marginTop:
                  4,

                color:
                  "#166534",

                fontSize:
                  11.5,

                lineHeight:
                  1.55,
              }}
            >
              Only wheelchairs currently available in AeroStation inventory can
              be selected. Choose Personal WCHR when the passenger is using
              their own wheelchair.
            </div>
          </div>

          <FieldLabel>
            WCHR Number *
          </FieldLabel>

          <SelectInput
            value={
              selectedWheelchairId
            }
            onChange={
              setSelectedWheelchairId
            }
            disabled={
              submitting ||
              loadingInventory
            }
          >
            <option value="">
              {loadingInventory
                ? "Loading wheelchair inventory..."
                : "Select wheelchair"}
            </option>

            <option
              value={
                PERSONAL_WCHR_VALUE
              }
            >
              Personal WCHR - Passenger's Own Wheelchair
            </option>

            {inventory.map(
              (
                item
              ) => (
                <option
                  key={
                    item.id
                  }
                  value={
                    item.id
                  }
                >
                  WCHR{" "}
                  {getInventoryNumber(
                    item
                  )}
                  {item.location
                    ? ` | ${item.location}`
                    : ""}
                </option>
              )
            )}
          </SelectInput>

          {isPersonalWheelchair && (
            <div
              style={{
                marginTop:
                  10,

                padding:
                  "10px 11px",

                borderRadius:
                  12,

                background:
                  "#eff6ff",

                border:
                  "1px solid #bfdbfe",

                color:
                  "#1d4ed8",

                fontSize:
                  11.5,

                fontWeight:
                  750,

                lineHeight:
                  1.55,
              }}
            >
              Personal WCHR selected. This passenger service will be tracked
              normally, but no AeroStation wheelchair inventory unit will be
              reserved.
            </div>
          )}

          {selectedInventory &&
            !isPersonalWheelchair && (
              <div
                style={{
                  marginTop:
                    10,

                  display:
                    "grid",

                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "repeat(2, minmax(0, 1fr))",

                  gap:
                    8,
                }}
              >
                <InfoField
                  label="Selected Wheelchair"
                  value={`WCHR ${getInventoryNumber(
                    selectedInventory
                  )}`}
                  tone="green"
                />

                <InfoField
                  label="Current Location"
                  value={
                    selectedInventory.location ||
                    "Not Reported"
                  }
                  tone="green"
                />
              </div>
            )}
        </div>

        {/* ==================================================== */}
        {/* SERVICE SETTINGS */}
        {/* ==================================================== */}

        <div
          style={{
            marginTop:
              17,

            display:
              "grid",

            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(2, minmax(0, 1fr))",

            gap:
              12,
          }}
        >
          <div>
            <FieldLabel>
              WCHR Type *
            </FieldLabel>

            <SelectInput
              value={
                wchType
              }
              onChange={
                setWchType
              }
              disabled={
                submitting
              }
            >
              {WCHR_TYPES.map(
                (
                  type
                ) => (
                  <option
                    key={
                      type
                    }
                    value={
                      type
                    }
                  >
                    {type}
                  </option>
                )
              )}
            </SelectInput>
          </div>

          <div>
            <FieldLabel>
              Pickup Location *
            </FieldLabel>

            <SelectInput
              value={
                startLocation
              }
              onChange={
                setStartLocation
              }
              disabled={
                submitting
              }
            >
              {START_LOCATIONS.map(
                (
                  location
                ) => (
                  <option
                    key={
                      location
                    }
                    value={
                      location
                    }
                  >
                    {location}
                  </option>
                )
              )}
            </SelectInput>
          </div>
        </div>

        {/* ==================================================== */}
        {/* PREVIEW */}
        {/* ==================================================== */}

        {selectedFlight &&
          selectedWheelchairId && (
            <div
              style={{
                marginTop:
                  18,

                borderRadius:
                  17,

                padding:
                  isMobile
                    ? 13
                    : 16,

                background:
                  "#f8fafc",

                border:
                  "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize:
                    10,

                  fontWeight:
                    900,

                  color:
                    "#64748b",

                  textTransform:
                    "uppercase",

                  letterSpacing:
                    "0.07em",
                }}
              >
                Service Preview
              </div>

              <div
                style={{
                  marginTop:
                    10,

                  display:
                    "grid",

                  gridTemplateColumns:
                    isMobile
                      ? "1fr"
                      : "repeat(4, minmax(0, 1fr))",

                  gap:
                    8,
                }}
              >
                <InfoField
                  label="Passenger"
                  value={
                    normalizePassengerName(
                      passengerName
                    ) ||
                    "Pending"
                  }
                />

                <InfoField
                  label="Flight"
                  value={`${safeUpper(
                    selectedFlight.airline
                  )} ${safeUpper(
                    selectedFlight.flight_number
                  )}`}
                />

                <InfoField
                  label="Wheelchair"
                  value={
                    isPersonalWheelchair
                      ? "Personal WCHR"
                      : `WCHR ${wheelchairNumber}`
                  }
                />

                <InfoField
                  label="Pickup"
                  value={
                    startLocation
                  }
                />
              </div>

              <div
                style={{
                  marginTop:
                    11,

                  padding:
                    "10px 12px",

                  borderRadius:
                    13,

                  background:
                    "#eff6ff",

                  border:
                    "1px solid #bfdbfe",

                  color:
                    "#1d4ed8",

                  fontSize:
                    11.5,

                  lineHeight:
                    1.55,

                  fontWeight:
                    750,
                }}
              >
                When you click <b>Mark Ready for Pickup</b>, the operational
                timer begins immediately. The service will appear live in WCHR
                Dispatch for assignment to an available agent.
              </div>
            </div>
          )}

        {/* ==================================================== */}
        {/* SUBMIT */}
        {/* ==================================================== */}

        <div
          style={{
            marginTop:
              18,

            display:
              "flex",

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

            gap:
              10,
          }}
        >
          <div
            style={{
              fontSize:
                11,

              color:
                "#64748b",

              lineHeight:
                1.5,

              maxWidth:
                620,
            }}
          >
            The employee will not be assigned from this page. Agent assignment
            is controlled exclusively from WCHR Dispatch.
          </div>

          <ActionButton
            variant="success"
            onClick={
              handleSubmit
            }
            disabled={
              submitting ||
              !formReady
            }
            style={{
              width:
                isMobile
                  ? "100%"
                  : "auto",

              minHeight:
                46,

              padding:
                "11px 18px",
            }}
          >
            {submitting
              ? "Preparing WCHR..."
              : "Mark Ready for Pickup"}
          </ActionButton>
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* PROCESS EXPLANATION */}
      {/* ====================================================== */}

      <PageCard
        style={{
          padding:
            isMobile
              ? 15
              : 18,
        }}
      >
        <div
          style={{
            fontSize:
              10,

            color:
              "#1769aa",

            fontWeight:
              900,

            textTransform:
              "uppercase",

            letterSpacing:
              "0.07em",
          }}
        >
          Operational Flow
        </div>

        <div
          style={{
            marginTop:
              10,

            display:
              "grid",

            gridTemplateColumns:
              isMobile
                ? "1fr"
                : "repeat(4, minmax(0, 1fr))",

            gap:
              8,
          }}
        >
          <InfoField
            label="1 | Intake"
            value="Passenger + Flight + WCHR"
          />

          <InfoField
            label="2 | Ready"
            value="Timer Starts"
          />

          <InfoField
            label="3 | Dispatch"
            value="Supervisor Assigns Agent"
          />

          <InfoField
            label="4 | Agent"
            value="Journey Begins"
          />
        </div>
      </PageCard>

      {/* ====================================================== */}
      {/* FOOTER */}
      {/* ====================================================== */}

      <div
        style={{
          textAlign:
            "center",

          padding:
            "2px 8px 10px",

          fontSize:
            10,

          color:
            "#94a3b8",
        }}
      >
        {APP_NAME} | {APP_SUBTITLE}
      </div>
    </div>
  );
}

// END WCHRScan.jsx
