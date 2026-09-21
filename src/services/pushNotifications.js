// src/services/pushNotifications.js

import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
} from "firebase/firestore";

import { app, db } from "../firebase.js";
import {
  getNativePushPermissionStatus,
  registerNativePush,
  subscribeToNativePushEvents,
} from "../platform/pushService.js";
import {
  getNativePlatform,
  isNativeApp,
  isStandalonePwa,
} from "../platform/platform.js";

const VAPID_KEY = String(
  import.meta.env.VITE_FIREBASE_VAPID_KEY || ""
).trim();

async function loadFirebaseMessaging() {
  try {
    const messagingModule = await import("firebase/messaging");

    return {
      getMessaging: messagingModule.getMessaging,
      getToken: messagingModule.getToken,
      isSupported: messagingModule.isSupported,
    };
  } catch (error) {
    console.error("Firebase Messaging could not be loaded:", error);
    return null;
  }
}

async function sha256(value) {
  if (
    typeof window === "undefined" ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    throw new Error(
      "Secure crypto is not available on this device."
    );
  }

  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDeviceLabel() {
  if (isNativeApp()) {
    const platform = getNativePlatform();

    if (platform === "ios") return "iPhone / iPad App";
    if (platform === "android") return "Android App";

    return "Native App";
  }

  const ua =
    typeof navigator !== "undefined"
      ? navigator.userAgent || ""
      : "";

  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";

  return "Web Device";
}

function isStandaloneMode() {
  return isStandalonePwa();
}

export async function getPushSupportStatus() {
  // ------------------------------------------------------------
  // Native iOS / Android
  // ------------------------------------------------------------
  if (isNativeApp()) {
    try {
      const permission =
        await getNativePushPermissionStatus();

      return {
        supported: true,
        permission:
          permission && permission.receive
            ? permission.receive
            : "prompt",
        standalone: true,
        native: true,
        platform: getNativePlatform(),
        reason: "",
      };
    } catch (error) {
      console.error(
        "Native push support check failed:",
        error
      );

      return {
        supported: false,
        permission: "unsupported",
        standalone: true,
        native: true,
        platform: getNativePlatform(),
        reason: "native-push",
      };
    }
  }

  // ------------------------------------------------------------
  // Website / PWA
  // ------------------------------------------------------------
  if (typeof window === "undefined") {
    return {
      supported: false,
      permission: "default",
      reason: "browser",
    };
  }

  if (!("Notification" in window)) {
    return {
      supported: false,
      permission: "unsupported",
      reason: "notifications",
    };
  }

  if (!("serviceWorker" in navigator)) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: "service-worker",
    };
  }

  const messaging = await loadFirebaseMessaging();

  if (!messaging) {
    return {
      supported: false,
      permission: Notification.permission,
      reason: "firebase-messaging-load",
    };
  }

  let messagingSupported = false;

  try {
    messagingSupported = await messaging.isSupported();
  } catch (error) {
    console.warn(
      "Firebase Messaging support check failed:",
      error
    );
  }

  return {
    supported: Boolean(messagingSupported),
    permission: Notification.permission,
    standalone: isStandaloneMode(),
    native: false,
    platform: "web",
    reason: messagingSupported
      ? ""
      : "firebase-messaging",
  };
}

async function getRootServiceWorkerRegistration() {
  let registration =
    await navigator.serviceWorker.getRegistration("/");

  if (!registration) {
    registration =
      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

    registration =
      await navigator.serviceWorker.ready;
  }

  return registration;
}

async function saveWebPushToken(user, token) {
  if (!user?.id || !token) {
    throw new Error("Missing user or push token.");
  }

  const tokenHash = await sha256(token);

  const tokenRef = doc(
    db,
    "users",
    user.id,
    "pushTokens",
    tokenHash
  );

  const nowPayload = {
    token,
    tokenHash,
    tokenRuntime: "web",
    tokenProvider: "firebase-web-messaging",
    userId: user.id,
    username:
      user.username ||
      user.loginUsername ||
      "",
    displayName:
      user.displayName ||
      user.fullName ||
      user.name ||
      "",
    deviceLabel: getDeviceLabel(),
    userAgent:
      typeof navigator !== "undefined"
        ? navigator.userAgent || ""
        : "",
    platform:
      typeof navigator !== "undefined"
        ? navigator.platform || ""
        : "",
    standalone: isStandaloneMode(),
    enabled: true,
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    tokenRef,
    {
      ...nowPayload,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return tokenHash;
}

async function saveNativePushToken(user, token) {
  if (!user?.id || !token) {
    throw new Error(
      "Missing user or native push token."
    );
  }

  const tokenHash = await sha256(token);
  const platform = getNativePlatform();

  // IMPORTANT:
  // Native tokens are stored separately from existing Web FCM tokens.
  // Current Netlify push functions continue reading only "pushTokens".
  // This prevents an iOS APNs token from accidentally being sent through
  // the existing Firebase Web Push delivery path.
  const tokenRef = doc(
    db,
    "users",
    user.id,
    "nativePushTokens",
    tokenHash
  );

  await setDoc(
    tokenRef,
    {
      token,
      tokenHash,
      tokenRuntime: "native",
      tokenProvider:
        platform === "ios"
          ? "apns"
          : platform === "android"
          ? "fcm"
          : "native",
      nativePlatform: platform,
      userId: user.id,
      username:
        user.username ||
        user.loginUsername ||
        "",
      displayName:
        user.displayName ||
        user.fullName ||
        user.name ||
        "",
      deviceLabel: getDeviceLabel(),
      enabled: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return tokenHash;
}

function waitForNativeRegistrationToken() {
  return new Promise((resolve, reject) => {
    let finished = false;
    let unsubscribe = function () {};

    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      unsubscribe();

      reject(
        new Error(
          "Native push registration timed out."
        )
      );
    }, 15000);

    unsubscribe = subscribeToNativePushEvents({
      onRegistration(token) {
        if (finished) return;

        const value =
          token && typeof token.value === "string"
            ? token.value.trim()
            : "";

        if (!value) return;

        finished = true;
        window.clearTimeout(timeoutId);
        unsubscribe();
        resolve(value);
      },

      onRegistrationError(error) {
        if (finished) return;

        finished = true;
        window.clearTimeout(timeoutId);
        unsubscribe();

        reject(
          new Error(
            error && error.error
              ? String(error.error)
              : "Native push registration failed."
          )
        );
      },
    });
  });
}

async function enableNativePushNotifications(user) {
  const tokenPromise =
    waitForNativeRegistrationToken();

  const registrationResult =
    await registerNativePush();

  if (!registrationResult.registered) {
    throw new Error(
      registrationResult.reason === "permission-denied"
        ? "Notifications were blocked on this device."
        : "Native push registration could not start."
    );
  }

  const token = await tokenPromise;

  await saveNativePushToken(user, token);

  return {
    success: true,
    token,
    permission:
      registrationResult.permission ||
      "granted",
    runtime: "native",
    platform: getNativePlatform(),
  };
}

export async function enablePushNotifications(user) {
  if (!user?.id) {
    throw new Error(
      "A logged-in user is required."
    );
  }

  if (isNativeApp()) {
    return enableNativePushNotifications(user);
  }

  if (!VAPID_KEY) {
    throw new Error(
      "VITE_FIREBASE_VAPID_KEY is not configured."
    );
  }

  const support = await getPushSupportStatus();

  if (!support.supported) {
    throw new Error(
      support.reason === "notifications"
        ? "Notifications are not supported on this browser."
        : "Push notifications are not available on this device yet."
    );
  }

  let permission = Notification.permission;

  if (permission !== "granted") {
    permission =
      await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications were blocked on this device."
        : "Notification permission was not granted."
    );
  }

  const registration =
    await getRootServiceWorkerRegistration();

  const messagingModule =
    await loadFirebaseMessaging();

  if (!messagingModule) {
    throw new Error(
      "Firebase Messaging could not be loaded on this device."
    );
  }

  const messaging =
    messagingModule.getMessaging(app);

  const token =
    await messagingModule.getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

  if (!token) {
    throw new Error(
      "Firebase did not return a push notification token."
    );
  }

  await saveWebPushToken(user, token);

  return {
    success: true,
    token,
    permission,
    runtime: "web",
  };
}

export async function refreshPushToken(user) {
  if (!user?.id) return null;

  if (isNativeApp()) {
    try {
      const result =
        await enableNativePushNotifications(user);

      return result?.token || null;
    } catch (error) {
      console.warn(
        "Native push token refresh failed:",
        error
      );
      return null;
    }
  }

  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return null;
  }

  if (!VAPID_KEY) return null;

  const support = await getPushSupportStatus();
  if (!support.supported) return null;

  const registration =
    await getRootServiceWorkerRegistration();

  const messagingModule =
    await loadFirebaseMessaging();

  if (!messagingModule) return null;

  const messaging =
    messagingModule.getMessaging(app);

  const token =
    await messagingModule.getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

  if (!token) return null;

  await saveWebPushToken(user, token);

  return token;
}

export async function hasPushRegistration(userId) {
  if (!userId) return false;

  try {
    const collectionName =
      isNativeApp()
        ? "nativePushTokens"
        : "pushTokens";

    const snap = await getDocs(
      query(
        collection(
          db,
          "users",
          userId,
          collectionName
        ),
        where("enabled", "==", true)
      )
    );

    return !snap.empty;
  } catch (error) {
    console.error(
      "Could not check push registration:",
      error
    );
    return false;
  }
}

// END pushNotifications
