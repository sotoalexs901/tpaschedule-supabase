// src/pages/EmployeeTimeOffRequestPage.jsx
import React, { useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();

  const [requestType, setRequestType] = useState("pto"); // pto | day_off | sick
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  if (!user) {
    return (
      <div className="p-4 text-sm text-slate-200">
        You must be logged in to submit a request.
      </div>
    );
  }

  const normalizeRange = () => {
    if (!startDate && !endDate) return null;
    if (!startDate && endDate) return null;

    const start = startDate;
    const end = endDate || startDate;
    if (end < start) return null;

    return { start, end };
  };

  const getDatesInRange = (startStr, endStr) => {
    const dates = [];
    const start = new Date(startStr);
    const end = new Date(endStr);

    const d = new Date(start);
    while (d <= end) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const range = normalizeRange();
    if (!range) {
      setMessage({
        type: "error",
        text: "Please select a valid start/end date.",
      });
      return;
    }

    const { start, end } = range;
    const newRequestDates = getDatesInRange(start, end);

    try {
      setSubmitting(true);

      // 🔎 Buscar solicitudes anteriores del mismo usuario
      const qRef = query(
        collection(db, "timeOffRequests"),
        where("userId", "==", user.id || user.uid || user.username)
      );
      const snap = await getDocs(qRef);

      const existing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const blockingStatuses = ["pending", "approved"];
      const conflictDates = new Set();

      for (const req of existing) {
        if (!blockingStatuses.includes(req.status || "pending")) continue;

        const existingStart = req.startDate || req.date;
        const existingEnd = req.endDate || req.date || req.startDate;

        if (!existingStart) continue;

        const existingRangeDates = getDatesInRange(
          existingStart,
          existingEnd || existingStart
        );

        for (const d of newRequestDates) {
          if (existingRangeDates.includes(d)) {
            conflictDates.add(d);
          }
        }
      }

      if (conflictDates.size > 0) {
        const list = Array.from(conflictDates).sort().join(", ");
        setMessage({
          type: "error",
          text: `You already have a pending/approved request for: ${list}. Adjust your dates or contact your manager.`,
        });
        setSubmitting(false);
        return;
      }

      await addDoc(collection(db, "timeOffRequests"), {
        userId: user.id || user.uid || user.username,
        username: user.username || "",
        fullName: user.name || user.fullName || "",
        role: user.role || "",
        requestType, // pto | day_off | sick
        startDate: start,
        endDate: end,
        notes: notes || "",
        status: "pending",
        createdAt: serverTimestamp(),
        source: "internal-portal",
      });

      setMessage({
        type: "success",
        text: "Your request has been sent successfully and is now pending review.",
      });
      setStartDate("");
      setEndDate("");
      setNotes("");
      setRequestType("pto");
    } catch (err) {
      console.error("Error sending request:", err);
      setMessage({
        type: "error",
        text: "There was an error sending your request. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="min-h-screen p-4 md:p-6"
      style={{
        background: "radial-gradient(circle at top, #0a0f24 0%, #020617 70%)",
        color: "white",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div className="max-w-xl mx-auto">
        <h1 className="text-xl md:text-2xl font-semibold mb-1">
          PTO / Day Off / Sick Request
        </h1>
        <p className="text-xs text-slate-300 mb-4">
          Logged in as <span className="font-semibold">{user.username}</span>{" "}
          · {user.role}
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-[#020617]/80 backdrop-blur-lg border border-white/10 rounded-2xl p-4 md:p-5 shadow-lg space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-blue-300 mb-1 font-semibold">
                Request Type
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full text-sm rounded-lg bg-slate-900/70 border border-slate-600 text-slate-100 px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="pto">PTO</option>
                <option value="day_off">Day Off</option>
                <option value="sick">Sick Day</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-blue-300 mb-1 font-semibold">
                Start Date
              </label>
              <input
                type="date"
                className="w-full text-sm rounded-lg bg-slate-900/70 border border-slate-600 text-slate-100 px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                min={todayStr}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-blue-300 mb-1 font-semibold">
                End Date
              </label>
              <input
                type="date"
                className="w-full text-sm rounded-lg bg-slate-900/70 border border-slate-600 text-slate-100 px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || todayStr}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                If empty, it will use the same as the start date.
              </p>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-blue-300 mb-1 font-semibold">
                Notes (optional)
              </label>
              <textarea
                className="w-full text-sm rounded-lg bg-slate-900/70 border border-slate-600 text-slate-100 px-2 py-2 h-[72px] resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason, flight details, or extra context (optional)"
              />
            </div>
          </div>

          {message && (
            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                message.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-400/60 text-emerald-200"
                  : "bg-rose-500/10 border border-rose-400/60 text-rose-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end mt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white shadow-md
                         hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {submitting ? "Sending..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
