import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
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

export default function ApprovedSchedulesPage() {
  const [approved, setApproved] = useState([]);

  useEffect(() => {
    async function load() {
      const q = query(
        collection(db, "schedules"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      setApproved(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Approved Weekly Schedules</h1>

      {approved.length === 0 && <p>No approved schedules.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {approved.map((s) => (
          <div key={s.id} className="rounded shadow bg-white border">
            <div
              className="p-3 text-white font-bold"
              style={{ backgroundColor: AIRLINE_COLORS[s.airline] }}
            >
              {s.airline} — {s.department}
            </div>

            <div className="p-3 text-sm">
              <p>Total Hours: <b>{s.airlineWeeklyHours}</b></p>
              <p>Budget: <b>{s.budget}</b></p>
              <p
                className={
                  s.airlineWeeklyHours > s.budget
                    ? "text-red-600"
                    : "text-green-700"
                }
              >
                {s.airlineWeeklyHours > s.budget ? "Over budget" : "Within budget"}
              </p>
            </div>

            <div className="p-3">
              <Link
                to={`/approved/${s.id}`}
                className="bg-blue-600 text-white px-3 py-1 rounded w-full block text-center"
              >
                View
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
