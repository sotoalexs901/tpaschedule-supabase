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

// Logos oficiales desde Firebase
const AIRLINE_LOGOS = {
  SY: "URL",            // 🔴 RECUERDA: aquí van tus URLs reales de Storage
  "WL Havana Air": "URL",
  "WL Invicta": "URL",
  AV: "URL",
  EA: "URL",
  WCHR: "URL",
  CABIN: "URL",
  "AA-BSO": "URL",
  OTHER: "URL",
};

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

export default function SchedulePage() {
  const { user } = useUser();
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

  useEffect(() => {
    getDocs(collection(db, "employees")).then((snap) =>
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    getDocs(collection(db, "airlineBudgets")).then((snap) => {
      const map = {};
      snap.docs.forEach((d) => (map[d.data().airline] = d.data().budgetHours));
      setAirlineBudgets(map);
    });
  }, []);

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
        r[d]?.forEach((x) => (subtotal += diffHours(x.start, x.end)));
      });
      employeeTotals[r.employeeId] = subtotal;
      airlineTotal += subtotal;
    });

    return { employeeTotals, airlineTotal };
  };

  const { employeeTotals, airlineTotal } = calculateTotals();

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
    });

    alert("Schedule submitted for approval!");
  };

  // ------------------------------------------------------
  // PDF: exportar horario con logo
  // ------------------------------------------------------
  const exportPDF = async () => {
    if (!airline || !department) {
      alert("Please select airline and department first.");
      return;
    }

    const container = document.getElementById("schedule-print-area");
    if (!container) {
      alert("Printable area not found.");
      return;
    }

    try {
      const logoUrl = AIRLINE_LOGOS[airline];
      let logoImg = null;

      if (logoUrl && logoUrl !== "URL") {
        // solo intentamos si no dejaste el placeholder "URL"
        logoImg = await loadImage(logoUrl);
      }

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        // estos dos ayudan a evitar PDFs en blanco
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
      });

      const pdf = new jsPDF("landscape", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      let currentY = margin;

      // Logo + título
      if (logoImg) {
        const logoHeight = 60;
        const logoWidth = (logoImg.width * logoHeight) / logoImg.height;

        pdf.addImage(logoImg, "PNG", margin, currentY, logoWidth, logoHeight);
        pdf.setFontSize(14);
        pdf.text(
          `${airline} — ${department}`,
          margin + logoWidth + 16,
          currentY + 30
        );

        currentY += logoHeight + 15;
      } else {
        pdf.setFontSize(16);
        pdf.text(`${airline} — ${department}`, margin, currentY + 10);
        currentY += 30;
      }

      // Imagen del grid
      const imgData = canvas.toDataURL("image/png");
      let imgWidth = pageWidth - margin * 2;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      const maxHeight = pageHeight - currentY - margin;
      if (imgHeight > maxHeight) {
        const scale = maxHeight / imgHeight;
        imgHeight = maxHeight;
        imgWidth = imgWidth * scale;
      }

      pdf.addImage(imgData, "PNG", margin, currentY, imgWidth, imgHeight);
      pdf.save(`Schedule_${airline}_${department}.pdf`);
    } catch (err) {
      console.error("PDF error", err);
      alert("There was an error creating the PDF. Check the console.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold">Create Weekly Schedule</h1>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label>Airline</label>
          <select
            className="border p-1 w-full"
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
          <label>Department</label>
          <select
            className="border p-1 w-full"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">Select</option>
            <option value="Ramp">Ramp</option>
            <option value="TC">Ticket Counter</option>
            <option value="BSO">BSO</option>
            <option value="Cabin">Cabin Service</option>
            <option value="WCHR">WCHR</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs">
        {Object.keys(dayNumbers).map((key) => (
          <div key={key}>
            <label>{key}</label>
            <input
              className="border text-center w-full"
              value={dayNumbers[key]}
              onChange={(e) =>
                setDayNumbers({ ...dayNumbers, [key]: e.target.value })
              }
            />
          </div>
        ))}
      </div>

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

      <div className="card text-sm">
        <h2>Weekly Summary</h2>
        <p>Total: {airlineTotal.toFixed(2)} hrs</p>
        <p>Budget: {airlineBudgets[airline] || 0}</p>
      </div>

      <button
        onClick={exportPDF}
        className="bg-green-600 text-white py-2 w-full rounded"
      >
        Export PDF
      </button>
    </div>
  );
}
