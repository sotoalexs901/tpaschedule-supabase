// src/utils/dashboardEventPush.js

function fireAndForgetDashboardEventPush(endpoint, payload, label) {
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

export function triggerDashboardEventCreatedPush(eventId) {
  if (!eventId) return;

  fireAndForgetDashboardEventPush(
    "/.netlify/functions/send-dashboard-event-created-push",
    {
      eventId: String(eventId),
    },
    "Dashboard event creation"
  );
}

export function triggerDashboardEventRsvpPush(eventId, userId) {
  if (!eventId || !userId) return;

  fireAndForgetDashboardEventPush(
    "/.netlify/functions/send-dashboard-event-rsvp-push",
    {
      eventId: String(eventId),
      userId: String(userId),
    },
    "Dashboard event RSVP"
  );
}

// END dashboardEventPush.js
