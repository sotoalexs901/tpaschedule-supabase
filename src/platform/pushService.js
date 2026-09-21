// src/platform/pushService.js
// Shared push-notification boundary for AeroStation Hub.
//
// Website/PWA:
//   Existing Firebase Web Push remains unchanged.
//
// iOS/Android:
//   Capacitor native push is exposed here. Token persistence and
//   server registration will be connected in a later batch.

import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "./platform.js";

export function shouldUseNativePush() {
  return isNativeApp();
}

export function getPushRuntime() {
  return isNativeApp() ? "native" : "web";
}

export async function getNativePushPermissionStatus() {
  if (!isNativeApp()) {
    return {
      receive: "unsupported",
    };
  }

  return PushNotifications.checkPermissions();
}

export async function requestNativePushPermission() {
  if (!isNativeApp()) {
    return {
      receive: "unsupported",
    };
  }

  var permission = await PushNotifications.checkPermissions();

  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }

  return permission;
}

export async function registerNativePush() {
  if (!isNativeApp()) {
    return {
      registered: false,
      reason: "web-runtime",
    };
  }

  var permission = await requestNativePushPermission();

  if (permission.receive !== "granted") {
    return {
      registered: false,
      reason: "permission-denied",
      permission: permission.receive,
    };
  }

  await PushNotifications.register();

  return {
    registered: true,
    permission: permission.receive,
  };
}

export function subscribeToNativePushEvents(handlers) {
  if (!isNativeApp()) {
    return function unsubscribeWebRuntime() {};
  }

  handlers = handlers || {};

  var listenerHandles = [];
  var disposed = false;

  function add(eventName, callback) {
    PushNotifications.addListener(eventName, callback)
      .then(function (handle) {
        if (disposed) {
          if (handle && typeof handle.remove === "function") {
            handle.remove();
          }
          return;
        }

        listenerHandles.push(handle);
      })
      .catch(function (error) {
        console.error(
          "Unable to register native push listener:",
          eventName,
          error
        );
      });
  }

  add("registration", function (token) {
    if (typeof handlers.onRegistration === "function") {
      handlers.onRegistration(token);
    }
  });

  add("registrationError", function (error) {
    if (typeof handlers.onRegistrationError === "function") {
      handlers.onRegistrationError(error);
    }
  });

  add("pushNotificationReceived", function (notification) {
    if (typeof handlers.onNotificationReceived === "function") {
      handlers.onNotificationReceived(notification);
    }
  });

  add("pushNotificationActionPerformed", function (action) {
    if (typeof handlers.onNotificationAction === "function") {
      handlers.onNotificationAction(action);
    }
  });

  return function unsubscribeNativePushEvents() {
    disposed = true;

    listenerHandles.forEach(function (handle) {
      if (handle && typeof handle.remove === "function") {
        handle.remove();
      }
    });

    listenerHandles = [];
  };
}
