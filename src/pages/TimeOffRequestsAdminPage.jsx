// src/pages/TimeOffRequestsAdminPage.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

export default function TimeOffRequestsAdminPage() {
  const { user } = useUser();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "timeOffRequests"),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // ordenar por fecha de creación (más reciente primero)
      list.sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setRequests(list);
    } catch (err) {
      console.error("Error loading time off requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests().catch(console.error);
  }, []);

  const approveRequest = async (req) => {
    const confirm = window.confirm(
      `Approve day-off for ${req.employeeName} (${req.reasonType}) from ${req.startDate} to ${req.endDate}?`
    );
    if (!confirm) return;

    try {
      // 1) Crear entrada en 'restrictions' (BlockedEmployees)
      await addDoc(collection(db, "restrictions"), {
        employeeId: req.employeeId || null,
        employeeName: req.employeeName || "",
        reason: `TIME OFF: ${req.reasonType}${
          req.notes ? " - " + req.notes : ""
        }`,
        start_date: req.startDate,
        end_date: req.endDate,
        createdAt: serverTimestamp(),
        createdBy: user?.username || "station_manager",
        source: "timeOffRequest",
      });

      // 2) Actualizar status del request
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "approved",
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      // 3) Quitar de la lista local
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error("Error approving request:", err);
      window.alert("Error approving request. Try again.");
    }
  };

  const rejectRequest = async (req) => {
    const confirm = window.confirm(
      `Reject day-off request from ${req.employeeName}?`
    );
    if (!confirm) return;

    try {
      await updateDoc(doc(db, "timeOffRequests", req.id), {
        status: "rejected",
        handledBy: user?.username || null,
        handledAt: serverTimestamp(),
      });

      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      console.error("Error rejecting request:", err);
      window.alert("Error rejecting request. Try again.");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Day Off Requests</h1>

      {loading ? (
        <p className="text-sm text-gray-500">Loading requests...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">
          No pending day-off requests at the moment.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="card">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    {req.employeeName || "Unknown employee"}
                  </h2>
                  <p className="text-xs text-gray-600">
                    {req.reasonType} • {req.startDate} → {req.endDate}
                  </p>
                </div>
                <div className="space-x-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => approveRequest(req)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => rejectRequest(req)}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {req.notes && (
                <p className="text-xs text-gray-700">
                  <span className="font-semibold">Notes: </span>
                  {req.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
