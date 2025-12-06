// src/pages/TimeOffStatusPublicPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

export default function TimeOffStatusPublicPage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Cargar lista de empleados
  useEffect(() => {
    async function loadEmployees() {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setEmployees(list);
      } catch (err) {
        console.error("Error loading employees:", err);
      }
    }

    loadEmployees().catch(console.error);
  }, []);

  const handleCheckStatus = async (e) => {
    e.preventDefault();
    setStatusMsg("");
    setRequests([]);

    if (!selectedEmployeeId || !pin) {
      setStatusMsg("Please select your name and enter your 4-digit PIN.");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setStatusMsg("PIN must be exactly 4 digits.");
      return;
    }

    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      setStatusMsg("Employee not found.");
      return;
    }

    setLoading(true);

    try {
      const qReq = query(
        collection(db, "timeOffRequests"),
        where("employeeName", "==", employee.name),
        where("pin", "==", pin)
      );

      const snap = await getDocs(qReq);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      list.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );

      setRequests(list);

      if (list.length === 0) {
        setStatusMsg(
          "No requests found for this name and PIN. Please check your PIN or contact your supervisor."
        );
      }
    } catch (err) {
      console.error("Error loading status:", err);
      setStatusMsg("Error loading status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: "url('/flamingo-bg.jpg')" }}
    >
      <div
        className="bg-white/75 backdrop-blur-md shadow-2xl border border-white/60"
        style={{ maxWidth: 520, width: "100%", borderRadius: 20, padding: "1.75rem" }}
      >
        <h1 className="text-xl font-bold mb-1 text-center text-gray-800">
          Check Day Off Request Status
        </h1>
        <p className="text-[11px] text-gray-600 text-center mb-4">
          Select your name, enter your 4-digit PIN, and view the status of your
          requests.
        </p>

        {/* FORM DE BÚSQUEDA */}
        <form onSubmit={handleCheckStatus} className="space-y-3 text-sm">
          {/* Nombre desde SELECT */}
          <div>
            <label className="font-medium text-xs block mb-1">
              Employee Name
            </label>
            <select
              className="border rounded w-full px-2 py-2 text-sm"
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
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
            <label className="font-medium text-xs block mb-1">4-digit PIN</label>
            <input
              type="password"
              className="border rounded w-full px-2 py-2 text-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              maxLength={4}
              placeholder="XXXX"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded mt-2 text-sm font-semibold shadow"
          >
            {loading ? "Searching..." : "Check Status"}
          </button>

          {/* Nota 72 horas */}
          <p className="text-[11px] text-gray-600 text-center mt-2">
            HR and Management team may take up to 72 hours to approve or reject
            your request.
          </p>

          {statusMsg && (
            <p className="text-[11px] text-center mt-2 text-gray-700">
              {statusMsg}
            </p>
          )}
        </form>

        {/* RESULTADOS */}
        <div className="mt-4 text-sm">
          {requests.length > 0 && (
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req.id} className="border rounded px-3 py-2 bg-white">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-[13px]">
                      {req.reasonType} — {req.startDate} → {req.endDate}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        req.status === "approved"
                          ? "text-green-700"
                          : req.status === "rejected"
                          ? "text-red-700"
                          : "text-gray-700"
                      }`}
                    >
                      {req.status?.toUpperCase() || "PENDING"}
                    </span>
                  </div>
                  {req.notes && (
                    <p className="text-[11px] text-gray-600">
                      Notes: {req.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
