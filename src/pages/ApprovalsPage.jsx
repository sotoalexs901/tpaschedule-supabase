// src/pages/ApprovalsPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
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

export default function ApprovalsPage() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [pendingSchedules, setPendingSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPending = async () => {
    setLoading(true);
    try {
      const qPending = query(
        collection(db, "schedules"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qPending);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPendingSchedules(items);
    } catch (err) {
      console.error("Error loading pending schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const formatWeekLabel = (sch) => {
    if (!sch.days) return "";
    return DAY_KEYS.map((k) => {
      const label = DAY_LABELS[k];
      const num = sch.days[k];
      return num ? `${label} ${num}` : label;
    }).join("  |  ");
  };

  // ✅ Aprobar
  const handleApprove = async (scheduleId) => {
    const ok = window.confirm("Approve this schedule?");
    if (!ok) return;

    try {
      await updateDoc(doc(db, "schedules", scheduleId), {
        status: "approved",
        approvedBy: user?.username || "station_manager",
        approvedAt: serverTimestamp(),
        reviewNotes: null,
      });
      setPendingSchedules((prev) =>
        prev.filter((s) => s.id !== scheduleId)
      );
    } catch (err) {
      console.error("Error approving schedule:", err);
      alert("Error approving schedule. Check console.");
    }
  };

  // 🔄 Devolver al Duty Manager (NO aprobar)
  const handleReturnToDuty = async (scheduleId) => {
    const note = window.prompt(
      "Reason to return this schedule to Duty Manager (will be visible to them):"
    );
    if (note === null) return; // cancelado

    try {
      await updateDoc(doc(db, "schedules", scheduleId), {
        status: "returned",          // 👈 nuevo estado
        reviewNotes: note,
        reviewedBy: user?.username || "station_manager",
        reviewedAt: serverTimestamp(),
      });

      // Lo quitamos de la lista de 'pending' localmente
      setPendingSchedules((prev) =>
        prev.filter((s) => s.id !== scheduleId)
      );
    } catch (err) {
      console.error("Error returning schedule:", err);
      alert("Error returning schedule. Check console.");
    }
  };

  // 👀 Ver (preview) usando la página que ya tienes para ver aprobados
  const handleView = (scheduleId) => {
    // reutilizamos la vista de ApprovedScheduleView (solo lectura)
    navigate(`/approved/${scheduleId}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pending Schedules Approval</h1>
        <button
          type="button"
          className="btn btn-soft text-xs"
          onClick={loadPending}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading pending schedules...</p>
      ) : pendingSchedules.length === 0 ? (
        <p className="text-sm text-slate-500">
          There are no schedules waiting for approval.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pendingSchedules.map((sch) => {
            const totalHours =
              typeof sch.airlineWeeklyHours === "number"
                ? sch.airlineWeeklyHours.toFixed(2)
                : "0.00";
            const overBudget =
              sch.budget && sch.airlineWeeklyHours > sch.budget;

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

                <p className="text-[11px] text-slate-500 mb-2">
                  Created by: <b>{sch.createdBy || "unknown"}</b>
                </p>

                <p>
                  <b>Total hours: </b>
                  {totalHours}
                </p>
                <p>
                  <b>Budget: </b>
                  {sch.budget ?? 0}
                </p>
                <p
                  className={
                    "text-xs font-semibold mt-1 " +
                    (overBudget ? "text-red-600" : "text-green-700")
                  }
                >
                  {overBudget ? "Over budget" : "Within budget"}
                </p>

                <div className="flex gap-2 mt-4">
                  <button
                    className="btn btn-soft text-xs flex-1"
                    type="button"
                    onClick={() => handleView(sch.id)}
                  >
                    View schedule
                  </button>
                  <button
                    className="btn btn-primary text-xs flex-1"
                    type="button"
                    onClick={() => handleApprove(sch.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn text-xs flex-1 bg-red-50 text-red-700 border border-red-200"
                    type="button"
                    onClick={() => handleReturnToDuty(sch.id)}
                  >
                    Return to Duty
                  </button>
                </div>

                {sch.reviewNotes && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Last review note: {sch.reviewNotes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
