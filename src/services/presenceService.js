import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

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

export async function updateUserPresence(user, extra = {}) {
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
      online: true,
      currentPage: cleanPage(extra.currentPage),
      lastSeen: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateUserPage(user, currentPage = "") {
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
      online: true,
      currentPage: cleanPage(currentPage),
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
}
