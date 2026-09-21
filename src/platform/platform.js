// src/platform/platform.js
// Shared runtime detection for AeroStation Hub.
// Works for website, installed PWA, iOS and Android from the same React codebase.

import { Capacitor } from "@capacitor/core";

export function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isStandalonePwa() {
  if (!isBrowserEnvironment()) return false;

  try {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone === true
    );
  } catch {
    return false;
  }
}

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform() {
  try {
    return Capacitor.getPlatform() || "web";
  } catch {
    return "web";
  }
}

export function getAppRuntime() {
  if (isNativeApp()) return getNativePlatform();
  if (isStandalonePwa()) return "pwa";
  return "web";
}

export function isIOSRuntime() {
  return getNativePlatform() === "ios";
}

export function isAndroidRuntime() {
  return getNativePlatform() === "android";
}

export function isWebRuntime() {
  return !isNativeApp();
}

export function getRuntimeInfo() {
  return {
    runtime: getAppRuntime(),
    platform: getNativePlatform(),
    native: isNativeApp(),
    pwa: isStandalonePwa(),
    web: isWebRuntime(),
  };
}
