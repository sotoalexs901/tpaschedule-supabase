// src/pages/TimeOffStatusPublicPage.jsx
import React, { useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffStatusPublicPage() {
  const [employeeName, setEmployeeName] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validatePin = (value) => {
    const sanitized = value.replace(/\D/g, "").slice(0, 4);
    setPin(sanitized);
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    setError("");
    setRequests([]);

    if (!employeeName || pin.length !== 4) {
      setError("Please enter your full name and 4-digit PIN.");
      return;
    }

    setLoading(true);
    try {
      // 🔍 Buscamos por nombre + pin
      const qRef = query(
        collection(db, "timeOffRequests"),
        where("employeeName", "==", employeeName.trim()),
        where("pin", "==", pin)
      );

      const snap = await getDocs(qRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ordenar por fecha creación (si existe)
      list.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      if (list.length === 0) {
        setError(
          "No requests found with this name and PIN. Please check the information."
        );
      } else {
        setRequests(list);
      }
    } catch (err) {
      console.error("Error loading time off status:", err);
      setError("Error loading requests. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "approved") return "text-green-700";
    if (status === "rejected") return "text-red-700";
    return "text-yellow-700";
  };

  const getStatusLabel = (status) => {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "Pending";
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{
        backgroundImage:
          "url('/images/tpa-night-ramp.jpg')", // puedes usar la misma del login o otra
      }}
    >
      <div className="bg-white/85 backdrop-blur-lg p-6 rounded-2xl shadow-2xl w-full max-w-md border border-white/60">
        <h1 className="text-xl font-bold text-center mb-2 text-gray-800">
          Day Off Request Status
        </h1>
        <p className="text-xs text-center text-gray-600 mb-4">
          Enter your name and the 4-digit PIN you used when you submitted your
          request.
        </p>

        <form onSubmit={handleSearch} className="space-y-3 text-sm mb-4">
          <div>
            <label className="font-medium block mb-1">
              Full Name (exactly as submitted)
            </label>
            <input
              type="text"
              className="border w-full p-2 rounded"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
            />
          </div>

          <div>
            <label className="font-medium block mb-1">4-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              className="border w-full p-2 rounded tracking-widest text-center"
              placeholder="••••"
              value={pin}
              onChange={(e) => validatePin(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 text-center mt-1">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded mt-1 text-sm font-semibold shadow"
            disabled={loading}
          >
            {loading ? "Searching..." : "Check Status"}
          </button>
        </form>

        {/* RESULTADOS */}
        {requests.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-auto text-sm">
            {requests.map((req) => (
              <div key={req.id} className="border rounded-lg p-3 bg-white">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-500">
                    {req.startDate} → {req.endDate}
                  </span>
                  <span
                    className={
                      "text-xs font-semibold px-2 py-1 rounded-full " +
                      (req.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : req.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700")
                    }
                  >
                    {getStatusLabel(req.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Reason:</span>{" "}
                  {req.reasonType}
                </p>
                {req.notes && (
                  <p className="text-xs text-gray-600 mt-1">
                    <span className="font-semibold">Notes: </span>
                    {req.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {requests.length === 0 && !error && !loading && (
          <p className="text-[11px] text-gray-500 text-center">
            No results yet. Enter your data and click &quot;Check Status&quot;.
          </p>
        )}
      </div>
    </div>
  );
}
