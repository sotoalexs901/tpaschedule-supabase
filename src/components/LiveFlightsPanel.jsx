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

function FlightCard({ flight, compact }) {
  const badge = statusStyle(flight.status);
  const delayMinutes = Number(flight.delayMinutes || 0);
  const eta = flight.eta || flight.estimatedIn || flight.estimated_in;
  const sta = flight.sta || flight.scheduledIn || flight.scheduled_in;
  const atd = flight.atd || flight.actualOut || flight.actual_out;

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
    </article>
  );
}

function Metric({ label, value, emphasized = false }) {
  return (
    <div style={{ background: emphasized ? "#eff6ff" : "#f8fafc", borderRadius: 11, padding: "8px 9px" }}>
      <div style={{ fontSize: 8.5, color: "#94a3b8", fontWeight: 900, letterSpacing: ".08em" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 12.5, color: emphasized ? "#1d4ed8" : "#334155", fontWeight: 900 }}>{value}</div>
    </div>
  );
}

export default function LiveFlightsPanel({ compact = false, maxItems = 6 }) {
  const { user } = useUser();
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState("");

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
    const now = Date.now();
    return flights
      .filter((item) => item.enabled !== false)
      .filter((item) => flightVisibleToUser(item, user))
      .filter((item) => {
        if (!item.flightDate) return true;
        const end = new Date(`${item.flightDate}T23:59:59-04:00`).getTime() + 12 * 60 * 60 * 1000;
        return Number.isNaN(end) || end >= now;
      })
      .slice(0, maxItems);
  }, [flights, user, maxItems]);

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
            Flight Operations
          </div>
          <h2 style={{ margin: "3px 0 0", fontSize: compact ? 16 : 18, color: "#0f172a" }}>✈️ Live Flights</h2>
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
