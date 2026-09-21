// src/platform/appLifecycle.js
// Browser lifecycle adapter. Native App lifecycle hooks will be added here
// after Capacitor is installed, leaving pages independent of the runtime.

export function subscribeToBrowserVisibility({ onActive, onInactive } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
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

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
