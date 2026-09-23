// src/platform/pushService.js
// Shared push-notification boundary for AeroStation Hub.
//
// Website/PWA:
//   Existing Firebase Web Push remains unchanged.
//
// iOS/Android:
//   Capacitor native push is exposed here.

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

  let permission = await PushNotifications.checkPermissions();

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

  const permission = await requestNativePushPermission();

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


export async function subscribeToNativeRegistrationEvents(handlers) {
  if (!isNativeApp()) {
    return async function unsubscribeWebRuntime() {};
  }

  const safeHandlers = handlers || {};
  const listenerHandles = [];
  let disposed = false;

  async function add(eventName, callback) {
    const handle = await PushNotifications.addListener(eventName, callback);

    if (disposed) {
      if (handle && typeof handle.remove === "function") {
        await handle.remove();
      }
      return;
    }

    listenerHandles.push(handle);
  }

  await add("registration", function (token) {
    if (typeof safeHandlers.onRegistration === "function") {
      safeHandlers.onRegistration(token);
    }
  });

  await add("registrationError", function (error) {
    if (typeof safeHandlers.onRegistrationError === "function") {
      safeHandlers.onRegistrationError(error);
    }
  });

  return async function unsubscribeNativeRegistrationEvents() {
    disposed = true;

    await Promise.all(
      listenerHandles.map(async function (handle) {
        if (handle && typeof handle.remove === "function") {
          try {
            await handle.remove();
          } catch (error) {
            console.warn("Unable to remove native registration listener:", error);
          }
        }
      })
    );

    listenerHandles.length = 0;
  };
}

export async function subscribeToNativePushEvents(handlers) {
  if (!isNativeApp()) {
    return function unsubscribeWebRuntime() {};
  }

  const safeHandlers = handlers || {};
  const listenerHandles = [];
  let disposed = false;

  async function add(eventName, callback) {
    try {
      const handle = await PushNotifications.addListener(eventName, callback);

      if (disposed) {
        if (handle && typeof handle.remove === "function") {
          await handle.remove();
        }
        return;
      }

      listenerHandles.push(handle);
    } catch (error) {
      console.error(
        "Unable to register native push listener:",
        eventName,
        error
      );
      throw error;
    }
  }

  await add("registration", function (token) {
    if (typeof safeHandlers.onRegistration === "function") {
      safeHandlers.onRegistration(token);
    }
  });

  await add("registrationError", function (error) {
    if (typeof safeHandlers.onRegistrationError === "function") {
      safeHandlers.onRegistrationError(error);
    }
  });

  await add("pushNotificationReceived", function (notification) {
    if (typeof safeHandlers.onNotificationReceived === "function") {
      safeHandlers.onNotificationReceived(notification);
    }
  });

  await add("pushNotificationActionPerformed", function (action) {
    if (typeof safeHandlers.onNotificationAction === "function") {
      safeHandlers.onNotificationAction(action);
    }
  });

  return async function unsubscribeNativePushEvents() {
    disposed = true;

    const removals = listenerHandles.map(async function (handle) {
      if (handle && typeof handle.remove === "function") {
        try {
          await handle.remove();
        } catch (error) {
          console.warn("Unable to remove native push listener:", error);
        }
      }
    });

    await Promise.all(removals);
    listenerHandles.length = 0;
  };
}
