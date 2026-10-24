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

function riskRank(level) {
  const ranks = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return ranks[String(level || "LOW").toUpperCase()] || 0;
}

function StationCard({ row, compact, onOpen }) {
  const tone = weatherRiskTone(row.riskLevel);
  const label = weatherRiskLabel(row.riskLevel);

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      aria-label={`Open weather details for ${row.code}`}
      style={{
        appearance: "none",
        width: "100%",
        minHeight: compact ? 76 : 82,
        border: `1px solid ${tone.border}`,
        borderRadius: 14,
        padding: compact ? "10px 11px" : "11px 12px",
        background: tone.bg,
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
        boxShadow: "0 5px 14px rgba(15,23,42,.035)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: compact ? 16 : 18, fontWeight: 950, color: "#0f172a", lineHeight: 1 }}>
          {row.code}
        </span>
        <span
          style={{
            width: 8,
            height: 8,
            flex: "0 0 8px",
            borderRadius: 999,
            background: tone.dot,
            boxShadow: `0 0 0 4px ${tone.border}55`,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: compact ? 11 : 11.5, fontWeight: 900, color: tone.text }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 800 }}>Details ›</span>
      </div>
    </button>
  );
}

function WeatherDetailModal({ row, onClose }) {
  if (!row) return null;

  const tone = weatherRiskTone(row.riskLevel);
  const alerts = Array.isArray(row.activeAlerts) ? row.activeAlerts : [];
  const fahrenheit = row.temperatureC !== null && row.temperatureC !== undefined
    ? Math.round((Number(row.temperatureC) * 9) / 5 + 32)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${row.code} weather details`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15,23,42,.48)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "min(760px, 88vh)",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 20,
          border: "1px solid #e2e8f0",
          boxShadow: "0 28px 80px rgba(15,23,42,.24)",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".16em", fontWeight: 900, color: "#0e7490", textTransform: "uppercase" }}>
              Station Intelligence
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 950, color: "#0f172a" }}>{row.code}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  color: tone.text,
                  borderRadius: 999,
                  padding: "5px 9px",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.dot }} />
                {weatherRiskLabel(row.riskLevel)}
              </span>
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>
              {row.label || row.airportName || row.icao || "Monitored airport"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close weather details"
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              border: "1px solid #dbe4ee",
              background: "#f8fafc",
              color: "#334155",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 14, background: "#f8fafc", color: "#334155", fontSize: 13, lineHeight: 1.5 }}>
          {weatherSummary(row)}
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9 }}>
          {fahrenheit !== null ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11 }}>
              <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Temperature</div>
              <div style={{ marginTop: 3, fontSize: 17, fontWeight: 950, color: "#0f172a" }}>{fahrenheit}°F</div>
            </div>
          ) : null}
          {row.ceilingFt ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11 }}>
              <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Ceiling</div>
              <div style={{ marginTop: 3, fontSize: 17, fontWeight: 950, color: "#0f172a" }}>{row.ceilingFt} ft</div>
            </div>
          ) : null}
          {row.icao ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11 }}>
              <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Station</div>
              <div style={{ marginTop: 3, fontSize: 17, fontWeight: 950, color: "#0f172a" }}>{row.icao}</div>
            </div>
          ) : null}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 13, padding: 11 }}>
            <div style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em" }}>Updated</div>
            <div style={{ marginTop: 3, fontSize: 17, fontWeight: 950, color: "#0f172a" }}>{formatUpdated(row.updatedAt)}</div>
          </div>
        </div>

        {alerts.length ? (
          <div style={{ marginTop: 12, borderRadius: 14, background: "#fff7ed", border: "1px solid #fed7aa", padding: "10px 12px", color: "#9a3412", fontSize: 12, lineHeight: 1.45 }}>
            <strong>⚠️ {alerts[0]?.event || "Weather alert"}</strong>
            {alerts[0]?.headline ? <div style={{ marginTop: 3 }}>{alerts[0].headline}</div> : null}
          </div>
        ) : null}

        {row.tafSummary ? (
          <div style={{ marginTop: 12, background: "#f8fafc", borderRadius: 14, padding: "10px 12px", color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
            <strong style={{ color: "#475569" }}>TAF:</strong> {row.tafSummary}
          </div>
        ) : null}

        <div style={{ marginTop: 12, color: "#94a3b8", fontSize: 10.5 }}>
          Advisory information only — not a confirmed flight delay.
        </div>
      </div>
    </div>
  );
}

export default function AirportWeatherPanel({ compact = false, maxItems = 12 }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => subscribeAirportWeather(setRows, (err) => {
    console.error("Airport weather listener error:", err);
    setError("Could not load airport weather.");
  }), []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const visible = useMemo(() => {
    const ordered = [...rows].sort((a, b) => {
      if (a.code === "TPA") return -1;
      if (b.code === "TPA") return 1;
      const riskDifference = riskRank(b.riskLevel) - riskRank(a.riskLevel);
      if (riskDifference !== 0) return riskDifference;
      return String(a.code || "").localeCompare(String(b.code || ""));
    });
    return ordered.slice(0, Math.max(1, Number(maxItems || 12)));
  }, [rows, maxItems]);

  if (!visible.length && !error) return null;

  return (
    <>
      <section style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: compact ? 16 : 20,
        padding: compact ? 12 : 16,
        boxShadow: "0 12px 30px rgba(15,23,42,.05)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: ".16em", fontWeight: 900, color: "#0e7490", textTransform: "uppercase" }}>
              Station Intelligence
            </div>
            <div style={{ fontSize: compact ? 18 : 21, fontWeight: 950, color: "#0f172a" }}>🌦️ Airport Weather</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 800 }}>Auto-updated</div>
            <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 1 }}>{visible.length} stations</div>
          </div>
        </div>

        {error ? <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 8 }}>{error}</div> : null}

        <div style={{
          display: "grid",
          gridTemplateColumns: compact
            ? "repeat(2,minmax(0,1fr))"
            : "repeat(auto-fit,minmax(120px,1fr))",
          gap: 8,
        }}>
          {visible.map((row) => (
            <StationCard
              key={row.id || row.code}
              row={row}
              compact={compact}
              onOpen={setSelected}
            />
          ))}
        </div>
      </section>

      <WeatherDetailModal row={selected} onClose={() => setSelected(null)} />
    </>
  );
}
