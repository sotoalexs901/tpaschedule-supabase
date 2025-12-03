// src/pages/ApprovedScheduleView.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// 🔵 MISMOS LOGOS QUE EN SchedulePage
const AIRLINE_LOGOS = {
  SY: "URL",            // pon aquí tus URLs reales de Storage
  "WL Havana Air": "URL",
  "WL Invicta": "URL",
  AV: "URL",
  EA: "URL",
  WCHR: "URL",
  CABIN: "URL",
  "AA-BSO": "URL",
  OTHER: "URL",
};

// helper para cargar logo
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });

export default function ApprovedScheduleView() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function load() {
      // horario
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) {
        setSchedule(snap.data());
      }

      // empleados
      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load();
  }, [id]);

  if (!schedule) return <p className="p-6">Loading...</p>;

  // ------------------------------------------------------
  // PDF: misma lógica que en SchedulePage
  // ------------------------------------------------------
  const exportPDF = async () => {
    const container = document.getElementById("approved-print-area");
    if (!container) {
      alert("Printable area not found.");
      return;
    }

    try {
      const airline = schedule.airline;
      const department = schedule.department;
      const logoUrl = AIRLINE_LOGOS[airline];
      let logoImg = null;

      if (logoUrl && logoUrl !== "URL") {
        logoImg = await loadImage(logoUrl);
      }

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
      });

      const pdf = new jsPDF("landscape", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;

      let currentY = margin;

      // Header con logo + título
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
      pdf.save(`Approved_${schedule.airline}_${schedule.department}.pdf`);
    } catch (err) {
      console.error("PDF error (approved view)", err);
      alert("There was an error creating the PDF. Check the console.");
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">
        Approved Schedule — {schedule.airline} ({schedule.department})
      </h1>

      {/* área imprimible */}
      <div id="approved-print-area">
        <ScheduleGrid
          employees={employees}
          rows={schedule.grid}
          setRows={() => {}}
          readonly={true}
          airline={schedule.airline}
          department={schedule.department}
          dayNumbers={schedule.days}
          approved={true}
        />
      </div>

      {/* resumen */}
      <div className="card text-sm">
        <h2 className="font-semibold mb-2">Weekly Summary</h2>
        <p>
          <b>Total Hours:</b> {schedule.airlineWeeklyHours.toFixed(2)}
        </p>
        <p>
          <b>Budget:</b> {schedule.budget}
        </p>
        <p
          className={
            schedule.airlineWeeklyHours > schedule.budget
              ? "text-red-600 font-bold"
              : "text-green-700 font-bold"
          }
        >
          {schedule.airlineWeeklyHours > schedule.budget
            ? "Over budget"
            : "Within budget"}
        </p>
      </div>

      <button
        onClick={exportPDF}
        className="bg-green-600 text-white py-2 rounded w-full"
      >
        Export PDF
      </button>
    </div>
  );
}
