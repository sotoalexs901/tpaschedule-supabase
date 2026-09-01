// src/utils/operationalAlerts.js
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export async function createOperationalAlert({
  alertType,
  category = "OPERATIONS",
  severity = "MEDIUM",
  priority = "",
  title,
  message,
  source = "",
  sourceId = "",
  sourcePath = "",
  airline = "",
  department = "",
  reportDate = "",
  targetRoles = ["station_manager", "duty_manager"],
  createdByUserId = "",
  createdByUsername = "",
  createdByName = "",
  createdByRole = "",
  metadata = {},
}) {
  const normalizedSeverity = String(severity || "MEDIUM")
    .trim()
    .toUpperCase();

  const normalizedPriority = String(
    priority ||
      (normalizedSeverity === "HIGH"
        ? "URGENT"
        : normalizedSeverity)
  )
    .trim()
    .toUpperCase();

  return addDoc(collection(db, "operational_alerts"), {
    alertType: String(alertType || "GENERAL")
      .trim()
      .toUpperCase(),
    category: String(category || "OPERATIONS")
      .trim()
      .toUpperCase(),
    severity: normalizedSeverity,
    priority: normalizedPriority,
    status: "OPEN",

    title: String(title || "Operational Alert").trim(),
    message: String(message || "").trim(),

    source: String(source || "").trim(),
    sourceId: String(sourceId || "").trim(),
    sourcePath: String(sourcePath || "").trim(),

    airline: String(airline || "").trim(),
    department: String(department || "").trim(),
    reportDate: String(reportDate || "").trim(),

    targetRoles: Array.isArray(targetRoles)
      ? targetRoles.filter(Boolean)
      : ["station_manager", "duty_manager"],

    createdByUserId: String(createdByUserId || "").trim(),
    createdByUsername: String(createdByUsername || "").trim(),
    createdByName: String(createdByName || "").trim(),
    createdByRole: String(createdByRole || "").trim(),

    metadata:
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata)
        ? metadata
        : {},

    createdAt: serverTimestamp(),
  });
}

export async function consumeOperationalAlert(alert, user) {
  if (!alert?.id) {
    throw new Error("Missing operational alert id.");
  }

  const readerName =
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Management";

  await addDoc(collection(db, "operational_alert_history"), {
    alertId: alert.id,
    alertType: alert.alertType || "",
    category: alert.category || "",
    severity: alert.severity || "",
    priority: alert.priority || "",
    title: alert.title || "",
    message: alert.message || "",
    source: alert.source || "",
    sourceId: alert.sourceId || "",
    sourcePath: alert.sourcePath || "",
    airline: alert.airline || "",
    department: alert.department || "",
    reportDate: alert.reportDate || "",
    createdAtOriginal: alert.createdAt || null,

    readByUserId: user?.id || "",
    readByUsername: user?.username || "",
    readByName: readerName,
    readByRole: user?.role || "",
    readAt: serverTimestamp(),
  });

  await deleteDoc(doc(db, "operational_alerts", alert.id));
}
