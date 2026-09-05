// src/utils/appBadge.js

function normalizeBadgeCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return 0;
  }

  return parsed;
}

async function syncBadgeWithServiceWorker(count) {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const message = {
    type: "AEROSTATION_BADGE_SYNC",
    count,
  };

  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(
        message
      );
      return;
    }

    const registration =
      await navigator.serviceWorker.ready;

    const worker =
      registration.active ||
      registration.waiting ||
      registration.installing;

    if (worker) {
      worker.postMessage(
        message
      );
    }
  } catch (error) {
    console.warn(
      "Could not sync AeroStation Hub badge with service worker:",
      error
    );
  }
}

async function clearBadgeInServiceWorker() {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const message = {
    type: "AEROSTATION_BADGE_CLEAR",
  };

  try {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(
        message
      );
      return;
    }

    const registration =
      await navigator.serviceWorker.ready;

    const worker =
      registration.active ||
      registration.waiting ||
      registration.installing;

    if (worker) {
      worker.postMessage(
        message
      );
    }
  } catch (error) {
    console.warn(
      "Could not clear AeroStation Hub badge in service worker:",
      error
    );
  }
}

export function supportsAppBadge() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.setAppBadge === "function"
  );
}

export async function setAeroStationAppBadge(value) {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return;
  }

  const count =
    normalizeBadgeCount(
      value
    );

  // Keep the Service Worker's persisted counter synchronized
  // with the exact unread/action count calculated by AppLayout.
  syncBadgeWithServiceWorker(
    count
  );

  try {
    if (count <= 0) {
      if (
        typeof navigator.clearAppBadge ===
        "function"
      ) {
        await navigator.clearAppBadge();
      } else if (
        typeof navigator.setAppBadge ===
        "function"
      ) {
        await navigator.setAppBadge(0);
      }

      return;
    }

    if (
      typeof navigator.setAppBadge ===
      "function"
    ) {
      await navigator.setAppBadge(
        count
      );
    }
  } catch (err) {
    console.warn(
      "AeroStation Hub app badge unavailable:",
      err
    );
  }
}

export async function clearAeroStationAppBadge() {
  if (
    typeof navigator ===
    "undefined"
  ) {
    return;
  }

  clearBadgeInServiceWorker();

  try {
    if (
      typeof navigator.clearAppBadge ===
      "function"
    ) {
      await navigator.clearAppBadge();
      return;
    }

    if (
      typeof navigator.setAppBadge ===
      "function"
    ) {
      await navigator.setAppBadge(0);
    }
  } catch (err) {
    console.warn(
      "Could not clear AeroStation Hub app badge:",
      err
    );
  }
}

// END appBadge.js
