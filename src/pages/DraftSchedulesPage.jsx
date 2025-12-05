// src/pages/DraftSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

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

function formatWeekLabel(schedule) {
  if (!schedule?.days) return schedule.weekTag || "";
  return DAY_KEYS.map((key) => {
    const label = DAY_LABELS[key];
    const num = schedule.days[key];
    return num ? `${label} ${num}` : label;
  }).join("  |  ");
}

export default function DraftSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const qDraft = query(
          collection(db, "schedules"),
          where("status", "==", "draft")
        );
        const snap = await getDocs(qDraft);

        const allDrafts = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Filtramos solo los creados por este usuario (para duty manager)
        const mine = user?.username
          ? allDrafts.filter((d) => d.createdBy === user.username)
          : allDrafts;

        // Más recientes primero
        mine.sort((a, b) => {
          const at = a.createdAt?.seconds || 0;
          const bt = b.createdAt?.seconds || 0;
          return bt - at;
        });

        setDrafts(mine);
      } catch (err) {
        console.error("Error loading draft schedules:", err);
      } finally {
        setLoading(false);
      }
    }

    load().catch(console.error);
  }, [user?.username]);

  return (
    <div className="p-4 space-y-4">
      <button
        type="button"
        className="btn btn-soft text-xs"
        onClick={() => navigate("/dashboard")}
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-lg font-semibold mt-2">Draft Schedules</h1>
      <p className="text-xs text-slate-500">
        Use this area to keep working on schedules before submitting them for
        approval.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Loading drafts...</p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-slate-500">
          You don&apos;t have any draft schedules yet.
        </p>
      ) : (
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          {drafts.map((sch) => {
            const total = sch.airlineWeeklyHours || 0;
            const overBudget =
              sch.budget && sch.airlineWeeklyHours > sch.budget;

            return (
              <div
                key={sch.id}
                className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm flex flex-col gap-2"
              >
                <div>
                  <p className="font-semibold text-gray-800">
                    {sch.airline} — {sch.department}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Week: {formatWeekLabel(sch)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Created by: {sch.createdBy || "unknown"}
                  </p>
                </div>

                <div className="text-xs mt-1">
                  <p>
                    Total Hours:{" "}
                    <span className="font-semibold">
                      {Number(total || 0).toFixed(2)}
                    </span>
                  </p>
                  {sch.budget !== undefined && (
                    <p
                      className={
                        "text-[11px] font-semibold " +
                        (overBudget ? "text-red-600" : "text-emerald-700")
                      }
                    >
                      Budget: {sch.budget} hrs –{" "}
                      {overBudget ? "Over budget" : "Within budget"}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-soft text-xs mt-2"
                  onClick={() =>
                    navigate("/schedule", {
                      state: {
                        template: {
                          airline: sch.airline,
                          department: sch.department,
                          days: sch.days,
                          grid: sch.grid,
                        },
                      },
                    })
                  }
                >
                  Open as template in Create Schedule
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
