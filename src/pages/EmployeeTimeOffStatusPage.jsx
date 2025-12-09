import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeTimeOffStatusPage() {
  const { user } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRequests() {
      if (!user) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      if (!user.employeeId) {
        setError(
          "We could not match your login with an employee profile. Please contact HR or your station manager."
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const qReq = query(
          collection(db, "timeOffRequests"),
          where("employeeId", "==", user.employeeId)
        );

        const snap = await getDocs(qReq);
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Ordenamos por fecha de creación (más reciente primero)
        list.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setRequests(list);
      } catch (err) {
        console.error("Error loading time off status:", err);
        setError("Error loading your requests.");
      } finally {
        setLoading(false);
      }
    }

    loadRequests().catch(console.error);
  }, [user]);

  const formatDate = (val) => {
    if (!val) return "—";
    if (typeof val === "string") return val; // ya es YYYY-MM-DD
    if (val.toDate) {
      try {
        return val.toDate().toISOString().slice(0, 10);
      } catch {
        return "—";
      }
    }
    return "—";
  };

  const formatCreatedAt = (val) => {
    if (!val) return "—";
    if (val.toDate) {
      const d = val.toDate();
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
    return "—";
  };

  const statusBadgeClass = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "approved")
      return "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700";
    if (s === "rejected")
      return "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700";
    if (s === "needs_info")
      return "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700";
    return "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700";
  };

  if (!user) {
    return (
      <div className="p-4">
        <p>You must be logged in to see your requests.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      <h1 className="text-lg font-semibold">My Day Off / PTO Status</h1>
      <p className="text-xs text-gray-600">
        Requests linked to your employee profile.
      </p>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 p-2 rounded">
          {error}
        </p>
      )}

      {loading && (
        <div className="card text-xs text-gray-600">Loading requests…</div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="card text-xs text-gray-600">
          You don't have any requests yet.
        </div>
      )}

      {!loading &&
        !error &&
        requests.map((r) => (
          <div key={r.id} className="card text-xs space-y-1">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold">
                  {r.reasonType || "Time Off Request"}
                </div>
                <div className="text-[11px] text-gray-600">
                  {formatDate(r.startDate)} → {formatDate(r.endDate)}
                </div>
              </div>
              <span className={statusBadgeClass(r.status)}>
                {r.status ? r.status.toUpperCase() : "PENDING"}
              </span>
            </div>

            {r.managerNote && (
              <p className="text-[11px] text-gray-700 mt-1">
                <span className="font-semibold">Manager note: </span>
                {r.managerNote}
              </p>
            )}

            <div className="text-[11px] text-gray-500 mt-1 flex justify-between">
              <span>PIN: ****</span>
              <span>Submitted: {formatCreatedAt(r.createdAt)}</span>
            </div>
          </div>
        ))}
    </div>
  );
}
