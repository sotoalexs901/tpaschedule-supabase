import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function updateUserPresence(user, extra = {}) {
  if (!user?.id) return;

  const ref = doc(db, "user_presence", user.id);

  await setDoc(
    ref,
    {
      userId: user.id,
      username: user.username || user.loginUsername || "",
      role: user.role || "",
      online: true,
      lastSeen: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      currentPage: extra.currentPage || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateUserPage(user, currentPage = "") {
  if (!user?.id) return;

  const ref = doc(db, "user_presence", user.id);

  await setDoc(
    ref,
    {
      userId: user.id,
      username: user.username || user.loginUsername || "",
      role: user.role || "",
      online: true,
      currentPage,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markUserOffline(user) {
  if (!user?.id) return;

  const ref = doc(db, "user_presence", user.id);

  await setDoc(
    ref,
    {
      userId: user.id,
      username: user.username || user.loginUsername || "",
      role: user.role || "",
      online: false,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
