import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "../UserContext.jsx";
import {
  flightVisibleToUser,
  subscribeFlightWatchlist,
} from "../services/flightWatchService.js";

function clean(value) {
  return String(value ?? "").trim();
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function formatDateLabel(dateKey) {
  const parsed = new Date(`${dateKey}T12:00:00-04:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function tampaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatAltitude(value) {
  const altitude = numberOrNull(value);
  if (altitude === null) return "—";
  return `${Math.round(altitude).toLocaleString("en-US")} ft`;
}

function formatSpeed(value) {
  const speed = numberOrNull(value);
  if (speed === null) return "—";
  return `${Math.round(speed)} kt`;
}

function formatPosition(lat, lon) {
  const latitude = numberOrNull(lat);
  const longitude = numberOrNull(lon);
  if (latitude === null || longitude === null) return "—";
  return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
}

function statusStyle(status) {
  const normalized = clean(status).toUpperCase();
  if (["CANCELLED", "DIVERTED"].includes(normalized)) {
    return { background: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }
  if (["DELAYED", "OPERATIONAL_RISK"].includes(normalized)) {
    return { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" };
  }
  if (["AIRBORNE", "APPROACHING"].includes(normalized)) {
    return { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
  }
  if (["LANDED", "ARRIVED"].includes(normalized)) {
    return { background: "#ecfdf5", color: "#047857", border: "#a7f3d0" };
  }
  return { background: "#f8fafc", color: "#475569", border: "#e2e8f0" };
}

function Metric({ label, value, emphasized = false }) {
  return (
    <div style={{ background: emphasized ? "#eff6ff" : "#f8fafc", borderRadius: 11, padding: "8px 9px" }}>
      <div style={{ fontSize: 8.5, color: "#94a3b8", fontWeight: 900, letterSpacing: ".08em" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 12.5, color: emphasized ? "#1d4ed8" : "#334155", fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function TrackPreview({ points = [], currentLat, currentLon }) {
  const usable = points
    .map((point) => ({ lat: numberOrNull(point.lat), lon: numberOrNull(point.lon) }))
    .filter((point) => point.lat !== null && point.lon !== null);

  const current = {
    lat: numberOrNull(currentLat),
    lon: numberOrNull(currentLon),
  };
  if (current.lat !== null && current.lon !== null) usable.push(current);

  if (usable.length < 2) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 12 }}>
        Track is not available yet for this flight.
      </div>
    );
  }

  const width = 640;
  const height = 230;
  const padding = 22;
  const lats = usable.map((point) => point.lat);
  const lons = usable.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = Math.max(0.01, maxLat - minLat);
  const lonSpan = Math.max(0.01, maxLon - minLon);

  const project = (point) => ({
    x: padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2),
  });
  const projected = usable.map(project);
  const path = projected.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = projected[projected.length - 1];

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #dbe5ef", background: "#eef6fb" }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Flight track preview" style={{ display: "block", width: "100%", minHeight: 180 }}>
        <defs>
          <pattern id="flight-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dbe8f2" strokeWidth="1" />
          </pattern>
          <linearGradient id="flight-bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fcff" />
            <stop offset="100%" stopColor="#e8f4fb" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#flight-bg)" />
        <rect width={width} height={height} fill="url(#flight-grid)" />
        <path d={path} fill="none" stroke="#1684c7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <circle cx={projected[0].x} cy={projected[0].y} r="7" fill="#0f5d8f" />
        <circle cx={last.x} cy={last.y} r="11" fill="#ffffff" stroke="#0f5d8f" strokeWidth="3" />
        <text x={last.x} y={last.y + 5} textAnchor="middle" fontSize="14">✈</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 11px", fontSize: 10.5, color: "#64748b" }}>
        <span>Track preview</span>
        <span>{usable.length} positions</span>
      </div>
    </div>
  );
}

function FlightCard({ flight, compact }) {
  const [expanded, setExpanded] = useState(false);
  const [track, setTrack] = useState([]);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const badge = statusStyle(flight.status);
  const delayMinutes = Number(flight.delayMinutes || 0);
  const eta = flight.eta || flight.estimatedIn || flight.estimated_in;
  const sta = flight.sta || flight.scheduledIn || flight.scheduled_in;
  const atd = flight.atd || flight.actualOut || flight.actual_out;

  async function openDetails() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (!nextExpanded || track.length || trackLoading || !flight.fr24Id) return;

    setTrackLoading(true);
    setTrackError("");
    try {
      const response = await fetch(`/.netlify/functions/flight-track?flight_id=${encodeURIComponent(flight.fr24Id)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Track request failed (${response.status})`);
      setTrack(Array.isArray(payload?.points) ? payload.points : []);
    } catch (error) {
      console.error("Flight track load failed:", error);
      setTrackError("Track is temporarily unavailable.");
    } finally {
      setTrackLoading(false);
    }
  }

  return (
    <article
      style={{
        border: "1px solid #dbe5ef",
        borderRadius: compact ? 15 : 18,
        padding: compact ? 12 : 14,
        background: "linear-gradient(135deg,#ffffff 0%,#f8fbff 100%)",
        boxShadow: "0 8px 22px rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? 18 : 20, fontWeight: 900, color: "#0f172a" }}>
            {flight.flightNumber || "Flight"}
          </div>
          <div style={{ marginTop: 2, color: "#64748b", fontSize: 11.5, fontWeight: 700 }}>
            {(flight.origin || "—")} → {(flight.destination || "TPA")}
          </div>
        </div>

        <span
          style={{
            border: `1px solid ${badge.border}`,
            background: badge.background,
            color: badge.color,
            borderRadius: 999,
            padding: "5px 8px",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: ".05em",
          }}
        >
          {clean(flight.status || "MONITORING").toUpperCase()}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        <Metric label="STA" value={formatTime(sta)} />
        <Metric label="ETA" value={formatTime(eta)} emphasized />
        <Metric label="ATD" value={formatTime(atd)} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: delayMinutes > 0 ? "#c2410c" : "#64748b", fontWeight: 800 }}>
          {delayMinutes > 0 ? `Delay +${delayMinutes} min` : "No delay detected"}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          Updated {formatTime(flight.lastProviderUpdate || flight.syncedAt)}
        </span>
      </div>

      <button
        type="button"
        onClick={openDetails}
        style={{
          width: "100%",
          marginTop: 11,
          border: "1px solid #cfe1ef",
          borderRadius: 12,
          padding: "8px 10px",
          background: expanded ? "#eef7fd" : "#ffffff",
          color: "#0f5d8f",
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        {expanded ? "Hide flight details" : "View live flight details"}
      </button>

      {expanded && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid #e5edf4" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginBottom: 10 }}>
            <Metric label="ALTITUDE" value={formatAltitude(flight.altitude)} />
            <Metric label="SPEED" value={formatSpeed(flight.groundSpeed)} />
            <Metric label="POSITION" value={formatPosition(flight.latitude, flight.longitude)} />
            <Metric label="AIRCRAFT" value={[flight.aircraftType, flight.registration].filter(Boolean).join(" · ") || "—"} />
          </div>

          {trackLoading ? (
            <div style={{ padding: 18, textAlign: "center", color: "#64748b", fontSize: 12 }}>Loading live track…</div>
          ) : trackError ? (
            <div style={{ padding: 12, borderRadius: 12, background: "#fff7ed", color: "#9a3412", fontSize: 11.5 }}>{trackError}</div>
          ) : (
            <TrackPreview points={track} currentLat={flight.latitude} currentLon={flight.longitude} />
          )}

          <div style={{ marginTop: 8, fontSize: 9.5, lineHeight: 1.45, color: "#94a3b8" }}>
            Track loads only when details are opened to reduce Flightradar24 API credit usage.
          </div>
        </div>
      )}
    </article>
  );
}

export default function LiveFlightsPanel({ compact = false, maxItems = 6 }) {
  const { user } = useUser();
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");
  const todayKey = tampaDateKey();

  useEffect(() => {
    return subscribeFlightWatchlist(
      (rows) => setFlights(rows),
      (err) => {
        console.error("Flight Watch subscription failed:", err);
        setError("Flight status is temporarily unavailable.");
      }
    );
  }, []);

  const visibleFlights = useMemo(() => {
    return flights
      .filter((item) => item.enabled !== false)
      .filter((item) => flightVisibleToUser(item, user))
      .filter((item) => clean(item.flightDate) === todayKey)
      .slice(0, maxItems);
  }, [flights, user, maxItems, todayKey]);

  if (!visibleFlights.length && !error) return null;

  return (
    <section
      style={{
        background: "rgba(255,255,255,0.96)",
        border: "1px solid #dbe5ef",
        borderRadius: compact ? 18 : 22,
        padding: compact ? 14 : 17,
        boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#1769aa", fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>
            Flight Operations · Today
          </div>
          <h2 style={{ margin: "3px 0 0", fontSize: compact ? 16 : 18, color: "#0f172a" }}>✈️ Live Flights</h2>
          <div style={{ marginTop: 2, fontSize: 10.5, color: "#64748b", fontWeight: 700 }}>{formatDateLabel(todayKey)}</div>
        </div>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>Auto-updated</span>
      </div>

      {error ? (
        <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
          {visibleFlights.map((flight) => (
            <FlightCard key={flight.id} flight={flight} compact={compact} />
          ))}
        </div>
      )}
    </section>
  );
}
