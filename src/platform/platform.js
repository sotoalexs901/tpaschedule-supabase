// src/platform/platform.js
// Shared platform detection for AeroStation Hub.
// This file intentionally has no Capacitor dependency yet, so the current
// website/PWA build remains unchanged. Once Capacitor is installed, native
// detection can be added here without spreading platform checks across pages.

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
  if (!isBrowserEnvironment()) return false;

  // Reserved for Capacitor. Keeping the check dependency-free means the
  // production website can use this foundation before Capacitor is installed.
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function getNativePlatform() {
  if (!isNativeApp()) return "web";

  try {
    return window.Capacitor?.getPlatform?.() || "native";
  } catch {
    return "native";
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
