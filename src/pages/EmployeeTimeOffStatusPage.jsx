// src/pages/EmployeeTimeOffStatusPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function EmployeeTimeOffStatusPage() {
  const { user } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (!user) return;

        const q = query(
          collection(db, "timeOffRequests"),
          user.employeeId
            ? where("employeeId", "==", user.employeeId)
            : where("username", "==", user.username),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading time off requests:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">My Day Off / PTO Status</h1>
      <p className="text-sm text-slate-600">
        These are your requests submitted through the portal.
      </p>

      {loading && (
        <div className="card p-3 text-sm text-slate-500">Loading...</div>
      )}

      {!loading && requests.length === 0 && (
        <div className="card p-3 text-sm text-slate-500">
          You don&apos;t have any requests yet.
        </div>
      )}

      {!loading &&
        requests.map((r) => (
          <div key={r.id} className="card p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{r.dates}</span>
              <span
                className={
                  r.status === "approved"
                    ? "text-green-600 font-semibold text-xs"
                    : r.status === "returned"
                    ? "text-red-600 font-semibold text-xs"
                    : "text-amber-600 font-semibold text-xs"
                }
              >
                {r.status || "pending"}
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Reason: {r.reason || "—"}
            </p>
            {r.notes && (
              <p className="text-xs text-slate-500">Notes: {r.notes}</p>
            )}
          </div>
        ))}
    </div>
  );
}
