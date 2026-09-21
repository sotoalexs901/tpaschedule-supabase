// src/platform/reportService.js
// Shared report / print / PDF / share boundary for AeroStation Hub.
//
// Website / PWA:
//   Existing browser print and download behavior remains available.
//
// iOS / Android:
//   Generated files can be written to native cache storage and opened
//   through the device Share Sheet without changing report data logic.

import { isNativeApp } from "./platform.js";
import {
  shareNativeFile,
  writeNativeBase64File,
} from "./mediaService.js";

function cleanBase64Data(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const commaIndex = raw.indexOf(",");

  if (
    raw.startsWith("data:") &&
    commaIndex >= 0
  ) {
    return raw.slice(commaIndex + 1);
  }

  return raw;
}

function safeFileName(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_");

  return cleaned || fallback || "AeroStation_Report";
}

export function openReportWindow(
  url = "",
  target = "_blank",
  features = ""
) {
  if (typeof window === "undefined") return null;

  // Website / PWA keep the current browser behavior.
  if (!isNativeApp()) {
    return window.open(url, target, features);
  }

  // Native pages should gradually migrate to shareGeneratedFile().
  // Keeping this fallback prevents an immediate breaking change in
  // operational reports that still use window.open().
  return window.open(url, target, features);
}

export function printCurrentView() {
  if (typeof window === "undefined") return false;

  window.print();
  return true;
}

export function printHtmlDocument(html, options = {}) {
  if (typeof window === "undefined") {
    return false;
  }

  const title =
    String(options.title || "AeroStation Hub Report").trim();

  const printWindow = window.open(
    "",
    "_blank",
    "width=1200,height=900"
  );

  if (!printWindow) {
    throw new Error(
      "Pop-up blocked. Please allow pop-ups to print this report."
    );
  }

  printWindow.document.open();
  printWindow.document.write(
    String(html || "")
  );
  printWindow.document.close();

  try {
    printWindow.document.title = title;
  } catch {
    // Ignore title failures.
  }

  window.setTimeout(function () {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error(
        "Unable to print report:",
        error
      );
    }
  }, 350);

  return true;
}

export function downloadBlob(
  blob,
  fileName = "AeroStation_Report.pdf"
) {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return false;
  }

  if (!(blob instanceof Blob)) {
    throw new Error(
      "A valid Blob is required for download."
    );
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = safeFileName(
    fileName,
    "AeroStation_Report.pdf"
  );

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);

  return true;
}

export async function shareGeneratedFile(options = {}) {
  const fileName = safeFileName(
    options.fileName,
    "AeroStation_Report.pdf"
  );

  const title =
    String(options.title || "AeroStation Hub").trim();

  const text =
    String(options.text || "").trim();

  // ------------------------------------------------------------
  // Native iOS / Android
  // ------------------------------------------------------------
  if (isNativeApp()) {
    const base64 = cleanBase64Data(
      options.base64 || options.data
    );

    if (!base64) {
      throw new Error(
        "Base64 file data is required to share a generated native file."
      );
    }

    const result = await writeNativeBase64File({
      path: `reports/${fileName}`,
      data: base64,
    });

    if (!result || !result.uri) {
      throw new Error(
        "The generated report could not be written to native storage."
      );
    }

    await shareNativeFile({
      title,
      text,
      files: [result.uri],
      dialogTitle:
        options.dialogTitle ||
        "Share AeroStation Hub Report",
    });

    return {
      shared: true,
      runtime: "native",
      uri: result.uri,
      fileName,
    };
  }

  // ------------------------------------------------------------
  // Website / PWA
  // ------------------------------------------------------------
  if (options.blob instanceof Blob) {
    downloadBlob(options.blob, fileName);

    return {
      shared: false,
      downloaded: true,
      runtime: "web",
      fileName,
    };
  }

  if (options.url) {
    await shareNativeFile({
      title,
      text,
      url: options.url,
    });

    return {
      shared: true,
      runtime: "web",
      url: options.url,
    };
  }

  throw new Error(
    "Provide a Blob, URL, or native base64 report file."
  );
}

export async function sharePdfDataUrl(
  dataUrl,
  options = {}
) {
  const raw = String(dataUrl || "").trim();

  if (!raw) {
    throw new Error(
      "A PDF data URL is required."
    );
  }

  const fileName = safeFileName(
    options.fileName,
    "AeroStation_Report.pdf"
  );

  if (isNativeApp()) {
    return shareGeneratedFile({
      fileName,
      title:
        options.title || "AeroStation Hub Report",
      text: options.text || "",
      base64: cleanBase64Data(raw),
      dialogTitle:
        options.dialogTitle ||
        "Share AeroStation Hub Report",
    });
  }

  if (typeof fetch !== "function") {
    throw new Error(
      "This browser cannot prepare the PDF download."
    );
  }

  const response = await fetch(raw);
  const blob = await response.blob();

  return shareGeneratedFile({
    fileName,
    title:
      options.title || "AeroStation Hub Report",
    blob,
  });
}

export async function shareJsPdfDocument(
  pdfDocument,
  options = {}
) {
  if (
    !pdfDocument ||
    typeof pdfDocument.output !== "function"
  ) {
    throw new Error(
      "A valid jsPDF document is required."
    );
  }

  const fileName = safeFileName(
    options.fileName,
    "AeroStation_Report.pdf"
  );

  if (isNativeApp()) {
    const dataUri =
      pdfDocument.output("datauristring");

    return sharePdfDataUrl(dataUri, {
      ...options,
      fileName,
    });
  }

  const blob = pdfDocument.output("blob");

  return shareGeneratedFile({
    ...options,
    fileName,
    blob,
  });
}
