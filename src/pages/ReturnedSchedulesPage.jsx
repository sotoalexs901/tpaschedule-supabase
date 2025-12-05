// src/pages/ReturnedSchedulesPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
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

export default function ReturnedSchedulesPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [returnedSchedules, setReturnedSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadReturned = async () => {
    setLoading(true);
    try {
      const qRef = query(
        collection(db, "schedules"),
        where("status", "==", "returned"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qRef);
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Si es duty_manager, solo ve los que él mismo creó
      if (user?.role === "duty_manager") {
        items = items.filter((s) => s.createdBy === user.username);
      }

      setReturnedSchedules(items);
    } catch (err) {
      console.error("Error loading returned schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReturned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const formatWeekLabel = (sch) => {
    if (!sch.days) return "";
    return DAY_KEYS.map((k) => {
      const label = DAY_LABELS[k];
      const num = sch.days[k];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  // Ver en vista tipo Excel (reutilizamos ApprovedScheduleView)
  const handleView = (id) => {
    navigate(`/approved/${id}`);
  };

  // Usar este horario como plantilla para corregir y reenviar
  const handleUseAsTemplate = (sch) => {
    navigate("/schedule", {
      state: {
        template: {
          airline: sch.airline,
          department: sch.department,
          days: sch.days,
          grid: sch.grid,
        },
        fromReturned: true,
        reviewNotes: sch.reviewNotes || null,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Header + back button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Returned Schedules</h1>
          <p className="text-xs text-slate-500">
            These schedules were returned by the Station Manager for corrections.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-soft text-xs"
            onClick={() => navigate("/dashboard")}
          >
            ← Back to Dashboard
          </button>
          <button
            type="button"
            className="btn btn-soft text-xs"
            onClick={loadReturned}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading returned schedules...</p>
      ) : returnedSchedules.length === 0 ? (
        <p className="text-sm text-slate-500">
          There are no returned schedules at this time.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {returnedSchedules.map((sch) => {
            const totalHours =
              typeof sch.airlineWeeklyHours === "number"
                ? sch.airlineWeeklyHours.toFixed(2)
                : "0.00";

            return (
              <div key={sch.id} className="card text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="font-semibold text-slate-800">
                      {sch.airline} — {sch.department}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Week: {formatWeekLabel(sch)}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 mb-1">
                  Created by: <b>{sch.createdBy || "unknown"}</b>
                </p>

                <p className="text-xs">
                  <b>Total hours:</b> {totalHours}
                </p>
                <p className="text-xs">
                  <b>Budget:</b> {sch.budget ?? 0}
                </p>

                {sch.reviewNotes && (
                  <p className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 mt-2">
                    <b>Reason:</b> {sch.reviewNotes}
                  </p>
                )}

                {sch.reviewedBy && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Reviewed by: {sch.reviewedBy}
                  </p>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    className="btn btn-soft text-xs flex-1"
                    type="button"
                    onClick={() => handleView(sch.id)}
                  >
                    View
                  </button>
                  <button
                    className="btn btn-primary text-xs flex-1"
                    type="button"
                    onClick={() => handleUseAsTemplate(sch)}
                  >
                    Fix & Resubmit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
