import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import ScheduleGrid from "../components/ScheduleGrid";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const AIRLINE_LOGOS = {
  SY: "URL",
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

export default function ApprovedScheduleView() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, "schedules", id));
      if (snap.exists()) setSchedule(snap.data());

      const empSnap = await getDocs(collection(db, "employees"));
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    load();
  }, [id]);

  if (!schedule) return <p className="p-4">Loading…</p>;

  const exportPDF = async () => {
    const area = document.getElementById("approved-area");
    const logoUrl = AIRLINE_LOGOS[schedule.airline];
    let logoImg = null;

    if (logoUrl) logoImg = await loadImage(logoUrl);

    const canvas = await html2canvas(area, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFF",
    });

    const pdf = new jsPDF("landscape", "pt", "a4");
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();

    if (logoImg) pdf.addImage(logoImg, "PNG", 20, 20, 150, 70);

    const yOffset = logoImg ? 110 : 20;
    const imgWidth = pageWidth - 40;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 20, yOffset, imgWidth, imgHeight);
    pdf.save(`Approved_${schedule.airline}_${schedule.department}.pdf`);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">
        Approved Schedule — {schedule.airline} ({schedule.department})
      </h1>

      <div id="approved-area">
        <ScheduleGrid
          employees={employees}
          rows={schedule.grid}
          setRows={() => {}}
          readonly={true}
          airline={schedule.airline}
          department={schedule.department}
          dayNumbers={schedule.days}
        />
      </div>

      <button
        className="w-full bg-green-600 text-white py-2 rounded"
        onClick={exportPDF}
      >
        Export PDF
      </button>
    </div>
  );
}
