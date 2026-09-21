// src/platform/reportService.js
// Web-safe report foundation. Existing report pages can migrate here gradually.

import { isNativeApp } from "./platform.js";

export function openReportWindow(url = "", target = "_blank", features = "") {
  if (typeof window === "undefined") return null;

  // Current website/PWA behavior remains unchanged.
  // Native Share/Print will be added after Capacitor is introduced.
  if (!isNativeApp()) {
    return window.open(url, target, features);
  }

  return window.open(url, target, features);
}

export function printCurrentView() {
  if (typeof window === "undefined") return false;
  window.print();
  return true;
}
