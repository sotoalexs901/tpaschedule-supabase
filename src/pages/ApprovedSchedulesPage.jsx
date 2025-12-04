// src/pages/ApprovedSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "MON",
  tue: "TUESD",
  wed: "WED",
  thu: "THURSD",
  fri: "FRIDAY",
  sat: "SATURD",
  sun: "SUND",
};

// Construye un texto bonito de semana con los números de día
function buildWeekText(days) {
  if (!days) return "Week not specified";
  return DAY_KEYS.map((k) => {
    const num = days[k];
    const label = DAY_LABELS[k];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

export default function ApprovedSchedulesPage() {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState({}); // { weekTag: [schedules] }
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const qApproved = query(
          collection(db, "schedules"),
          where("status", "==", "approved")
        );
        const snap = await getDocs(qApproved);
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Agrupar por weekTag
        const grouped = {};
        items.forEach((sch) => {
          const key = sch.weekTag || "no-week";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(sch);
        });

        setGroups(grouped);
      } catch (err) {
        console.error("Error loading approved schedules:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, []);

  const handleOpen = (id) => {
    navigate(`/approved/${id}`);
  };

  if (loading) {
    return <p className="p-6 text-sm">Loading approved schedules...</p>;
  }

  const weekTags = Object.keys(groups);
  if (!weekTags.length) {
    return (
      <div className="card p-4 text-sm">
        <h2 className="font-semibold mb-2">Approved Schedules</h2>
        <p>No approved schedules yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold mb-2">Approved Schedules</h1>

      {weekTags.map((weekTag) => {
        const list = groups[weekTag];
        const sample = list[0];
        const weekText = buildWeekText(sample.days);

        return (
          <div key={weekTag} className="card p-4 space-y-3">
            {/* “Carpeta” de semana */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">
                  📁 Week: {weekText}
                </h2>
                <p className="text-[11px] text-gray-500">
                  {list.length} schedule{list.length > 1 ? "s" : ""} approved
                  for this week.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {list.map((sch) => (
                <div
                  key={sch.id}
                  className="border border-gray-200 rounded-md p-3 text-sm bg-white"
                >
                  <p className="font-semibold">
                    {sch.airline} — {sch.department}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Created by: {sch.createdBy || "N/A"}
                  </p>
                  <p className="text-[11px] text-gray-600">
                    Total Hours:{" "}
                    {sch.airlineWeeklyHours
                      ? sch.airlineWeeklyHours.toFixed(2)
                      : "0.00"}
                  </p>
                  <button
                    type="button"
                    className="btn text-xs mt-2"
                    onClick={() => handleOpen(sch.id)}
                  >
                    View schedule →
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

