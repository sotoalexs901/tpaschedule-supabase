// src/components/PushNotificationsButton.jsx

import React, { useEffect, useState } from "react";
import {
  enablePushNotifications,
  getPushSupportStatus,
  hasPushRegistration,
  refreshPushToken,
} from "../services/pushNotifications.js";

export default function PushNotificationsButton({ user }) {
  const [status, setStatus] = useState("checking");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) return;

      try {
        const support = await getPushSupportStatus();

        if (cancelled) return;

        if (!support.supported) {
          setStatus("unsupported");
          return;
        }

        if (support.permission === "denied") {
          setStatus("blocked");
          return;
        }

        if (support.permission === "granted") {
          const registered = await hasPushRegistration(user.id);

          if (cancelled) return;

          if (registered) {
            setStatus("enabled");

            refreshPushToken(user).catch((error) =>
              console.warn("Push token refresh failed:", error)
            );
          } else {
            setStatus("available");
          }

          return;
        }

        setStatus("available");
      } catch (error) {
        console.error("Push status check failed:", error);

        if (!cancelled) {
          setStatus("available");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleEnable = async () => {
    if (!user?.id || working) return;

    try {
      setWorking(true);
      setMessage("");

      await enablePushNotifications(user);

      setStatus("enabled");
      setMessage("Push notifications enabled.");
    } catch (error) {
      console.error("Could not enable push notifications:", error);

      const msg = String(error?.message || "");

      if (msg.toLowerCase().includes("blocked")) {
        setStatus("blocked");
      }

      setMessage(
        msg || "Could not enable push notifications."
      );
    } finally {
      setWorking(false);
    }
  };

  if (!user?.id || status === "checking") {
    return null;
  }

  if (status === "unsupported") {
    return null;
  }

  if (status === "enabled") {
    return (
      <div
        title="Push notifications are enabled on this device."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          borderRadius: 13,
          padding: "9px 11px",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          color: "#065f46",
          fontSize: 11,
          fontWeight: 850,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">{"\u{1F514}"}</span>
        Push On
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div
        title="Notifications are blocked in this device's browser settings."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          borderRadius: 13,
          padding: "9px 11px",
          background: "#fff1f2",
          border: "1px solid #fecdd3",
          color: "#9f1239",
          fontSize: 11,
          fontWeight: 850,
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">{"\u{1F515}"}</span>
        Push Blocked
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 5 }}>
      <button
        type="button"
        onClick={handleEnable}
        disabled={working}
        style={{
          border: "1px solid #cfe7fb",
          background:
            "linear-gradient(135deg, #eff8ff 0%, #ffffff 100%)",
          color: "#1769aa",
          borderRadius: 13,
          padding: "9px 11px",
          fontSize: 11,
          fontWeight: 850,
          cursor: working ? "not-allowed" : "pointer",
          opacity: working ? 0.7 : 1,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 18px rgba(23,105,170,0.08)",
        }}
      >
        {"\u{1F514}"} {working ? "Enabling..." : "Enable Push"}
      </button>

      {message && (
        <div
          style={{
            maxWidth: 180,
            fontSize: 9.5,
            lineHeight: 1.35,
            color: status === "blocked" ? "#9f1239" : "#64748b",
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

// END PushNotificationsButton
