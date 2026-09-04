// src/services/pwaService.js

const SW_URL = "/sw.js";
const UPDATE_EVENT = "aerostation-pwa-update-ready";
const CONTROLLER_EVENT = "aerostation-pwa-controller-changed";

let registrationRef = null;
let controllerChangeBound = false;

function dispatchUpdateReady(registration) {
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: { registration },
    })
  );
}

function bindControllerChange() {
  if (controllerChangeBound) return;
  controllerChangeBound = true;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.dispatchEvent(new Event(CONTROLLER_EVENT));
  });
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

    const registration = await navigator.serviceWorker.register(
      SW_URL,
      {
        scope: "/",
        updateViaCache: "none",
      }
    );

    registrationRef = registration;

    if (registration.waiting) {
      dispatchUpdateReady(registration);
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          dispatchUpdateReady(registration);
        }
      });
    });

    return registration;
  } catch (error) {
    console.error(
      "AeroStation Hub service worker registration failed:",
      error
    );
    return null;
  }
}

export async function checkAeroStationServiceWorkerUpdate() {
  try {
    const registration =
      registrationRef ||
      (await navigator.serviceWorker?.getRegistration?.("/"));

    if (!registration) return null;

    registrationRef = registration;
    await registration.update();

    if (registration.waiting) {
      dispatchUpdateReady(registration);
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
  const registration =
    registrationRef ||
    (await navigator.serviceWorker?.getRegistration?.("/"));

  if (!registration) {
    window.location.reload();
    return;
  }

  registrationRef = registration;

  if (registration.waiting) {
    registration.waiting.postMessage("SKIP_WAITING");
    return;
  }

  await registration.update();

  if (registration.waiting) {
    registration.waiting.postMessage("SKIP_WAITING");
    return;
  }

  window.location.reload();
}

export const AEROSTATION_PWA_UPDATE_EVENT = UPDATE_EVENT;
export const AEROSTATION_PWA_CONTROLLER_EVENT = CONTROLLER_EVENT;

// Auto-register when this module is imported.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    registerAeroStationServiceWorker();
  });
}

// END pwaService
