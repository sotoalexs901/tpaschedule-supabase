// src/utils/generateCabinShifts.js

function toMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toTimeString(totalMinutes) {
  let mins = totalMinutes % (24 * 60);
  if (mins < 0) mins += 24 * 60;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function normalizeRange(start, end) {
  let s = toMinutes(start);
  let e = toMinutes(end);
  if (s == null || e == null) return null;
  if (e <= s) e += 24 * 60;
  return [s, e];
}

function overlaps(shiftStart, shiftEnd, blockStart, blockEnd) {
  const shift = normalizeRange(shiftStart, shiftEnd);
  if (!shift) return false;

  let bs = blockStart;
  let be = blockEnd;

  if (be <= bs) be += 24 * 60;
  if (bs < shift[0] && be < shift[0]) {
    bs += 24 * 60;
    be += 24 * 60;
  }

  return shift[0] < be && bs < shift[1];
}

function diffCalendarHours(start, end) {
  const range = normalizeRange(start, end);
  if (!range) return 0;
  return (range[1] - range[0]) / 60;
}

function diffPaidHours(start, end) {
  const range = normalizeRange(start, end);
  if (!range) return 0;
  let totalMinutes = range[1] - range[0];

  // break de 30 min si dura 6h 1m o más
  if (totalMinutes >= 361) {
    totalMinutes -= 30;
  }

  return totalMinutes / 60;
}

function getMaxAgentsCovered(shiftStart, shiftEnd, demandBlocks) {
  let maxAgents = 0;

  for (const block of demandBlocks) {
    if (
      overlaps(
        shiftStart,
        shiftEnd,
        block.startMinutes,
        block.endMinutes
      )
    ) {
      maxAgents = Math.max(maxAgents, block.recommendedAgents || 0);
    }
  }

  return maxAgents;
}

function makeSlot(dayKey, index, start, end, role, slotNumber) {
  return {
    id: `${dayKey}-${role}-${index}-${slotNumber}`,
    start,
    end,
    role,
    slotNumber,
    calendarHours: diffCalendarHours(start, end),
    paidHours: diffPaidHours(start, end),
    employeeId: "",
  };
}

export function generateCabinShifts(demandBlocks, dayKey) {
  const activeBlocks = demandBlocks.filter((b) => b.activityScore > 0);

  if (!activeBlocks.length) return [];

  const firstActive = activeBlocks[0];
  const lastActive = activeBlocks[activeBlocks.length - 1];

  const firstStart = firstActive.startMinutes;
  const lastEnd = lastActive.endMinutes;

  const earlyShiftStart = toTimeString(firstStart);
  const earlyShiftEnd = toTimeString(firstStart + 510); // 8.5h calendario

  const midShiftStart = toTimeString(firstStart + 240); // 4h después
  const midShiftEnd = toTimeString(firstStart + 750);   // +8.5h

  const lateBaseStart = Math.max(lastEnd - 240, firstStart + 480);
  const lateShiftStart = toTimeString(lateBaseStart);
  const lateShiftEnd = toTimeString(lateBaseStart + 240); // 4h

  const supervisorNeeded = true;
  const lavNeeded = true;

  const earlyAgents = getMaxAgentsCovered(
    earlyShiftStart,
    earlyShiftEnd,
    demandBlocks
  );

  const midAgents = getMaxAgentsCovered(
    midShiftStart,
    midShiftEnd,
    demandBlocks
  );

  const lateAgents = getMaxAgentsCovered(
    lateShiftStart,
    lateShiftEnd,
    demandBlocks
  );

  const slots = [];
  let idx = 1;

  if (supervisorNeeded) {
    slots.push(makeSlot(dayKey, idx++, earlyShiftStart, earlyShiftEnd, "Supervisor", 1));
  }

  if (lavNeeded) {
    slots.push(makeSlot(dayKey, idx++, earlyShiftStart, earlyShiftEnd, "LAV", 1));
  }

  for (let i = 1; i <= Math.max(1, Math.min(7, earlyAgents)); i += 1) {
    slots.push(makeSlot(dayKey, idx++, earlyShiftStart, earlyShiftEnd, "Agent", i));
  }

  if (midAgents > 0) {
    for (let i = 1; i <= Math.min(7, midAgents); i += 1) {
      slots.push(makeSlot(dayKey, idx++, midShiftStart, midShiftEnd, "Agent", i));
    }
  }

  if (lateAgents > 0) {
    for (let i = 1; i <= Math.min(7, lateAgents); i += 1) {
      slots.push(makeSlot(dayKey, idx++, lateShiftStart, lateShiftEnd, "Agent", i));
    }
  }

  return dedupeShifts(slots);
}

function dedupeShifts(slots) {
  const seen = new Set();

  return slots.filter((slot) => {
    const key = `${slot.start}-${slot.end}-${slot.role}-${slot.slotNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
