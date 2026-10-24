import React, { useEffect, useMemo, useRef, useState } from "react";
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

let leafletPromise;

function ensureLeafletCss() {
  return new Promise((resolve, reject) => {
    let css = document.querySelector('link[data-aerohub-leaflet="1"]');

    if (css) {
      if (css.dataset.loaded === "1" || css.sheet) {
        css.dataset.loaded = "1";
        resolve();
        return;
      }
      css.addEventListener("load", () => { css.dataset.loaded = "1"; resolve(); }, { once: true });
      css.addEventListener("error", () => reject(new Error("Unable to load map styles.")), { once: true });
      return;
    }

    css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.crossOrigin = "anonymous";
    css.dataset.aerohubLeaflet = "1";
    css.addEventListener("load", () => { css.dataset.loaded = "1"; resolve(); }, { once: true });
    css.addEventListener("error", () => reject(new Error("Unable to load map styles.")), { once: true });
    document.head.appendChild(css);
  });
}

function ensureLeafletScript() {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }

    let script = document.querySelector('script[data-aerohub-leaflet="1"]');
    if (script) {
      script.addEventListener("load", () => resolve(window.L), { once: true });
      script.addEventListener("error", () => reject(new Error("Unable to load map library.")), { once: true });
      return;
    }

    script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.aerohubLeaflet = "1";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Unable to load map library."));
    document.head.appendChild(script);
  });
}

function ensureLeaflet() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Map is only available in the browser."));
  }
  if (leafletPromise) return leafletPromise;

  leafletPromise = Promise.all([ensureLeafletCss(), ensureLeafletScript()]).then(([, L]) => L);
  return leafletPromise;
}

function FlightMap({ points = [], currentLat, currentLon, heading, origin, destination, status }) {
  const mapEl = useRef(null);
  const mapInstance = useRef(null);
  const [mapError, setMapError] = useState("");

  const usable = useMemo(() => {
    const rows = points
      .map((point) => ({ lat: numberOrNull(point.lat), lon: numberOrNull(point.lon) }))
      .filter((point) => point.lat !== null && point.lon !== null);

    const current = { lat: numberOrNull(currentLat), lon: numberOrNull(currentLon) };
    if (current.lat !== null && current.lon !== null) {
      const last = rows[rows.length - 1];
      if (!last || Math.abs(last.lat - current.lat) > 0.0001 || Math.abs(last.lon - current.lon) > 0.0001) {
        rows.push(current);
      }
    }
    return rows;
  }, [points, currentLat, currentLon]);

  useEffect(() => {
    let cancelled = false;
    if (!mapEl.current || usable.length < 1) return undefined;

    ensureLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current) return;
        setMapError("");

        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        const map = L.map(mapEl.current, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
        });
        mapInstance.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const latLngs = usable.map((point) => [point.lat, point.lon]);
        if (latLngs.length >= 2) {
          L.polyline(latLngs, { color: "#1684c7", weight: 4, opacity: 0.9 }).addTo(map);
        }

        const first = latLngs[0];
        const last = latLngs[latLngs.length - 1];

        L.circleMarker(first, {
          radius: 6,
          weight: 3,
          color: "#0f5d8f",
          fillColor: "#ffffff",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(origin ? `Track start · ${origin}` : "Track start");

        const normalizedStatus = clean(status).toUpperCase();
        const rotation = Number.isFinite(Number(heading)) ? Number(heading) : 0;
        const isLanded = ["LANDED", "ARRIVED", "COMPLETED"].includes(normalizedStatus);

        if (isLanded) {
          L.circleMarker(last, {
            radius: 7,
            weight: 3,
            color: "#047857",
            fillColor: "#d1fae5",
            fillOpacity: 1,
          })
            .addTo(map)
            .bindTooltip(destination ? `Landed · ${destination}` : "Landed");
        } else {
          const planeIcon = L.divIcon({
            className: "aerohub-flight-plane-marker",
            html: `<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid #0f5d8f;box-shadow:0 5px 14px rgba(15,93,143,.28);display:flex;align-items:center;justify-content:center"><span style="display:block;font-size:18px;line-height:1;transform:rotate(${rotation}deg)">✈</span></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          });
          L.marker(last, { icon: planeIcon })
            .addTo(map)
            .bindTooltip(destination ? `En route to ${destination}` : "Current aircraft position");
        }

        if (latLngs.length === 1) {
          map.setView(last, 7);
        } else {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 8 });
        }

        const refreshMapSize = () => {
          if (!mapInstance.current) return;
          map.invalidateSize({ animate: false, pan: false });
          if (latLngs.length === 1) {
            map.setView(last, 7, { animate: false });
          } else {
            map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24], maxZoom: 8, animate: false });
          }
        };

        window.requestAnimationFrame(() => {
          refreshMapSize();
          window.setTimeout(refreshMapSize, 180);
          window.setTimeout(refreshMapSize, 500);
        });
      })
      .catch((error) => {
        console.error("Live flight map failed:", error);
        if (!cancelled) setMapError("Map is temporarily unavailable.");
      });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [usable, heading, origin, destination, status]);

  if (!usable.length) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#64748b", fontSize: 12 }}>
        Live position is not available yet for this flight.
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #dbe5ef", borderRadius: 16, overflow: "hidden", background: "#eef6fb" }}>
      {mapError ? (
        <div style={{ padding: 16, textAlign: "center", color: "#9a3412", fontSize: 12 }}>{mapError}</div>
      ) : (
        <div ref={mapEl} style={{ width: "100%", height: 260, background: "#e8f1f7" }} aria-label="Live flight map" />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 11px", fontSize: 10.5, color: "#64748b" }}>
        <span>Live map · {origin || "—"} → {destination || "—"}</span>
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
  const std = flight.std || flight.scheduledOut || flight.scheduled_out;
  const eta = flight.eta || flight.estimatedIn || flight.estimated_in || flight.scheduleEta;
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
          gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        <Metric label="STD" value={formatTime(std)} />
        <Metric label="STA" value={formatTime(sta)} />
        <Metric label="ATD" value={formatTime(atd)} />
        <Metric label="ETA" value={formatTime(eta)} emphasized />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: delayMinutes > 0 ? "#c2410c" : "#64748b", fontWeight: 800 }}>
          {delayMinutes > 0 ? `Arrival delay +${delayMinutes} min` : (sta ? "On schedule / no arrival delay detected" : "Schedule pending")}
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
            <FlightMap
              points={track}
              currentLat={flight.latitude}
              currentLon={flight.longitude}
              heading={flight.track}
              origin={flight.origin}
              destination={flight.destination}
              status={flight.status}
            />
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
