// src/utils/buildDemandBlocks.js

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

function intersects(blockStart, blockEnd, activeStart, activeEnd) {
  return blockStart < activeEnd && activeStart < blockEnd;
}

function recommendAgents(score) {
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 4;
  if (score <= 10) return 5;
  if (score <= 12) return 6;
  return 7;
}

export function buildDemandBlocks(flights) {
  const blocks = [];

  for (let start = 0; start < 24 * 60; start += 30) {
    blocks.push({
      startMinutes: start,
      endMinutes: start + 30,
      startTime: toTimeString(start),
      endTime: toTimeString(start + 30),
      arrivalsCount: 0,
      departuresCount: 0,
      activityScore: 0,
      recommendedAgents: 0,
      requiresSupervisor: false,
      requiresLAV: false,
    });
  }

  for (const flight of flights) {
    const flightMinutes = toMinutes(flight.scheduledTime);
    if (flightMinutes == null) continue;

    let activeStart = flightMinutes - 120;
    let activeEnd = flightMinutes + 30;

    if (flight.movementType === "arrival") {
      activeStart = flightMinutes - 30;
      activeEnd = flightMinutes + 60;
    }

    for (const block of blocks) {
      if (
        intersects(
          block.startMinutes,
          block.endMinutes,
          activeStart,
          activeEnd
        )
      ) {
        if (flight.movementType === "arrival") {
          block.arrivalsCount += 1;
        } else {
          block.departuresCount += 1;
        }
      }
    }
  }

  return blocks.map((block) => {
    const activityScore = block.arrivalsCount + block.departuresCount;
    const recommendedAgents = recommendAgents(activityScore);

    return {
      ...block,
      activityScore,
      recommendedAgents,
      requiresSupervisor: activityScore > 0,
      requiresLAV: activityScore > 0,
    };
  });
}
