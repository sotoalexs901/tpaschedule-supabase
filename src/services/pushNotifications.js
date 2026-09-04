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
import {
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";

import { app, db } from "../firebase.js";

const VAPID_KEY = String(
  import.meta.env.VITE_FIREBASE_VAPID_KEY || ""
).trim();

async function sha256(value) {
  const encoded = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", encoded);

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
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
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

  const messagingSupported = await isSupported().catch(() => false);

  return {
    supported: messagingSupported,
    permission: Notification.permission,
    standalone: isStandaloneMode(),
    reason: messagingSupported ? "" : "firebase-messaging",
  };
}

async function getRootServiceWorkerRegistration() {
  let registration = await navigator.serviceWorker.getRegistration("/");

  if (!registration) {
    registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    await navigator.serviceWorker.ready;
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

  await setDoc(
    tokenRef,
    {
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
      "Push notifications are not supported on this device/browser."
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

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
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
  if (Notification.permission !== "granted") return null;
  if (!VAPID_KEY) return null;

  const support = await getPushSupportStatus();
  if (!support.supported) return null;

  const registration =
    await getRootServiceWorkerRegistration();

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
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
