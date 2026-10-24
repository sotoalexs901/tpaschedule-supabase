import React, { useEffect, useMemo, useState } from "react";
import {
  subscribeAirportWeather,
  weatherRiskLabel,
  weatherRiskTone,
} from "../services/airportWeatherService.js";

function formatUpdated(value) {
  if (!value) return "—";
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "—";
  }
}

function weatherSummary(row) {
  const bits = [];
  if (row.flightCategory) bits.push(row.flightCategory);
  if (row.weatherText) bits.push(row.weatherText);
  if (Number.isFinite(Number(row.windSpeedKt))) {
    const gust = Number(row.windGustKt || 0);
    bits.push(gust > 0 ? `Wind ${row.windSpeedKt} kt gust ${gust}` : `Wind ${row.windSpeedKt} kt`);
  }
  if (row.visibilitySm !== undefined && row.visibilitySm !== null && row.visibilitySm !== "") {
    bits.push(`Vis ${row.visibilitySm} SM`);
  }
  return bits.filter(Boolean).join(" · ") || "Latest aviation weather available";
}

export default function AirportWeatherPanel({ compact = false, maxItems = 6 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => subscribeAirportWeather(setRows, (err) => {
    console.error("Airport weather listener error:", err);
    setError("Could not load airport weather.");
  }), []);

  const visible = useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      if (a.code === "TPA") return -1;
      if (b.code === "TPA") return 1;
      const ranks = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (ranks[String(b.riskLevel || "LOW").toUpperCase()] || 0) -
        (ranks[String(a.riskLevel || "LOW").toUpperCase()] || 0);
    });
    return ordered.slice(0, Math.max(1, Number(maxItems || 6)));
  }, [rows, maxItems]);

  if (!visible.length && !error) return null;

  return (
    <section style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: compact ? 16 : 20,
      padding: compact ? 14 : 18,
      boxShadow: "0 12px 30px rgba(15,23,42,.05)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".16em", fontWeight: 800, color: "#0e7490", textTransform: "uppercase" }}>
            Station Intelligence
          </div>
          <div style={{ fontSize: compact ? 20 : 24, fontWeight: 900, color: "#0f172a" }}>🌦️ Airport Weather</div>
          <div style={{ marginTop: 2, color: "#64748b", fontSize: compact ? 12 : 13 }}>
            Aviation conditions for monitored airports
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Auto-updated</div>
      </div>

      {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
        {visible.map((row) => {
          const tone = weatherRiskTone(row.riskLevel);
          const alerts = Array.isArray(row.activeAlerts) ? row.activeAlerts : [];
          return (
            <article key={row.id || row.code} style={{ border: `1px solid ${tone.border}`, borderRadius: 16, padding: 13, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>{row.code}</div>
                  <div style={{ color: "#64748b", fontSize: 11.5, marginTop: 1 }}>{row.label || row.airportName || row.icao || "Monitored airport"}</div>
                </div>
                <span style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text, borderRadius: 999, padding: "5px 9px", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: tone.dot, marginRight: 5 }} />
                  {weatherRiskLabel(row.riskLevel)}
                </span>
              </div>

              <div style={{ marginTop: 11, fontSize: 12.5, color: "#334155", lineHeight: 1.45 }}>{weatherSummary(row)}</div>

              {row.temperatureC !== null && row.temperatureC !== undefined ? (
                <div style={{ marginTop: 9, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "#475569" }}>
                  <span><strong>{Math.round((Number(row.temperatureC) * 9) / 5 + 32)}°F</strong></span>
                  {row.ceilingFt ? <span>Ceiling <strong>{row.ceilingFt} ft</strong></span> : null}
                  {row.icao ? <span>Station <strong>{row.icao}</strong></span> : null}
                </div>
              ) : null}

              {alerts.length ? (
                <div style={{ marginTop: 10, borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa", padding: "8px 10px", color: "#9a3412", fontSize: 11.5, lineHeight: 1.35 }}>
                  <strong>⚠️ {alerts[0]?.event || "Weather alert"}</strong>
                  {alerts[0]?.headline ? <div style={{ marginTop: 2 }}>{alerts[0].headline}</div> : null}
                </div>
              ) : null}

              {row.tafSummary ? (
                <div style={{ marginTop: 9, background: "#f8fafc", borderRadius: 11, padding: "8px 10px", color: "#64748b", fontSize: 10.5, lineHeight: 1.35 }}>
                  <strong style={{ color: "#475569" }}>TAF:</strong> {row.tafSummary}
                </div>
              ) : null}

              <div style={{ marginTop: 9, color: "#94a3b8", fontSize: 9.5 }}>
                Updated {formatUpdated(row.updatedAt)} · Advisory only — not a confirmed flight delay
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
