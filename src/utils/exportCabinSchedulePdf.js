import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportCabinSchedulePdf({
  elementId,
  fileName = "cabin-schedule.pdf",
}) {
  const element = document.getElementById(elementId);

  if (!element) {
    throw new Error("Export area not found.");
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const ratio = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
  const renderWidth = imgWidth * ratio;
  const renderHeight = imgHeight * ratio;

  const x = (pageWidth - renderWidth) / 2;
  const y = 20;

  pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
  pdf.save(fileName);
}
