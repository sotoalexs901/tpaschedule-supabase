// src/utils/generateCabinShifts.js

const SHIFT_TEMPLATES = [
  { start: "04:30", end: "13:00", type: "full" },
  { start: "05:30", end: "14:00", type: "full" },
  { start: "08:30", end: "17:00", type: "full" },
  { start: "12:30", end: "21:00", type: "full" },
  { start: "16:30", end: "01:00", type: "full" },
  { start: "17:00", end: "01:30", type: "full" },
  { start: "11:00", end: "14:00", type: "short" },
];

function toMinutes(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function normalizeRange(start, end) {
  let s = toMinutes(start);
  let e = toMinutes(end);

  if (s == null || e == null) return null;
  if (e <= s) e += 24 * 60;

  return [s, e];
}

function overlaps(shiftStart, shiftEnd, blockStart, blockEnd) {
  const range = normalizeRange(shiftStart, shiftEnd);
  if (!range) return false;

  let bs = blockStart;
  let be = blockEnd;

  if (be <= bs) be += 24 * 60;

  if (bs < range[0] && be < range[0]) {
    bs += 24 * 60;
    be += 24 * 60;
  }

  return range[0] < be && bs < range[1];
}

function diffCalendarHours(start, end) {
  const range = normalizeRange(start, end);
  if (!range) return 0;
  return Number(((range[1] - range[0]) / 60).toFixed(2));
}

function diffPaidHours(start, end) {
  const range = normalizeRange(start, end);
  if (!range) return 0;

  let totalMinutes = range[1] - range[0];

  // Break de 30 min si dura 6h 1m o más
  if (totalMinutes >= 361) {
    totalMinutes -= 30;
  }

  return Number((totalMinutes / 60).toFixed(2));
}

function getCoveredBlocks(template, demandBlocks) {
  return demandBlocks.filter((block) =>
    overlaps(template.start, template.end, block.startMinutes, block.endMinutes)
  );
}

function getTemplateStats(template, demandBlocks) {
  const covered = getCoveredBlocks(template, demandBlocks);

  if (!covered.length) {
    return {
      coveredBlocks: 0,
      activeBlocks: 0,
      maxAgents: 0,
      totalScore: 0,
    };
  }

  const activeBlocks = covered.filter((b) => b.activityScore > 0);
  const maxAgents = covered.reduce(
    (max, block) => Math.max(max, block.recommendedAgents || 0),
    0
  );
  const totalScore = covered.reduce(
    (sum, block) => sum + (block.activityScore || 0),
    0
  );

  return {
    coveredBlocks: covered.length,
    activeBlocks: activeBlocks.length,
    maxAgents,
    totalScore,
  };
}

function isTemplateRelevant(template, stats) {
  if (template.type === "short") {
    return stats.activeBlocks >= 2 && stats.totalScore >= 4;
  }

  return stats.activeBlocks >= 3 && stats.totalScore >= 6;
}

function chooseTemplates(demandBlocks) {
  const templatesWithStats = SHIFT_TEMPLATES.map((template) => ({
    ...template,
    stats: getTemplateStats(template, demandBlocks),
  }));

  const activeBlocks = demandBlocks.filter((b) => b.activityScore > 0);
  if (!activeBlocks.length) return [];

  const chosen = [];

  const earlyCandidates = templatesWithStats
    .filter((t) => toMinutes(t.start) <= toMinutes("06:00"))
    .filter((t) => isTemplateRelevant(t, t.stats))
    .sort((a, b) => {
      if (b.stats.totalScore !== a.stats.totalScore) {
        return b.stats.totalScore - a.stats.totalScore;
      }
      return b.stats.activeBlocks - a.stats.activeBlocks;
    });

  if (earlyCandidates.length) {
    chosen.push(earlyCandidates[0]);
  }

  const midCandidates = templatesWithStats
    .filter((t) => {
      const start = toMinutes(t.start);
      return start >= toMinutes("08:00") && start <= toMinutes("13:00");
    })
    .filter((t) => isTemplateRelevant(t, t.stats))
    .sort((a, b) => {
      if (b.stats.totalScore !== a.stats.totalScore) {
        return b.stats.totalScore - a.stats.totalScore;
      }
      return b.stats.activeBlocks - a.stats.activeBlocks;
    });

  if (midCandidates.length) {
    const bestMid = midCandidates[0];
    if (!chosen.some((c) => c.start === bestMid.start && c.end === bestMid.end)) {
      chosen.push(bestMid);
    }
  }

  const lateCandidates = templatesWithStats
    .filter((t) => toMinutes(t.start) >= toMinutes("16:00"))
    .filter((t) => isTemplateRelevant(t, t.stats))
    .sort((a, b) => {
      if (b.stats.totalScore !== a.stats.totalScore) {
        return b.stats.totalScore - a.stats.totalScore;
      }
      return b.stats.activeBlocks - a.stats.activeBlocks;
    });

  if (lateCandidates.length) {
    const bestLate = lateCandidates[0];
    if (!chosen.some((c) => c.start === bestLate.start && c.end === bestLate.end)) {
      chosen.push(bestLate);
    }
  }

  if (!chosen.length) {
    const bestOverall = templatesWithStats
      .filter((t) => t.stats.totalScore > 0)
      .sort((a, b) => {
        if (b.stats.totalScore !== a.stats.totalScore) {
          return b.stats.totalScore - a.stats.totalScore;
        }
        return b.stats.activeBlocks - a.stats.activeBlocks;
      })[0];

    if (bestOverall) chosen.push(bestOverall);
  }

  const shortTemplate = templatesWithStats.find(
    (t) => t.start === "11:00" && t.end === "14:00"
  );

  if (
    shortTemplate &&
    shortTemplate.stats.maxAgents >= 3 &&
    shortTemplate.stats.totalScore >= 8 &&
    !chosen.some((c) => c.start === shortTemplate.start && c.end === shortTemplate.end)
  ) {
    chosen.push(shortTemplate);
  }

  return chosen;
}

function getAgentsForTemplate(template, demandBlocks) {
  const covered = getCoveredBlocks(template, demandBlocks);

  if (!covered.length) return 0;

  const maxAgents = covered.reduce(
    (max, block) => Math.max(max, block.recommendedAgents || 0),
    0
  );

  const avgAgents =
    covered.reduce((sum, block) => sum + (block.recommendedAgents || 0), 0) /
    covered.length;

  let agents = Math.max(maxAgents - 1, Math.round(avgAgents));

  if (template.type === "short") {
    agents = Math.max(1, Math.min(4, agents));
  } else {
    agents = Math.max(1, Math.min(7, agents));
  }

  return agents;
}

function makeSlot(dayKey, uniqueIndex, start, end, role, slotNumber) {
  return {
    id: `${dayKey}-${role}-${uniqueIndex}-${slotNumber}`,
    start,
    end,
    role,
    slotNumber,
    calendarHours: diffCalendarHours(start, end),
    paidHours: diffPaidHours(start, end),
    employeeId: "",
  };
}

function dedupeSlots(slots) {
  const seen = new Set();

  return slots.filter((slot) => {
    const key = `${slot.start}-${slot.end}-${slot.role}-${slot.slotNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generateCabinShifts(demandBlocks = [], dayKey = "day") {
  const activeBlocks = demandBlocks.filter((b) => b.activityScore > 0);
  if (!activeBlocks.length) return [];

  const chosenTemplates = chooseTemplates(demandBlocks);
  if (!chosenTemplates.length) return [];

  const slots = [];
  let uniqueIndex = 1;

  const primaryTemplate = chosenTemplates[0];

  slots.push(
    makeSlot(
      dayKey,
      uniqueIndex++,
      primaryTemplate.start,
      primaryTemplate.end,
      "Supervisor",
      1
    )
  );

  slots.push(
    makeSlot(
      dayKey,
      uniqueIndex++,
      primaryTemplate.start,
      primaryTemplate.end,
      "LAV",
      1
    )
  );

  for (const template of chosenTemplates) {
    const agentsNeeded = getAgentsForTemplate(template, demandBlocks);

    for (let i = 1; i <= agentsNeeded; i += 1) {
      slots.push(
        makeSlot(
          dayKey,
          uniqueIndex++,
          template.start,
          template.end,
          "Agent",
          i
        )
      );
    }
  }

  return dedupeSlots(slots);
}
