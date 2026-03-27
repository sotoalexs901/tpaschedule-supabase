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
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 20;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const scale = usableWidth / imgWidth;
  const scaledHeight = imgHeight * scale;

  let remainingHeight = scaledHeight;
  let yOffset = 0;

  pdf.addImage(
    imgData,
    "PNG",
    margin,
    margin,
    usableWidth,
    scaledHeight,
    undefined,
    "FAST"
  );

  remainingHeight -= usableHeight;

  while (remainingHeight > 0) {
    yOffset += usableHeight / scale;
    pdf.addPage();
    pdf.addImage(
      imgData,
      "PNG",
      margin,
      margin - yOffset * scale,
      usableWidth,
      scaledHeight,
      undefined,
      "FAST"
    );
    remainingHeight -= usableHeight;
  }

  pdf.save(fileName);
}
