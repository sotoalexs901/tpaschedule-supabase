// src/pages/WCHRFlights.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
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

function safeStr(v) {
  return String(v ?? "").trim();
}

function tsToDate(val) {
  // Firestore Timestamp -> Date
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function downloadCSV(filename, rows) {
  const headers = [
    "Report ID",
    "Submitted By",
    "Submitted At",
    "Passenger",
    "Airline",
    "Flight",
    "Date",
    "Origin",
    "Destination",
    "Seat",
    "Gate",
    "PNR",
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
        submitted ? submitted.toISOString() : "",
        r.passenger_name || "",
        r.airline || "",
        r.flight_number || "",
        flightDate ? toYYYYMMDD(flightDate) : "",
        r.origin || "",
        r.destination || "",
        r.seat || "",
        r.gate || "",
        r.pnr || "",
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

export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");

  // ✅ NUEVO: selección de vuelo + detalle reportes
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

  // Cargar vuelos del día
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
          where("submitted_at", "<=", end),
          orderBy("submitted_at", "desc")
        );

        const snap = await getDocs(q);

        // ⚠️ IMPORTANTE: necesitamos el id del doc para links/tabla
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const map = new Map();
        for (const r of rows) {
          const fk = r.flight_key || "UNKNOWN";
          const key = fk;

          if (!map.has(key)) {
            map.set(key, {
              flight_key: fk,
              airline: r.airline || "—",
              flight_number: r.flight_number || "—",
              flight_date: tsToDate(r.flight_date),
              origin: r.origin || "",
              destination: r.destination || "",
              total_reports: 0,
              new_reports: 0,
              late_reports: 0,
              closed: false,
              closed_at: null,
            });
          }
          const item = map.get(key);
          item.total_reports += 1;
          if (String(r.status || "").toUpperCase() === "LATE") item.late_reports += 1;
          else item.new_reports += 1;
        }

        const flightArr = Array.from(map.values());

        // revisar si está cerrado
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

          // ✅ si el vuelo seleccionado ya no existe, limpiar
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

  // ✅ Cargar reportes del vuelo seleccionado
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
          where("flight_key", "==", selectedFlightKey),
          orderBy("submitted_at", "asc")
        );

        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (mounted) setReports(rows);
      } catch (e) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load reports for this flight.");
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

      // refrescar UI
      setFlights((prev) =>
        prev.map((f) =>
          f.flight_key === flight.flight_key
            ? { ...f, closed: true, closed_at: new Date() }
            : f
        )
      );

      // ✅ auto-export al cerrar (si hay reportes cargados)
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>WCHR Flights</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Select a flight to view the table and export. Closing a flight marks it as closed.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {/* Si no existe esta ruta, cámbiala o elimina el botón */}
          <button onClick={() => navigate("/wchr/my-reports")} style={btnGhost}>
            My Reports
          </button>
          <button onClick={() => navigate("/dashboard")} style={btnGhost}>
            Back
          </button>
        </div>
      </div>

      {error && (
        <div style={alertError}>
          <div style={{ fontSize: 14 }}>{error}</div>
        </div>
      )}

      {/* Date selector */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, opacity: 0.9 }}>Date</label>
          <input
            type="date"
            value={toYYYYMMDD(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(e.target.value + "T00:00:00"))}
            style={dateInput}
          />
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Showing flights with WCHR reports submitted on: <b>{toMMDDYYYY(selectedDate)}</b>
          </div>
        </div>
      </div>

      {/* Flights list */}
      <div style={card}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : flights.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No flights found for this date.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.8 }}>
                  <th style={th}>Flight</th>
                  <th style={th}>Date</th>
                  <th style={th}>Route</th>
                  <th style={th}>Reports</th>
                  <th style={th}>Status</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {flights.map((f) => (
                  <tr
                    key={f.flight_key}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background:
                        selectedFlightKey === f.flight_key
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                    }}
                  >
                    <td style={td}>
                      <button
                        onClick={() => setSelectedFlightKey(f.flight_key)}
                        style={{
                          ...btnLink,
                          fontWeight: selectedFlightKey === f.flight_key ? 800 : 600,
                        }}
                      >
                        {f.airline} {f.flight_number}
                      </button>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        flight_key: {f.flight_key}
                      </div>
                    </td>

                    <td style={td}>{f.flight_date ? toMMDDYYYY(f.flight_date) : "—"}</td>
                    <td style={td}>
                      {(f.origin || "—") + " → " + (f.destination || "—")}
                    </td>

                    <td style={td}>
                      <div>Total: {f.total_reports}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        NEW: {f.new_reports} · LATE: {f.late_reports}
                      </div>
                    </td>

                    <td style={td}>
                      {f.closed ? (
                        <span style={badge("CLOSED")}>CLOSED</span>
                      ) : (
                        <span style={badge("OPEN")}>OPEN</span>
                      )}
                      {f.closed_at && (
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          Closed at: {toMMDDYYYY(f.closed_at)}
                        </div>
                      )}
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setSelectedFlightKey(f.flight_key)}
                          style={btnGhostSmall}
                        >
                          View Table
                        </button>

                        <button
                          onClick={() => handleCloseFlight(f)}
                          disabled={!canClose || f.closed}
                          style={{
                            ...btnPrimary,
                            opacity: !canClose || f.closed ? 0.5 : 1,
                            cursor: !canClose || f.closed ? "not-allowed" : "pointer",
                          }}
                        >
                          Close Flight
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Note: Reports submitted after closure will be marked as <b>LATE</b>.
            </p>
          </div>
        )}
      </div>

      {/* Selected flight reports table */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Flight Report Table</h3>
            <p style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
              {selectedFlight
                ? <>
                    Showing reports for <b>{selectedFlight.airline} {selectedFlight.flight_number}</b>{" "}
                    ({(selectedFlight.origin || "—")} → {(selectedFlight.destination || "—")}) ·{" "}
                    <b>{selectedFlight.flight_date ? toMMDDYYYY(selectedFlight.flight_date) : "—"}</b>
                  </>
                : "Select a flight above to view the table."}
            </p>
          </div>

          {selectedFlight && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const filename = `WCHR_${selectedFlight.airline}${selectedFlight.flight_number}_${toYYYYMMDD(
                    selectedFlight.flight_date || new Date()
                  )}.csv`;
                  downloadCSV(filename, reports);
                }}
                disabled={!reports?.length}
                style={{
                  ...btnGhost,
                  opacity: reports?.length ? 1 : 0.5,
                  cursor: reports?.length ? "pointer" : "not-allowed",
                }}
              >
                Export CSV
              </button>

              <button
                onClick={() => handleCloseFlight(selectedFlight)}
                disabled={!canClose || selectedFlight.closed}
                style={{
                  ...btnPrimary,
                  opacity: !canClose || selectedFlight.closed ? 0.5 : 1,
                  cursor: !canClose || selectedFlight.closed ? "not-allowed" : "pointer",
                }}
              >
                Close Flight (Export)
              </button>
            </div>
          )}
        </div>

        {reportsLoading ? (
          <div style={{ opacity: 0.8 }}>Loading reports…</div>
        ) : !selectedFlight ? (
          <div style={{ opacity: 0.8 }}>No flight selected.</div>
        ) : reports.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No reports for this flight.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={th}>Report ID</th>
                  <th style={th}>Passenger</th>
                  <th style={th}>Seat</th>
                  <th style={th}>Gate</th>
                  <th style={th}>PNR</th>
                  <th style={th}>WCHR</th>
                  <th style={th}>Wheelchair #</th>
                  <th style={th}>Submitted By</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={td}>{r.report_id || r.id}</td>
                    <td style={td}>{r.passenger_name || "—"}</td>
                    <td style={td}>{r.seat || "—"}</td>
                    <td style={td}>{r.gate || "—"}</td>
                    <td style={td}>{r.pnr || "—"}</td>
                    <td style={td}>{r.wch_type || "—"}</td>
                    <td style={td}>{r.wheelchair_number || "—"}</td>
                    <td style={td}>{r.employee_name || "—"}</td>
                    <td style={td}>
                      {String(r.status || "").toUpperCase() === "LATE" ? (
                        <span style={badge("LATE")}>LATE</span>
                      ) : (
                        <span style={badge("NEW")}>NEW</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Total reports: <b>{reports.length}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- styles ---
const card = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
};

const alertError = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,0,0,0.12)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const btnPrimary = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.18)",
  color: "inherit",
  cursor: "pointer",
};

const btnGhost = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

const btnGhostSmall = {
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
};

const btnLink = {
  background: "transparent",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
};

const dateInput = {
  height: 36,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.25)",
  color: "inherit",
};

const th = { padding: "10px 8px" };
const td = { padding: "10px 8px", verticalAlign: "top" };

function badge(kind) {
  const k = String(kind || "").toUpperCase();
  const base = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: 12,
  };
  if (k === "CLOSED") return { ...base, background: "rgba(255,0,0,0.10)" };
  if (k === "OPEN") return { ...base, background: "rgba(0,255,0,0.10)" };
  if (k === "LATE") return { ...base, background: "rgba(255,165,0,0.12)" };
  if (k === "NEW") return { ...base, background: "rgba(0,128,255,0.12)" };
  return { ...base, background: "rgba(255,255,255,0.08)" };
}
