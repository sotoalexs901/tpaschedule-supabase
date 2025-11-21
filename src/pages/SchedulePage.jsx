import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// -------------------------------------------
// 🔵 LOGOS OFICIALES EN FIREBASE
// -------------------------------------------
const AIRLINE_LOGOS = {
  SY: "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2009_14_59%20p.m..png?alt=media&token=8fbdd39b-c6f8-4446-9657-76641e27fc59",
  "WL Havana Air":
    "https://firebasestorage.googleapis.com/v0/b/tpa-schedule-app.firebasestorage.app/o/logos%2FChatGPT%20Image%2013%20nov%202025%2C%2006_28_07%20p.m..png?alt=media&token=7bcf90fd-c854-400e-a28a-f838adca89f4",
  "WL Invicta":
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

// Helper: load image async
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

export default function SchedulePage() {
  const { user } = useUser(); // 🔵 User actual
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
  const [rows, setRows] = useState([]);
  const [airlineBudgets, setAirlineBudgets] = useState({});

  // Load Employees
  useEffect(() => {
    getDocs(collection(db, "employees")).then((snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  // Load Budgets
  useEffect(() => {
    getDocs(collection(db, "airlineBudgets")).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => (map[d.data().airline] = d.data().budgetHours));
      setAirlineBudgets(map);
    });
  }, []);

  // Hours calculation
  const diffHours = (start, end) => {
    if (!start || !end || start === "OFF") return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let s = sh * 60 + sm;
    let e = eh * 60 + em;
    if (e < s) e += 1440;
    return (e - s) / 60;
  };

  const calculateTotals = () => {
    let airlineTotal = 0;
    const employeeTotals = {};

    rows.forEach((r) => {
      let subtotal = 0;
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].forEach((d) => {
        r[d]?.forEach(
          (shift) => (subtotal += diffHours(shift.start, shift.end))
        );
      });
      employeeTotals[r.employeeId] = subtotal;
      airlineTotal += subtotal;
    });

    return { employeeTotals, airlineTotal };
  };

  const { employeeTotals, airlineTotal } = calculateTotals();

  // Save to Firestore
  const handleSaveSchedule = async () => {
    if (!airline || !department)
      return alert("Please select airline and department.");

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
      role: user.role, // 🔥 Necesario para Firestore Rules
    });

    alert("Schedule submitted for approval!");
  };

  // ------------------------------------------------------
  // 🔵 EXPORT PDF WITH FIREBASE LOGO
  // ------------------------------------------------------
  const exportPDF = async () => {
    const container = document.getElementById("schedule-print-area");
    if (!container) return alert("Printable area not found.");

    const logoUrl = AIRLINE_LOGOS[airline];
    let logoImg = null;

    if (logoUrl) {
      logoImg = await loadImage(logoUrl);
    }

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFFFFF",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Logo
    if (logoImg) {
      pdf.addImage(logoImg, "PNG", 20, 20, 150, 70);
    }

    const imgData = canvas.toDataURL("image/png");
    const yOffset = logoImg ? 110 : 20;

    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);
    pdf.save(`Schedule_${airline}_${department}.pdf`);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Create Weekly Schedule</h1>

      {/* AIRLINE + DEPARTMENT */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="font-medium text-sm">Airline</label>
          <select
            className="border p-1 rounded w-full"
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
          >
          <option value="">Select airline</option>
<option value="SY">SY</option>
<option value="WL Havana Air">WL Havana Air</option>
<option value="WL Invicta">WL Invicta</option>
<option value="AV">AV</option>
<option value="EA">EA</option>
<option value="WCHR">WCHR</option>
<option value="CABIN">Cabin Service</option>
<option value="AA-BSO">AA-BSO</option>
<option value="OTHER">Other</option>

          </select>
        </div>

        <div>
          <label className="font-medium text-sm">Department</label>
          <select
            className="border p-1 rounded w-full"
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

      {/* DAY NUMBERS */}
      <div className="grid grid-cols-7 gap-2 text-xs">
        {Object.keys(dayNumbers).map((key) => (
          <div key={key}>
            <label className="uppercase text-[11px] font-semibold">{key}</label>
            <input
              className="border rounded text-center px-1 py-1 w-full"
              value={dayNumbers[key]}
              onChange={(e) =>
                setDayNumbers({ ...dayNumbers, [key]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

      {/* PRINT AREA */}
      <div id="schedule-print-area">
        <ScheduleGrid
          employees={employees}
          dayNumbers={dayNumbers}
          rows={rows}
          setRows={setRows}
          airline={airline}
          department={department}
          onSave={handleSaveSchedule}
        />
      </div>

      {/* SUMMARY */}
      <div className="card text-sm">
        <h2 className="font-semibold">Weekly Summary</h2>
        <p>Total Hours: {airlineTotal.toFixed(2)}</p>
        <p>Budget: {airlineBudgets[airline] || 0}</p>

        {Object.entries(employeeTotals).map(([id, hrs]) => {
          const emp = employees.find((e) => e.id === id);
          return (
            <p key={id}>
              {emp?.name || "Unknown"} — <b>{hrs.toFixed(2)} hrs</b>
            </p>
          );
        })}
      </div>

      {/* BUTTONS */}
      <button
        onClick={exportPDF}
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Export PDF
      </button>
    </div>
  );
}
