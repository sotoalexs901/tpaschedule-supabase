import {
  addDoc,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";

function safeString(value) {
  return String(value || "").trim();
}

export async function createNotification({
  userId,
  type = "general",
  title = "Notification",
  message = "",
  link = "",
  createdBy = "",
  entityId = "",
  entityType = "",
}) {
  const cleanUserId = safeString(userId);
  if (!cleanUserId) return;

  await addDoc(collection(db, "notifications"), {
    userId: cleanUserId,
    type: safeString(type) || "general",
    title: safeString(title) || "Notification",
    message: safeString(message),
    link: safeString(link),
    read: false,
    createdBy: safeString(createdBy),
    entityId: safeString(entityId),
    entityType: safeString(entityType),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markNotificationAsRead(notificationId) {
  const cleanNotificationId = safeString(notificationId);
  if (!cleanNotificationId) return;

  await updateDoc(doc(db, "notifications", cleanNotificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsAsRead(userId) {
  const cleanUserId = safeString(userId);
  if (!cleanUserId) return;

  const snap = await getDocs(
    query(
      collection(db, "notifications"),
      where("userId", "==", cleanUserId),
      where("read", "==", false)
    )
  );

  if (snap.empty) return;

  const batch = writeBatch(db);

  snap.docs.forEach((item) => {
    batch.update(doc(db, "notifications", item.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}
