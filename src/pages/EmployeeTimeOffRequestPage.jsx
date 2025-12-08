// src/pages/EmployeeTimeOffRequestPage.jsx
import React, { useEffect, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeTimeOffRequestPage() {
  const { user } = useUser();
  const [employee, setEmployee] = useState(null);
  const [dates, setDates] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  // Cargar info del empleado vinculado
  useEffect(() => {
    async function loadEmployee() {
      if (!user?.employeeId) return;
      try {
        const snap = await getDoc(doc(db, "employees", user.employeeId));
        if (snap.exists()) {
          setEmployee({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("Error loading employee profile:", err);
      }
    }
    loadEmployee();
  }, [user?.employeeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!dates || !reason) {
      setMessage("Please fill in the dates and reason.");
      return;
    }

    try {
      setSending(true);

      await addDoc(collection(db, "timeOffRequests"), {
        source: "internal", // diferencia vs formulario público
        status: "pending",
        createdAt: serverTimestamp(),
        employeeId: user?.employeeId || null,
        employeeName: employee?.name || user?.username,
        employeeAirline: employee?.airline || "",
        employeeDepartment: employee?.department || "",
        userId: user?.id || null,
        username: user?.username || "",
        dates,
        reason,
        notes,
      });

      setDates("");
      setReason("");
      setNotes("");
      setMessage("Request sent successfully!");
    } catch (err) {
      console.error(err);
      setMessage("Error sending request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">Request Day Off / PTO</h1>
      <p className="text-sm text-slate-600">
        This request will be linked to your employee profile and reviewed by Management/HR.
      </p>

      <div className="card p-3 text-sm bg-slate-50">
        <p>
          <b>Employee:</b> {employee?.name || user?.username}
        </p>
        {employee?.airline && (
          <p>
            <b>Airline:</b> {employee.airline}
          </p>
        )}
        {employee?.department && (
          <p>
            <b>Department:</b> {employee.department}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="card p-4 space-y-3">
        <div>
          <label className="text-sm font-medium">Dates</label>
          <input
            className="border rounded w-full px-2 py-1 text-sm"
            value={dates}
            onChange={(e) => setDates(e.target.value)}
            placeholder="Example: Dec 24–26, 2025"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Reason</label>
          <input
            className="border rounded w-full px-2 py-1 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacation, medical, personal, etc."
          />
        </div>

        <div>
          <label className="text-sm font-medium">Notes for manager (optional)</label>
          <textarea
            className="border rounded w-full px-2 py-1 text-sm min-h-[70px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="bg-blue-600 text-white w-full py-2 rounded font-semibold disabled:opacity-70"
        >
          {sending ? "Sending..." : "Submit request"}
        </button>

        {message && (
          <p className="text-sm text-center mt-2">
            {message.includes("successfully") ? (
              <span className="text-green-600">{message}</span>
            ) : (
              <span className="text-red-600">{message}</span>
            )}
          </p>
        )}
      </form>
    </div>
  );
}
