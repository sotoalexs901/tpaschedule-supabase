// src/utils/timesheetPush.js

export function triggerTimesheetSubmittedPush(reportId) {
  if (!reportId || typeof window === "undefined") {
    return;
  }

  fetch("/.netlify/functions/send-timesheet-submitted-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reportId: String(reportId),
    }),
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
        "Timesheet was submitted, but management Push was not completed.",
        {
          reportId,
          status: response.status,
          details,
        }
      );
    })
    .catch((error) => {
      console.warn(
        "Timesheet was submitted, but management Push could not be requested.",
        {
          reportId,
          error,
        }
      );
    });
}

// END timesheetPush.js
