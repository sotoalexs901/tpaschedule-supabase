import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  SMART_ASSIGNMENTS_COLLECTION,
  SMART_AUDIT_COLLECTION,
  tampaDateKey,
} from "./smartIntelligenceAssignmentEngine.js";

export const SMART_REPORT_MONITOR_VERSION = "report_monitor_v1";

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
};

const REPORT_LABELS = {
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
  if (raw === "WL" || raw === "WAL" || raw.includes("WORLD ATLANTIC")) return "WL";
  if (raw === "AV" || raw.includes("AVIANCA")) return "AV";
  if (raw.includes("AA BSO") || raw === "BSO") return "AA BSO";
  if (
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
    raw === "APPROVED" ||
    raw === "CLOSED" ||
    raw === "COMPLETE" ||
    raw === "COMPLETED"
  ) {
    return "APPROVED";
  }

  if (
    raw === "RETURNED" ||
    raw === "REJECTED" ||
    raw === "FOLLOW_UP_REQUIRED" ||
    item?.followUpRequired === true
  ) {
    return "FOLLOW_UP";
  }

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
      return [
        key,
        snap.docs.map((item) => ({ id: item.id, ...item.data() })),
      ];
    })
  );
  return Object.fromEntries(entries);
}

function buildReportStatus({ key, department, dateKey, rowsByKey }) {
  const label = REPORT_LABELS[key] || key;
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

  const matches = (rowsByKey[key] || [])
    .filter((item) => reportDateKey(item, source) === dateKey)
    .filter((item) => reportMatchesDepartment(item, source, department))
    .map((item) => ({
      id: item.id,
      workflowStatus: normalizeWorkflowStatus(item, source),
      submittedBy: clean(firstValue(item, source.submitterFields)),
      rawStatus: clean(firstValue(item, source.statusFields)),
    }))
    .filter((item) => item.workflowStatus !== "DRAFT");

  if (!matches.length) {
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
  const connected = rows.filter((row) => row.connected);
  const missing = connected.filter((row) => row.status === "MISSING");
  const followUp = connected.filter((row) => row.status === "FOLLOW_UP");
  const approved = connected.filter((row) => row.status === "APPROVED");
  const received = connected.filter((row) => row.status === "RECEIVED");
  const notConnected = rows.filter((row) => !row.connected);

  let packageStatus = "WAITING";
  if (followUp.length) packageStatus = "FOLLOW_UP_REQUIRED";
  else if (missing.length) packageStatus = "INCOMPLETE";
  else if (connected.length && approved.length === connected.length) packageStatus = "APPROVED";
  else if (connected.length) packageStatus = "READY_FOR_REVIEW";

  return {
    packageStatus,
    requiredCount: rows.length,
    connectedCount: connected.length,
    receivedCount: received.length,
    approvedCount: approved.length,
    missingCount: missing.length,
    followUpCount: followUp.length,
    notConnectedCount: notConnected.length,
  };
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
      buildReportStatus({
        key,
        department: assignment.department,
        dateKey,
        rowsByKey,
      })
    );

    const summary = summarizePackage(reportPackage);
    const hash = stablePackageHash(reportPackage);
    const changed = hash !== clean(assignment.reportPackageHash);

    await setDoc(
      doc(db, SMART_ASSIGNMENTS_COLLECTION, assignment.id),
      {
        reportPackage,
        reportPackageHash: hash,
        reportPackageStatus: summary.packageStatus,
        reportPackageSummary: summary,
        reportPackageCheckedAt: serverTimestamp(),
        reportMonitorVersion: SMART_REPORT_MONITOR_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (changed) {
      const auditId = `${dateKey}__${assignment.id}__reports_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      await setDoc(doc(db, SMART_AUDIT_COLLECTION, auditId), {
        eventType: "REPORT_PACKAGE_UPDATED",
        dateKey,
        assignmentId: assignment.id,
        department: assignment.department || "",
        assignedDutyManagerId: assignment.assignedDutyManagerId || "",
        assignedDutyManagerName: assignment.assignedDutyManagerName || "",
        responsibleSupervisorName: assignment.responsibleSupervisorName || "",
        responsibleSupervisorNames: assignment.responsibleSupervisorNames || [],
        reportPackage,
        reportPackageSummary: summary,
        packageStatus: summary.packageStatus,
        actorId: actor?.id || "",
        actorName:
          actor?.displayName || actor?.fullName || actor?.name || actor?.username || "Smart Intelligence",
        source: SMART_REPORT_MONITOR_VERSION,
        createdAt: serverTimestamp(),
      });
    }

    updated.push({ ...assignment, reportPackage, reportPackageSummary: summary, reportPackageStatus: summary.packageStatus });
  }

  return { dateKey, assignments: updated };
}
