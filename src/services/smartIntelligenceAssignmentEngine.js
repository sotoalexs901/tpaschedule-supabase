import {
  collection,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export const SMART_RULES_COLLECTION = "smart_intelligence_department_rules";
export const SMART_ASSIGNMENTS_COLLECTION = "smart_intelligence_daily_assignments";
export const SMART_AUDIT_COLLECTION = "smart_intelligence_audit";

const DUTY_FRESH_MINUTES = 75;

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function visibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "Duty Manager";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function tampaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isDutyManagerFresh(user, nowMs = Date.now()) {
  if (upper(user?.role) !== "DUTY_MANAGER") return false;
  if (user?.smartDutyAvailable !== true) return false;
  if (upper(user?.smartDutyStatus || "AVAILABLE") !== "AVAILABLE") return false;

  const lastSeen =
    toDate(user?.smartDutyLastSeen) ||
    toDate(user?.lastActivityAt) ||
    toDate(user?.lastSeenAt) ||
    toDate(user?.updatedAt);

  if (!lastSeen) return false;
  const ageMinutes = (nowMs - lastSeen.getTime()) / 60000;
  return ageMinutes >= -5 && ageMinutes <= DUTY_FRESH_MINUTES;
}

function normalizeRule(id, data = {}) {
  return {
    id,
    department: clean(data.department),
    active: data.active !== false,
    reviewMode: upper(data.reviewMode) === "DEDICATED" ? "DEDICATED" : "GENERAL_POOL",
    dedicatedDutyManagerIds: Array.isArray(data.dedicatedDutyManagerIds)
      ? data.dedicatedDutyManagerIds.map(String).filter(Boolean)
      : [],
    requiredReports: Array.isArray(data.requiredReports)
      ? data.requiredReports.map(String).filter(Boolean)
      : [],
    notes: clean(data.notes),
  };
}

function assignmentId(dateKey, rule) {
  return `${dateKey}__${slug(rule.id || rule.department)}`;
}

async function appendAudit({ dateKey, rule, assignment, actor }) {
  const id = `${dateKey}__${slug(rule.id || rule.department)}__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, SMART_AUDIT_COLLECTION, id), {
    eventType: assignment.assignedDutyManagerId
      ? "DAILY_REVIEW_ASSIGNMENT_CREATED"
      : "DAILY_REVIEW_ASSIGNMENT_WAITING",
    dateKey,
    ruleId: rule.id,
    department: rule.department,
    reviewMode: rule.reviewMode,
    assignedDutyManagerId: assignment.assignedDutyManagerId || "",
    assignedDutyManagerName: assignment.assignedDutyManagerName || "",
    status: assignment.status,
    createdAt: serverTimestamp(),
    actorId: actor?.id || "",
    actorName: actor ? visibleName(actor) : "Smart Intelligence",
    source: "smart_assignment_engine_v1",
  });
}

export async function ensureDailySmartAssignments({ actor } = {}) {
  const dateKey = tampaDateKey();
  const [rulesSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, SMART_RULES_COLLECTION)),
    getDocs(collection(db, "users")),
  ]);

  const rules = rulesSnap.docs
    .map((item) => normalizeRule(item.id, item.data()))
    .filter((rule) => rule.active && rule.department)
    .sort((a, b) => a.department.localeCompare(b.department));

  const allDutyManagers = usersSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((user) => upper(user.role) === "DUTY_MANAGER");

  const activeDutyManagers = allDutyManagers
    .filter((user) => isDutyManagerFresh(user))
    .sort((a, b) => visibleName(a).localeCompare(visibleName(b)) || a.id.localeCompare(b.id));

  // A DM explicitly dedicated to one or more active department rules stays out
  // of the general pool. This prevents Delta-specific Duty Managers from being
  // automatically assigned SY/WL/AV/WCHR work.
  const dedicatedIds = new Set(
    rules.flatMap((rule) =>
      rule.reviewMode === "DEDICATED" ? rule.dedicatedDutyManagerIds : []
    )
  );

  const generalPool = activeDutyManagers.filter((user) => !dedicatedIds.has(user.id));
  const results = [];

  for (const rule of rules) {
    const id = assignmentId(dateKey, rule);
    const ref = doc(db, SMART_ASSIGNMENTS_COLLECTION, id);
    const existingSnap = await getDoc(ref);
    const existing = existingSnap.exists() ? existingSnap.data() : null;

    // Once a reviewer has been assigned for the date, keep the assignment stable.
    if (clean(existing?.assignedDutyManagerId)) {
      results.push({ id, ...existing, preserved: true });
      continue;
    }

    const pool = rule.reviewMode === "DEDICATED"
      ? activeDutyManagers.filter((user) => rule.dedicatedDutyManagerIds.includes(user.id))
      : generalPool;

    const selected = pool.length
      ? pool[stableHash(`${dateKey}|${rule.department}`) % pool.length]
      : null;

    const payload = {
      dateKey,
      ruleId: rule.id,
      department: rule.department,
      reviewMode: rule.reviewMode,
      requiredReports: rule.requiredReports,
      ruleNotes: rule.notes,
      dedicatedDutyManagerIds: rule.dedicatedDutyManagerIds,
      assignedDutyManagerId: selected?.id || "",
      assignedDutyManagerName: selected ? visibleName(selected) : "",
      assignedDutyManagerDepartment: selected?.department || "",
      status: selected ? "ASSIGNED" : "WAITING_FOR_DUTY_MANAGER",
      assignmentSource: "smart_assignment_engine_v1",
      updatedAt: serverTimestamp(),
      ...(existingSnap.exists()
        ? {}
        : {
            createdAt: serverTimestamp(),
            createdById: actor?.id || "",
            createdByName: actor ? visibleName(actor) : "Smart Intelligence",
          }),
    };

    await setDoc(ref, payload, { merge: true });

    // Only audit the first creation or transition from waiting -> assigned.
    const shouldAudit =
      !existingSnap.exists() ||
      (!clean(existing?.assignedDutyManagerId) && Boolean(selected));

    if (shouldAudit) {
      await appendAudit({ dateKey, rule, assignment: payload, actor });
    }

    results.push({ id, ...payload, preserved: false });
  }

  return {
    dateKey,
    rulesCount: rules.length,
    activeDutyManagers,
    generalPool,
    dedicatedIds: [...dedicatedIds],
    assignments: results,
  };
}
