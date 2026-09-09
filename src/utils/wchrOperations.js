// src/utils/wchrOperations.js

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// ============================================================
// CONSTANTS
// ============================================================

export const WCHR_AGENT_STATUS = {
  ACTIVE: "ACTIVE",
  OFF_DUTY: "OFF_DUTY",
};

export const WCHR_AGENT_AVAILABILITY = {
  AVAILABLE: "AVAILABLE",
  BUSY: "BUSY",
  BREAK: "BREAK",
  UNAVAILABLE: "UNAVAILABLE",
};

export const WCHR_SERVICE_STATUS = {
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  AT_GATE: "AT_GATE",
  BOARDING: "BOARDING",
  BOARDED: "BOARDED",
  PENDING_STORAGE: "PENDING_STORAGE",
  STORED: "STORED",
  CANCELLED: "CANCELLED",
};

export const WCHR_TIMELINE_EVENT_TYPES = {
  CREATED: "CREATED",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "PICKED_UP",
  LOCATION_UPDATE: "LOCATION_UPDATE",
  TSA_CHECKPOINT: "TSA_CHECKPOINT",
  ARRIVED_GATE: "ARRIVED_GATE",
  PASSENGER_CHECK: "PASSENGER_CHECK",
  BOARDING_STARTED: "BOARDING_STARTED",
  BOARDED: "BOARDED",
  STORED: "STORED",
  COMMENT: "COMMENT",
  ALERT: "ALERT",
};

// ============================================================
// BASIC HELPERS
// ============================================================

export function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

export function safeUpper(value) {
  return cleanText(value).toUpperCase();
}

export function getVisibleUserName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "Employee"
  );
}

export function getUserIdentifier(user) {
  return cleanText(
    user?.employeeId ||
      user?.id ||
      user?.uid ||
      user?.username
  );
}

export function getEmployeeIdentifier(employee, user = null) {
  return cleanText(
    employee?.id ||
      user?.employeeId ||
      user?.id ||
      user?.uid ||
      user?.username
  );
}

// ============================================================
// AGENT SHIFT HELPERS
// ============================================================

export function buildAgentShiftPayload({
  employee,
  user,
  trackingConsent = false,
  startingLocation = "",
}) {
  const agentId = getEmployeeIdentifier(employee, user);

  return {
    agent_id: agentId,

    employee_id:
      cleanText(employee?.id) ||
      cleanText(user?.employeeId) ||
      "",

    agent_name:
      cleanText(
        employee?.name ||
          employee?.fullName ||
          employee?.displayName
      ) || getVisibleUserName(user),

    username:
      cleanText(
        user?.username ||
          user?.loginUsername ||
          employee?.loginUsername
      ),

    department:
      cleanText(
        employee?.department ||
          user?.department
      ),

    position:
      cleanText(
        employee?.position ||
          user?.position
      ),

    status: WCHR_AGENT_STATUS.ACTIVE,

    availability_status:
      WCHR_AGENT_AVAILABILITY.AVAILABLE,

    active_report_id: "",
    active_wheelchair_number: "",

    current_location: cleanText(startingLocation),
    last_location_update_at: serverTimestamp(),

    live_tracking_consent:
      trackingConsent === true,

    clock_in_at: serverTimestamp(),
    clock_out_at: null,

    last_activity_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
}

// ============================================================
// PUNCH IN
// ============================================================

export async function punchInWchrAgent({
  employee,
  user,
  trackingConsent = false,
  startingLocation = "",
}) {
  const agentId = getEmployeeIdentifier(employee, user);

  if (!agentId) {
    throw new Error(
      "Unable to identify the employee for WCHR Punch In."
    );
  }

  const cleanStartingLocation = cleanText(startingLocation);

  if (!cleanStartingLocation) {
    throw new Error(
      "Starting location is required for WCHR Punch In."
    );
  }

  const shiftRef = doc(
    db,
    "wchr_agent_shifts",
    agentId
  );

  const existingSnap = await getDoc(shiftRef);

  if (existingSnap.exists()) {
    const existing = existingSnap.data();

    if (
      safeUpper(existing.status) ===
      WCHR_AGENT_STATUS.ACTIVE
    ) {
      return {
        alreadyActive: true,
        agentId,
        shift: {
          id: shiftRef.id,
          ...existing,
        },
      };
    }
  }

  const payload = buildAgentShiftPayload({
    employee,
    user,
    trackingConsent,
    startingLocation: cleanStartingLocation,
  });

  await setDoc(
    shiftRef,
    payload,
    {
      merge: true,
    }
  );

  await addDoc(
    collection(
      db,
      "wchr_agent_shift_history"
    ),
    {
      agent_id: agentId,
      employee_id:
        payload.employee_id,
      agent_name:
        payload.agent_name,
      username:
        payload.username,
      department:
        payload.department,

      event_type: "PUNCH_IN",

      live_tracking_consent:
        trackingConsent === true,

      current_location:
        cleanStartingLocation,

      created_at:
        serverTimestamp(),
    }
  );

  return {
    alreadyActive: false,
    agentId,
  };
}

// ============================================================
// PUNCH OUT
// ============================================================

export async function punchOutWchrAgent({
  agentId,
  user,
  force = false,
}) {
  const cleanAgentId =
    cleanText(agentId);

  if (!cleanAgentId) {
    throw new Error(
      "Unable to identify the WCHR Agent."
    );
  }

  const shiftRef = doc(
    db,
    "wchr_agent_shifts",
    cleanAgentId
  );

  const snap = await getDoc(shiftRef);

  if (!snap.exists()) {
    throw new Error(
      "No active WCHR shift was found."
    );
  }

  const shift = snap.data();

  const activeReportId =
    cleanText(
      shift.active_report_id
    );

  const activeWheelchair =
    cleanText(
      shift.active_wheelchair_number
    );

  const availability =
    safeUpper(
      shift.availability_status
    );

  if (
    !force &&
    (
      activeReportId ||
      activeWheelchair ||
      availability ===
        WCHR_AGENT_AVAILABILITY.BUSY
    )
  ) {
    throw new Error(
      `Punch Out is blocked because this agent still has an active WCHR assignment${
        activeWheelchair
          ? ` (${activeWheelchair})`
          : ""
      }. Complete or transfer the assignment first.`
    );
  }

  await updateDoc(
    shiftRef,
    {
      status:
        WCHR_AGENT_STATUS.OFF_DUTY,

      availability_status:
        WCHR_AGENT_AVAILABILITY.UNAVAILABLE,

      active_report_id: "",
      active_wheelchair_number: "",

      current_location: "",

      clock_out_at:
        serverTimestamp(),

      last_activity_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    }
  );

  await addDoc(
    collection(
      db,
      "wchr_agent_shift_history"
    ),
    {
      agent_id:
        cleanAgentId,

      employee_id:
        shift.employee_id || "",

      agent_name:
        shift.agent_name ||
        getVisibleUserName(user),

      username:
        shift.username || "",

      department:
        shift.department || "",

      event_type:
        "PUNCH_OUT",

      created_at:
        serverTimestamp(),

      created_by_user_id:
        user?.id ||
        user?.uid ||
        "",

      created_by_username:
        user?.username ||
        "",
    }
  );

  return true;
}

// ============================================================
// AVAILABILITY
// ============================================================

export async function updateWchrAgentAvailability({
  agentId,
  availability,
}) {
  const cleanAgentId =
    cleanText(agentId);

  const nextAvailability =
    safeUpper(availability);

  if (!cleanAgentId) {
    throw new Error(
      "Missing WCHR Agent ID."
    );
  }

  if (
    !Object.values(
      WCHR_AGENT_AVAILABILITY
    ).includes(
      nextAvailability
    )
  ) {
    throw new Error(
      "Invalid WCHR Agent availability status."
    );
  }

  await updateDoc(
    doc(
      db,
      "wchr_agent_shifts",
      cleanAgentId
    ),
    {
      availability_status:
        nextAvailability,

      last_activity_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    }
  );
}

// ============================================================
// ASSIGN WCHR TO AGENT
// ============================================================

export async function assignWheelchairToAgent({
  agentId,
  reportId,
  wheelchairNumber,
  currentLocation = "",
  assignedByUser = null,
}) {
  const cleanAgentId =
    cleanText(agentId);

  const cleanReportId =
    cleanText(reportId);

  const cleanWheelchair =
    safeUpper(
      wheelchairNumber
    );

  if (!cleanAgentId) {
    throw new Error(
      "Please select a WCHR Agent."
    );
  }

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report ID."
    );
  }

  if (!cleanWheelchair) {
    throw new Error(
      "Missing wheelchair number."
    );
  }

  const shiftRef = doc(
    db,
    "wchr_agent_shifts",
    cleanAgentId
  );

  const shiftSnap =
    await getDoc(shiftRef);

  if (!shiftSnap.exists()) {
    throw new Error(
      "This WCHR Agent is not currently punched in."
    );
  }

  const shift =
    shiftSnap.data();

  if (
    safeUpper(
      shift.status
    ) !== WCHR_AGENT_STATUS.ACTIVE
  ) {
    throw new Error(
      "This WCHR Agent is not active."
    );
  }

  if (
    safeUpper(
      shift.availability_status
    ) !==
    WCHR_AGENT_AVAILABILITY.AVAILABLE
  ) {
    throw new Error(
      "This WCHR Agent is not currently available."
    );
  }

  if (
    cleanText(
      shift.active_report_id
    ) ||
    cleanText(
      shift.active_wheelchair_number
    )
  ) {
    throw new Error(
      "This WCHR Agent already has an active assignment."
    );
  }

  await updateDoc(
    shiftRef,
    {
      availability_status:
        WCHR_AGENT_AVAILABILITY.BUSY,

      active_report_id:
        cleanReportId,

      active_wheelchair_number:
        cleanWheelchair,

      current_location:
        cleanText(
          currentLocation
        ),

      assignment_started_at:
        serverTimestamp(),

      last_activity_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    }
  );

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      wchr_agent_id:
        cleanAgentId,

      wchr_agent_name:
        shift.agent_name || "",

      assigned_wchr_agent:
        shift.agent_name || "",

      assigned_agent_username:
        shift.username || "",

      wheelchair_number:
        cleanWheelchair,

      current_location:
        cleanText(
          currentLocation
        ),

      tracking_status:
        WCHR_SERVICE_STATUS.ASSIGNED,

      assigned_at:
        serverTimestamp(),

      assigned_by_user_id:
        assignedByUser?.id ||
        assignedByUser?.uid ||
        "",

      assigned_by_username:
        assignedByUser?.username ||
        "",

      assigned_by_name:
        getVisibleUserName(
          assignedByUser
        ),

      last_updated_at:
        serverTimestamp(),
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.ASSIGNED,

    wheelchairNumber:
      cleanWheelchair,

    agentId:
      cleanAgentId,

    agentName:
      shift.agent_name || "",

    location:
      cleanText(
        currentLocation
      ),

    note: `Wheelchair ${cleanWheelchair} assigned to ${
      shift.agent_name || "WCHR Agent"
    }.`,

    user:
      assignedByUser,
  });

  return {
    agentId:
      cleanAgentId,

    agentName:
      shift.agent_name || "",

    reportId:
      cleanReportId,

    wheelchairNumber:
      cleanWheelchair,
  };
}

// ============================================================
// RELEASE AGENT AFTER WCHR IS COMPLETE
// ============================================================

export async function releaseWchrAgent({
  agentId,
  finalLocation = "",
}) {
  const cleanAgentId =
    cleanText(agentId);

  if (!cleanAgentId) {
    return;
  }

  const shiftRef = doc(
    db,
    "wchr_agent_shifts",
    cleanAgentId
  );

  const snap =
    await getDoc(
      shiftRef
    );

  if (!snap.exists()) {
    return;
  }

  const shift =
    snap.data();

  if (
    safeUpper(
      shift.status
    ) !==
    WCHR_AGENT_STATUS.ACTIVE
  ) {
    return;
  }

  await updateDoc(
    shiftRef,
    {
      availability_status:
        WCHR_AGENT_AVAILABILITY.AVAILABLE,

      active_report_id: "",
      active_wheelchair_number: "",

      current_location:
        cleanText(
          finalLocation
        ),

      assignment_completed_at:
        serverTimestamp(),

      last_activity_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    }
  );
}

// ============================================================
// AGENT ACTIVITY / LOCATION
// ============================================================

export async function updateWchrAgentLocation({
  agentId,
  location,
}) {
  const cleanAgentId =
    cleanText(agentId);

  const cleanLocation =
    cleanText(location);

  if (
    !cleanAgentId ||
    !cleanLocation
  ) {
    return;
  }

  await setDoc(
    doc(
      db,
      "wchr_agent_shifts",
      cleanAgentId
    ),
    {
      current_location:
        cleanLocation,

      last_activity_at:
        serverTimestamp(),

      updated_at:
        serverTimestamp(),
    },
    {
      merge: true,
    }
  );
}

// ============================================================
// SERVICE TIMELINE
// ============================================================

export async function addWchrTimelineEvent({
  reportId,
  eventType,
  wheelchairNumber = "",
  agentId = "",
  agentName = "",
  location = "",
  note = "",
  metadata = {},
  user = null,
}) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report ID for timeline event."
    );
  }

  const event =
    safeUpper(eventType);

  await addDoc(
    collection(
      db,
      "wchr_tracking_events"
    ),
    {
      report_doc_id:
        cleanReportId,

      report_id:
        cleanReportId,

      event_type:
        event,

      wheelchair_number:
        safeUpper(
          wheelchairNumber
        ),

      agent_id:
        cleanText(agentId),

      agent_name:
        cleanText(agentName),

      location:
        cleanText(location),

      notes:
        cleanText(note),

      metadata:
        metadata || {},

      employee_id:
        user?.employeeId ||
        user?.id ||
        user?.uid ||
        "",

      employee_name:
        getVisibleUserName(
          user
        ),

      employee_username:
        user?.username ||
        "",

      created_at:
        serverTimestamp(),
    }
  );
}

// ============================================================
// PASSENGER CHECK AT GATE
// ============================================================

export async function addPassengerGateCheck({
  reportId,
  wheelchairNumber,
  agentId = "",
  agentName = "",
  location = "",
  note = "",
  user,
}) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report."
    );
  }

  const now =
    serverTimestamp();

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      last_passenger_check_at:
        now,

      last_passenger_check_note:
        cleanText(note),

      last_passenger_check_by:
        getVisibleUserName(
          user
        ),

      last_updated_at:
        now,
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.PASSENGER_CHECK,

    wheelchairNumber,

    agentId,

    agentName,

    location,

    note:
      cleanText(note) ||
      "Passenger welfare check completed.",

    user,
  });
}

// ============================================================
// BOARDING STARTED
// ============================================================

export async function markWchrBoardingStarted({
  reportId,
  wheelchairNumber,
  agentId = "",
  agentName = "",
  location = "",
  user,
}) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report."
    );
  }

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      tracking_status:
        WCHR_SERVICE_STATUS.BOARDING,

      boarding_started_at:
        serverTimestamp(),

      last_updated_at:
        serverTimestamp(),
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.BOARDING_STARTED,

    wheelchairNumber,

    agentId,

    agentName,

    location,

    note:
      "Passenger boarding started.",

    user,
  });
}

// ============================================================
// PASSENGER BOARDED
// ============================================================

export async function markWchrPassengerBoarded({
  reportId,
  wheelchairNumber,
  agentId = "",
  agentName = "",
  location = "",
  user,
}) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report."
    );
  }

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      tracking_status:
        WCHR_SERVICE_STATUS.BOARDED,

      passenger_delivered:
        true,

      passenger_boarded:
        true,

      boarded_at:
        serverTimestamp(),

      delivered_at:
        serverTimestamp(),

      delivered_location:
        cleanText(location),

      is_active:
        true,

      alerts_enabled:
        true,

      last_updated_at:
        serverTimestamp(),
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.BOARDED,

    wheelchairNumber,

    agentId,

    agentName,

    location,

    note:
      "Passenger boarded. Wheelchair pending storage.",

    user,
  });
}

// ============================================================
// WHEELCHAIR STORED
// ============================================================

export async function markWchrStored({
  reportId,
  wheelchairNumber,
  agentId = "",
  agentName = "",
  storageLocation = "Wheelchair Storage",
  user,
}) {
  const cleanReportId =
    cleanText(reportId);

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report."
    );
  }

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      tracking_status:
        WCHR_SERVICE_STATUS.STORED,

      current_location:
        storageLocation,

      stored_location:
        storageLocation,

      stored_at:
        serverTimestamp(),

      is_active:
        false,

      alerts_enabled:
        false,

      last_location_update_at:
        serverTimestamp(),

      last_updated_at:
        serverTimestamp(),
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.STORED,

    wheelchairNumber,

    agentId,

    agentName,

    location:
      storageLocation,

    note:
      `Wheelchair ${safeUpper(
        wheelchairNumber
      )} stored and available.`,

    user,
  });

  if (agentId) {
    await releaseWchrAgent({
      agentId,
      finalLocation:
        storageLocation,
    });
  }
}

// ============================================================
// READY FOR PICKUP
// ============================================================

export async function markWchrReadyForPickup({
  reportId,
  wheelchairNumber,
  location = "Counter",
  user,
}) {
  const cleanReportId =
    cleanText(reportId);

  const cleanWheelchair =
    safeUpper(
      wheelchairNumber
    );

  if (!cleanReportId) {
    throw new Error(
      "Missing WCHR report."
    );
  }

  if (!cleanWheelchair) {
    throw new Error(
      "Wheelchair number is required."
    );
  }

  await updateDoc(
    doc(
      db,
      "wch_reports",
      cleanReportId
    ),
    {
      wheelchair_number:
        cleanWheelchair,

      tracking_status:
        WCHR_SERVICE_STATUS.READY_FOR_PICKUP,

      current_location:
        cleanText(location),

      ready_for_pickup:
        true,

      ready_for_pickup_at:
        serverTimestamp(),

      timer_started_at:
        serverTimestamp(),

      passenger_delivered:
        false,

      passenger_boarded:
        false,

      is_active:
        true,

      alerts_enabled:
        true,

      alert_after_minutes:
        30,

      last_location_update_at:
        serverTimestamp(),

      last_updated_at:
        serverTimestamp(),
    }
  );

  await addWchrTimelineEvent({
    reportId:
      cleanReportId,

    eventType:
      WCHR_TIMELINE_EVENT_TYPES.READY_FOR_PICKUP,

    wheelchairNumber:
      cleanWheelchair,

    location,

    note:
      `Wheelchair ${cleanWheelchair} ready for pickup.`,

    user,
  });
}

// ============================================================
// TIMER HELPERS
// ============================================================

export function timestampToMillis(value) {
  if (!value) return 0;

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  const parsed =
    new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? 0
    : parsed.getTime();
}

export function getElapsedSeconds(
  value,
  now = Date.now()
) {
  const startedAt =
    timestampToMillis(value);

  if (!startedAt) return 0;

  return Math.max(
    0,
    Math.floor(
      (now - startedAt) /
        1000
    )
  );
}

export function formatElapsedTime(
  totalSeconds
) {
  const safeSeconds =
    Math.max(
      0,
      Number(totalSeconds || 0)
    );

  const hours =
    Math.floor(
      safeSeconds / 3600
    );

  const minutes =
    Math.floor(
      (safeSeconds % 3600) /
        60
    );

  const seconds =
    Math.floor(
      safeSeconds % 60
    );

  if (hours > 0) {
    return `${String(hours).padStart(
      2,
      "0"
    )}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

// ============================================================
// END wchrOperations.js
// ============================================================
