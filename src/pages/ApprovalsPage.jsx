import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  query
} from "firebase/firestore";

export default function ApprovalsPage() {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    const loadSchedules = async () => {
      const q = query(
        collection(db, "schedules"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setSchedules(data);
    };

    loadSchedules();
  }, []);

  const approveSchedule = async (id) => {
    await updateDoc(doc(db, "schedules", id), { status: "approved" });
    alert("Schedule approved");
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "approved" } : s))
    );
  };

  const rejectSchedule = async (id) => {
    await updateDoc(doc(db, "schedules", id), { status: "rejected" });
    alert("Schedule rejected");
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "rejected" } : s))
    );
  };

  return (
    <div className="p-4">
      <h1 className="font-bold text-xl mb-4">Pending Schedules</h1>

      {schedules.length === 0 && (
        <p className="text-gray-500">No schedules submitted yet.</p>
      )}

      {schedules.map((s) => (
        <div
          key={s.id}
          className="border rounded p-3 mb-3 shadow bg-white"
        >
          <p>
            <b>Airline:</b> {s.airline}
          </p>
          <p>
            <b>Department:</b> {s.department}
          </p>
          <p>
            <b>Status:</b>{" "}
            <span
              className={
                s.status === "pending"
                  ? "text-yellow-600"
                  : s.status === "approved"
                  ? "text-green-600"
                  : "text-red-600"
              }
            >
              {s.status}
            </span>
          </p>

          <div className="flex gap-2 mt-3">
            {s.status === "pending" && (
              <>
                <button
                  onClick={() => approveSchedule(s.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Approve
                </button>

                <button
                  onClick={() => rejectSchedule(s.id)}
                  className="bg-red-600 text-white px-3 py-1 rounded"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
