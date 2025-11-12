import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import ScheduleGrid from "../components/ScheduleGrid";

export default function SchedulePage() {
  const [airline, setAirline] = useState("");
  const [department, setDepartment] = useState("");
  const [dayNumbers, setDayNumbers] = useState({
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
    sat: "",
    sun: "",
  });

  const [employees, setEmployees] = useState([]);

  // Load employees from Firestore
  useEffect(() => {
    const fetchEmployees = async () => {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    fetchEmployees();
  }, []);

  const handleSaveSchedule = async (gridData) => {
    if (!airline || !department) {
      alert("Select airline and department");
      return;
    }

    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      grid: gridData,
      status: "pending",
    });

    alert("Schedule submitted for approval");
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Create Weekly Schedule</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1 text-sm">
          <label className="font-medium">Airline</label>
          <select
            className="border rounded w-full px-2 py-1"
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
          >
            <option value="">Select airline</option>
            <option value="SY">SY</option>
            <option value="AV">AV</option>
            <option value="WL">WL</option>
            <option value="EA">EA</option>
            <option value="WCHR">WCHR</option>
            <option value="AA-BSO">AA BSO</option>
            <option value="CABIN">Cabin Service</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="space-y-1 text-sm">
          <label className="font-medium">Department</label>
          <select
            className="border rounded w-full px-2 py-1"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select department</option>
            <option value="Ramp">Ramp</option>
            <option value="TC">Ticket Counter</option>
            <option value="BSO">BSO</option>
            <option value="Cabin">Cabin Service</option>
            <option value="WCHR">WCHR</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div></div>
      </div>

      {/* Editable day numbers */}
      <div className="grid grid-cols-7 gap-2 text-xs">
        {Object.keys(dayNumbers).map((key) => (
          <div key={key} className="space-y-1">
            <label className="font-medium uppercase">{key}</label>
            <input
              className="border rounded w-full text-center px-1 py-1"
              value={dayNumbers[key]}
              onChange={(e) =>
                setDayNumbers({ ...dayNumbers, [key]: e.target.value })
              }
              placeholder="10"
            />
          </div>
        ))}
      </div>

      <ScheduleGrid
        employees={employees}
        dayNumbers={dayNumbers}
        onSave={handleSaveSchedule}
      />
    </div>
  );
}
