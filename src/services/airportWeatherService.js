import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

export const AIRPORT_WEATHER_COLLECTION = "airport_weather_status";

export function subscribeAirportWeather(callback, onError) {
  const q = query(collection(db, AIRPORT_WEATHER_COLLECTION), orderBy("code", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.enabled !== false);
      callback(rows);
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
