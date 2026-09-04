// src/utils/messagePush.js

function fireAndForgetMessagePush(endpoint, payload) {
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
        "Direct message was sent, but Push delivery was not completed.",
        {
          status: response.status,
          details,
          payload,
        }
      );
    })
    .catch((error) => {
      console.warn(
        "Direct message was sent, but Push delivery could not be requested.",
        {
          error,
          payload,
        }
      );
    });
}

export function triggerDirectMessagePush(
  conversationId,
  messageId
) {
  if (!conversationId || !messageId) {
    return;
  }

  fireAndForgetMessagePush(
    "/.netlify/functions/send-direct-message-push",
    {
      conversationId: String(conversationId),
      messageId: String(messageId),
    }
  );
}

// END messagePush.js
