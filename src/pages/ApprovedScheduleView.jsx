import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import ScheduleGrid from "../components/ScheduleGrid_AirlineViewReadOnly";

export default function ApprovedScheduleView({ id }) {
  const [schedule, setSchedule] = useState(null);

  useEffect(() => {
    const load = async () => {
      const ref = doc(db, "schedules", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setSchedule(snap.data());
      }
    };
    load();
  }, [id]);

  if (!schedule) return <p>Loading schedule...</p>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-3">
        {schedule.airline} — {schedule.department}
      </h1>

      {/* Read-only grid */}
      <ScheduleGrid
        employees={[]} // employees not needed for view mode
        rows={schedule.grid}
        readonly={true}
        airline={schedule.airline}
        department={schedule.department}
        dayNumbers={schedule.days}
      />

      <button
        onClick={() => window.print()}
        className="bg-gray-700 text-white w-full mt-4 py-2 rounded"
      >
        Print
      </button>
    </div>
  );
}
