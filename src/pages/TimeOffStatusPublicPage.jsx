// src/pages/TimeOffStatusPublicPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffStatusPublicPage() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Cargar empleados (igual que en la solicitud)
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees for status page:", err);
      }
    }
    loadEmployees().catch(console.error);
  }, []);

  const handleCheck = async (e) => {
    e.preventDefault();
    setMessage("");
    setRequests([]);

    if (!employeeId || pin.length !== 4) {
      setMessage("Please select your name and enter your 4-digit PIN.");
      return;
    }

    try {
      setLoading(true);

      const qReq = query(
        collection(db, "timeOffRequests"),
        where("employeeId", "==", employeeId),
        where("pin", "==", pin),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(qReq);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (list.length === 0) {
        setMessage("No requests found for this employee and PIN.");
      } else {
        setRequests(list);
      }
    } catch (err) {
      console.error("Error checking time off status:", err);
      setMessage("Error loading status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center"
      style={{ backgroundImage: "url('/tpa-flamingo-bw.jpg')" }}
    >
      <div className="bg-white/85 backdrop-blur-md rounded-2xl shadow-2xl px-8 py-7 w-[340px] sm:w-[420px] border border-white/40">
        <h1 className="text-xl font-bold text-center mb-1 text-slate-900">
          Check Day Off Request Status
        </h1>
        <p className="text-[11px] text-center text-slate-600 mb-5">
          Select your name, enter your 4-digit PIN, and view the status of your
          requests.
        </p>

        <form onSubmit={handleCheck} className="space-y-3 text-sm">
          {/* Employee Name */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Employee Name
            </label>
            <select
              className="w-full border rounded px-2 py-2 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select your name</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              4-digit PIN
            </label>
            <input
              type="password"
              maxLength={4}
              inputMode="numeric"
              className="w-full border rounded px-2 py-2 text-sm tracking-[0.3em]"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
          </div>

          {/* Info 72h */}
          <p className="text-[11px] text-slate-500 mt-1">
            HR and Management team may take up to <b>72 hours</b> to approve or
            reject your request.
          </p>

          {/* Mensajes */}
          {message && (
            <p className="text-[11px] text-center mt-1 text-slate-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-semibold shadow-md transition"
            disabled={loading}
          >
            {loading ? "Checking..." : "Check Status"}
          </button>
        </form>

        {/* Resultados */}
        {requests.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3 max-h-52 overflow-auto text-[11px]">
            {requests.map((r) => (
              <div key={r.id} className="mb-2">
                <div className="font-semibold">
                  {r.reasonType || "Reason"} — {r.startDate} → {r.endDate}
                </div>
                <div>
                  Status:{" "}
                  <span
                    className={
                      r.status === "approved"
                        ? "text-green-700 font-semibold"
                        : r.status === "rejected"
                        ? "text-red-700 font-semibold"
                        : "text-yellow-700 font-semibold"
                    }
                  >
                    {r.status?.toUpperCase()}
                  </span>
                </div>
                {r.notes && (
                  <div className="text-slate-600">
                    Notes: <span>{r.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
