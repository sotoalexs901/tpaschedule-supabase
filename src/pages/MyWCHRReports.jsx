import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const STORED_WCHR_LOCATIONS = [
  "AV Ticket Counter",
  "SY Ticket Counter",
  "Gate F87",
  "Other Location",
];

const MAX_STORED_WHEELCHAIRS = 18;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatMMDDYYYYFromFirestore(value) {
  try {
    const date =
      value?.toDate?.() instanceof Date
        ? value.toDate()
        : value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return `${pad2(date.getMonth() + 1)}-${pad2(
      date.getDate()
    )}-${date.getFullYear()}`;
  } catch {
    return "";
  }
}

function formatDateTime(value) {
  try {
    const date =
      value?.toDate?.() instanceof Date
        ? value.toDate()
        : value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function toInputDateValue(value) {
  try {
    const date =
      value?.toDate?.() instanceof Date
        ? value.toDate()
        : value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return `${date.getFullYear()}-${pad2(
      date.getMonth() + 1
    )}-${pad2(date.getDate())}`;
  } catch {
    return "";
  }
}

function tsToDate(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function safeText(value) {
  return String(value || "").trim();
}

function safeUpper(value) {
  return safeText(value).toUpperCase();
}

function normalizeText(value) {
  return safeText(value).toLowerCase();
}

function cleanWheelchairNumber(value) {
  return safeUpper(value).replace(
    /[^A-Z0-9-]/g,
    ""
  );
}

function getWheelchairDocumentId(value) {
  return cleanWheelchairNumber(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "_");
}

function getUserId(user) {
  return safeText(
    user?.id ||
      user?.uid ||
      user?.username ||
      user?.email
  );
}

function getUserDisplayName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    user?.email ||
    ""
  );
}

function getWchrAgentName(row) {
  return (
    row?.wchr_agent_name ||
    row?.assigned_wchr_agent ||
    row?.activity_agent_name ||
    row?.employee_name ||
    "—"
  );
}

function getReportDate(row) {
  return (
    row?.flight_date ||
    row?.submitted_at ||
    row?.billing_date ||
    null
  );
}

function getInventoryStatus(row) {
  if (row?.is_available === false) {
    return "IN USE";
  }

  return safeUpper(row?.status || "STORED");
}

function dedupeReports(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.id)) {
      map.set(row.id, row);
    }
  });

  return Array.from(map.values());
}

function rowBelongsToUser(row, user) {
  const userId = getUserId(user);
  const username = normalizeText(
    user?.username
  );

  const displayName = normalizeText(
    getUserDisplayName(user)
  );

  const email = normalizeText(user?.email);

  const assignedId = safeText(
    row?.wchr_agent_id
  );

  const employeeId = safeText(
    row?.employee_id
  );

  const reportNames = [
    row?.wchr_agent_name,
    row?.assigned_wchr_agent,
    row?.activity_agent_name,
    row?.employee_name,
    row?.employee_login,
  ]
    .map(normalizeText)
    .filter(Boolean);

  if (
    userId &&
    (
      assignedId === userId ||
      employeeId === userId
    )
  ) {
    return true;
  }

  if (
    username &&
    reportNames.includes(username)
  ) {
    return true;
  }

  if (
    displayName &&
    reportNames.includes(displayName)
  ) {
    return true;
  }

  if (
    email &&
    reportNames.includes(email)
  ) {
    return true;
  }

  return false;
}

function parseWheelchairEntries(value) {
  const entries = String(value || "")
    .split(/[\n,;]+/)
    .map(cleanWheelchairNumber)
    .filter(Boolean);

  return Array.from(new Set(entries));
}

function groupReports(rows) {
  const grouped = {};

  rows.forEach((row) => {
    const dateKey =
      formatMMDDYYYYFromFirestore(
        getReportDate(row)
      ) || "No Date";

    const flightKey = `${
      row.airline || "—"
    } ${row.flight_number || "—"}`.trim();

    if (!grouped[dateKey]) {
      grouped[dateKey] = {};
    }

    if (!grouped[dateKey][flightKey]) {
      grouped[dateKey][flightKey] = [];
    }

    grouped[dateKey][flightKey].push(row);
  });

  return grouped;
}

function sortReportsByNewest(rows) {
  return [...rows].sort((a, b) => {
    const timeA =
      tsToDate(a.submitted_at)?.getTime() ||
      tsToDate(a.billing_date)?.getTime() ||
      0;

    const timeB =
      tsToDate(b.submitted_at)?.getTime() ||
      tsToDate(b.billing_date)?.getTime() ||
      0;

    return timeB - timeA;
  });
}

function sortInventory(rows) {
  return [...rows].sort((a, b) => {
    const locationCompare = safeText(
      a.location
    ).localeCompare(
      safeText(b.location)
    );

    if (locationCompare !== 0) {
      return locationCompare;
    }

    return safeText(
      a.wheelchair_number
    ).localeCompare(
      safeText(b.wheelchair_number),
      undefined,
      {
        numeric: true,
      }
    );
  });
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
      background: "#fff7ed",
      color: "#9a3412",
      border: "1px solid #fed7aa",
      boxShadow: "none",
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
        cursor: disabled
          ? "not-allowed"
          : "pointer",
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

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 14,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}

function TextAreaInput(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 130,
        resize: "vertical",
        border: "1px solid #dbeafe",
        background: "#ffffff",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 14,
        lineHeight: 1.6,
        color: "#0f172a",
        outline: "none",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
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
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </label>
  );
}

function statusBadge(status) {
  const normalizedStatus =
    safeUpper(status);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  if (normalizedStatus === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (
    normalizedStatus === "NEW" ||
    normalizedStatus === "AVAILABLE"
  ) {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  if (
    normalizedStatus === "STORED" ||
    normalizedStatus ===
      "STORED / AVAILABLE"
  ) {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#166534",
      borderColor: "#bbf7d0",
    };
  }

  if (
    normalizedStatus === "IN USE" ||
    normalizedStatus === "IN_USE"
  ) {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    };
  }

  if (
    normalizedStatus ===
      "HANDOFF_AVAILABLE" ||
    normalizedStatus ===
      "HANDOFF AVAILABLE"
  ) {
    return {
      ...base,
      background: "#fefce8",
      color: "#854d0e",
      borderColor: "#fde68a",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function InventoryStatCard({
  label,
  value,
  subtitle,
  tone = "blue",
}) {
  const tones = {
    blue: {
      background: "#f8fbff",
      border: "#dbeafe",
      color: "#1769aa",
    },

    green: {
      background: "#f0fdf4",
      border: "#bbf7d0",
      color: "#166534",
    },

    amber: {
      background: "#fffbeb",
      border: "#fde68a",
      color: "#92400e",
    },

    slate: {
      background: "#f8fafc",
      border: "#e2e8f0",
      color: "#334155",
    },
  };

  const selectedTone =
    tones[tone] || tones.blue;

  return (
    <div
      style={{
        background: selectedTone.background,
        border: `1px solid ${selectedTone.border}`,
        borderRadius: 16,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          lineHeight: 1,
          fontWeight: 900,
          color: selectedTone.color,
        }}
      >
        {value}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

function StoredWheelchairForm({
  location,
  setLocation,
  customLocation,
  setCustomLocation,
  wheelchairText,
  setWheelchairText,
  parsedNumbers,
  saving,
  onSave,
  onClear,
}) {
  const finalLocation =
    location === "Other Location"
      ? safeText(customLocation)
      : location;

  const tooMany =
    parsedNumbers.length >
    MAX_STORED_WHEELCHAIRS;

  return (
    <PageCard style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Store Wheelchairs
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              maxWidth: 720,
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Register up to 18 wheelchairs stored
            at the same location. Enter one number
            per line or separate the numbers with
            commas.
          </p>
        </div>

        <span
          style={statusBadge(
            tooMany
              ? "LATE"
              : "STORED"
          )}
        >
          {parsedNumbers.length}/
          {MAX_STORED_WHEELCHAIRS}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 14,
        }}
      >
        <div>
          <FieldLabel>
            Storage Location
          </FieldLabel>

          <SelectInput
            value={location}
            onChange={(event) =>
              setLocation(event.target.value)
            }
          >
            {STORED_WCHR_LOCATIONS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </SelectInput>
        </div>

        {location === "Other Location" && (
          <div>
            <FieldLabel>
              Write Location
            </FieldLabel>

            <TextInput
              value={customLocation}
              onChange={(event) =>
                setCustomLocation(
                  event.target.value
                )
              }
              placeholder="Example: Outside CBP"
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <FieldLabel>
          Wheelchair Numbers
        </FieldLabel>

        <TextAreaInput
          value={wheelchairText}
          onChange={(event) =>
            setWheelchairText(
              event.target.value
            )
          }
          placeholder={`Example:
23
34
WCHR-41

You may also enter: 23, 34, 41`}
        />
      </div>

      {parsedNumbers.length > 0 && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {parsedNumbers.map((number) => (
            <span
              key={number}
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "7px 11px",
                background: "#edf7ff",
                border: "1px solid #cfe7fb",
                color: "#1769aa",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              WCHR {number}
            </span>
          ))}
        </div>
      )}

      {tooMany && (
        <div
          style={{
            marginTop: 14,
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 14,
            padding: "12px 14px",
            color: "#be123c",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          A maximum of 18 wheelchair numbers
          can be stored in one submission.
        </div>
      )}

      {!finalLocation && (
        <div
          style={{
            marginTop: 14,
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            borderRadius: 14,
            padding: "12px 14px",
            color: "#9a3412",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Enter the storage location before
          saving.
        </div>
      )}

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
          onClick={onSave}
          disabled={
            saving ||
            parsedNumbers.length === 0 ||
            tooMany ||
            !finalLocation
          }
        >
          {saving
            ? "Saving Wheelchairs..."
            : `Save ${parsedNumbers.length || ""} Wheelchair${
                parsedNumbers.length === 1
                  ? ""
                  : "s"
              }`}
        </ActionButton>

        <ActionButton
          variant="secondary"
          onClick={onClear}
          disabled={saving}
        >
          Clear
        </ActionButton>
      </div>
    </PageCard>
  );
}

function StoredWheelchairInventory({
  rows,
  loading,
  updatingId,
  onMarkUnavailable,
  onMarkAvailable,
}) {
  return (
    <PageCard style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          Stored / Available Wheelchairs
        </h2>

        <p
          style={{
            margin: "5px 0 0",
            fontSize: 13,
            color: "#64748b",
            lineHeight: 1.6,
          }}
        >
          These wheelchairs will also appear in
          the WCHR Flight Report and will later
          be available for selection in the scan
          page.
        </p>
      </div>

      {loading ? (
        <div style={infoBoxStyle}>
          Loading wheelchair inventory...
        </div>
      ) : rows.length === 0 ? (
        <div style={infoBoxStyle}>
          No stored wheelchairs have been
          registered.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(245px, 1fr))",
            gap: 12,
          }}
        >
          {rows.map((row) => {
            const status =
              getInventoryStatus(row);

            const available =
              row.is_available !== false;

            return (
              <div
                key={row.id}
                style={{
                  border: available
                    ? "1px solid #bbf7d0"
                    : "1px solid #bfdbfe",
                  borderRadius: 18,
                  padding: 15,
                  background: available
                    ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)"
                    : "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: "#0f172a",
                      }}
                    >
                      WCHR{" "}
                      {row.wheelchair_number ||
                        "—"}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13,
                        color: "#475569",
                        fontWeight: 700,
                      }}
                    >
                      {row.location || "—"}
                    </div>
                  </div>

                  <span
                    style={statusBadge(status)}
                  >
                    {status}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 7,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <div>
                    Stored by:{" "}
                    <b>
                      {row.stored_by_name ||
                        "—"}
                    </b>
                  </div>

                  <div>
                    Updated:{" "}
                    <b>
                      {formatDateTime(
                        row.updated_at ||
                          row.stored_at
                      )}
                    </b>
                  </div>

                  {!available &&
                    row.assigned_agent_name && (
                      <div>
                        In use by:{" "}
                        <b>
                          {
                            row.assigned_agent_name
                          }
                        </b>
                      </div>
                    )}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {available ? (
                    <ActionButton
                      variant="warning"
                      onClick={() =>
                        onMarkUnavailable(row)
                      }
                      disabled={
                        updatingId === row.id
                      }
                    >
                      {updatingId === row.id
                        ? "Updating..."
                        : "Mark In Use"}
                    </ActionButton>
                  ) : (
                    <ActionButton
                      variant="success"
                      onClick={() =>
                        onMarkAvailable(row)
                      }
                      disabled={
                        updatingId === row.id
                      }
                    >
                      {updatingId === row.id
                        ? "Updating..."
                        : "Return to Storage"}
                    </ActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageCard>
  );
}
export default function MyWCHRReports() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryRows, setInventoryRows] = useState([]);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [editingRow, setEditingRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [storageLocation, setStorageLocation] = useState(
    "AV Ticket Counter"
  );

  const [customStorageLocation, setCustomStorageLocation] =
    useState("");

  const [wheelchairText, setWheelchairText] = useState("");
  const [savingInventory, setSavingInventory] = useState(false);
  const [updatingInventoryId, setUpdatingInventoryId] =
    useState("");

  const employeeId = useMemo(
    () => getUserId(user),
    [user]
  );

  const currentUserName = useMemo(
    () => getUserDisplayName(user),
    [user]
  );

  const parsedWheelchairNumbers = useMemo(
    () => parseWheelchairEntries(wheelchairText),
    [wheelchairText]
  );

  const groupedReports = useMemo(
    () => groupReports(rows),
    [rows]
  );

  const totalReports = rows.length;

  const availableWheelchairs = useMemo(
    () =>
      inventoryRows.filter(
        (row) => row.is_available !== false
      ),
    [inventoryRows]
  );

  const wheelchairsInUse = useMemo(
    () =>
      inventoryRows.filter(
        (row) => row.is_available === false
      ),
    [inventoryRows]
  );

  const finalStorageLocation = useMemo(() => {
    if (storageLocation === "Other Location") {
      return safeText(customStorageLocation);
    }

    return safeText(storageLocation);
  }, [
    storageLocation,
    customStorageLocation,
  ]);

  useEffect(() => {
    let mounted = true;

    async function loadReports() {
      setError("");
      setLoading(true);

      try {
        if (!user) {
          if (mounted) {
            setRows([]);
            setEmployees([]);
            setLoading(false);
          }

          return;
        }

        const employeeSnapshot = await getDocs(
          collection(db, "employees")
        );

        const employeeRows =
          employeeSnapshot.docs
            .map((employeeDoc) => ({
              id: employeeDoc.id,
              ...employeeDoc.data(),
            }))
            .sort((a, b) =>
              String(
                a.name ||
                  a.displayName ||
                  a.fullName ||
                  ""
              ).localeCompare(
                String(
                  b.name ||
                    b.displayName ||
                    b.fullName ||
                    ""
                )
              )
            );

        const reportQueries = [];
        const seenQueryKeys = new Set();

        const pushReportQuery = (
          field,
          value
        ) => {
          const cleanValue =
            safeText(value);

          if (!cleanValue) return;

          const queryKey =
            `${field}:${cleanValue}`;

          if (
            seenQueryKeys.has(queryKey)
          ) {
            return;
          }

          seenQueryKeys.add(queryKey);

          reportQueries.push(
            getDocs(
              query(
                collection(
                  db,
                  "wch_reports"
                ),
                where(
                  field,
                  "==",
                  cleanValue
                ),
                limit(150)
              )
            )
          );
        };

        pushReportQuery(
          "employee_id",
          getUserId(user)
        );

        pushReportQuery(
          "wchr_agent_id",
          getUserId(user)
        );

        pushReportQuery(
          "employee_login",
          user?.username
        );

        pushReportQuery(
          "employee_login",
          user?.email
        );

        pushReportQuery(
          "employee_name",
          getUserDisplayName(user)
        );

        pushReportQuery(
          "wchr_agent_name",
          getUserDisplayName(user)
        );

        pushReportQuery(
          "assigned_wchr_agent",
          getUserDisplayName(user)
        );

        pushReportQuery(
          "activity_agent_name",
          getUserDisplayName(user)
        );

        pushReportQuery(
          "wchr_agent_name",
          user?.username
        );

        pushReportQuery(
          "assigned_wchr_agent",
          user?.username
        );

        pushReportQuery(
          "activity_agent_name",
          user?.username
        );

        const snapshots =
          await Promise.all(
            reportQueries
          );

        const allReports =
          snapshots.flatMap(
            (snapshot) =>
              snapshot.docs.map(
                (reportDoc) => ({
                  id: reportDoc.id,
                  ...reportDoc.data(),
                })
              )
          );

        const filteredReports =
          sortReportsByNewest(
            dedupeReports(allReports).filter(
              (row) =>
                rowBelongsToUser(
                  row,
                  user
                )
            )
          );

        if (mounted) {
          setEmployees(employeeRows);
          setRows(filteredReports);
        }
      } catch (loadError) {
        console.error(
          "Failed to load My WCHR Reports:",
          loadError
        );

        if (mounted) {
          setError(
            loadError?.message ||
              "Failed to load reports."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadReports();

    return () => {
      mounted = false;
    };
  }, [employeeId, user]);

  useEffect(() => {
    let mounted = true;

    async function loadInventory() {
      setInventoryLoading(true);

      try {
        const inventorySnapshot =
          await getDocs(
            query(
              collection(
                db,
                "wchr_inventory"
              ),
              limit(300)
            )
          );

        const inventory =
          sortInventory(
            inventorySnapshot.docs.map(
              (inventoryDoc) => ({
                id: inventoryDoc.id,
                ...inventoryDoc.data(),
              })
            )
          );

        if (mounted) {
          setInventoryRows(inventory);
        }
      } catch (inventoryError) {
        console.error(
          "Failed to load WCHR inventory:",
          inventoryError
        );

        if (mounted) {
          setError(
            inventoryError?.message ||
              "Failed to load stored wheelchairs."
          );
        }
      } finally {
        if (mounted) {
          setInventoryLoading(false);
        }
      }
    }

    loadInventory();

    return () => {
      mounted = false;
    };
  }, []);

  const clearStoredWheelchairForm =
    () => {
      setWheelchairText("");
      setStorageLocation(
        "AV Ticket Counter"
      );
      setCustomStorageLocation("");
    };

  const handleSaveStoredWheelchairs =
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
        !parsedWheelchairNumbers.length
      ) {
        setError(
          "Enter at least one wheelchair number."
        );
        return;
      }

      if (
        parsedWheelchairNumbers.length >
        MAX_STORED_WHEELCHAIRS
      ) {
        setError(
          `You may save a maximum of ${MAX_STORED_WHEELCHAIRS} wheelchairs at one time.`
        );
        return;
      }

      if (!finalStorageLocation) {
        setError(
          "Enter the storage location."
        );
        return;
      }

      const duplicatedNumbers =
        parsedWheelchairNumbers.filter(
          (wheelchairNumber) =>
            inventoryRows.some(
              (inventoryRow) =>
                cleanWheelchairNumber(
                  inventoryRow.wheelchair_number
                ) ===
                cleanWheelchairNumber(
                  wheelchairNumber
                )
            )
        );

      const confirmed =
        window.confirm(
          duplicatedNumbers.length
            ? `${duplicatedNumbers.join(
                ", "
              )} already exist in the inventory. Their location and availability will be updated. Continue?`
            : `Save ${parsedWheelchairNumbers.length} wheelchair(s) at ${finalStorageLocation}?`
        );

      if (!confirmed) return;

      try {
        setSavingInventory(true);

        const batch =
          writeBatch(db);

        const now =
          serverTimestamp();

        parsedWheelchairNumbers.forEach(
          (wheelchairNumber) => {
            const inventoryId =
              getWheelchairDocumentId(
                wheelchairNumber
              );

            if (!inventoryId) return;

            const inventoryRef =
              doc(
                db,
                "wchr_inventory",
                inventoryId
              );

            batch.set(
              inventoryRef,
              {
                wheelchair_number:
                  wheelchairNumber,

                location:
                  finalStorageLocation,

                status: "STORED",

                inventory_type:
                  "STORED_WHEELCHAIR",

                is_available: true,
                is_active: false,

                assigned_report_id: "",
                assigned_report_doc_id: "",

                assigned_agent_id: "",
                assigned_agent_name: "",

                passenger_name: "",
                pnr: "",
                flight_number: "",

                stored_by_id:
                  employeeId,

                stored_by_name:
                  currentUserName,

                stored_at: now,
                updated_at: now,

                last_action:
                  "STORED",

                source:
                  "MY_WCHR_REPORTS",
              },
              {
                merge: true,
              }
            );
          }
        );

        await batch.commit();

        const localNow =
          new Date();

        const savedRows =
          parsedWheelchairNumbers.map(
            (wheelchairNumber) => {
              const inventoryId =
                getWheelchairDocumentId(
                  wheelchairNumber
                );

              return {
                id: inventoryId,

                wheelchair_number:
                  wheelchairNumber,

                location:
                  finalStorageLocation,

                status: "STORED",

                inventory_type:
                  "STORED_WHEELCHAIR",

                is_available: true,
                is_active: false,

                assigned_report_id: "",
                assigned_report_doc_id: "",

                assigned_agent_id: "",
                assigned_agent_name: "",

                passenger_name: "",
                pnr: "",
                flight_number: "",

                stored_by_id:
                  employeeId,

                stored_by_name:
                  currentUserName,

                stored_at: localNow,
                updated_at: localNow,

                last_action:
                  "STORED",

                source:
                  "MY_WCHR_REPORTS",
              };
            }
          );

        setInventoryRows(
          (previousRows) => {
            const updatedMap =
              new Map(
                previousRows.map(
                  (row) => [
                    row.id,
                    row,
                  ]
                )
              );

            savedRows.forEach(
              (row) => {
                updatedMap.set(
                  row.id,
                  {
                    ...(updatedMap.get(
                      row.id
                    ) || {}),
                    ...row,
                  }
                );
              }
            );

            return sortInventory(
              Array.from(
                updatedMap.values()
              )
            );
          }
        );

        setMessage(
          `${parsedWheelchairNumbers.length} wheelchair${
            parsedWheelchairNumbers.length ===
            1
              ? ""
              : "s"
          } saved at ${finalStorageLocation}.`
        );

        clearStoredWheelchairForm();
      } catch (saveError) {
        console.error(
          "Failed to save stored wheelchairs:",
          saveError
        );

        setError(
          saveError?.message ||
            "Failed to save the wheelchair inventory."
        );
      } finally {
        setSavingInventory(false);
      }
    };

  const handleMarkInventoryUnavailable =
    async (inventoryRow) => {
      const confirmed =
        window.confirm(
          `Mark wheelchair ${
            inventoryRow.wheelchair_number ||
            ""
          } as In Use?`
        );

      if (!confirmed) return;

      try {
        setUpdatingInventoryId(
          inventoryRow.id
        );

        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            "wchr_inventory",
            inventoryRow.id
          ),
          {
            status: "IN_USE",
            is_available: false,
            is_active: true,

            assigned_agent_id:
              employeeId,

            assigned_agent_name:
              currentUserName,

            checked_out_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),

            last_action:
              "MANUAL_CHECKOUT",
          }
        );

        setInventoryRows(
          (previousRows) =>
            sortInventory(
              previousRows.map(
                (row) =>
                  row.id ===
                  inventoryRow.id
                    ? {
                        ...row,

                        status:
                          "IN_USE",

                        is_available:
                          false,

                        is_active:
                          true,

                        assigned_agent_id:
                          employeeId,

                        assigned_agent_name:
                          currentUserName,

                        checked_out_at:
                          new Date(),

                        updated_at:
                          new Date(),

                        last_action:
                          "MANUAL_CHECKOUT",
                      }
                    : row
              )
            )
        );

        setMessage(
          `Wheelchair ${inventoryRow.wheelchair_number} marked as In Use.`
        );
      } catch (updateError) {
        console.error(
          "Failed to update wheelchair inventory:",
          updateError
        );

        setError(
          updateError?.message ||
            "Failed to update the wheelchair."
        );
      } finally {
        setUpdatingInventoryId("");
      }
    };

  const handleReturnInventoryToStorage =
    async (inventoryRow) => {
      const confirmed =
        window.confirm(
          `Return wheelchair ${
            inventoryRow.wheelchair_number ||
            ""
          } to storage at ${
            inventoryRow.location ||
            "its current location"
          }?`
        );

      if (!confirmed) return;

      try {
        setUpdatingInventoryId(
          inventoryRow.id
        );

        setError("");
        setMessage("");

        await updateDoc(
          doc(
            db,
            "wchr_inventory",
            inventoryRow.id
          ),
          {
            status: "STORED",
            is_available: true,
            is_active: false,

            assigned_report_id: "",
            assigned_report_doc_id: "",

            assigned_agent_id: "",
            assigned_agent_name: "",

            passenger_name: "",
            pnr: "",
            flight_number: "",

            stored_by_id:
              employeeId,

            stored_by_name:
              currentUserName,

            stored_at:
              serverTimestamp(),

            updated_at:
              serverTimestamp(),

            last_action:
              "RETURNED_TO_STORAGE",
          }
        );

        setInventoryRows(
          (previousRows) =>
            sortInventory(
              previousRows.map(
                (row) =>
                  row.id ===
                  inventoryRow.id
                    ? {
                        ...row,

                        status:
                          "STORED",

                        is_available:
                          true,

                        is_active:
                          false,

                        assigned_report_id:
                          "",

                        assigned_report_doc_id:
                          "",

                        assigned_agent_id:
                          "",

                        assigned_agent_name:
                          "",

                        passenger_name:
                          "",

                        pnr: "",

                        flight_number:
                          "",

                        stored_by_id:
                          employeeId,

                        stored_by_name:
                          currentUserName,

                        stored_at:
                          new Date(),

                        updated_at:
                          new Date(),

                        last_action:
                          "RETURNED_TO_STORAGE",
                      }
                    : row
              )
            )
        );

        setMessage(
          `Wheelchair ${inventoryRow.wheelchair_number} returned to storage.`
        );
      } catch (returnError) {
        console.error(
          "Failed to return wheelchair to storage:",
          returnError
        );

        setError(
          returnError?.message ||
            "Failed to return the wheelchair to storage."
        );
      } finally {
        setUpdatingInventoryId("");
      }
    };

  const handleOpenEdit = (row) => {
    const currentAgentName =
      getWchrAgentName(row);

    const matchedEmployee =
      employees.find(
        (employee) =>
          safeText(employee.id) ===
            safeText(
              row?.wchr_agent_id
            ) ||
          safeText(
            employee.name ||
              employee.displayName ||
              employee.fullName
          ) ===
            safeText(
              currentAgentName
            )
      ) || null;

    setEditingRow({
      ...row,

      flight_date:
        toInputDateValue(
          row.flight_date
        ),

      wchr_agent_name:
        currentAgentName === "—"
          ? ""
          : currentAgentName,

      wchr_agent_id:
        matchedEmployee?.id ||
        row?.wchr_agent_id ||
        "",
    });

    setError("");
    setMessage("");
  };
    const handleSaveEdit = async () => {
    if (!editingRow?.id) return;

    try {
      setSavingEdit(true);
      setError("");
      setMessage("");

      const matchedEmployee =
        employees.find(
          (employee) =>
            employee.id ===
            editingRow.wchr_agent_id
        ) || null;

      const finalWchrAgentName =
        matchedEmployee?.name ||
        matchedEmployee?.displayName ||
        matchedEmployee?.fullName ||
        editingRow.wchr_agent_name ||
        "";

      const finalWchrAgentId =
        matchedEmployee?.id ||
        editingRow.wchr_agent_id ||
        "";

      const flightDate =
        editingRow.flight_date
          ? new Date(
              `${editingRow.flight_date}T00:00:00`
            )
          : null;

      const payload = {
        passenger_name: safeText(
          editingRow.passenger_name
        ),

        airline: safeUpper(
          editingRow.airline
        ),

        flight_number: safeUpper(
          editingRow.flight_number
        ),

        flight_date: flightDate,

        origin: safeUpper(
          editingRow.origin
        ),

        destination: safeUpper(
          editingRow.destination
        ),

        seat: safeUpper(
          editingRow.seat
        ),

        gate: safeUpper(
          editingRow.gate
        ),

        pnr: safeUpper(
          editingRow.pnr
        ),

        wch_type: safeUpper(
          editingRow.wch_type
        ),

        wheelchair_number:
          cleanWheelchairNumber(
            editingRow.wheelchair_number
          ),

        wchr_agent_id:
          finalWchrAgentId,

        wchr_agent_name:
          finalWchrAgentName,

        assigned_wchr_agent:
          finalWchrAgentName,

        activity_agent_name:
          finalWchrAgentName,

        last_edited_by_id:
          employeeId,

        last_edited_by_name:
          currentUserName,

        last_edited_at:
          serverTimestamp(),
      };

      await updateDoc(
        doc(
          db,
          "wch_reports",
          editingRow.id
        ),
        payload
      );

      setRows((previousRows) =>
        sortReportsByNewest(
          previousRows.map((row) =>
            row.id === editingRow.id
              ? {
                  ...row,
                  ...payload,

                  flight_date:
                    flightDate,

                  last_edited_at:
                    new Date(),
                }
              : row
          )
        )
      );

      setEditingRow(null);

      setMessage(
        "Report updated successfully."
      );
    } catch (saveError) {
      console.error(
        "Failed to update WCHR report:",
        saveError
      );

      setError(
        saveError?.message ||
          "Error updating the report."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePrint = (row) => {
    const printWindow =
      window.open(
        "",
        "_blank",
        "width=900,height=700"
      );

    if (!printWindow) {
      setError(
        "The print window was blocked by the browser."
      );
      return;
    }

    const wchrAgentName =
      getWchrAgentName(row);

    const reportDate =
      formatMMDDYYYYFromFirestore(
        getReportDate(row)
      ) || "—";

    const safeHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>WCHR Report ${safeHtml(
            row.report_id || row.id
          )}</title>

          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
              background: #ffffff;
            }

            h1 {
              margin: 0 0 8px;
            }

            .meta {
              margin-bottom: 18px;
              line-height: 1.6;
            }

            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }

            .box {
              border: 1px solid #dbeafe;
              border-radius: 10px;
              padding: 12px;
              min-height: 48px;
            }

            .label {
              font-size: 11px;
              font-weight: bold;
              color: #64748b;
              text-transform: uppercase;
              margin-bottom: 6px;
              letter-spacing: 0.04em;
            }

            img {
              display: block;
              max-width: 420px;
              max-height: 420px;
              object-fit: contain;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
              margin-top: 18px;
            }

            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>

        <body>
          <h1>WCHR Report</h1>

          <div class="meta">
            <strong>Report ID:</strong>
            ${safeHtml(
              row.report_id || row.id
            )}
            <br />

            <strong>Status:</strong>
            ${safeHtml(
              row.status || "—"
            )}
          </div>

          <div class="grid">
            <div class="box">
              <div class="label">
                Passenger
              </div>

              ${safeHtml(
                row.passenger_name || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Flight
              </div>

              ${safeHtml(
                `${row.airline || "—"} ${
                  row.flight_number || ""
                }`
              )}
            </div>

            <div class="box">
              <div class="label">
                Date
              </div>

              ${safeHtml(reportDate)}
            </div>

            <div class="box">
              <div class="label">
                WCHR Type
              </div>

              ${safeHtml(
                row.wch_type || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                WCHR Agent
              </div>

              ${safeHtml(
                wchrAgentName
              )}
            </div>

            <div class="box">
              <div class="label">
                Wheelchair Number
              </div>

              ${safeHtml(
                row.wheelchair_number ||
                  "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Origin
              </div>

              ${safeHtml(
                row.origin || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Destination
              </div>

              ${safeHtml(
                row.destination || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Seat
              </div>

              ${safeHtml(
                row.seat || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Gate
              </div>

              ${safeHtml(
                row.gate || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                PNR
              </div>

              ${safeHtml(
                row.pnr || "—"
              )}
            </div>

            <div class="box">
              <div class="label">
                Current Location
              </div>

              ${safeHtml(
                row.current_location ||
                  "—"
              )}
            </div>
          </div>

          ${
            row.image_url
              ? `
                <div>
                  <img
                    src="${safeHtml(
                      row.image_url
                    )}"
                    alt="Boarding Pass"
                  />
                </div>
              `
              : ""
          }
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    window.setTimeout(() => {
      printWindow.print();
    }, 250);
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
        <div style={infoBoxStyle}>
          You must be logged in to view
          your WCHR reports.
        </div>
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
        maxWidth: 1180,
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
          boxShadow:
            "0 24px 60px rgba(23,105,170,0.22)",
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
            background:
              "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent:
              "space-between",
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
                textTransform:
                  "uppercase",
                letterSpacing:
                  "0.22em",
                color:
                  "rgba(255,255,255,0.78)",
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
                letterSpacing:
                  "-0.04em",
              }}
            >
              My WCHR Reports
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 780,
                fontSize: 14,
                color:
                  "rgba(255,255,255,0.88)",
                lineHeight: 1.6,
              }}
            >
              Review your passenger
              services and register
              wheelchairs stored at the
              station.
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
                navigate("/wchr/scan")
              }
              variant="primary"
            >
              + New Service
            </ActionButton>

            <ActionButton
              onClick={() =>
                navigate("/dashboard")
              }
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
                error
                  ? "#fecdd3"
                  : "#a7f3d0"
              }`,

              borderRadius: 16,
              padding: "14px 16px",

              color: error
                ? "#9f1239"
                : "#065f46",

              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            {error || message}
          </div>
        </PageCard>
      )}

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <InventoryStatCard
            label="My Reports"
            value={totalReports}
            subtitle="Passenger services assigned to you"
            tone="blue"
          />

          <InventoryStatCard
            label="Stored / Available"
            value={
              availableWheelchairs.length
            }
            subtitle="Wheelchairs ready for service"
            tone="green"
          />

          <InventoryStatCard
            label="Wheelchairs In Use"
            value={
              wheelchairsInUse.length
            }
            subtitle="Checked out from inventory"
            tone="amber"
          />

          <InventoryStatCard
            label="Inventory Total"
            value={
              inventoryRows.length
            }
            subtitle="All registered wheelchairs"
            tone="slate"
          />
        </div>
      </PageCard>

      <StoredWheelchairForm
        location={storageLocation}
        setLocation={setStorageLocation}
        customLocation={
          customStorageLocation
        }
        setCustomLocation={
          setCustomStorageLocation
        }
        wheelchairText={
          wheelchairText
        }
        setWheelchairText={
          setWheelchairText
        }
        parsedNumbers={
          parsedWheelchairNumbers
        }
        saving={savingInventory}
        onSave={
          handleSaveStoredWheelchairs
        }
        onClear={
          clearStoredWheelchairForm
        }
      />

      <StoredWheelchairInventory
        rows={inventoryRows}
        loading={inventoryLoading}
        updatingId={
          updatingInventoryId
        }
        onMarkUnavailable={
          handleMarkInventoryUnavailable
        }
        onMarkAvailable={
          handleReturnInventoryToStorage
        }
      />

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Reports by Date & Flight
          </h2>

          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.6,
            }}
          >
            Reports are grouped by
            service date and flight
            number.
          </p>
        </div>

        {loading ? (
          <div style={infoBoxStyle}>
            Loading reports...
          </div>
        ) : rows.length === 0 ? (
          <div style={infoBoxStyle}>
            No passenger service reports
            yet. Click{" "}
            <b>New Service</b> to start
            one.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            {Object.entries(
              groupedReports
            ).map(
              ([dateKey, flights]) => (
                <div
                  key={dateKey}
                  style={{
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      padding:
                        "10px 14px",
                      borderRadius: 14,
                      background:
                        "#edf7ff",
                      border:
                        "1px solid #cfe7fb",
                      color: "#1769aa",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    Date: {dateKey}
                  </div>

                  {Object.entries(
                    flights
                  ).map(
                    ([
                      flightKey,
                      reports,
                    ]) => (
                      <div
                        key={flightKey}
                        style={{
                          border:
                            "1px solid #e2e8f0",
                          borderRadius: 18,
                          padding: 16,
                          background:
                            "#fff",
                        }}
                      >
                        <div
                          style={{
                            marginBottom: 12,
                            fontSize: 16,
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          Flight:{" "}
                          {flightKey}
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: 14,
                          }}
                        >
                          {reports.map(
                            (report) => (
                              <div
                                key={
                                  report.id
                                }
                                style={{
                                  border:
                                    "1px solid #eef2f7",
                                  borderRadius: 16,
                                  padding: 14,
                                  background:
                                    "#fbfdff",
                                  display:
                                    "grid",
                                  gridTemplateColumns:
                                    "110px minmax(0, 1fr)",
                                  gap: 14,
                                }}
                              >
                                <div>
                                  {report.image_url ? (
                                    <img
                                      src={
                                        report.image_url
                                      }
                                      alt="Boarding pass"
                                      style={{
                                        width: 100,
                                        height: 130,
                                        objectFit:
                                          "cover",
                                        borderRadius: 12,
                                        border:
                                          "1px solid #dbeafe",
                                        background:
                                          "#fff",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: 100,
                                        height: 130,
                                        borderRadius: 12,
                                        border:
                                          "1px solid #dbeafe",
                                        background:
                                          "#f8fbff",
                                        display:
                                          "flex",
                                        alignItems:
                                          "center",
                                        justifyContent:
                                          "center",
                                        color:
                                          "#94a3b8",
                                        fontSize: 12,
                                        fontWeight: 700,
                                        textAlign:
                                          "center",
                                        padding: 8,
                                        boxSizing:
                                          "border-box",
                                      }}
                                    >
                                      No image
                                    </div>
                                  )}
                                </div>
                                                                <div
                                  style={{
                                    minWidth: 0,
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
                                          fontSize: 15,
                                          fontWeight: 900,
                                          color: "#0f172a",
                                        }}
                                      >
                                        {report.passenger_name ||
                                          "No passenger"}
                                      </div>

                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: 12,
                                          color: "#64748b",
                                        }}
                                      >
                                        Report ID:{" "}
                                        {report.report_id ||
                                          report.id}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 6,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        style={statusBadge(
                                          report.status || "NEW"
                                        )}
                                      >
                                        {report.status || "NEW"}
                                      </span>

                                      {report.tracking_status && (
                                        <span
                                          style={statusBadge(
                                            report.tracking_status
                                          )}
                                        >
                                          {safeUpper(
                                            report.tracking_status
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(140px, 1fr))",
                                      gap: 10,
                                      marginTop: 12,
                                    }}
                                  >
                                    <InfoMini
                                      label="Flight"
                                      value={`${report.airline || "—"} ${
                                        report.flight_number || ""
                                      }`}
                                    />

                                    <InfoMini
                                      label="Date"
                                      value={
                                        formatMMDDYYYYFromFirestore(
                                          getReportDate(report)
                                        ) || "—"
                                      }
                                    />

                                    <InfoMini
                                      label="Seat"
                                      value={report.seat || "—"}
                                    />

                                    <InfoMini
                                      label="Gate"
                                      value={report.gate || "—"}
                                    />

                                    <InfoMini
                                      label="PNR"
                                      value={report.pnr || "—"}
                                    />

                                    <InfoMini
                                      label="WCHR Type"
                                      value={report.wch_type || "—"}
                                    />

                                    <InfoMini
                                      label="Wheelchair #"
                                      value={
                                        report.wheelchair_number || "—"
                                      }
                                    />

                                    <InfoMini
                                      label="WCHR Agent"
                                      value={getWchrAgentName(report)}
                                    />

                                    <InfoMini
                                      label="Current Location"
                                      value={
                                        report.current_location || "—"
                                      }
                                    />

                                    <InfoMini
                                      label="Passenger Delivered"
                                      value={
                                        report.passenger_delivered === true ||
                                        safeUpper(
                                          report.tracking_status
                                        ) === "COMPLETED"
                                          ? "Yes"
                                          : "No"
                                      }
                                    />

                                    <InfoMini
                                      label="Stored"
                                      value={
                                        safeUpper(
                                          report.tracking_status
                                        ) === "STORED"
                                          ? "Yes"
                                          : "No"
                                      }
                                    />

                                    <InfoMini
                                      label="Last Updated"
                                      value={formatDateTime(
                                        report.last_updated_at ||
                                          report.last_location_update_at ||
                                          report.submitted_at
                                      )}
                                    />
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      flexWrap: "wrap",
                                      marginTop: 14,
                                    }}
                                  >
                                    <ActionButton
                                      variant="secondary"
                                      onClick={() =>
                                        handleOpenEdit(report)
                                      }
                                    >
                                      Edit
                                    </ActionButton>

                                    <ActionButton
                                      variant="warning"
                                      onClick={() =>
                                        handlePrint(report)
                                      }
                                    >
                                      Print
                                    </ActionButton>
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )
            )}
          </div>
        )}
      </PageCard>

      {editingRow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 22,
              padding: 20,
              boxShadow:
                "0 24px 60px rgba(15,23,42,0.20)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#0f172a",
                  }}
                >
                  Edit WCHR Report
                </h2>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Report ID:{" "}
                  {editingRow.report_id ||
                    editingRow.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingRow(null)
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border:
                    "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#64748b",
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <EditField
                label="Passenger Name"
                value={
                  editingRow.passenger_name ||
                  ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      passenger_name: value,
                    })
                  )
                }
              />

              <EditField
                label="Airline"
                value={
                  editingRow.airline || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      airline: value,
                    })
                  )
                }
              />

              <EditField
                label="Flight Number"
                value={
                  editingRow.flight_number ||
                  ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      flight_number: value,
                    })
                  )
                }
              />

              <EditField
                label="Flight Date"
                type="date"
                value={
                  editingRow.flight_date ||
                  ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      flight_date: value,
                    })
                  )
                }
              />

              <EditField
                label="Origin"
                value={
                  editingRow.origin || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      origin: value,
                    })
                  )
                }
              />

              <EditField
                label="Destination"
                value={
                  editingRow.destination ||
                  ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      destination: value,
                    })
                  )
                }
              />

              <EditField
                label="Seat"
                value={
                  editingRow.seat || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      seat: value,
                    })
                  )
                }
              />

              <EditField
                label="Gate"
                value={
                  editingRow.gate || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      gate: value,
                    })
                  )
                }
              />

              <EditField
                label="PNR"
                value={
                  editingRow.pnr || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      pnr: value,
                    })
                  )
                }
              />

              <EditField
                label="WCHR Type"
                value={
                  editingRow.wch_type || ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      wch_type: value,
                    })
                  )
                }
              />

              <EditField
                label="Wheelchair #"
                value={
                  editingRow.wheelchair_number ||
                  ""
                }
                onChange={(value) =>
                  setEditingRow(
                    (previous) => ({
                      ...previous,
                      wheelchair_number:
                        value,
                    })
                  )
                }
              />

              <div>
                <FieldLabel>
                  WCHR Agent Name
                </FieldLabel>

                <SelectInput
                  value={
                    editingRow.wchr_agent_id ||
                    ""
                  }
                  onChange={(event) => {
                    const selectedId =
                      event.target.value;

                    const selectedEmployee =
                      employees.find(
                        (employee) =>
                          employee.id ===
                          selectedId
                      ) || null;

                    setEditingRow(
                      (previous) => ({
                        ...previous,

                        wchr_agent_id:
                          selectedId,

                        wchr_agent_name:
                          selectedEmployee?.name ||
                          selectedEmployee?.displayName ||
                          selectedEmployee?.fullName ||
                          "",
                      })
                    );
                  }}
                >
                  <option value="">
                    Select employee
                  </option>

                  {employees.map(
                    (employee) => {
                      const employeeName =
                        employee.name ||
                        employee.displayName ||
                        employee.fullName ||
                        employee.username ||
                        employee.id;

                      return (
                        <option
                          key={employee.id}
                          value={employee.id}
                        >
                          {employeeName}
                        </option>
                      );
                    }
                  )}
                </SelectInput>
              </div>
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
                onClick={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit
                  ? "Saving..."
                  : "Save Changes"}
              </ActionButton>

              <ActionButton
                variant="secondary"
                onClick={() =>
                  setEditingRow(null)
                }
                disabled={savingEdit}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoMini({ label, value }) {
  return (
    <div
      style={{
        background: "#f8fbff",
        border: "1px solid #dbeafe",
        borderRadius: 12,
        padding: "10px 12px",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>

      <TextInput
        type={type}
        value={value || ""}
        onChange={(event) =>
          onChange(event.target.value)
        }
      />
    </div>
  );
}

const infoBoxStyle = {
  padding: 14,
  borderRadius: 16,
  background: "#f8fbff",
  border: "1px solid #dbeafe",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
};
