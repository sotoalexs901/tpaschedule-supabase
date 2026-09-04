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

// END schedulePush.js
