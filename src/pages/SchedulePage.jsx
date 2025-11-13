import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import ScheduleGrid from "../components/ScheduleGrid";

// PDF Libraries
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Load logo helper
const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

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
  const [airlineBudgets, setAirlineBudgets] = useState({});
  const [rows, setRows] = useState([]);

  // Load employees
  useEffect(() => {
    const fetchEmployees = async () => {
      const snap = await getDocs(collection(db, "employees"));
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    fetchEmployees();
  }, []);

  // Load budgets
  useEffect(() => {
    const fetchBudgets = async () => {
      const snap = await getDocs(collection(db, "airlineBudgets"));
      const obj = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        obj[data.airline] = data.budgetHours;
      });
      setAirlineBudgets(obj);
    };
    fetchBudgets();
  }, []);

  // Calculate total hours per employee
  const diffHours = (start, end) => {
    if (!start || !end) return 0;
    if (start === "OFF") return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let s = sh * 60 + sm;
    let e = eh * 60 + em;
    if (e < s) e += 24 * 60;
    return (e - s) / 60;
  };

  const calculateTotals = () => {
    const employeeTotals = {};
    let airlineTotal = 0;

    rows.forEach((row) => {
      if (!row.employeeId) return;

      let total = 0;
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].forEach((day) => {
        row[day].forEach((shift) => {
          total += diffHours(shift.start, shift.end);
        });
      });

      employeeTotals[row.employeeId] = total;
      airlineTotal += total;
    });

    return { employeeTotals, airlineTotal };
  };

  const { employeeTotals, airlineTotal } = calculateTotals();

  const handleSaveSchedule = async () => {
    if (!airline || !department) {
      alert("Select airline and department");
      return;
    }

    await addDoc(collection(db, "schedules"), {
      createdAt: serverTimestamp(),
      airline,
      department,
      days: dayNumbers,
      grid: rows,
      totals: employeeTotals,
      airlineWeeklyHours: airlineTotal,
      budget: airlineBudgets[airline] || 0,
      status: "pending",
    });

    alert("Schedule submitted!");
  };

  // -------------------------------
  // EXPORT PDF WITH AIRLINE LOGO
  // -------------------------------
  const exportPDF = async () => {
    const element = document.getElementById("schedule-print-area");
    if (!element) return alert("Printable area not found.");

    // Load airline logo from public/logos/
    const logoPath = `/logos/${airline}.png`;
    let logoImg = null;

    try {
      logoImg = await loadImage(logoPath);
    } catch (e) {
      console.warn("Logo not found for airline:", airline);
    }

    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("landscape", "pt", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Add the airline logo (if exists)
    if (logoImg) {
      const logoWidth = 140;
      const logoHeight = 70;
      pdf.addImage(logoImg, "PNG", 20, 20, logoWidth, logoHeight);
    }

    // Shift table down if logo exists
    const yOffset = logoImg ? 110 : 20;

    // Table image
    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);

    pdf.save(`Schedule_${airline}_${department}.pdf`);
  };

  const printSchedule = () => {
    window.print();
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Create Weekly Schedule</h1>

      {/* Airline, Department */}
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
      </div>

      {/* Day numbers */}
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

      {/* PRINT AREA */}
      <div id="schedule-print-area">
        <ScheduleGrid
          employees={employees}
          dayNumbers={dayNumbers}
          onSave={handleSaveSchedule}
          rows={rows}
          setRows={setRows}
          airline={airline}
          department={department}
        />
      </div>

      {/* SUMMARY */}
      <div className="card text-sm">
        <h2 className="font-semibold mb-2">Weekly Summary</h2>

        <p><b>Total hours for airline:</b> {airlineTotal.toFixed(2)}</p>
        <p><b>Budget hours:</b> {airlineBudgets[airline] || 0}</p>

        {airlineBudgets[airline] && (
          <p
            className={
              airlineTotal > airlineBudgets[airline]
                ? "text-red-600 font-bold"
                : "text-green-700 font-bold"
            }
          >
            {airlineTotal > airlineBudgets[airline]
              ? "Over budget"
              : "Within budget"}
          </p>
        )}

        <div className="mt-3">
          {Object.entries(employeeTotals).map(([id, total]) => {
            const emp = employees.find((e) => e.id === id);
            return (
              <p key={id}>
                {emp?.name || "Unknown"} — <b>{total.toFixed(2)} hrs</b>
              </p>
            );
          })}
        </div>
      </div>

      {/* EXPORT BUTTONS */}
      <button
        className="btn w-full border border-black mt-4 bg-green-600 text-white py-2 rounded"
        onClick={exportPDF}
      >
        Export PDF
      </button>

      <button
        className="btn w-full border border-black mt-2 bg-gray-200 py-2 rounded"
        onClick={printSchedule}
      >
        Print Schedule
      </button>
    </div>
  );
}
