// src/services/pwaService.js

const SW_URL = "/sw.js";
const UPDATE_EVENT = "aerostation-pwa-update-ready";
const CONTROLLER_EVENT = "aerostation-pwa-controller-changed";

const AUTO_CHECK_MS = 30 * 1000;
const MIN_UPDATE_GAP_MS = 8 * 1000;
const RELOAD_GUARD_KEY = "aerostation_sw_reload_guard";

let registrationRef = null;
let controllerChangeBound = false;
let lifecycleChecksBound = false;
let autoCheckTimer = null;
let lastUpdateCheckAt = 0;
let activationInProgress = false;

function dispatchUpdateReady(registration) {
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: { registration },
    })
  );
}

function markReloadGuard() {
  try {
    sessionStorage.setItem(
      RELOAD_GUARD_KEY,
      String(Date.now())
    );
  } catch {
    // Ignore storage failures.
  }
}

function recentlyReloadedForServiceWorker() {
  try {
    const raw = sessionStorage.getItem(
      RELOAD_GUARD_KEY
    );

    const timestamp = Number(raw || 0);

    if (!timestamp) return false;

    const isRecent =
      Date.now() - timestamp < 5000;

    if (!isRecent) {
      sessionStorage.removeItem(
        RELOAD_GUARD_KEY
      );
    }

    return isRecent;
  } catch {
    return false;
  }
}

function clearReloadGuardSoon() {
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(
        RELOAD_GUARD_KEY
      );
    } catch {
      // Ignore storage failures.
    }
  }, 6000);
}

function bindControllerChange() {
  if (
    controllerChangeBound ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  controllerChangeBound = true;

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      if (
        recentlyReloadedForServiceWorker()
      ) {
        clearReloadGuardSoon();
        return;
      }

      markReloadGuard();

      window.dispatchEvent(
        new Event(
          CONTROLLER_EVENT
        )
      );

      clearReloadGuardSoon();
    }
  );
}

function requestWaitingWorkerActivation(
  registration
) {
  if (
    !registration?.waiting ||
    activationInProgress
  ) {
    return false;
  }

  activationInProgress = true;

  try {
    registration.waiting.postMessage(
      "SKIP_WAITING"
    );

    return true;
  } catch (error) {
    activationInProgress = false;

    console.error(
      "Could not activate waiting AeroStation Hub service worker:",
      error
    );

    return false;
  }
}

function handleInstalledWorker(
  registration,
  worker
) {
  if (
    worker.state !== "installed" ||
    !navigator.serviceWorker.controller
  ) {
    return;
  }

  dispatchUpdateReady(
    registration
  );

  requestWaitingWorkerActivation(
    registration
  );
}

async function getRegistration() {
  if (
    registrationRef
  ) {
    return registrationRef;
  }

  if (
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  try {
    const registration =
      await navigator.serviceWorker.getRegistration(
        "/"
      );

    if (registration) {
      registrationRef =
        registration;
    }

    return registration || null;
  } catch (error) {
    console.error(
      "Could not get AeroStation Hub service worker registration:",
      error
    );

    return null;
  }
}

export async function registerAeroStationServiceWorker() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  try {
    bindControllerChange();

    const registration =
      await navigator.serviceWorker.register(
        SW_URL,
        {
          scope: "/",
          updateViaCache: "none",
        }
      );

    registrationRef =
      registration;

    if (
      registration.waiting
    ) {
      dispatchUpdateReady(
        registration
      );

      requestWaitingWorkerActivation(
        registration
      );
    }

    registration.addEventListener(
      "updatefound",
      () => {
        const worker =
          registration.installing;

        if (!worker) {
          return;
        }

        worker.addEventListener(
          "statechange",
          () => {
            handleInstalledWorker(
              registration,
              worker
            );
          }
        );
      }
    );

    // Force one immediate update check after registration.
    try {
      await registration.update();

      if (
        registration.waiting
      ) {
        dispatchUpdateReady(
          registration
        );

        requestWaitingWorkerActivation(
          registration
        );
      }
    } catch (updateError) {
      console.warn(
        "Initial AeroStation Hub service worker update check failed:",
        updateError
      );
    }

    bindAggressiveUpdateChecks();

    return registration;
  } catch (error) {
    console.error(
      "AeroStation Hub service worker registration failed:",
      error
    );

    return null;
  }
}

export async function checkAeroStationServiceWorkerUpdate({
  force = false,
  autoActivate = true,
} = {}) {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return null;
  }

  const now = Date.now();

  if (
    !force &&
    lastUpdateCheckAt &&
    now - lastUpdateCheckAt <
      MIN_UPDATE_GAP_MS
  ) {
    return (
      registrationRef ||
      null
    );
  }

  lastUpdateCheckAt = now;

  try {
    const registration =
      (await getRegistration()) ||
      (await registerAeroStationServiceWorker());

    if (!registration) {
      return null;
    }

    registrationRef =
      registration;

    await registration.update();

    if (
      registration.waiting
    ) {
      dispatchUpdateReady(
        registration
      );

      if (autoActivate) {
        requestWaitingWorkerActivation(
          registration
        );
      }
    }

    return registration;
  } catch (error) {
    console.error(
      "AeroStation Hub service worker update check failed:",
      error
    );

    return null;
  }
}

export async function activateAeroStationUpdate() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  const registration =
    (await getRegistration()) ||
    (await registerAeroStationServiceWorker());

  if (!registration) {
    window.location.reload();
    return;
  }

  registrationRef =
    registration;

  if (
    registration.waiting
  ) {
    requestWaitingWorkerActivation(
      registration
    );

    return;
  }

  try {
    await registration.update();
  } catch (error) {
    console.warn(
      "AeroStation Hub update check before activation failed:",
      error
    );
  }

  if (
    registration.waiting
  ) {
    requestWaitingWorkerActivation(
      registration
    );

    return;
  }

  window.location.reload();
}

function bindAggressiveUpdateChecks() {
  if (
    lifecycleChecksBound ||
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  lifecycleChecksBound = true;

  const forceCheck =
    () => {
      checkAeroStationServiceWorkerUpdate({
        force: true,
        autoActivate: true,
      }).catch(() => {});
    };

  const normalCheck =
    () => {
      checkAeroStationServiceWorkerUpdate({
        force: false,
        autoActivate: true,
      }).catch(() => {});
    };

  const onFocus =
    () => {
      forceCheck();
    };

  const onVisibilityChange =
    () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        forceCheck();
      }
    };

  const onPageShow =
    () => {
      forceCheck();
    };

  const onOnline =
    () => {
      forceCheck();
    };

  window.addEventListener(
    "focus",
    onFocus
  );

  window.addEventListener(
    "pageshow",
    onPageShow
  );

  window.addEventListener(
    "online",
    onOnline
  );

  document.addEventListener(
    "visibilitychange",
    onVisibilityChange
  );

  if (
    autoCheckTimer
  ) {
    window.clearInterval(
      autoCheckTimer
    );
  }

  autoCheckTimer =
    window.setInterval(
      normalCheck,
      AUTO_CHECK_MS
    );

  // iOS can restore a Home Screen PWA from memory without a normal reload.
  // Run another update check shortly after startup to catch that case.
  window.setTimeout(
    forceCheck,
    1500
  );

  window.setTimeout(
    forceCheck,
    5000
  );
}

export const AEROSTATION_PWA_UPDATE_EVENT =
  UPDATE_EVENT;

export const AEROSTATION_PWA_CONTROLLER_EVENT =
  CONTROLLER_EVENT;

// Auto-register when this module is imported.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator
) {
  bindControllerChange();

  window.addEventListener(
    "load",
    () => {
      registerAeroStationServiceWorker()
        .then(() => {
          bindAggressiveUpdateChecks();
        })
        .catch(() => {});
    }
  );
}

// END pwaService
