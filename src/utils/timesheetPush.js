// src/utils/timesheetPush.js

function fireAndForgetTimesheetPush(endpoint, payload, label) {
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
        `${label} was completed, but Push delivery was not completed.`,
        {
          status: response.status,
          details,
          payload,
        }
      );
    })
    .catch((error) => {
      console.warn(
        `${label} was completed, but Push delivery could not be requested.`,
        {
          error,
          payload,
        }
      );
    });
}

export function triggerTimesheetSubmittedPush(reportId) {
  if (!reportId) {
    return;
  }

  fireAndForgetTimesheetPush(
    "/.netlify/functions/send-timesheet-submitted-push",
    {
      reportId: String(reportId),
    },
    "Timesheet submission"
  );
}

export function triggerTimesheetDecisionPush(reportId, decision) {
  if (!reportId) {
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
      "Timesheet decision Push ignored because decision is invalid.",
      {
        reportId,
        decision,
      }
    );
    return;
  }

  fireAndForgetTimesheetPush(
    "/.netlify/functions/send-timesheet-decision-push",
    {
      reportId: String(reportId),
      decision: normalizedDecision,
    },
    "Timesheet decision"
  );
}

// END timesheetPush.js
