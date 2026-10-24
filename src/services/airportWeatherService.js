import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

export const AIRPORT_WEATHER_COLLECTION = "airport_weather_status";

export function subscribeAirportWeather(callback, onError) {
  const q = query(collection(db, AIRPORT_WEATHER_COLLECTION), orderBy("code", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const rawRows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.enabled !== false);

      // Defensive de-duplication: TPA and KTPA represent the same station.
      const byAirport = new Map();
      for (const row of rawRows) {
        const rawCode = String(row.code || row.id || "").trim().toUpperCase();
        const canonicalCode = rawCode === "KTPA" ? "TPA" : rawCode;
        const normalized = {
          ...row,
          code: canonicalCode,
          icao: row.icao || (canonicalCode === "TPA" ? "KTPA" : row.icao),
          label: canonicalCode === "TPA" ? "Tampa International Airport" : row.label,
        };

        const existing = byAirport.get(canonicalCode);
        // Prefer the canonical TPA document over the legacy KTPA document.
        if (!existing || rawCode === canonicalCode) byAirport.set(canonicalCode, normalized);
      }
      callback([...byAirport.values()]);
    },
    onError
  );
}

export function weatherRiskLabel(level) {
  const value = String(level || "LOW").toUpperCase();
  if (value === "CRITICAL") return "Severe";
  if (value === "HIGH") return "High impact";
  if (value === "MEDIUM") return "Advisory";
  return "Normal";
}

export function weatherRiskTone(level) {
  const value = String(level || "LOW").toUpperCase();
  if (value === "CRITICAL") return { bg: "#fee2e2", border: "#fecaca", text: "#991b1b", dot: "#dc2626" };
  if (value === "HIGH") return { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412", dot: "#f97316" };
  if (value === "MEDIUM") return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#f59e0b" };
  return { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", dot: "#10b981" };
}
