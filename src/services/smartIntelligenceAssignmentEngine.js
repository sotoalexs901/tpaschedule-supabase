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
export const SMART_ALERTS_COLLECTION = "smart_intelligence_alerts";

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

  const smartStatus = upper(user?.smartDutyStatus);
  const presenceStatus = upper(
    user?.status ||
    user?.presenceStatus ||
    user?.onlineStatus ||
    user?.activityStatus ||
    user?.presence
  );

  const explicitlyOffline =
    smartStatus === "OFFLINE" ||
    smartStatus === "UNAVAILABLE" ||
    presenceStatus === "OFFLINE" ||
    presenceStatus === "LOGGED_OUT" ||
    user?.online === false ||
    user?.isOnline === false;

  if (explicitlyOffline) return false;

  const lastSeen =
    toDate(user?.smartDutyLastSeen) ||
    toDate(user?.lastActivityAt) ||
    toDate(user?.lastActiveAt) ||
    toDate(user?.lastSeenAt) ||
    toDate(user?.lastSeen) ||
    toDate(user?.lastActivity) ||
    toDate(user?.presenceUpdatedAt) ||
    toDate(user?.updatedAt);

  if (!lastSeen) return false;

  const ageMinutes = (nowMs - lastSeen.getTime()) / 60000;
  const fresh = ageMinutes >= -5 && ageMinutes <= DUTY_FRESH_MINUTES;
  if (!fresh) return false;

  const smartAvailable =
    user?.smartDutyAvailable === true ||
    smartStatus === "AVAILABLE";

  const existingPresenceOnline =
    user?.online === true ||
    user?.isOnline === true ||
    presenceStatus === "ONLINE" ||
    presenceStatus === "ACTIVE" ||
    presenceStatus === "AVAILABLE";

  // Use AeroStation's existing presence as the primary signal.
  // Smart Duty fields remain supported, but are no longer mandatory.
  return smartAvailable || existingPresenceOnline;
}


const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function tampaDayKey(date = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(date).toLowerCase();
  return weekday.slice(0, 3);
}

function tampaMonthDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(map.month)}/${Number(map.day)}`;
}

function normalizeAccount(value) {
  const raw = upper(value).replace(/[^A-Z0-9]+/g, " ").trim();
  if (!raw) return "";

  // Sun Country
  if (raw === "SY" || raw.includes("SUN COUNTRY")) return "SY";

  // World Atlantic / Invicta schedule aliases
  if (
    raw === "WL" ||
    raw === "WAL" ||
    raw.includes("WORLD ATLANTIC") ||
    raw.includes("WL INVICTA")
  ) return "WL";

  // Avianca
  if (raw === "AV" || raw.includes("AVIANCA")) return "AV";

  // Aeromexico schedules are stored under OTHER
  if (
    raw === "AM" ||
    raw === "AEROMEXICO" ||
    raw === "AEROMEXICO OTHER" ||
    raw.includes("AEROMEXICO")
  ) return "AEROMEXICO OTHER";

  // AA BSO
  if (raw.includes("AA BSO") || raw === "BSO") return "AA BSO";

  // Delta Cabin Service schedule aliases
  if (
    raw === "CABIN" ||
    raw.includes("DL CABIN") ||
    raw.includes("CABIN SERVICE") ||
    raw === "DL" ||
    raw.includes("DELTA")
  ) return "DL CABIN SERVICE";

  // WCHR
  if (raw.includes("WCHR") || raw.includes("WHEELCHAIR")) return "WCHR";

  return raw;
}

function scheduleMatchesRule(schedule, rule) {
  const wanted = normalizeAccount(rule.department);
  const candidates = [
    schedule?.department,
    schedule?.airline,
    schedule?.airlineDisplayName,
  ].map(normalizeAccount).filter(Boolean);
  return Boolean(wanted && candidates.includes(wanted));
}

function shiftIsWorking(shift) {
  if (!shift || typeof shift !== "object") return false;
  const start = upper(shift.start);
  if (!start || start === "OFF") return false;
  return true;
}

function scheduleCoversToday(schedule, now = new Date()) {
  const dayKey = tampaDayKey(now);
  const expectedMonthDay = tampaMonthDay(now);
  const dayLabel = clean(schedule?.days?.[dayKey]).replace(/^0+/, "").replace(/\/0/g, "/");
  if (dayLabel) {
    const normalized = dayLabel.split("/").map((part) => String(Number(part))).join("/");
    if (normalized === expectedMonthDay) return true;
  }

  const weekStart = clean(schedule?.weekStart || schedule?.weekTag);
  if (weekStart) {
    const start = new Date(`${weekStart}T12:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const todayKey = tampaDateKey(now);
      const today = new Date(`${todayKey}T12:00:00`);
      const diffDays = Math.round((today.getTime() - start.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays <= 6) return true;
    }
  }

  return false;
}

function getEmployeeName(employee) {
  return employee?.name || employee?.displayName || employee?.fullName || employee?.employeeName || "Employee";
}

function findUserForEmployee(employee, users) {
  if (!employee) return null;
  const linkedUserId = clean(employee.linkedUserId);
  if (linkedUserId) {
    const byId = users.find((user) => user.id === linkedUserId);
    if (byId) return byId;
  }
  return users.find((user) => {
    const employeeId = clean(employee.id);
    return clean(user.employeeId) === employeeId || clean(user.linkedEmployeeId) === employeeId;
  }) || null;
}

function resolveResponsibleSupervisors({ rule, schedules, employees, users, now = new Date() }) {
  const dayKey = tampaDayKey(now);
  const approvedSchedules = schedules.filter((schedule) => {
    const status = upper(schedule.status || "APPROVED");
    return status === "APPROVED" && scheduleMatchesRule(schedule, rule) && scheduleCoversToday(schedule, now);
  });

  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const seen = new Set();
  const supervisors = [];

  for (const schedule of approvedSchedules) {
    const rows = Array.isArray(schedule.grid) ? schedule.grid : [];
    for (const row of rows) {
      const shifts = Array.isArray(row?.[dayKey]) ? row[dayKey] : [];
      if (!shifts.some(shiftIsWorking)) continue;
      const employee = employeeMap.get(clean(row.employeeId));
      if (!employee) continue;
      const linkedUser = findUserForEmployee(employee, users);
      if (!linkedUser || upper(linkedUser.role) !== "SUPERVISOR") continue;
      const key = linkedUser.id || employee.id;
      if (seen.has(key)) continue;
      seen.add(key);
      supervisors.push({
        employeeId: employee.id,
        userId: linkedUser.id,
        name: visibleName(linkedUser) || getEmployeeName(employee),
        username: clean(linkedUser.username || linkedUser.loginUsername),
        department: clean(employee.department || linkedUser.department),
        airline: clean(employee.airline || linkedUser.airline),
        scheduleId: schedule.id,
        scheduleDepartment: clean(schedule.department),
        scheduleAirline: clean(schedule.airlineDisplayName || schedule.airline),
        shifts: shifts.filter(shiftIsWorking).map((shift) => ({ start: clean(shift.start), end: clean(shift.end) })),
      });
    }
  }

  supervisors.sort((a, b) => a.name.localeCompare(b.name));
  return {
    supervisors,
    scheduleIds: [...new Set(approvedSchedules.map((schedule) => schedule.id))],
    source: supervisors.length ? "approved_schedule_plus_users" : "not_resolved",
  };
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
    fallbackToStationManager: data.fallbackToStationManager === true,
    fallbackStationManagerId: clean(data.fallbackStationManagerId),
    fallbackStationManagerName: clean(data.fallbackStationManagerName),
    notes: clean(data.notes),
    dutySchedule: Array.isArray(data.dutySchedule) ? data.dutySchedule : [],
  };
}

function assignmentId(dateKey, rule) {
  return `${dateKey}__${slug(rule.id || rule.department)}`;
}

export async function selectResponsibleSupervisor({ assignmentId: id, supervisorUserId, actor, overrideReason = "" } = {}) {
  const assignmentKey = clean(id);
  const selectedUserId = clean(supervisorUserId);
  if (!assignmentKey || !selectedUserId) {
    throw new Error("Assignment and supervisor are required.");
  }

  const ref = doc(db, SMART_ASSIGNMENTS_COLLECTION, assignmentKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Smart Intelligence assignment not found.");

  const assignment = snap.data() || {};
  const actorRole = upper(actor?.role);
  const isAssignedDutyManager =
    actorRole === "DUTY_MANAGER" && clean(assignment.assignedDutyManagerId) === clean(actor?.id);
  const isStationManager = actorRole === "STATION_MANAGER";

  if (!isAssignedDutyManager && !isStationManager) {
    throw new Error("Only the assigned Duty Manager or Station Manager can select the responsible supervisor.");
  }

  const candidates = Array.isArray(assignment.responsibleSupervisors)
    ? assignment.responsibleSupervisors
    : [];
  let selected = candidates.find((item) => clean(item?.userId) === selectedUserId);
  const isScheduleOverride = !selected;
  if (isScheduleOverride) {
    if (!clean(overrideReason)) throw new Error("Enter a reason for changing to an unscheduled supervisor.");
    const userSnap = await getDoc(doc(db, "users", selectedUserId));
    if (!userSnap.exists() || upper(userSnap.data()?.role) !== "SUPERVISOR") {
      throw new Error("The selected user is not a valid Supervisor.");
    }
    const supervisorUser = userSnap.data();
    selected = {
      userId: selectedUserId,
      employeeId: clean(supervisorUser.employeeId || supervisorUser.linkedEmployeeId),
      name: visibleName(supervisorUser),
    };
  }

  const patch = {
    responsibleSupervisorId: clean(selected.employeeId),
    responsibleSupervisorUserId: clean(selected.userId),
    responsibleSupervisorName: clean(selected.name),
    responsibleSupervisorSource: isScheduleOverride ? "manual_schedule_override" : "manual_selection_from_approved_schedule",
    responsibleSupervisorOverrideReason: isScheduleOverride ? clean(overrideReason) : "",
    responsibleSupervisorSelectedById: clean(actor?.id),
    responsibleSupervisorSelectedByName: actor ? visibleName(actor) : "",
    responsibleSupervisorSelectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, patch, { merge: true });

  await setDoc(
    doc(db, SMART_AUDIT_COLLECTION, `${assignment.dateKey || tampaDateKey()}__${slug(assignment.ruleId || assignment.department)}__supervisor_selected_${Date.now()}`),
    {
      eventType: "RESPONSIBLE_SUPERVISOR_SELECTED",
      previousSupervisorName: clean(assignment.responsibleSupervisorName),
      previousSupervisorUserId: clean(assignment.responsibleSupervisorUserId),
      overrideReason: isScheduleOverride ? clean(overrideReason) : "",
      scheduleOverride: isScheduleOverride,
      dateKey: assignment.dateKey || tampaDateKey(),
      ruleId: assignment.ruleId || "",
      department: assignment.department || "",
      assignedDutyManagerId: assignment.assignedDutyManagerId || "",
      assignedDutyManagerName: assignment.assignedDutyManagerName || "",
      responsibleSupervisorId: clean(selected.employeeId),
      responsibleSupervisorUserId: clean(selected.userId),
      responsibleSupervisorName: clean(selected.name),
      selectedById: clean(actor?.id),
      selectedByName: actor ? visibleName(actor) : "",
      createdAt: serverTimestamp(),
      source: "smart_intelligence_manual_supervisor_selection_v1",
    }
  );

  return { id: assignmentKey, ...assignment, ...patch };
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
    source: assignment.assignmentSource || "smart_assignment_engine_v2",
    stationManagerFallbackUsed: assignment.stationManagerFallbackUsed === true,
  });
}


function reviewIsComplete(assignment) {
  const status = upper(
    assignment?.packageReviewStatus ||
    assignment?.reviewStatus ||
    assignment?.packageStatus
  );
  return status === "COMPLETED" || status === "REVIEW_COMPLETE" || status === "CLOSED";
}

function chooseLeastLoaded(pool, loadMap) {
  if (!Array.isArray(pool) || !pool.length) return null;
  return [...pool].sort((a, b) => {
    const aLoad = Number(loadMap.get(a.id) || 0);
    const bLoad = Number(loadMap.get(b.id) || 0);
    if (aLoad !== bLoad) return aLoad - bLoad;
    return visibleName(a).localeCompare(visibleName(b)) || String(a.id).localeCompare(String(b.id));
  })[0];
}

async function writeAssignmentNotice({ dateKey, rule, selected, previousAssigneeId = "", previousAssigneeName = "", reassigned = false }) {
  const key = `${dateKey}__${slug(rule.id || rule.department)}__assignment_notice`;

  if (previousAssigneeId && previousAssigneeId !== selected?.id) {
    await setDoc(
      doc(db, SMART_ALERTS_COLLECTION, `${key}__${previousAssigneeId}`),
      { active: false, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  if (!selected?.id) return;

  const selectedRole = upper(selected.role) === "STATION_MANAGER" ? "station_manager" : "duty_manager";
  await setDoc(
    doc(db, SMART_ALERTS_COLLECTION, `${key}__${selected.id}`),
    {
      active: true,
      dateKey,
      department: rule.department,
      ruleId: rule.id,
      targetUserId: selected.id,
      targetRole: selectedRole,
      audience: selectedRole === "station_manager" ? "STATION_MANAGER" : "DUTY_MANAGER",
      alertType: reassigned ? "DEPARTMENT_REASSIGNED" : "DEPARTMENT_ASSIGNED",
      severity: "NORMAL",
      title: `${rule.department}: assigned to you`,
      message: reassigned
        ? `${rule.department} has been reassigned to you by Smart Intelligence for today's report review.`
        : `${rule.department} has been assigned to you by Smart Intelligence for today's report review.`,
      previousAssigneeId: previousAssigneeId || "",
      previousAssigneeName: previousAssigneeName || "",
      source: "smart_assignment_engine_balanced_v3",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function appendReassignmentAudit({ dateKey, rule, previous, next, actor }) {
  await setDoc(
    doc(db, SMART_AUDIT_COLLECTION, `${dateKey}__${slug(rule.id || rule.department)}__reassigned_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    {
      eventType: "DAILY_REVIEW_ASSIGNMENT_REBALANCED",
      dateKey,
      ruleId: rule.id,
      department: rule.department,
      previousDutyManagerId: previous?.assignedDutyManagerId || "",
      previousDutyManagerName: previous?.assignedDutyManagerName || "",
      assignedDutyManagerId: next?.assignedDutyManagerId || "",
      assignedDutyManagerName: next?.assignedDutyManagerName || "",
      createdAt: serverTimestamp(),
      actorId: actor?.id || "",
      actorName: actor ? visibleName(actor) : "Smart Intelligence",
      source: "smart_assignment_engine_balanced_v3",
    }
  );
}

// Evaluate weekly shift coverage in Tampa local time. Overnight rows remain active after midnight.
function tampaShiftContext(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const day = get("weekday").toLowerCase().slice(0, 3);
  const minute = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return { day, previousDay: DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7], minute };
}
function shiftMinute(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clean(time));
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}
function scheduledDutyIds(rule, now = new Date()) {
  const { day, previousDay, minute } = tampaShiftContext(now);
  return [...new Set((rule.dutySchedule || []).filter((slot) => {
    const start = shiftMinute(slot.start), end = shiftMinute(slot.end);
    if (start === null || end === null || start === end || !slot.dutyManagerId) return false;
    if (end > start) return slot.day === day && minute >= start && minute < end;
    return (slot.day === day && minute >= start) || (slot.day === previousDay && minute < end);
  }).map((slot) => clean(slot.dutyManagerId)))];
}

export async function ensureDailySmartAssignments({ actor } = {}) {
  const dateKey = tampaDateKey();
  const [rulesSnap, usersSnap, employeesSnap, schedulesSnap, assignmentsSnap] = await Promise.all([
    getDocs(collection(db, SMART_RULES_COLLECTION)),
    getDocs(collection(db, "users")),
    getDocs(collection(db, "employees")),
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, SMART_ASSIGNMENTS_COLLECTION)),
  ]);

  const rules = rulesSnap.docs
    .map((item) => normalizeRule(item.id, item.data()))
    .filter((rule) => rule.active && rule.department)
    .sort((a, b) => a.department.localeCompare(b.department));

  const allUsers = usersSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const employees = employeesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const schedules = schedulesSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const existingById = new Map(
    assignmentsSnap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => clean(item.dateKey) === dateKey)
      .map((item) => [item.id, item])
  );

  const allDutyManagers = allUsers.filter((user) => upper(user.role) === "DUTY_MANAGER");
  const activeDutyManagers = allDutyManagers
    .filter((user) => isDutyManagerFresh(user))
    .sort((a, b) => visibleName(a).localeCompare(visibleName(b)) || a.id.localeCompare(b.id));

  const dedicatedIds = new Set(
    rules.flatMap((rule) =>
      rule.reviewMode === "DEDICATED" ? rule.dedicatedDutyManagerIds : []
    )
  );
  const generalPool = allDutyManagers.filter((user) => !dedicatedIds.has(user.id));

  // Count only locked/completed packages first. Open auto-assigned packages are
  // recalculated deterministically so the active workload stays balanced.
  const loadByUserId = new Map(allDutyManagers.map((user) => [user.id, 0]));
  for (const rule of rules) {
    const existing = existingById.get(assignmentId(dateKey, rule));
    if (!existing || !clean(existing.assignedDutyManagerId) || !reviewIsComplete(existing)) continue;
    if (loadByUserId.has(existing.assignedDutyManagerId)) {
      loadByUserId.set(existing.assignedDutyManagerId, Number(loadByUserId.get(existing.assignedDutyManagerId) || 0) + 1);
    }
  }

  const results = [];

  for (const rule of rules) {
    const id = assignmentId(dateKey, rule);
    const ref = doc(db, SMART_ASSIGNMENTS_COLLECTION, id);
    const existing = existingById.get(id) || null;

    const supervisorContext = resolveResponsibleSupervisors({
      rule,
      schedules,
      employees,
      users: allUsers,
    });
    const supervisorNames = supervisorContext.supervisors.map((item) => item.name);
    const primarySupervisor = supervisorContext.supervisors.length === 1
      ? supervisorContext.supervisors[0]
      : null;

    // Preserve a manual responsible-supervisor choice when present.
    const supervisorPatch = {
      responsibleSupervisors: supervisorContext.supervisors,
      responsibleSupervisorNames: supervisorNames,
      responsibleSupervisorCount: supervisorContext.supervisors.length,
      responsibleSupervisorId: Boolean(existing?.responsibleSupervisorSelectedAt)
        ? clean(existing?.responsibleSupervisorId)
        : (primarySupervisor?.employeeId || ""),
      responsibleSupervisorUserId: Boolean(existing?.responsibleSupervisorSelectedAt)
        ? clean(existing?.responsibleSupervisorUserId)
        : (primarySupervisor?.userId || ""),
      responsibleSupervisorName: Boolean(existing?.responsibleSupervisorSelectedAt)
        ? clean(existing?.responsibleSupervisorName)
        : (primarySupervisor?.name || ""),
      responsibleSupervisorSource: Boolean(existing?.responsibleSupervisorSelectedAt)
        ? (existing?.responsibleSupervisorSource || "manual_selection_from_approved_schedule")
        : supervisorContext.source,
      approvedScheduleIds: supervisorContext.scheduleIds,
      supervisorResolvedAt: serverTimestamp(),
    };

    // Migration safety: do not erase today's assignments before the Station Manager
    // has configured a weekly schedule for this department.
    if (existing && !(rule.dutySchedule || []).length) {
      await setDoc(ref, { ...supervisorPatch, updatedAt: serverTimestamp() }, { merge: true });
      results.push({ id, ...existing, ...supervisorPatch, preserved: true, awaitingScheduleSetup: true });
      continue;
    }

    // Closed/review-complete packages are audit-locked and never rebalanced.
    if (existing && clean(existing.assignedDutyManagerId) && reviewIsComplete(existing)) {
      await setDoc(ref, { ...supervisorPatch, updatedAt: serverTimestamp() }, { merge: true });
      results.push({ id, ...existing, ...supervisorPatch, preserved: true, balanceLocked: true });
      continue;
    }

    // Schedule is authoritative: no login, heartbeat or online requirement.
    const scheduledIds = scheduledDutyIds(rule);
    const pool = allDutyManagers.filter((candidate) =>
      scheduledIds.includes(candidate.id) &&
      (rule.reviewMode !== "DEDICATED" || rule.dedicatedDutyManagerIds.includes(candidate.id))
    );

    const selectedDutyManager = chooseLeastLoaded(pool, loadByUserId);
    const fallbackStationManager =
      !selectedDutyManager && rule.fallbackToStationManager
        ? (
            allUsers.find((candidate) => candidate.id === rule.fallbackStationManagerId && upper(candidate.role) === "STATION_MANAGER") ||
            allUsers.find((candidate) => upper(candidate.role) === "STATION_MANAGER" && visibleName(candidate) === rule.fallbackStationManagerName) ||
            null
          )
        : null;

    const selected = selectedDutyManager || fallbackStationManager;
    const isStationManagerFallback = Boolean(fallbackStationManager && !selectedDutyManager);
    const previousAssigneeId = clean(existing?.assignedDutyManagerId);
    const previousAssigneeName = clean(existing?.assignedDutyManagerName);
    const assigneeChanged = previousAssigneeId !== clean(selected?.id);

    const payload = {
      dateKey,
      ruleId: rule.id,
      department: rule.department,
      reviewMode: rule.reviewMode,
      requiredReports: rule.requiredReports,
      ruleNotes: rule.notes,
      dedicatedDutyManagerIds: rule.dedicatedDutyManagerIds,
      fallbackToStationManager: rule.fallbackToStationManager,
      fallbackStationManagerId: rule.fallbackStationManagerId,
      fallbackStationManagerName: rule.fallbackStationManagerName,
      ...supervisorPatch,
      assignedDutyManagerId: selected?.id || "",
      assignedDutyManagerName: selected ? visibleName(selected) : "",
      assignedDutyManagerDepartment: selected?.department || "",
      assignedReviewerRole: selected ? (isStationManagerFallback ? "station_manager" : "duty_manager") : "",
      stationManagerFallbackUsed: isStationManagerFallback,
      status: selected ? "ASSIGNED" : "WAITING_FOR_DUTY_MANAGER",
      assignmentSource: isStationManagerFallback
        ? "station_manager_fallback"
        : "smart_assignment_engine_scheduled_v4",
      balancingStrategy: "least_loaded_scheduled_pool",
      scheduledDutyManagerIds: scheduledIds,
      rebalancedAt: assigneeChanged && previousAssigneeId ? serverTimestamp() : (existing?.rebalancedAt || null),
      updatedAt: serverTimestamp(),
      ...(existing
        ? {}
        : {
            createdAt: serverTimestamp(),
            createdById: actor?.id || "",
            createdByName: actor ? visibleName(actor) : "Smart Intelligence",
          }),
    };

    await setDoc(ref, payload, { merge: true });

    if (selectedDutyManager?.id && loadByUserId.has(selectedDutyManager.id)) {
      loadByUserId.set(selectedDutyManager.id, Number(loadByUserId.get(selectedDutyManager.id) || 0) + 1);
    }

    const firstAssignment = !previousAssigneeId && Boolean(selected?.id);
    if (!existing || firstAssignment) {
      await appendAudit({ dateKey, rule, assignment: payload, actor });
    } else if (assigneeChanged) {
      await appendReassignmentAudit({ dateKey, rule, previous: existing, next: payload, actor });
    }

    if ((firstAssignment || assigneeChanged) && selected?.id) {
      await writeAssignmentNotice({
        dateKey,
        rule,
        selected,
        previousAssigneeId,
        previousAssigneeName,
        reassigned: Boolean(previousAssigneeId),
      });
    }

    if (assigneeChanged && !selected?.id && previousAssigneeId) {
      await setDoc(doc(db, SMART_ALERTS_COLLECTION, `${dateKey}__${slug(rule.id || rule.department)}__assignment_notice__${previousAssigneeId}`), { active: false, updatedAt: serverTimestamp() }, { merge: true });
    }
    results.push({ id, ...payload, preserved: !assigneeChanged && Boolean(existing) });
  }

  return {
    dateKey,
    rulesCount: rules.length,
    activeDutyManagers,
    scheduledDutyManagers: allDutyManagers.filter((dm) => results.some((row) => row.scheduledDutyManagerIds?.includes(dm.id))),
    generalPool,
    dedicatedIds: [...dedicatedIds],
    loadByUserId: Object.fromEntries(loadByUserId.entries()),
    assignments: results,
  };
}
