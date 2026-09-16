// src/utils/eprPush.js

function fireAndForgetEprPush(payload, label = "EPR Push") {
  if (typeof window === "undefined") return;

  fetch("/.netlify/functions/send-epr-event-push", {
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

      console.warn(`${label} was completed, but Push delivery was not completed.`, {
        status: response.status,
        details,
        payload,
      });
    })
    .catch((error) => {
      console.warn(`${label} was completed, but Push delivery could not be requested.`, {
        error,
        payload,
      });
    });
}

export function triggerEprPush(reportId, eventType) {
  if (!reportId || !eventType) return;

  fireAndForgetEprPush(
    {
      reportId: String(reportId),
      eventType: String(eventType).trim().toLowerCase(),
    },
    `EPR ${eventType}`
  );
}

// END src/utils/eprPush.js
