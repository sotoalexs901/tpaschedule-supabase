import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  orderBy,
} from "firebase/firestore";
import { Link } from "react-router-dom";

const AIRLINE_COLORS = {
  SY: "#F28C28",
  "WL Havana Air": "#3A7BD5",
  "WL Invicta": "#0057B8",
  AV: "#D22630",
  EA: "#003E7E",
  WCHR: "#7D39C7",
  CABIN: "#1FA86A",
  "AA-BSO": "#A8A8A8",
  OTHER: "#555555",
};

export default function ApprovalsPage() {
  const [pending, setPending] = useState([]);

  useEffect(() => {
    async function load() {
      const q = query(
        collection(db, "schedules"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load();
  }, []);

  const approve = async (id) => {
    await updateDoc(doc(db, "schedules", id), { status: "approved" });
    setPending((prev) => prev.filter((p) => p.id !== id));
    alert("Schedule approved!");
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Pending Schedules</h1>

      {pending.length === 0 && <p>No schedules pending approval.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pending.map((s) => (
          <div key={s.id} className="border rounded shadow bg-white">
            <div
              className="p-3 text-white font-bold"
              style={{ backgroundColor: AIRLINE_COLORS[s.airline] }}
            >
              {s.airline} — {s.department}
            </div>

            <div className="p-3 text-sm">
              <p>Total Hours: <b>{s.airlineWeeklyHours}</b></p>
              <p>Budget: <b>{s.budget}</b></p>
            </div>

            <div className="p-3 flex gap-2">
              <Link
                to={`/approved/${s.id}`}
                className="bg-blue-600 text-white px-3 py-1 rounded w-full text-center"
              >
                View
              </Link>

              <button
                onClick={() => approve(s.id)}
                className="bg-green-600 text-white px-3 py-1 rounded w-full"
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
