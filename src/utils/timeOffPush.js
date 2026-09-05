// src/utils/timeOffPush.js

function fireAndForgetTimeOffPush(endpoint, payload, label) {
  if (typeof window === "undefined") return;

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
      if (response.ok) return;

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

export function triggerTimeOffSubmittedPush(requestId) {
  if (!requestId) return;

  fireAndForgetTimeOffPush(
    "/.netlify/functions/send-timeoff-submitted-push",
    {
      requestId: String(requestId),
    },
    "Time Off request"
  );
}

export function triggerTimeOffDecisionPush(requestId, decision) {
  if (!requestId) return;

  const normalizedDecision = String(decision || "")
    .trim()
    .toLowerCase();

  if (
    normalizedDecision !== "approved" &&
    normalizedDecision !== "rejected" &&
    normalizedDecision !== "needs_info"
  ) {
    console.warn(
      "Time Off decision Push ignored because decision is invalid.",
      {
        requestId,
        decision,
      }
    );
    return;
  }

  fireAndForgetTimeOffPush(
    "/.netlify/functions/send-timeoff-decision-push",
    {
      requestId: String(requestId),
      decision: normalizedDecision,
    },
    "Time Off decision"
  );
}

// END timeOffPush.js
