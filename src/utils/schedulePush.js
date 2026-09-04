// src/utils/schedulePush.js

function fireAndForgetSchedulePush(endpoint, payload, label) {
  if (typeof window === "undefined") {
    return;
  }

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    keepalive: true,
  })
    .then(async (response) => {
      if (response.ok) {
        return;
      }

      let details = "";

      try {
        const result = await response.json();
        details = result?.error || "";
      } catch {
        details = "";
      }

      console.warn(
        `${label} completed, but Push delivery was not completed.`,
        {
          status: response.status,
          details,
          payload,
        }
      );
    })
    .catch((error) => {
      console.warn(
        `${label} completed, but Push delivery could not be requested.`,
        {
          error,
          payload,
        }
      );
    });
}

export function triggerScheduleSubmittedPush(scheduleId) {
  if (!scheduleId) {
    return;
  }

  fireAndForgetSchedulePush(
    "/.netlify/functions/send-schedule-submitted-push",
    {
      scheduleId: String(scheduleId),
    },
    "Schedule submission"
  );
}

export function triggerScheduleDecisionPush(scheduleId, decision) {
  if (!scheduleId) {
    return;
  }

  const normalizedDecision = String(decision || "")
    .trim()
    .toLowerCase();

  if (
    normalizedDecision !== "approved" &&
    normalizedDecision !== "returned"
  ) {
    console.warn(
      "Schedule decision Push ignored because decision is invalid.",
      {
        scheduleId,
        decision,
      }
    );
    return;
  }

  fireAndForgetSchedulePush(
    "/.netlify/functions/send-schedule-decision-push",
    {
      scheduleId: String(scheduleId),
      decision: normalizedDecision,
    },
    "Schedule decision"
  );
}

// END schedulePush.js
