import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// ============================================================
// AEROSTATION HUB - PRESENCE & USAGE ANALYTICS
// ============================================================
//
// This service keeps the original public functions:
// - updateUserPresence(user, extra)
// - updateUserPage(user, currentPage)
// - markUserOffline(user)
//
// New analytics collected in user_presence:
// - loginCount
// - sessionCount
// - pageViews
// - activityCount
// - activeMinutesApprox
// - firstLoginAt
// - lastLoginAt
// - lastSeen
// - lastActivityAt
// - currentPage
//
// IMPORTANT:
// AppLayout throttles activity heartbeat to approximately once per minute.
// Therefore activeMinutesApprox is an approximation of engaged minutes,
// not payroll/timekeeping data.

const SESSION_PREFIX = "aerostation_presence_session_";
const LAST_PAGE_PREFIX = "aerostation_presence_last_page_";

function getUserId(user) {
  return String(user?.id || user?.uid || user?.linkedUserId || "").trim();
}

function getUsername(user) {
  return String(
    user?.username ||
      user?.loginUsername ||
      user?.name ||
      user?.email ||
      ""
  ).trim();
}

function getRole(user) {
  return String(user?.role || "").trim();
}

function getDisplayName(user) {
  return String(
    user?.displayName ||
      user?.fullName ||
      user?.name ||
      user?.username ||
      user?.loginUsername ||
      ""
  ).trim();
}

function cleanPage(value) {
  return String(value || "").trim();
}

function getSessionKey(userId) {
  return `${SESSION_PREFIX}${userId}`;
}

function getLastPageKey(userId) {
  return `${LAST_PAGE_PREFIX}${userId}`;
}

function canUseSessionStorage() {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.sessionStorage !== "undefined"
    );
  } catch {
    return false;
  }
}

function isNewBrowserSession(userId) {
  if (!canUseSessionStorage()) {
    // Safe fallback:
    // if sessionStorage is unavailable we avoid artificially incrementing
    // every heartbeat. The login timestamp will still be maintained by
    // first document creation / explicit new browser session when available.
    return false;
  }

  const key = getSessionKey(userId);
  const existing = window.sessionStorage.getItem(key);

  if (existing) return false;

  window.sessionStorage.setItem(key, String(Date.now()));
  return true;
}

function shouldCountPageView(userId, currentPage) {
  const clean = cleanPage(currentPage);
  if (!clean) return false;

  if (!canUseSessionStorage()) {
    return true;
  }

  const key = getLastPageKey(userId);
  const previous = window.sessionStorage.getItem(key) || "";

  if (previous === clean) {
    return false;
  }

  window.sessionStorage.setItem(key, clean);
  return true;
}

function clearLocalPresenceSession(userId) {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.removeItem(getSessionKey(userId));
    window.sessionStorage.removeItem(getLastPageKey(userId));
  } catch {
    // No action required.
  }
}

async function ensurePresenceDocument(user, ref) {
  const userId = getUserId(user);
  if (!userId) return null;

  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap;
  }

  await setDoc(
    ref,
    {
      userId,
      username: getUsername(user),
      displayName: getDisplayName(user),
      role: getRole(user),
      online: true,

      currentPage: "",

      loginCount: 0,
      sessionCount: 0,
      pageViews: 0,
      activityCount: 0,
      activeMinutesApprox: 0,

      firstLoginAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return null;
}

export async function updateUserPresence(user, extra = {}) {
  const userId = getUserId(user);
  if (!userId) return;

  const ref = doc(db, "user_presence", userId);

  const existingSnap = await ensurePresenceDocument(user, ref);
  const newSession = isNewBrowserSession(userId);

  const currentPage = cleanPage(extra.currentPage);
  const hasActivitySignal = Boolean(extra.lastActivityAt);

  const payload = {
    userId,
    username: getUsername(user),
    displayName: getDisplayName(user),
    role: getRole(user),

    online: true,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (currentPage) {
    payload.currentPage = currentPage;
  }

  // ------------------------------------------------------------
  // NEW SESSION
  // ------------------------------------------------------------
  //
  // Count only once per browser-tab session.
  // This prevents route changes and heartbeat pings from being counted
  // as repeated logins.

  if (newSession) {
    payload.loginCount = increment(1);
    payload.sessionCount = increment(1);
    payload.lastLoginAt = serverTimestamp();

    // If this is the first presence document, ensure firstLoginAt exists.
    if (!existingSnap?.exists?.()) {
      payload.firstLoginAt = serverTimestamp();
    }
  }

  // ------------------------------------------------------------
  // REAL ACTIVITY HEARTBEAT
  // ------------------------------------------------------------
  //
  // AppLayout sends extra.lastActivityAt when the user actually interacts
  // with the app. Because that call is throttled to about once per minute,
  // each accepted heartbeat can also be used as approximately one active
  // minute.

  if (hasActivitySignal) {
    payload.lastActivityAt = serverTimestamp();
    payload.activityCount = increment(1);
    payload.activeMinutesApprox = increment(1);
  }

  await setDoc(ref, payload, { merge: true });
}

export async function updateUserPage(user, currentPage = "") {
  const userId = getUserId(user);
  if (!userId) return;

  const ref = doc(db, "user_presence", userId);
  const cleanCurrentPage = cleanPage(currentPage);

  await ensurePresenceDocument(user, ref);

  const payload = {
    userId,
    username: getUsername(user),
    displayName: getDisplayName(user),
    role: getRole(user),

    online: true,
    currentPage: cleanCurrentPage,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Count a page only when the route actually changes in this tab.
  // Re-renders of the same route will not inflate the metric.
  if (shouldCountPageView(userId, cleanCurrentPage)) {
    payload.pageViews = increment(1);
  }

  await setDoc(ref, payload, { merge: true });
}

export async function markUserOffline(user) {
  const userId = getUserId(user);
  if (!userId) return;

  const ref = doc(db, "user_presence", userId);

  await setDoc(
    ref,
    {
      userId,
      username: getUsername(user),
      displayName: getDisplayName(user),
      role: getRole(user),

      online: false,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // A normal logout, page close, forced logout or deleted account should
  // allow the next login to become a new tracked session.
  clearLocalPresenceSession(userId);
}

// END presenceService
