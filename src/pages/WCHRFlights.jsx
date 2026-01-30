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
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

function toMMDDYYYY(dateObj) {
  return `${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}-${dateObj.getFullYear()}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export default function WCHRFlights() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");

  const canClose = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return role.includes("station") || role.includes("duty") || role.includes("supervisor");
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function loadFlights() {
      setError("");
      setLoading(true);

      try {
        const start = Timestamp.fromDate(startOfDay(selectedDate));
        const end = Timestamp.fromDate(endOfDay(selectedDate));

        // Cargamos reportes del día, agrupamos por flight_key
        const q = query(
          collection(db, "wch_reports"),
          where("submitted_at", ">=", start),
          where("submitted_at", "<=", end),
          orderBy("submitted_at", "desc")
        );

        const snap = await getDocs(q);
        const rows = snap.docs.map((d) => d.data());

        const map = new Map();
        for (const r of rows) {
          const fk = r.flight_key || "UNKNOWN";
          const key = fk;

          if (!map.has(key)) {
            map.set(key, {
              flight_key: fk,
              airline: r.airline || "—",
              flight_number: r.flight_number || "—",
              flight_date: r.flight_date?.toDate?.() || null,
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

        // Para cada flight_key, revisamos si está cerrado en wch_flights
        const flightArr = Array.from(map.values());
        for (const f of flightArr) {
          if (!f.flight_key || f.flight_key === "UNKNOWN") continue;
          const fsnap = await getDoc(doc(db, "wch_flights", f.flight_key));
          if (fsnap.exists()) {
            const fd = fsnap.data();
            f.closed = Boolean(fd?.closed_at);
            f.closed_at = fd?.closed_at?.toDate?.() || null;
          }
        }

        // Orden: por airline/flight
        flightArr.sort((a, b) => {
          const A = `${a.airline} ${a.flight_number}`;
          const B = `${b.airline} ${b.flight_number}`;
          return A.localeCompare(B);
        });

        if (mounted) setFlights(flightArr);
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
  }, [selectedDate]);

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
        // si ya existía, solo aseguramos closed_at
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
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to close flight.");
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>WCHR Flights</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Close a flight to trigger the summary email.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/wchr/admin/reports")} style={btnGhost}>
            View Reports
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
            Showing flights with WCHR reports submitted on:{" "}
            <b>{toMMDDYYYY(selectedDate)}</b>
          </div>
        </div>
      </div>

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
                    style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <td style={td}>
                      {f.airline} {f.flight_number}
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
    </div>
  );
}

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
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.16)",
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
  return { ...base, background: "rgba(255,255,255,0.08)" };
}
