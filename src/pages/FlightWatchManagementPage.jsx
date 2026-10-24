import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "../UserContext.jsx";
import {
  DEFAULT_FLIGHT_EVENTS,
  FLIGHT_WATCH_DEPARTMENTS,
  createFlightWatch,
  deleteFlightWatch,
  deleteMonitoredAirport,
  saveMonitoredAirport,
  subscribeFlightWatchlist,
  subscribeMonitoredAirports,
  updateFlightWatch,
} from "../services/flightWatchService.js";

const EVENT_LABELS = {
  delayed: "Delayed",
  airborne: "Airborne",
  etaChanged: "ETA change",
  approaching: "Approaching TPA",
  landed: "Landed",
  arrived: "Arrived at gate",
  cancelled: "Cancelled",
  diverted: "Diverted",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value) {
  return String(value ?? "").trim();
}

function statusColor(status) {
  const s = clean(status).toUpperCase();
  if (["CANCELLED", "DIVERTED"].includes(s)) return { bg: "#fee2e2", fg: "#991b1b" };
  if (s === "DELAYED") return { bg: "#fff7ed", fg: "#9a3412" };
  if (["AIRBORNE", "APPROACHING"].includes(s)) return { bg: "#eff6ff", fg: "#1d4ed8" };
  if (["LANDED", "ARRIVED"].includes(s)) return { bg: "#ecfdf5", fg: "#047857" };
  return { bg: "#f1f5f9", fg: "#475569" };
}

export default function FlightWatchManagementPage() {
  const { user } = useUser();
  const [flights, setFlights] = useState([]);
  const [airports, setAirports] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [airportCode, setAirportCode] = useState("");
  const [airportLabel, setAirportLabel] = useState("");
  const [form, setForm] = useState({
    flightNumber: "",
    flightDate: today(),
    origin: "",
    destination: "TPA",
    targetDepartments: ["ALL"],
    notifyEvents: { ...DEFAULT_FLIGHT_EVENTS },
    etaChangeMinutes: 10,
    approachingMinutes: 30,
    enabled: true,
  });

  useEffect(() => subscribeFlightWatchlist(setFlights, console.error), []);
  useEffect(() => subscribeMonitoredAirports(setAirports, console.error), []);

  const activeCount = useMemo(() => flights.filter((item) => item.enabled !== false).length, [flights]);

  function toggleDepartment(department) {
    setForm((current) => {
      let next = current.targetDepartments.includes(department)
        ? current.targetDepartments.filter((item) => item !== department)
        : [...current.targetDepartments, department];

      if (department === "ALL" && !current.targetDepartments.includes("ALL")) next = ["ALL"];
      if (department !== "ALL") next = next.filter((item) => item !== "ALL");
      if (!next.length) next = ["ALL"];
      return { ...current, targetDepartments: next };
    });
  }

  async function handleAddFlight(event) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await createFlightWatch(form, user);
      setForm((current) => ({
        ...current,
        flightNumber: "",
        origin: "",
        destination: "TPA",
      }));
      setMessage("Flight added to live monitoring.");
    } catch (error) {
      setMessage(error?.message || "Unable to add flight.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAirport(event) {
    event.preventDefault();
    setMessage("");
    try {
      await saveMonitoredAirport({ code: airportCode, label: airportLabel }, user);
      setAirportCode("");
      setAirportLabel("");
      setMessage("Airport added to monitored locations.");
    } catch (error) {
      setMessage(error?.message || "Unable to add airport.");
    }
  }

  return (
    <div style={{ width: "100%", minWidth: 0, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <section style={{ background: "linear-gradient(135deg,#071c33,#0f4c81 55%,#1769aa)", color: "#fff", borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".12em", opacity: .72 }}>STATION INTELLIGENCE CENTER</div>
        <h1 style={{ margin: "5px 0 4px", fontSize: 28 }}>✈️ Flight Watch</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: .82, maxWidth: 780 }}>
          Select flights and airports AeroStation Hub should monitor. Flight status is shared with the selected departments and important changes can generate notifications automatically.
        </p>
      </section>

      {message && <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 12, background: "#eff6ff", color: "#1e40af", fontSize: 12, fontWeight: 700 }}>{message}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>Add flight to watchlist</div>
          <form onSubmit={handleAddFlight} style={{ display: "grid", gap: 11 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
              <Field label="Flight number"><input required value={form.flightNumber} onChange={(e) => setForm({ ...form, flightNumber: e.target.value.toUpperCase() })} placeholder="AV194" style={inputStyle} /></Field>
              <Field label="Flight date"><input required type="date" value={form.flightDate} onChange={(e) => setForm({ ...form, flightDate: e.target.value })} style={inputStyle} /></Field>
              <Field label="Origin"><input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value.toUpperCase() })} placeholder="BOG" style={inputStyle} /></Field>
              <Field label="Destination"><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value.toUpperCase() })} placeholder="TPA" style={inputStyle} /></Field>
            </div>

            <Field label="Departments to notify">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {FLIGHT_WATCH_DEPARTMENTS.map((department) => (
                  <button key={department} type="button" onClick={() => toggleDepartment(department)} style={pillStyle(form.targetDepartments.includes(department))}>{department}</button>
                ))}
              </div>
            </Field>

            <Field label="Notify when">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 7 }}>
                {Object.entries(EVENT_LABELS).map(([key, label]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#334155" }}>
                    <input type="checkbox" checked={form.notifyEvents[key] !== false} onChange={(e) => setForm({ ...form, notifyEvents: { ...form.notifyEvents, [key]: e.target.checked } })} />
                    {label}
                  </label>
                ))}
              </div>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
              <Field label="ETA alert threshold"><select value={form.etaChangeMinutes} onChange={(e) => setForm({ ...form, etaChangeMinutes: Number(e.target.value) })} style={inputStyle}><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option><option value={20}>20 min</option></select></Field>
              <Field label="Approaching alert"><select value={form.approachingMinutes} onChange={(e) => setForm({ ...form, approachingMinutes: Number(e.target.value) })} style={inputStyle}><option value={20}>20 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></Field>
            </div>

            <button disabled={saving} style={primaryButton}>{saving ? "Adding..." : "+ Add to Flight Watch"}</button>
          </form>
        </section>

        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={sectionTitleStyle}>Monitored airports</div>
            <span style={{ fontSize: 11, color: "#64748b" }}>{airports.filter((item) => item.enabled !== false).length} active</span>
          </div>
          <form onSubmit={handleAddAirport} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, marginBottom: 12 }}>
            <input required maxLength={4} value={airportCode} onChange={(e) => setAirportCode(e.target.value.toUpperCase())} placeholder="BOG" style={inputStyle} />
            <input value={airportLabel} onChange={(e) => setAirportLabel(e.target.value)} placeholder="Bogotá / AV origin" style={inputStyle} />
            <button style={secondaryButton}>Add</button>
          </form>
          <div style={{ display: "grid", gap: 8 }}>
            {airports.length === 0 ? <Empty text="No additional airports yet. TPA remains the station reference." /> : airports.map((airport) => (
              <div key={airport.id} style={rowStyle}>
                <div><strong style={{ color: "#0f172a" }}>{airport.code}</strong><div style={{ color: "#64748b", fontSize: 10.5 }}>{airport.label || "Monitored airport"}</div></div>
                <button onClick={() => deleteMonitoredAirport(airport.id)} style={dangerButton}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <div style={sectionTitleStyle}>Current watchlist</div>
          <span style={{ fontSize: 11, color: "#64748b" }}>{activeCount} active flight{activeCount === 1 ? "" : "s"}</span>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          {flights.length === 0 ? <Empty text="No flights are being monitored yet." /> : flights.map((flight) => {
            const badge = statusColor(flight.status);
            return (
              <div key={flight.id} style={{ ...rowStyle, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ color: "#0f172a", fontSize: 15 }}>{flight.flightNumber}</strong>
                    <span style={{ padding: "4px 7px", borderRadius: 999, background: badge.bg, color: badge.fg, fontSize: 9, fontWeight: 900 }}>{clean(flight.status || "MONITORING").toUpperCase()}</span>
                    {flight.enabled === false && <span style={{ fontSize: 9, color: "#64748b", fontWeight: 900 }}>PAUSED</span>}
                  </div>
                  <div style={{ marginTop: 3, color: "#64748b", fontSize: 11 }}>{flight.origin || "—"} → {flight.destination || "TPA"} · {flight.flightDate || "Date not set"}</div>
                  <div style={{ marginTop: 5, color: "#475569", fontSize: 10.5 }}>Notify: {(flight.targetDepartments || ["ALL"]).join(", ")}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button onClick={() => updateFlightWatch(flight.id, { enabled: flight.enabled === false })} style={secondaryButton}>{flight.enabled === false ? "Resume" : "Pause"}</button>
                  <button onClick={() => deleteFlightWatch(flight.id)} style={dangerButton}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div style={{ marginTop: 12, color: "#64748b", fontSize: 10.5 }}>
        Live provider data requires the Netlify environment variable <strong>FLIGHTAWARE_API_KEY</strong>. AeroStation Hub will keep the key server-side.
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 10.5, color: "#475569", fontWeight: 800 }}>{label}</span>{children}</label>;
}

function Empty({ text }) {
  return <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", color: "#64748b", fontSize: 11.5 }}>{text}</div>;
}

const cardStyle = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 17, boxShadow: "0 12px 28px rgba(15,23,42,.04)" };
const sectionTitleStyle = { fontSize: 15, fontWeight: 900, color: "#0f172a", marginBottom: 12 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid #dbe5ef", borderRadius: 10, padding: "9px 10px", fontSize: 12, color: "#0f172a", background: "#fff" };
const primaryButton = { border: 0, borderRadius: 11, padding: "10px 14px", background: "#1769aa", color: "#fff", fontWeight: 900, cursor: "pointer" };
const secondaryButton = { border: "1px solid #cbd5e1", borderRadius: 9, padding: "7px 9px", background: "#fff", color: "#334155", fontSize: 10.5, fontWeight: 800, cursor: "pointer" };
const dangerButton = { ...secondaryButton, border: "1px solid #fecaca", color: "#b91c1c", background: "#fff7f7" };
const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 11, borderRadius: 13, border: "1px solid #e2e8f0", background: "#fbfdff" };
const pillStyle = (active) => ({ border: active ? "1px solid #1769aa" : "1px solid #dbe5ef", borderRadius: 999, padding: "6px 9px", background: active ? "#eaf5ff" : "#fff", color: active ? "#1769aa" : "#475569", fontSize: 10.5, fontWeight: 800, cursor: "pointer" });
