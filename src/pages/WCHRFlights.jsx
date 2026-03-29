import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  doc,
  setDoc,
  updateDoc,
  getDoc,
} from "firebase/firestore";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYYYYMMDD(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}`;
}

function toMMDDYYYY(dateObj) {
  return `${pad2(dateObj.getMonth() + 1)}-${pad2(
    dateObj.getDate()
  )}-${dateObj.getFullYear()}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function tsToDate(val) {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function safeText(v) {
  return String(v || "").trim();
}

function formatTimeAtGate(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function downloadCSV(filename, rows) {
  const headers = [
    "Report ID",
    "Submitted By",
    "Employee Login",
    "Employee Role",
    "Submitted At",
    "Passenger",
    "Airline",
    "Flight",
    "Flight Date",
    "Origin",
    "Destination",
    "Seat",
    "Gate",
    "Time At Gate",
    "Boarding Group",
    "PNR",
    "Operator",
    "WCHR Type",
    "Wheelchair #",
    "Status",
    "Image URL",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => {
      const flightDate = tsToDate(r.flight_date);
      const submitted = tsToDate(r.submitted_at);

      const cols = [
        r.report_id || "",
        r.employee_name || "",
        r.employee_login || "",
        r.employee_role || "",
        submitted ? submitted.toISOString() : "",
        r.passenger_name || "",
        r.airline || "",
        r.flight_number || "",
        flightDate ? toYYYYMMDD(flightDate) : "",
        r.origin || "",
        r.destination || "",
        r.seat || "",
        r.gate || "",
        r.time_at_gate || "",
        r.boarding_group || "",
        r.pnr || "",
        r.operator || "",
        r.wch_type || "",
        r.wheelchair_number || "",
        r.status || "",
        r.image_url || "",
      ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`);

      return cols.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvLines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
        opacity: disabled ? 0.55 : 1,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function statusBadge(kind) {
  const k = String(kind || "").toUpperCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
  };

  if (k === "CLOSED") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }
  if (k === "OPEN") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }
  if (k === "LATE") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }
  if (k === "NEW") {
    return {
      ...base,
      background: "#edf7ff",
      color: "#1769aa",
      borderColor: "#cfe7fb",
    };
  }

  return {
    ...base,
    background: "#f8fafc",
    color: "#334155",
    borderColor: "#e2e8f0",
  };
}

function ImageThumb({ src, alt = "Boarding pass" }) {
  if (!src) {
    return <span style={{ color: "#94a3b8" }}>—</span>;
  }

  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img
        src={src}
        alt={alt}
        style={{
          width: 56,
          height: 56,
          objectFit: "cover",
          borderRadius: 12,
          border: "1px solid #dbeafe",
          background: "#fff",
          display: "block",
        }}
      />
    </a>
  );
}

function sortBySubmittedAtDesc(a, b) {
  const A = tsToDate(a.submitted_at)?.getTime() || 0;
  const B = tsToDate(b.submitted_at)?.getTime() || 0;
  return B - A;
}

function sortBySubmittedAtAsc(a, b) {
  const A = tsToDate(a.submitted_at)?.getTime() || 0;
  const B = tsToDate(b.submitted_at)?.getTime() || 0;
  return A - B;
}

export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");

  const [selectedFlightKey, setSelectedFlightKey] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reports, setReports] = useState([]);

  const canClose = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return (
      role.includes("station") ||
      role.includes("duty") ||
      role.includes("supervisor")
    );
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function loadFlights() {
      setError("");
      setLoading(true);

      try {
        const start = Timestamp.fromDate(startOfDay(selectedDate));
        const end = Timestamp.fromDate(endOfDay(selectedDate));

        const q = query(
          collection(db, "wch_reports"),
          where("submitted_at", ">=", start),
          where("submitted_at", "<=", end)
        );

        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(sortBySubmittedAtDesc);

        const map = new Map();

        for (const r of rows) {
          const fk = r.flight_key || "UNKNOWN";
          const reportFlightDate = tsToDate(r.flight_date);

          if (!map.has(fk)) {
            map.set(fk, {
              flight_key: fk,
              airline: safeUpper(r.airline) || "—",
              flight_number: safeUpper(r.flight_number) || "—",
              flight_date: reportFlightDate,
              origin: safeUpper(r.origin) || "",
              destination: safeUpper(r.destination) || "",
              operator: safeUpper(r.operator) || "",
              total_reports: 0,
              new_reports: 0,
              late_reports: 0,
              closed: false,
              closed_at: null,
            });
          }

          const item = map.get(fk);
          item.total_reports += 1;

          if (!item.flight_date && reportFlightDate) {
            item.flight_date = reportFlightDate;
          }
          if (!item.operator && r.operator) {
            item.operator = safeUpper(r.operator);
          }
          if (!item.origin && r.origin) {
            item.origin = safeUpper(r.origin);
          }
          if (!item.destination && r.destination) {
            item.destination = safeUpper(r.destination);
          }

          if (String(r.status || "").toUpperCase() === "LATE") {
            item.late_reports += 1;
          } else {
            item.new_reports += 1;
          }
        }

        const flightArr = Array.from(map.values());

        for (const f of flightArr) {
          if (!f.flight_key || f.flight_key === "UNKNOWN") continue;
          const fsnap = await getDoc(doc(db, "wch_flights", f.flight_key));
          if (fsnap.exists()) {
            const fd = fsnap.data();
            f.closed = Boolean(fd?.closed_at);
            f.closed_at = tsToDate(fd?.closed_at);
          }
        }

        flightArr.sort((a, b) => {
          const A = `${a.airline} ${a.flight_number}`;
          const B = `${b.airline} ${b.flight_number}`;
          return A.localeCompare(B);
        });

        if (mounted) {
          setFlights(flightArr);

          const exists = flightArr.some((x) => x.flight_key === selectedFlightKey);
          if (!exists) {
            setSelectedFlightKey("");
            setReports([]);
          }
        }
      } catch (e) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load flights.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadFlights();
    return () => {
      mounted = false;
    };
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let mounted = true;

    async function loadReportsForFlight() {
      setError("");
      if (!selectedFlightKey) {
        setReports([]);
        return;
      }

      setReportsLoading(true);
      try {
        const q = query(
          collection(db, "wch_reports"),
          where("flight_key", "==", selectedFlightKey)
        );

        const snap = await getDocs(q);
        const rows = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
            airline: safeUpper(d.data().airline),
            flight_number: safeUpper(d.data().flight_number),
            origin: safeUpper(d.data().origin),
            destination: safeUpper(d.data().destination),
            gate: safeUpper(d.data().gate),
            seat: safeUpper(d.data().seat),
            boarding_group: safeUpper(d.data().boarding_group),
            operator: safeUpper(d.data().operator),
            time_at_gate: formatTimeAtGate(d.data().time_at_gate),
            pnr: safeText(d.data().pnr).toUpperCase(),
            employee_login: safeText(d.data().employee_login),
            employee_role: safeText(d.data().employee_role),
          }))
          .sort(sortBySubmittedAtAsc);

        if (mounted) setReports(rows);
      } catch (e) {
        console.error(e);
        if (mounted) {
          setError(e?.message || "Failed to load reports for this flight.");
        }
      } finally {
        if (mounted) setReportsLoading(false);
      }
    }

    loadReportsForFlight();
    return () => {
      mounted = false;
    };
  }, [selectedFlightKey]);

  const selectedFlight = useMemo(() => {
    return flights.find((f) => f.flight_key === selectedFlightKey) || null;
  }, [flights, selectedFlightKey]);

  const handleCloseFlight = async (flight) => {
    setError("");
    if (!canClose) {
      setError("You do not have permission to close flights.");
      return;
    }
    if (!flight?.flight_key || flight.flight_key === "UNKNOWN") {
      setError("Missing flight_key. This flight cannot be closed.");
      return;
    }

    try {
      const ref = doc(db, "wch_flights", flight.flight_key);
      const snap = await getDoc(ref);

      const payload = {
        flight_key: flight.flight_key,
        airline: flight.airline,
        flight_number: flight.flight_number,
        flight_date: flight.flight_date || null,
        origin: flight.origin || "",
        destination: flight.destination || "",
        operator: flight.operator || "",
        closed_at: Timestamp.now(),
        closed_by_employee_id: user?.id || "",
        closed_by_name: user?.username || "",
      };

      if (!snap.exists()) {
        await setDoc(ref, payload);
      } else {
        await updateDoc(ref, {
          closed_at: payload.closed_at,
          closed_by_employee_id: payload.closed_by_employee_id,
          closed_by_name: payload.closed_by_name,
        });
      }

      setFlights((prev) =>
        prev.map((f) =>
          f.flight_key === flight.flight_key
            ? { ...f, closed: true, closed_at: new Date() }
            : f
        )
      );

      if (selectedFlightKey === flight.flight_key && reports?.length) {
        const filename = `WCHR_${flight.airline}${flight.flight_number}_${toYYYYMMDD(
          flight.flight_date || new Date()
        )}.csv`;
        downloadCSV(filename, reports);
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to close flight.");
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
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
              WCHR Flights
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              View flights by date, review WCHR reports, export CSV files and
              close flights when needed.
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

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
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
              Date
            </label>
            <input
              type="date"
              value={toYYYYMMDD(selectedDate)}
              onChange={(e) =>
                setSelectedDate(new Date(e.target.value + "T00:00:00"))
              }
              style={{
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

          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 14,
              padding: "12px 14px",
              fontSize: 13,
              color: "#334155",
            }}
          >
            Showing flights with WCHR reports submitted on:{" "}
            <b>{toMMDDYYYY(selectedDate)}</b>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Flights List
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Select a flight to review the report table, export data or close the
            flight.
          </p>
        </div>

        {loading ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading...
          </div>
        ) : flights.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No flights found for this date.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 980,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle({ textAlign: "left" })}>Flight</th>
                  <th style={thStyle({ textAlign: "left" })}>Date</th>
                  <th style={thStyle({ textAlign: "left" })}>Route</th>
                  <th style={thStyle({ textAlign: "left" })}>Operator</th>
                  <th style={thStyle({ textAlign: "left" })}>Reports</th>
                  <th style={thStyle({ textAlign: "left" })}>Status</th>
                  <th style={thStyle({ textAlign: "center" })}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f, index) => (
                  <tr
                    key={f.flight_key}
                    style={{
                      background:
                        selectedFlightKey === f.flight_key
                          ? "#edf7ff"
                          : index % 2 === 0
                          ? "#ffffff"
                          : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>
                      <button
                        onClick={() => setSelectedFlightKey(f.flight_key)}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          color: "#1769aa",
                          cursor: "pointer",
                          fontWeight:
                            selectedFlightKey === f.flight_key ? 900 : 700,
                          fontSize: 14,
                        }}
                      >
                        {f.airline} {f.flight_number}
                      </button>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        flight_key: {f.flight_key}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {f.flight_date ? toMMDDYYYY(f.flight_date) : "—"}
                    </td>

                    <td style={tdStyle}>
                      {(f.origin || "—") + " → " + (f.destination || "—")}
                    </td>

                    <td style={tdStyle}>{f.operator || "—"}</td>

                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700 }}>
                        Total: {f.total_reports}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                        }}
                      >
                        NEW: {f.new_reports} · LATE: {f.late_reports}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {f.closed ? (
                        <span style={statusBadge("CLOSED")}>CLOSED</span>
                      ) : (
                        <span style={statusBadge("OPEN")}>OPEN</span>
                      )}
                      {f.closed_at && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            marginTop: 6,
                          }}
                        >
                          Closed at: {toMMDDYYYY(f.closed_at)}
                        </div>
                      )}
                    </td>

                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "center",
                        }}
                      >
                        <ActionButton
                          onClick={() => setSelectedFlightKey(f.flight_key)}
                          variant="secondary"
                          style={{ padding: "8px 12px", fontSize: 12 }}
                        >
                          View Table
                        </ActionButton>

                        <ActionButton
                          onClick={() => handleCloseFlight(f)}
                          variant="primary"
                          disabled={!canClose || f.closed}
                          style={{ padding: "8px 12px", fontSize: 12 }}
                        >
                          Close Flight
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p
              style={{
                margin: "10px 12px 0",
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              Note: Reports submitted after closure will be marked as <b>LATE</b>.
            </p>
          </div>
        )}
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: 14,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.02em",
              }}
            >
              Flight Report Table
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "#64748b",
              }}
            >
              {selectedFlight ? (
                <>
                  Showing reports for <b>{selectedFlight.airline} {selectedFlight.flight_number}</b>{" "}
                  ({selectedFlight.origin || "—"} → {selectedFlight.destination || "—"}) ·{" "}
                  <b>{selectedFlight.flight_date ? toMMDDYYYY(selectedFlight.flight_date) : "—"}</b>
                </>
              ) : (
                "Select a flight above to view the table."
              )}
            </p>
          </div>

          {selectedFlight && (
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <ActionButton
                onClick={() => {
                  const filename = `WCHR_${selectedFlight.airline}${selectedFlight.flight_number}_${toYYYYMMDD(
                    selectedFlight.flight_date || new Date()
                  )}.csv`;
                  downloadCSV(filename, reports);
                }}
                variant="secondary"
                disabled={!reports?.length}
              >
                Export CSV
              </ActionButton>

              <ActionButton
                onClick={() => handleCloseFlight(selectedFlight)}
                variant="success"
                disabled={!canClose || selectedFlight.closed}
              >
                Close Flight (Export)
              </ActionButton>
            </div>
          )}
        </div>

        {reportsLoading ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading reports...
          </div>
        ) : !selectedFlight ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No flight selected.
          </div>
        ) : reports.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No reports for this flight.
          </div>
        ) : (
          <>
            <div
              style={{
                overflowX: "auto",
                borderRadius: 18,
                border: "1px solid #e2e8f0",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 1600,
                  background: "#fff",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fbff" }}>
                    <th style={thStyle({ textAlign: "left" })}>Photo</th>
                    <th style={thStyle({ textAlign: "left" })}>Report ID</th>
                    <th style={thStyle({ textAlign: "left" })}>Passenger</th>
                    <th style={thStyle({ textAlign: "left" })}>Flight Date</th>
                    <th style={thStyle({ textAlign: "left" })}>Seat</th>
                    <th style={thStyle({ textAlign: "left" })}>Gate</th>
                    <th style={thStyle({ textAlign: "left" })}>Time at Gate</th>
                    <th style={thStyle({ textAlign: "left" })}>Group</th>
                    <th style={thStyle({ textAlign: "left" })}>PNR</th>
                    <th style={thStyle({ textAlign: "left" })}>Operator</th>
                    <th style={thStyle({ textAlign: "left" })}>WCHR</th>
                    <th style={thStyle({ textAlign: "left" })}>Wheelchair #</th>
                    <th style={thStyle({ textAlign: "left" })}>Submitted By</th>
                    <th style={thStyle({ textAlign: "left" })}>Login</th>
                    <th style={thStyle({ textAlign: "left" })}>Role</th>
                    <th style={thStyle({ textAlign: "center" })}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r, index) => (
                    <tr
                      key={r.id}
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                      }}
                    >
                      <td style={tdStyle}>
                        <ImageThumb
                          src={r.image_url}
                          alt={r.passenger_name || "Boarding pass"}
                        />
                      </td>
                      <td style={tdStyle}>{r.report_id || r.id}</td>
                      <td style={tdStyle}>{r.passenger_name || "—"}</td>
                      <td style={tdStyle}>
                        {formatReportFlightDate(r.flight_date)}
                      </td>
                      <td style={tdStyle}>{r.seat || "—"}</td>
                      <td style={tdStyle}>{r.gate || "—"}</td>
                      <td style={tdStyle}>{r.time_at_gate || "—"}</td>
                      <td style={tdStyle}>{r.boarding_group || "—"}</td>
                      <td style={tdStyle}>{r.pnr || "—"}</td>
                      <td style={tdStyle}>{r.operator || "—"}</td>
                      <td style={tdStyle}>{r.wch_type || "—"}</td>
                      <td style={tdStyle}>{r.wheelchair_number || "—"}</td>
                      <td style={tdStyle}>{r.employee_name || "—"}</td>
                      <td style={tdStyle}>{r.employee_login || "—"}</td>
                      <td style={tdStyle}>{r.employee_role || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {String(r.status || "").toUpperCase() === "LATE" ? (
                          <span style={statusBadge("LATE")}>LATE</span>
                        ) : (
                          <span style={statusBadge("NEW")}>NEW</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Total reports: <b>{reports.length}</b>
            </div>
          </>
        )}
      </PageCard>
    </div>
  );
}

function formatReportFlightDate(val) {
  const d = tsToDate(val);
  return d ? toMMDDYYYY(d) : "—";
}

function thStyle(extra = {}) {
  return {
    padding: "14px 14px",
    fontSize: 12,
    fontWeight: 800,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #e2e8f0",
    ...extra,
  };
}

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "middle",
  fontSize: 14,
  color: "#0f172a",
};
