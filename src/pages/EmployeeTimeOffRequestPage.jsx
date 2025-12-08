// src/pages/EmployeeTimeOffRequestPage.jsx
import React, { useState } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { useNavigate } from "react-router-dom";

// Helpers de fecha
function toDateSafe(isoString) {
  if (!isoString) return null;
  // Usamos medianoche local para evitar problemas de zona horaria
  const d = new Date(`${isoString}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMidnight(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [requestType, setRequestType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState(null); // {type: 'error'|'success', text: string}
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="p-6 text-sm text-red-600">
        You must be logged in to request time off.
      </div>
    );
  }

  // Normalizar rango escrito por el usuario
  const normalizeRange = () => {
    const start = toDateSafe(startDate);
    const end = toDateSafe(endDate || startDate);
    if (!start || !end) return null;
    if (end < start) return null;
    return { start: startDate, end: endDate || startDate };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const range = normalizeRange();
    if (!range) {
      setMessage({
        type: "error",
        text: "Please select a valid start and end date (end date cannot be before start date).",
      });
      return;
    }

    const { start, end } = range;
    const newStartDate = normalizeMidnight(toDateSafe(start));
    const newEndDate = normalizeMidnight(toDateSafe(end));

    if (!requestType) {
      setMessage({
        type: "error",
        text: "Please select a request type (PTO / Day Off / Sick / Other).",
      });
      return;
    }

    try {
      setSubmitting(true);

      const userKey = user.id || user.uid || user.username;

      // 🔎 Buscar solicitudes anteriores del mismo usuario
      const qRef = query(
        collection(db, "timeOffRequests"),
        where("userId", "==", userKey)
      );
      const snap = await getDocs(qRef);

      let conflict = null;

      snap.forEach((docSnap) => {
        const data = docSnap.data();

        // Solo consideramos pendientes o aprobadas
        if (
          data.status !== "pending" &&
          data.status !== "approved" &&
          data.status !== "needs_info"
        ) {
          return;
        }

        const existingStart = normalizeMidnight(toDateSafe(data.startDate));
        const existingEnd = normalizeMidnight(
          toDateSafe(data.endDate || data.startDate)
        );

        if (rangesOverlap(newStartDate, newEndDate, existingStart, existingEnd)) {
          conflict = {
            start: data.startDate,
            end: data.endDate || data.startDate,
            status: data.status,
          };
        }
      });

      if (conflict) {
        setMessage({
          type: "error",
          text: `You already have a ${conflict.status.toUpperCase()} request overlapping this date range (${conflict.start} → ${conflict.end}). Please choose different dates or talk to your manager.`,
        });
        return;
      }

      // 👉 Valores normalizados para compatibilidad con el panel de manager
      const employeeId = user.employeeId || userKey;
      const employeeName =
        user.name || user.fullName || user.username || "Unknown";

      // Guardar solicitud
      await addDoc(collection(db, "timeOffRequests"), {
        // Campos antiguos (para TimeOffRequestsAdminPage)
        employeeId,
        employeeName,

        // Campos nuevos (más detallados)
        userId: userKey,
        username: user.username || "",
        fullName: user.name || user.fullName || "",
        role: user.role || "",

        requestType, // pto | day_off | sick | other
        startDate: start,
        endDate: end,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        source: "internal-portal",
      });

      setMessage({
        type: "success",
        text: "Your request has been submitted successfully.",
      });

      setRequestType("");
      setStartDate("");
      setEndDate("");
      setNotes("");
    } catch (err) {
      console.error("Error submitting internal time off request:", err);
      setMessage({
        type: "error",
        text: "There was an error submitting your request. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cardClass =
    "p-5 rounded-xl bg-[#0f172a]/60 backdrop-blur-lg border border-white/10 shadow-lg";

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-6"
      style={{
        background: "radial-gradient(circle at top, #020617 0%, #020617 70%)",
        color: "white",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div className="w-full max-w-md">
        {/* Top bar con back */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => navigate("/dashboard")}
            className="px-4 py-2 rounded-lg text-xs font-medium
                       bg-[#1e293b]/60 backdrop-blur-md
                       border border-white/10 shadow-md
                       hover:bg-[#334155]/60 transition duration-200
                       text-white flex items-center gap-2"
          >
            <span style={{ fontSize: "14px" }}>←</span> Back to Dashboard
          </button>

          <div className="text-right text-[11px] text-slate-300">
            Logged in as <b>{user.username}</b>
          </div>
        </div>

        <div className={cardClass}>
          <h1 className="text-lg font-semibold tracking-wide mb-1">
            Internal PTO / Day Off Request
          </h1>
          <p className="text-[11px] text-slate-300 mb-4">
            Submit your request directly from your crew profile. HR & Management
            will review it as soon as possible.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            {/* Nombre empleado (solo lectura) */}
            <div>
              <label className="block mb-1 font-semibold text-blue-200">
                Employee
              </label>
              <input
                type="text"
                readOnly
                value={
                  user.name || user.fullName || `${user.username} (${user.role})`
                }
                className="w-full rounded-md border border-slate-600 bg-slate-900/60
                           px-2 py-1.5 text-xs text-slate-100"
              />
            </div>

            {/* Tipo de solicitud */}
            <div>
              <label className="block mb-1 font-semibold text-blue-200">
                Request Type
              </label>
              <select
                className="w-full rounded-md border border-slate-600 bg-slate-900/60
                           px-2 py-1.5 text-xs text-slate-100"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
              >
                <option value="">Select type</option>
                <option value="PTO">PTO / Vacation</option>
                <option value="Day Off">Day Off</option>
                <option value="Sick">Sick</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 font-semibold text-blue-200">
                  Start Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-600 bg-slate-900/60
                             px-2 py-1.5 text-xs text-slate-100"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-blue-200">
                  End Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-slate-600 bg-slate-900/60
                             px-2 py-1.5 text-xs text-slate-100"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block mb-1 font-semibold text-blue-200">
                Notes (optional)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-slate-600 bg-slate-900/60
                           px-2 py-1.5 text-xs text-slate-100 resize-y"
                placeholder="Flight details, doctor appointment, comments for manager, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <p className="text-[11px] text-slate-400">
              Management may take up to <b>72 hours</b> to review your request.
            </p>

            {message && (
              <p
                className={`text-[11px] mt-1 ${
                  message.type === "error" ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-full py-2 text-xs font-semibold
                         bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600
                         shadow-lg shadow-blue-500/40
                         hover:from-blue-400 hover:via-blue-500 hover:to-indigo-500
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
