// src/pages/ApprovedSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

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
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        // Solo schedules con status "approved"
        const q = query(
          collection(db, "schedules"),
          where("status", "==", "approved"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setApproved(items);
      } catch (err) {
        console.error("Error loading approved schedules", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <p className="p-6">Loading approved schedules...</p>;
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">Approved Schedules</h1>

      {approved.length === 0 && (
        <p className="text-sm text-gray-600">
          No approved schedules found.
        </p>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {approved.map((s) => {
          const color = AIRLINE_COLORS[s.airline] || "#0f172a";

          return (
            <div
              key={s.id}
              className="approved-card"
              style={{
                borderTop: `4px solid ${color}`,
                padding: "12px 14px",
              }}
            >
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {s.airline} — {s.department}
                  </div>
                  <div className="text-xs text-gray-500">
                    Week:{" "}
                    {s.days
                      ? Object.entries(s.days)
                          .map(([k, v]) =>
                            v ? `${k.toUpperCase()} ${v}` : ""
                          )
                          .filter(Boolean)
                          .join(" • ")
                      : "N/A"}
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-600 mt-2">
                <p>
                  <b>Total hours:</b>{" "}
                  {s.airlineWeeklyHours
                    ? s.airlineWeeklyHours.toFixed(2)
                    : "0.00"}
                </p>
                <p>
                  <b>Budget:</b> {s.budget ?? 0}
                </p>
                <p>
                  <b>Status:</b> {s.status}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary w-full mt-3"
                onClick={() => navigate(`/approved/${s.id}`)}
              >
                View details
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
