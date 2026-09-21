// src/platform/appLifecycle.js
// Shared lifecycle adapter for AeroStation Hub.
//
// Website/PWA:
//   Uses document visibility + beforeunload.
//
// iOS/Android:
//   Uses the official Capacitor App plugin.
//
// AppLayout can keep using the same subscription API on every platform.

import { App } from "@capacitor/app";
import { isNativeApp } from "./platform.js";

export function subscribeToBrowserVisibility({
  onActive,
  onInactive,
} = {}) {
  // ------------------------------------------------------------
  // Native iOS / Android
  // ------------------------------------------------------------
  if (isNativeApp()) {
    let disposed = false;

    const listenerPromise = App.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (disposed) return;

        if (isActive) {
          onActive?.();
        } else {
          onInactive?.();
        }
      }
    );

    return () => {
      disposed = true;

      Promise.resolve(listenerPromise)
        .then((handle) => handle?.remove?.())
        .catch(() => {});
    };
  }

  // ------------------------------------------------------------
  // Website / PWA
  // ------------------------------------------------------------
  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return () => {};
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      onInactive?.();
    } else {
      onActive?.();
    }
  };

  const handleBeforeUnload = () => {
    onInactive?.();
  };

  window.addEventListener(
    "beforeunload",
    handleBeforeUnload
  );

  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

  return () => {
    window.removeEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
  };
