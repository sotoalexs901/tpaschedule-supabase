import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  SMART_ASSIGNMENTS_COLLECTION,
  SMART_AUDIT_COLLECTION,
  tampaDateKey,
} from "./smartIntelligenceAssignmentEngine.js";

export const SMART_REPORT_MONITOR_VERSION = "report_monitor_final_v1";
export const SMART_ALERTS_COLLECTION = "smart_intelligence_alerts";

const REPORT_SOURCES = {
  gate_checklist: {
    collection: "gateChecklistReports",
    dateFields: ["date", "reportDate", "flightDate"],
    departmentFields: ["airline", "department"],
    submitterFields: ["submittedByName", "submittedBy", "updatedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  operational_report: {
    collection: "operational_reports",
    dateFields: ["reportDate", "date"],
    departmentFields: ["airline", "department", "templateKey"],
    submitterFields: ["submittedByName", "supervisorReporting", "updatedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  supervisor_daily_report: {
    collection: "operational_reports",
    dateFields: ["reportDate", "date"],
    departmentFields: ["airline", "department", "templateKey"],
    submitterFields: ["submittedByName", "supervisorReporting", "updatedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  timesheet: {
    collection: "timesheet_reports",
    dateFields: ["reportDate", "date"],
    departmentFields: ["airline", "normalizedAirline", "department"],
    submitterFields: ["submittedByName", "supervisorReporting", "submittedBy"],
    statusFields: ["status", "reviewStatus"],
  },
  regulated_garbage: {
    collection: "regulated_garbage_reports",
    dateFields: ["reportDate", "date"],
    departmentFields: ["airline", "department"],
    submitterFields: ["submittedByName", "supervisorName", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  cleaning_security: {
    collection: "cleaning_security_reports",
    dateFields: ["date", "reportDate"],
    departmentFields: ["airline", "airlineName", "department"],
    submitterFields: ["submittedByName", "supervisorName", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  operations_request: {
    collection: "supplies_uniform_ot_requests",
    dateFields: ["date", "reportDate", "submittedAt", "createdAt"],
    departmentFields: ["airline", "department", "departmentName"],
    submitterFields: ["submittedByName", "employeeName", "requestedByName", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  wchr_poi: {
    collection: "wchr_poi_reports",
    dateFields: ["date", "flightDate", "reportDate"],
    departmentFields: ["airline", "airlineName", "department"],
    submitterFields: ["submittedByName", "supervisorName", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  employee_performance: {
    collection: "employeePerformanceReports",
    monthly: true,
    monthFields: ["month", "monthKey", "reportMonth"],
    departmentFields: ["department", "airline", "airlineName"],
    submitterFields: ["submittedByName", "supervisorName", "submittedBy"],
    statusFields: ["managerStatus", "reviewStatus", "status"],
  },
  bso_daily: {
    collection: "bso_daily_reports",
    dateFields: ["reportDate", "date"],
    departmentFields: ["department", "airline"],
    submitterFields: ["submittedByName", "supervisorName", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  fuel_entry: {
    collection: "fuel_logs",
    dateFields: ["date", "reportDate"],
    departmentFields: ["airline", "department"],
    submitterFields: ["submittedByName", "agent", "supervisor", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
  cierre_vuelo: {
    collection: "cierreVueloFlights",
    dateFields: ["date", "reportDate"],
    departmentFields: ["airline", "department"],
    submitterFields: ["submittedByName", "closingAgent", "supervisor", "submittedBy"],
    statusFields: ["reviewStatus", "status"],
  },
};

export const SMART_REPORT_LABELS = {
  gate_checklist: "Gate Checklist",
  operational_report: "Supervisor Operational Report",
  supervisor_daily_report: "Supervisor Daily Report",
  timesheet: "Timesheet",
  operations_request: "Supplies / Uniform / OT Request",
  cleaning_security: "Cleaning & Security Report",
  regulated_garbage: "Regulated Garbage Report",
  wchr_flight_report: "WCHR Flight Report",
  wchr_poi: "WCHR POI Report",
  employee_performance: "Employee Performance Report",
  bso_daily: "BSO Daily Report",
  fuel_entry: "Fuel Entry",
  cierre_vuelo: "Cierre de Vuelo",
};

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function normalizeAccount(value) {
  const raw = upper(value).replace(/[^A-Z0-9]+/g, " ").trim();
  if (!raw) return "";
  if (raw === "SY" || raw.includes("SUN COUNTRY")) return "SY";
  if (
    raw === "WL" ||
    raw === "WAL" ||
    raw.includes("WL INVICTA") ||
    raw.includes("WORLD ATLANTIC")
  ) return "WL";
  if (raw === "AV" || raw.includes("AVIANCA")) return "AV";
  if (raw === "AM" || raw.includes("AEROMEXICO")) return "AEROMEXICO OTHER";
  if (raw.includes("AA BSO") || raw === "BSO") return "AA BSO";
  if (
    raw === "CABIN" ||
    raw.includes("DL CABIN") ||
    raw.includes("CABIN SERVICE") ||
    raw === "DL" ||
    raw.includes("DELTA")
  ) return "DL CABIN SERVICE";
  if (raw.includes("WCHR") || raw.includes("WHEELCHAIR")) return "WCHR";
  return raw;
}

function firstValue(item, fields) {
  for (const field of fields || []) {
    const value = item?.[field];
    if (value !== null && value !== undefined && clean(value)) return value;
  }
  return "";
}

function firestoreDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const raw = value.trim();
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "" : tampaDateKey(parsed);
  }
  if (typeof value?.toDate === "function") return tampaDateKey(value.toDate());
  if (typeof value?.seconds === "number") return tampaDateKey(new Date(value.seconds * 1000));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : tampaDateKey(parsed);
}

function reportDateKey(item, source) {
  for (const field of source.dateFields || []) {
    const key = firestoreDateKey(item?.[field]);
    if (key) return key;
  }
  return firestoreDateKey(item?.submittedAt || item?.createdAt || item?.updatedAt);
}

function monthKeyFromDateKey(dateKey) {
  return clean(dateKey).slice(0, 7);
}

function normalizeMonth(value) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})[-\/]?(\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return tampaDateKey(parsed).slice(0, 7);
  return raw.toUpperCase();
}

function reportMatchesDepartment(item, source, department) {
  const wanted = normalizeAccount(department);
  if (!wanted) return false;
  const candidates = (source.departmentFields || [])
    .map((field) => normalizeAccount(item?.[field]))
    .filter(Boolean);
  return candidates.includes(wanted);
}

function normalizeWorkflowStatus(item, source) {
  const raw = upper(firstValue(item, source.statusFields));

  if (
    item?.approvedAt ||
    item?.closedAt ||
    raw === "APPROVED" ||
    raw === "CLOSED" ||
    raw === "COMPLETE" ||
    raw === "COMPLETED"
  ) return "APPROVED";

  if (
    raw === "RETURNED" ||
    raw === "REJECTED" ||
    raw === "FOLLOW_UP_REQUIRED" ||
    raw === "FOLLOW UP REQUIRED" ||
    item?.followUpRequired === true
  ) return "FOLLOW_UP";

  if (raw === "DRAFT") return "DRAFT";
  return "RECEIVED";
}

function statusRank(status) {
  if (status === "APPROVED") return 4;
  if (status === "RECEIVED") return 3;
  if (status === "FOLLOW_UP") return 2;
  if (status === "DRAFT") return 1;
  return 0;
}

function pickBestReport(reports) {
  return [...reports].sort((a, b) => {
    const rank = statusRank(b.workflowStatus) - statusRank(a.workflowStatus);
    if (rank) return rank;
    return clean(b.id).localeCompare(clean(a.id));
  })[0] || null;
}

function stablePackageHash(packageRows) {
  return JSON.stringify(
    packageRows.map((row) => ({
      key: row.key,
      status: row.status,
      count: row.count,
      bestReportId: row.bestReportId || "",
      submitter: row.submittedBy || "",
    }))
  );
}

async function loadSourceRows(requiredKeys) {
  const keys = [...new Set(requiredKeys)].filter((key) => REPORT_SOURCES[key]);
  const entries = await Promise.all(
    keys.map(async (key) => {
      const source = REPORT_SOURCES[key];
      const snap = await getDocs(collection(db, source.collection));
      return [key, snap.docs.map((item) => ({ id: item.id, ...item.data() }))];
    })
  );
  return Object.fromEntries(entries);
}

function monthlyNotDue(dateKey) {
  const day = Number(clean(dateKey).slice(8, 10) || 0);
  return day > 0 && day < 15;
}

function buildReportStatus({ key, department, dateKey, rowsByKey }) {
  const label = SMART_REPORT_LABELS[key] || key;
  const source = REPORT_SOURCES[key];

  if (!source) {
    return {
      key,
      label,
      connected: false,
      status: "NOT_CONNECTED",
      count: 0,
      submittedBy: "",
      bestReportId: "",
      sourceCollection: "",
      reports: [],
    };
  }

  let matches = (rowsByKey[key] || [])
    .filter((item) => reportMatchesDepartment(item, source, department));

  if (source.monthly) {
    const wantedMonth = monthKeyFromDateKey(dateKey);
    matches = matches.filter((item) => {
      const fromField = firstValue(item, source.monthFields);
      if (fromField) return normalizeMonth(fromField) === wantedMonth;
      const fallback = firestoreDateKey(item?.submittedAt || item?.createdAt || item?.updatedAt);
      return fallback.slice(0, 7) === wantedMonth;
    });
  } else {
    matches = matches.filter((item) => reportDateKey(item, source) === dateKey);
  }

  matches = matches
    .map((item) => ({
      id: item.id,
      workflowStatus: normalizeWorkflowStatus(item, source),
      submittedBy: clean(firstValue(item, source.submitterFields)),
      rawStatus: clean(firstValue(item, source.statusFields)),
    }))
    .filter((item) => item.workflowStatus !== "DRAFT");

  if (!matches.length) {
    if (source.monthly && monthlyNotDue(dateKey)) {
      return {
        key,
        label,
        connected: true,
        status: "NOT_DUE",
        count: 0,
        submittedBy: "",
        bestReportId: "",
        sourceCollection: source.collection,
        reports: [],
      };
    }

    return {
      key,
      label,
      connected: true,
      status: "MISSING",
      count: 0,
      submittedBy: "",
      bestReportId: "",
      sourceCollection: source.collection,
      reports: [],
    };
  }

  const best = pickBestReport(matches);
  const hasFollowUp = matches.some((item) => item.workflowStatus === "FOLLOW_UP");
  const hasApproved = matches.some((item) => item.workflowStatus === "APPROVED");

  return {
    key,
    label,
    connected: true,
    status: hasFollowUp ? "FOLLOW_UP" : hasApproved ? "APPROVED" : "RECEIVED",
    count: matches.length,
    submittedBy: best?.submittedBy || "",
    bestReportId: best?.id || "",
    sourceCollection: source.collection,
    reports: matches,
  };
}

function summarizePackage(rows) {
  const actionable = rows.filter((row) => row.connected && row.status !== "NOT_DUE");
  const missing = actionable.filter((row) => row.status === "MISSING");
  const followUp = actionable.filter((row) => row.status === "FOLLOW_UP");
  const approved = actionable.filter((row) => row.status === "APPROVED");
  const received = actionable.filter((row) => row.status === "RECEIVED");
  const notConnected = rows.filter((row) => !row.connected);
  const notDue = rows.filter((row) => row.status === "NOT_DUE");

  let packageStatus = "WAITING";
  if (followUp.length) packageStatus = "FOLLOW_UP_REQUIRED";
  else if (missing.length) packageStatus = "INCOMPLETE";
  else if (actionable.length && approved.length === actionable.length) packageStatus = "APPROVED";
  else if (actionable.length) packageStatus = "READY_FOR_REVIEW";

  return {
    packageStatus,
    requiredCount: rows.length,
    connectedCount: rows.filter((row) => row.connected).length,
    actionableCount: actionable.length,
    receivedCount: received.length,
    approvedCount: approved.length,
    missingCount: missing.length,
    followUpCount: followUp.length,
    notConnectedCount: notConnected.length,
    notDueCount: notDue.length,
  };
}

function missingLabels(reportPackage) {
  return reportPackage
    .filter((item) => item.status === "MISSING" || item.status === "FOLLOW_UP")
    .map((item) => item.label);
}

function hasTimesheetReceived(reportPackage) {
  const item = reportPackage.find((row) => row.key === "timesheet");
  return item && ["RECEIVED", "APPROVED"].includes(item.status);
}

function alertStateForPackage(assignment, reportPackage, summary) {
  if (!assignment?.assignedDutyManagerId) return null;
  if (!assignment?.responsibleSupervisorUserId && !assignment?.responsibleSupervisorName) return null;
  if (assignment?.packageReviewStatus === "COMPLETED") return null;

  const missing = missingLabels(reportPackage);

  if (summary.packageStatus === "FOLLOW_UP_REQUIRED") {
    return {
      alertType: "FOLLOW_UP_REQUIRED",
      severity: "HIGH",
      title: `${assignment.department}: follow-up required`,
      message: `${assignment.responsibleSupervisorName || "Supervisor"} has report item(s) requiring follow-up: ${missing.join(", ")}.`,
    };
  }

  if (summary.packageStatus === "INCOMPLETE" && hasTimesheetReceived(reportPackage)) {
    return {
      alertType: "MISSING_AFTER_TIMESHEET",
      severity: "HIGH",
      title: `${assignment.department}: reporting package incomplete`,
      message: `Timesheet has been received, but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} still missing. Please follow up with ${assignment.responsibleSupervisorName || "the responsible supervisor"}.`,
    };
  }

  if (summary.packageStatus === "READY_FOR_REVIEW") {
    return {
      alertType: "READY_FOR_REVIEW",
      severity: "NORMAL",
      title: `${assignment.department}: reports ready for review`,
      message: `The connected reporting package for ${assignment.responsibleSupervisorName || "the responsible supervisor"} is ready for your review.`,
    };
  }

  if (summary.packageStatus === "APPROVED") {
    return {
      alertType: "READY_TO_CLOSE",
      severity: "NORMAL",
      title: `${assignment.department}: ready to close`,
      message: `All connected reports are approved. Confirm the package review to close today's ${assignment.department} reporting.`,
    };
  }

  return null;
}

async function upsertDutyAlert({ assignment, alert }) {
  const alertId = `${assignment.dateKey}__${assignment.id}__duty_action`;
  if (!alert) {
    await setDoc(
      doc(db, SMART_ALERTS_COLLECTION, alertId),
      { active: false, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  }

  await setDoc(
    doc(db, SMART_ALERTS_COLLECTION, alertId),
    {
      active: true,
      dateKey: assignment.dateKey,
      assignmentId: assignment.id,
      department: assignment.department || "",
      targetUserId: assignment.assignedDutyManagerId || "",
      targetRole: "duty_manager",
      audience: "DUTY_MANAGER",
      responsibleSupervisorName: assignment.responsibleSupervisorName || "",
      alertType: alert.alertType,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: SMART_REPORT_MONITOR_VERSION,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function refreshSmartReportPackages({ actor } = {}) {
  const dateKey = tampaDateKey();
  const assignmentsSnap = await getDocs(collection(db, SMART_ASSIGNMENTS_COLLECTION));
  const assignments = assignmentsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.dateKey === dateKey);

  const requiredKeys = assignments.flatMap((item) =>
    Array.isArray(item.requiredReports) ? item.requiredReports : []
  );
  const rowsByKey = await loadSourceRows(requiredKeys);
  const updated = [];

  for (const assignment of assignments) {
    const requiredReports = Array.isArray(assignment.requiredReports)
      ? assignment.requiredReports
      : [];

    const reportPackage = requiredReports.map((key) =>
      buildReportStatus({ key, department: assignment.department, dateKey, rowsByKey })
    );

    const summary = summarizePackage(reportPackage);
    const hash = stablePackageHash(reportPackage);
    const changed = hash !== clean(assignment.reportPackageHash);

    const nextPackageReviewStatus = assignment.packageReviewStatus === "COMPLETED"
      ? "COMPLETED"
      : summary.packageStatus === "INCOMPLETE" || summary.packageStatus === "FOLLOW_UP_REQUIRED"
      ? "ACTION_REQUIRED"
      : "OPEN";

    await setDoc(
      doc(db, SMART_ASSIGNMENTS_COLLECTION, assignment.id),
      {
        reportPackage,
        reportPackageHash: hash,
        reportPackageStatus: summary.packageStatus,
        reportPackageSummary: summary,
        reportPackageCheckedAt: serverTimestamp(),
        packageReviewStatus: nextPackageReviewStatus,
        reportMonitorVersion: SMART_REPORT_MONITOR_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await upsertDutyAlert({
      assignment: { ...assignment, dateKey },
      alert: alertStateForPackage(assignment, reportPackage, summary),
    });

    if (changed) {
      const auditId = `${dateKey}__${assignment.id}__reports_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(doc(db, SMART_AUDIT_COLLECTION, auditId), {
        eventType: "REPORT_PACKAGE_UPDATED",
        dateKey,
        assignmentId: assignment.id,
        department: assignment.department || "",
        assignedDutyManagerId: assignment.assignedDutyManagerId || "",
        assignedDutyManagerName: assignment.assignedDutyManagerName || "",
        responsibleSupervisorName: assignment.responsibleSupervisorName || "",
        reportPackage,
        reportPackageSummary: summary,
        packageStatus: summary.packageStatus,
        actorId: actor?.id || "",
        actorName: actor?.displayName || actor?.fullName || actor?.name || actor?.username || "Smart Intelligence",
        source: SMART_REPORT_MONITOR_VERSION,
        createdAt: serverTimestamp(),
      });
    }

    updated.push({
      ...assignment,
      reportPackage,
      reportPackageSummary: summary,
      reportPackageStatus: summary.packageStatus,
      packageReviewStatus: nextPackageReviewStatus,
    });
  }

  return { dateKey, assignments: updated };
}

export async function completeSmartReportPackage({ assignment, actor } = {}) {
  if (!assignment?.id) throw new Error("Assignment is required.");
  if (!actor?.id) throw new Error("User session is required.");

  const isStationManager = actor?.role === "station_manager";
  const isAssignedDutyManager =
    actor?.role === "duty_manager" && assignment.assignedDutyManagerId === actor.id;

  if (!isStationManager && !isAssignedDutyManager) {
    throw new Error("Only the assigned Duty Manager or Station Manager can close this package.");
  }

  if (!assignment.responsibleSupervisorName) {
    throw new Error("Select the responsible supervisor before closing the package.");
  }

  const summary = assignment.reportPackageSummary || {};
  if (Number(summary.missingCount || 0) > 0 || Number(summary.followUpCount || 0) > 0) {
    throw new Error("Resolve missing or follow-up items before closing the package.");
  }

  const reviewerName = actor?.displayName || actor?.fullName || actor?.name || actor?.username || "Duty Manager";

  await updateDoc(doc(db, SMART_ASSIGNMENTS_COLLECTION, assignment.id), {
    packageReviewStatus: "COMPLETED",
    packageReviewedAt: serverTimestamp(),
    packageReviewedById: actor.id,
    packageReviewedByName: reviewerName,
    packageReviewedByRole: actor.role || "",
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, SMART_ALERTS_COLLECTION, `${assignment.dateKey}__${assignment.id}__duty_action`), {
    active: false,
    resolvedAt: serverTimestamp(),
    resolvedById: actor.id,
    resolvedByName: reviewerName,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const stationAlertId = `${assignment.dateKey}__${assignment.id}__station_close`;
  await setDoc(doc(db, SMART_ALERTS_COLLECTION, stationAlertId), {
    active: true,
    dateKey: assignment.dateKey,
    assignmentId: assignment.id,
    department: assignment.department || "",
    targetRole: "station_manager",
    audience: "STATION_MANAGER",
    alertType: "PACKAGE_COMPLETED",
    severity: "INFO",
    title: `${assignment.department}: reports reviewed`,
    message: `${reviewerName} completed the ${assignment.department} report review for ${assignment.responsibleSupervisorName}.`,
    responsibleSupervisorName: assignment.responsibleSupervisorName || "",
    reviewedByName: reviewerName,
    source: SMART_REPORT_MONITOR_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await addDoc(collection(db, SMART_AUDIT_COLLECTION), {
    eventType: "REPORT_PACKAGE_COMPLETED",
    dateKey: assignment.dateKey || tampaDateKey(),
    assignmentId: assignment.id,
    department: assignment.department || "",
    assignedDutyManagerId: assignment.assignedDutyManagerId || "",
    assignedDutyManagerName: assignment.assignedDutyManagerName || "",
    responsibleSupervisorName: assignment.responsibleSupervisorName || "",
    reportPackage: assignment.reportPackage || [],
    reportPackageSummary: assignment.reportPackageSummary || {},
    actorId: actor.id,
    actorName: reviewerName,
    actorRole: actor.role || "",
    source: SMART_REPORT_MONITOR_VERSION,
    createdAt: serverTimestamp(),
  });
}

export async function acknowledgeSmartAlert({ alertId, actor } = {}) {
  if (!alertId || !actor?.id) return;
  await updateDoc(doc(db, SMART_ALERTS_COLLECTION, alertId), {
    active: false,
    acknowledgedAt: serverTimestamp(),
    acknowledgedById: actor.id,
    acknowledgedByName: actor?.displayName || actor?.fullName || actor?.name || actor?.username || "User",
    updatedAt: serverTimestamp(),
  });
}
