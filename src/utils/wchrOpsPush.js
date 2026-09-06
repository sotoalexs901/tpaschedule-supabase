/ src/utils/wchrOpsPush.js

function fireAndForgetWchrOpsPush(endpoint, payload, label) {
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

export function triggerWchrOperationalClosePush(operationalDate) {
  if (!operationalDate) {
    return;
  }

  fireAndForgetWchrOpsPush(
    "/.netlify/functions/send-wchr-operational-close-push",
    {
      operationalDate: String(operationalDate),
    },
    "WCHR operational close"
  );
}

// END wchrOpsPush.js
