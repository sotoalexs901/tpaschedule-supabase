import { App } from "@capacitor/app";
import { isNativeApp } from "./platform.js";

export function subscribeToBrowserVisibility(options = {}) {
  const onActive =
    typeof options.onActive === "function" ? options.onActive : function () {};

  const onInactive =
    typeof options.onInactive === "function"
      ? options.onInactive
      : function () {};

  if (isNativeApp()) {
    let disposed = false;
    let listenerHandle = null;

    App.addListener("appStateChange", function (state) {
      if (disposed) return;

      if (state && state.isActive) {
        onActive();
      } else {
        onInactive();
      }
    })
      .then(function (handle) {
        listenerHandle = handle;
      })
      .catch(function (error) {
        console.error("Unable to register native app lifecycle listener:", error);
      });

    return function unsubscribeNativeLifecycle() {
      disposed = true;

      if (
        listenerHandle &&
        typeof listenerHandle.remove === "function"
      ) {
        listenerHandle.remove();
      }
    };
  }

  if (
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return function noop() {};
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      onInactive();
    } else {
      onActive();
    }
  }

  function handleBeforeUnload() {
    onInactive();
  }

  window.addEventListener("beforeunload", handleBeforeUnload);
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );

  return function unsubscribeBrowserLifecycle() {
    window.removeEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
  };
}
