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

// Logos correctos usando las mismas keys que SchedulePage
const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  "WL-Havana":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2006_28_07%20p.m..png?alt=media&token=7bcf90fd-c854-400e-a28a-f838adca89f4",
  "WL-Invicta":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_49%20p.m..png?alt=media&token=092a1deb-3285-41e1-ab0c-2e48a8faab92",
  AV: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_37%20p.m..png?alt=media&token=f133d1c8-51f9-4513-96df-8a75c6457b5b",
  EA: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_41%20p.m..png?alt=media&token=13fe584f-078f-4073-8d92-763ac549e5eb",
  WCHR:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_32%20p.m..png?alt=media&token=4f7e9ddd-692b-4288-af0a-8027a1fc6e1c",
  CABIN:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_28%20p.m..png?alt=media&token=b269ad02-0761-4b6b-b2f1-b510365cce49",
  "AA-BSO":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_25%20p.m..png?alt=media&token=09862a10-d237-43e9-a373-8bd07c30ce62",
  OTHER:
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_17%20p.m..png?alt=media&token=f338435c-12e0-4d5f-b126-9c6a69f6dcc6",
};

// Colores con las mismas keys
const AIRLINE_COLORS = {
  SY: "#F28C28",
  "WL-Havana": "#3A7BD5",
  "WL-Invicta": "#0057B8",
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
    const load = async () => {
      const q = query(
        collection(db, "schedules"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPending(list);
    };

    load();
  }, []);

  const approveSchedule = async (id) => {
    await updateDoc(doc(db, "schedules", id), { status: "approved" });
    setPending((prev) => prev.filter((p) => p.id !== id));
    alert("Schedule approved!");
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">Pending Schedules for Approval</h1>

      {pending.length === 0 && (
        <p className="text-gray-600">No pending schedules.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {pending.map((s) => {
          const color = AIRLINE_COLORS[s.airline] || "#333";
          const logo = AIRLINE_LOGOS[s.airline];

          return (
            <div
              key={s.id}
              className="rounded-lg shadow border bg-white overflow-hidden"
            >
              {/* Header */}
              <div
                className="p-3 text-white flex items-center justify-between"
                style={{ backgroundColor: color }}
              >
                <div>
                  <p className="text-lg font-semibold">{s.airline}</p>
                  <p className="text-sm opacity-90">{s.department}</p>
                </div>

                {logo && (
                  <img
                    src={logo}
                    className="h-10 w-auto object-contain"
                    alt={s.airline}
                  />
                )}
              </div>

              {/* Body */}
              <div className="p-4 text-sm space-y-2">
                <p>
                  <b>Total Hours:</b> {s.airlineWeeklyHours?.toFixed(2)}
                </p>
                <p>
                  <b>Budget:</b> {s.budget || "N/A"}
                </p>
                <p
                  className={
                    s.airlineWeeklyHours > s.budget
                      ? "text-red-600 font-bold"
                      : "text-green-700 font-bold"
                  }
                >
                  {s.airlineWeeklyHours > s.budget
                    ? "Over budget"
                    : "Within budget"}
                </p>
              </div>

              {/* Buttons */}
              <div className="p-4 flex gap-3">
                <Link
                  to={`/approved/${s.id}`}
                  className="bg-blue-600 text-white px-3 py-1 rounded w-full text-center"
                >
                  View
                </Link>

                <button
                  onClick={() => approveSchedule(s.id)}
                  className="bg-green-600 text-white px-3 py-1 rounded w-full font-semibold"
                >
                  Approve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
