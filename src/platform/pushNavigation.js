// src/platform/pushNavigation.js
// Native push routing for AeroStation Hub.
// Keeps notification navigation centralized so Web/PWA routing remains unchanged.

import { subscribeToNativePushEvents } from "./pushService.js";
import { isNativeApp } from "./platform.js";

function cleanRoute(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  // Accept only internal app routes. Never navigate to an arbitrary external URL.
  if (raw.startsWith("/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);

    if (
      parsed.hostname === "www.aerostationhub.com" ||
      parsed.hostname === "aerostationhub.com"
    ) {
      return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch {
    // Ignore malformed/external values.
  }

  return "";
}

export function getPushActionRoute(action) {
  const notification =
    action && action.notification
      ? action.notification
      : {};

  const data =
    notification && notification.data
      ? notification.data
      : {};

  return cleanRoute(
    data.route ||
      data.url ||
      notification.route ||
      notification.url ||
      ""
  );
}

export function subscribeToNativePushNavigation({
  navigate,
  onForegroundNotification,
  onRegistration,
  onRegistrationError,
} = {}) {
  if (!isNativeApp()) {
    return function unsubscribeWebPushNavigation() {};
  }

  return subscribeToNativePushEvents({
    onRegistration(token) {
      if (typeof onRegistration === "function") {
        onRegistration(token);
      }
    },

    onRegistrationError(error) {
      if (typeof onRegistrationError === "function") {
        onRegistrationError(error);
      }
    },

    onNotificationReceived(notification) {
      if (typeof onForegroundNotification === "function") {
        onForegroundNotification(notification);
      }
    },

    onNotificationAction(action) {
      const route = getPushActionRoute(action);

      if (
        route &&
        typeof navigate === "function"
      ) {
        navigate(route);
      }
    },
  });
}
