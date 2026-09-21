// src/platform/mediaService.js
// Shared entry point for camera/photo/file capabilities.
// Browser inputs continue working today; Capacitor adapters will be added later.

import { isNativeApp } from "./platform.js";

export function shouldUseNativeMediaPicker() {
  return isNativeApp();
}

export function getMediaRuntime() {
  return isNativeApp() ? "native" : "web";
}
