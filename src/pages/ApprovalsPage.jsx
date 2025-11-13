import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where
} from "firebase/firestore";
import { Link } from "react-router-dom";

export default function ApprovedSchedulesPage() {
  const [approved, setApproved] = useState([]);

  useEffect(() => {
    const loadSchedules = async () => {
      const q = query(
        collection(db, "schedules"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setApproved(list);
    };

    loadSchedules();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Approved Schedules</h1>

      {approved.length === 0 && (
        <p className="text-gray-600">No approved schedules yet.</p>
      )}

      {approved.map(s => (
        <div
          key={s.id}
          className="border rounded p-4 mb-3 bg-white shadow"
        >
          <p><b>Airline:</b> {s.airline}</p>
          <p><b>Department:</b> {s.department}</p>
          <p><b>Total Hours:</b> {s.airlineWeeklyHours}</p>

          <div className="flex gap-3 mt-3">
            <Link
              to={`/approved/${s.id}`}
              className="bg-blue-600 text-white px-3 py-1 rounded"
            >
              View
            </Link>

            <button
              onClick={() => alert("PDF ready soon")}
              className="bg-green-600 text-white px-3 py-1 rounded"
            >
              PDF
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
