// src/utils/trainingPush.js

export async function triggerTrainingNoticePush(noticeId) {
  const cleanNoticeId = String(noticeId || "").trim();

  if (!cleanNoticeId) {
    console.warn("Training Notice Push skipped: missing noticeId.");
    return null;
  }

  try {
    const response = await fetch(
      "/.netlify/functions/send-training-notice-push",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noticeId: cleanNoticeId,
        }),
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.warn(
        "Training Notice Push request failed:",
        response.status,
        data
      );

      return null;
    }

    return data;
  } catch (err) {
    console.warn("Training Notice Push unavailable:", err);
    return null;
  }
}

// END trainingPush
