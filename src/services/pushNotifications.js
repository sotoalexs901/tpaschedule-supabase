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
import { FCM } from "@capacitor-community/fcm";
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
    throw new Error("Secure crypto is not available on this device.");
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
  if (isNativeApp()) {
    try {
      const permission = await getNativePushPermissionStatus();

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
      console.error("Native push support check failed:", error);

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
    console.warn("Firebase Messaging support check failed:", error);
  }

  return {
    supported: Boolean(messagingSupported),
    permission: Notification.permission,
    standalone: isStandaloneMode(),
    native: false,
    platform: "web",
    reason: messagingSupported ? "" : "firebase-messaging",
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

    registration = await navigator.serviceWorker.ready;
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
  console.log("[PUSH DIAG] 5/7 saveNativePushToken() started", {
    userId: user?.id,
    hasToken: Boolean(token),
  });

  if (!user?.id || !token) {
    throw new Error("Missing user or native push token.");
  }

  const tokenHash = await sha256(token);
  const platform = getNativePlatform();

  const tokenRef = doc(
    db,
    "users",
    user.id,
    "nativePushTokens",
    tokenHash
  );

  console.log("[PUSH DIAG] 6/7 Writing native FCM token to Firestore", {
    userId: user.id,
    platform,
    tokenHash,
  });

  await setDoc(
    tokenRef,
    {
      token,
      tokenHash,
      tokenRuntime: "native",
      tokenProvider: "firebase-native-messaging",
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

  console.log("[PUSH DIAG] 7/7 Native FCM token saved to Firestore", {
    userId: user.id,
    tokenHash,
  });

  return tokenHash;
}

async function createNativeRegistrationWaiter() {
  let finished = false;
  let unsubscribe = async function () {};
  let timeoutId;
  let resolveToken;
  let rejectToken;

  const tokenPromise = new Promise((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  unsubscribe = await subscribeToNativePushEvents({
    onRegistration(token) {
      console.log("[PUSH DIAG] 2/7 APNs registration event received", {
        hasValue: Boolean(token?.value),
      });

      if (finished) return;

      const value =
        token && typeof token.value === "string"
          ? token.value.trim()
          : "";

      if (!value) return;

      finished = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      void unsubscribe();
      resolveToken(value);
    },

    onRegistrationError(error) {
      console.error("[PUSH DIAG] APNs registration error", error);

      if (finished) return;

      finished = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      void unsubscribe();

      rejectToken(
        new Error(
          error && error.error
            ? String(error.error)
            : "Native push registration failed."
        )
      );
    },
  });

  timeoutId = window.setTimeout(() => {
    if (finished) return;

    finished = true;
    void unsubscribe();
    rejectToken(new Error("Native push registration timed out."));
  }, 15000);

  return {
    tokenPromise,
    unsubscribe,
  };
}

async function enableNativePushNotifications(user) {
  console.log("[PUSH DIAG] 1/7 enableNativePushNotifications() started", {
    userId: user?.id,
    platform: getNativePlatform(),
  });

  // IMPORTANT: wait until all native listeners are fully attached before
  // calling PushNotifications.register(). This avoids losing the APNs
  // registration event on fast devices.
  const registrationWaiter = await createNativeRegistrationWaiter();
  console.log("[PUSH DIAG] Native push listeners attached");

  const registrationResult = await registerNativePush();
  console.log(
    "[PUSH DIAG] Native registration request result",
    registrationResult
  );

  if (!registrationResult.registered) {
    await registrationWaiter.unsubscribe();

    throw new Error(
      registrationResult.reason === "permission-denied"
        ? "Notifications were blocked on this device."
        : "Native push registration could not start."
    );
  }

  const apnsToken = await registrationWaiter.tokenPromise;

  console.log("[PUSH DIAG] 3/7 APNs registration completed", {
    tokenLength: apnsToken?.length || 0,
  });

  console.log("[PUSH DIAG] Native FCM plugin ready", {
    available: Boolean(FCM),
    hasGetToken: typeof FCM?.getToken === "function",
  });

  if (!FCM || typeof FCM.getToken !== "function") {
    throw new Error("Native Firebase Messaging plugin is not available.");
  }

  console.log("[PUSH DIAG] Requesting FCM token...");

  const result = await Promise.race([
    FCM.getToken(),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(
          new Error("Timed out while requesting the native FCM token.")
        );
      }, 15000);
    }),
  ]);

  console.log("[PUSH DIAG] 4/7 FCM.getToken() returned", {
    hasToken: Boolean(result?.token),
    tokenLength: result?.token?.length || 0,
  });

  const token =
    result && typeof result.token === "string"
      ? result.token.trim()
      : "";

  if (!token) {
    throw new Error("Firebase did not return a native FCM token.");
  }

  await saveNativePushToken(user, token);

  return {
    success: true,
    token,
    permission: registrationResult.permission || "granted",
    runtime: "native",
    platform: getNativePlatform(),
    tokenProvider: "firebase-native-messaging",
  };
}

export async function enablePushNotifications(user) {
  if (!user?.id) {
    throw new Error("A logged-in user is required.");
  }

  if (isNativeApp()) {
    try {
      return await enableNativePushNotifications(user);
    } catch (error) {
      console.error("[PUSH DIAG] Native push enable FAILED", error);
      throw error;
    }
  }

  if (!VAPID_KEY) {
    throw new Error("VITE_FIREBASE_VAPID_KEY is not configured.");
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
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications were blocked on this device."
        : "Notification permission was not granted."
    );
  }

  const registration = await getRootServiceWorkerRegistration();
  const messagingModule = await loadFirebaseMessaging();

  if (!messagingModule) {
    throw new Error(
      "Firebase Messaging could not be loaded on this device."
    );
  }

  const messaging = messagingModule.getMessaging(app);

  const token = await messagingModule.getToken(messaging, {
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
      const result = await enableNativePushNotifications(user);
      return result?.token || null;
    } catch (error) {
      console.warn("Native push token refresh failed:", error);
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

  const registration = await getRootServiceWorkerRegistration();
  const messagingModule = await loadFirebaseMessaging();

  if (!messagingModule) return null;

  const messaging = messagingModule.getMessaging(app);

  const token = await messagingModule.getToken(messaging, {
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
    console.error("Could not check push registration:", error);
    return false;
  }
}

// END pushNotifications
