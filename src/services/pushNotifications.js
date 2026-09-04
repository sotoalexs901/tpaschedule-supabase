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
  if (!window.crypto?.subtle) {
    throw new Error(
      "Secure browser crypto is not available on this device."
    );
  }

  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getDeviceLabel() {
  const ua = navigator.userAgent || "";

  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";

  return "Web Device";
}

function isStandaloneMode() {
  try {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone === true
    );
  } catch {
    return false;
  }
}

export async function getPushSupportStatus() {
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
    reason: messagingSupported ? "" : "firebase-messaging",
  };
}

async function getRootServiceWorkerRegistration() {
  let registration =
    await navigator.serviceWorker.getRegistration("/");

  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    registration = await navigator.serviceWorker.ready;
  }

  return registration;
}

async function savePushToken(user, token) {
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
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    standalone: isStandaloneMode(),
    enabled: true,
    updatedAt: serverTimestamp(),
  };

  // setDoc + merge means an existing token is refreshed without
  // overwriting unrelated token data.
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

export async function enablePushNotifications(user) {
  if (!user?.id) {
    throw new Error("A logged-in user is required.");
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
    permission = await Notification.requestPermission();
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

  await savePushToken(user, token);

  return {
    success: true,
    token,
    permission,
  };
}

export async function refreshPushToken(user) {
  if (!user?.id) return null;

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

  const messagingModule = await loadFirebaseMessaging();
  if (!messagingModule) return null;

  const messaging = messagingModule.getMessaging(app);

  const token = await messagingModule.getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) return null;

  await savePushToken(user, token);

  return token;
}

export async function hasPushRegistration(userId) {
  if (!userId) return false;

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "pushTokens"),
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
