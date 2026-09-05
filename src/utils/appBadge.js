// src/utils/appBadge.js

export function supportsAppBadge() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.setAppBadge === "function"
  );
}

export async function setAeroStationAppBadge(value) {
  if (typeof navigator === "undefined") return;

  const count = Math.max(
    0,
    Number.parseInt(value, 10) || 0
  );

  try {
    if (count <= 0) {
      if (typeof navigator.clearAppBadge === "function") {
        await navigator.clearAppBadge();
      } else if (typeof navigator.setAppBadge === "function") {
        await navigator.setAppBadge(0);
      }

      return;
    }

    if (typeof navigator.setAppBadge === "function") {
      await navigator.setAppBadge(count);
    }
  } catch (err) {
    console.warn("AeroStation Hub app badge unavailable:", err);
  }
}

export async function clearAeroStationAppBadge() {
  if (typeof navigator === "undefined") return;

  try {
    if (typeof navigator.clearAppBadge === "function") {
      await navigator.clearAppBadge();
      return;
    }

    if (typeof navigator.setAppBadge === "function") {
      await navigator.setAppBadge(0);
    }
  } catch (err) {
    console.warn("Could not clear AeroStation Hub app badge:", err);
  }
}

// END appBadge.js
