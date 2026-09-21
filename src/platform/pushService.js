// src/platform/pushService.js
// Runtime boundary for Web Push vs future Capacitor native push.

import { isNativeApp } from "./platform.js";

export function shouldUseNativePush() {
  return isNativeApp();
}

export function getPushRuntime() {
  return isNativeApp() ? "native" : "web";
}
