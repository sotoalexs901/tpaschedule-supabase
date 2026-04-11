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
  if (!userId) return;

  await addDoc(collection(db, "notifications"), {
    userId: safeString(userId),
    type: safeString(type) || "general",
    title: safeString(title) || "Notification",
    message: safeString(message),
    link: safeString(link),
    read: false,
    createdBy: safeString(createdBy),
    entityId: safeString(entityId),
    entityType: safeString(entityType),
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationAsRead(notificationId) {
  if (!notificationId) return;

  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
  });
}

export async function markAllNotificationsAsRead(userId) {
  if (!userId) return;

  const snap = await getDocs(
    query(
      collection(db, "notifications"),
      where("userId", "==", String(userId)),
      where("read", "==", false)
    )
  );

  if (snap.empty) return;

  const batch = writeBatch(db);

  snap.docs.forEach((item) => {
    batch.update(doc(db, "notifications", item.id), {
      read: true,
    });
  });

  await batch.commit();
}
