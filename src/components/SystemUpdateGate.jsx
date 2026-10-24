// src/components/SystemUpdateGate.jsx
// AeroStation Hub - global update enforcement + version compliance heartbeat

import React, { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import {
  activateAeroStationUpdate,
  checkAeroStationServiceWorkerUpdate,
} from "../services/pwaService.js";

const UPDATE_CONFIG_PATH = ["system_config", "app_update"];
const CLIENTS_COLLECTION = "app_update_clients";
const APPLIED_UPDATE_STORAGE_KEY = "aerostation_forced_update_id";
const APP_VERSION_STORAGE_KEY = "aerostation_app_version";

function clean(value) {
  return String(value || "").trim();
}

function visibleName(user) {
  return (
    user?.displayName ||
    user?.fullName ||
    user?.name ||
    user?.username ||
    "User"
  );
}

function getUserId(user) {
  return clean(user?.id || user?.uid || user?.employeeId || user?.username);
}

async function fetchCurrentVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return "";
    const data = await response.json();
    return clean(data?.version);
  } catch (error) {
    console.warn("Could not read AeroStation version:", error);
    return "";
  }
}

export default function SystemUpdateGate() {
  const { user } = useUser();
  const [config, setConfig] = useState(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [applying, setApplying] = useState(false);
  const [softDismissedId, setSoftDismissedId] = useState("");
  const heartbeatBusyRef = useRef(false);

  const userId = useMemo(() => getUserId(user), [user]);
  const updateId = clean(config?.updateId);
  const mode = clean(config?.mode).toUpperCase();
  const requiredVersion = clean(config?.requiredVersion);

  const locallyAppliedId = (() => {
    try {
      return clean(window.localStorage.getItem(APPLIED_UPDATE_STORAGE_KEY));
    } catch {
      return "";
    }
  })();

  const needsForcedUpdate = Boolean(
    user && updateId && mode === "FORCE" && locallyAppliedId !== updateId
  );

  const showSoftNotice = Boolean(
    user &&
      updateId &&
      mode === "NOTICE" &&
      locallyAppliedId !== updateId &&
      softDismissedId !== updateId
  );

  useEffect(() => {
    let cancelled = false;
    fetchCurrentVersion().then((value) => {
      if (!cancelled) setCurrentVersion(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ref = doc(db, ...UPDATE_CONFIG_PATH);
    return onSnapshot(
      ref,
      (snapshot) => {
        setConfig(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      },
      (error) => {
        console.error("System update listener failed:", error);
      }
    );
  }, []);

  const reportClient = async (extra = {}) => {
    if (!userId || heartbeatBusyRef.current) return;
    heartbeatBusyRef.current = true;
    try {
      const version = currentVersion || (await fetchCurrentVersion());
      if (version && version !== currentVersion) setCurrentVersion(version);

      await setDoc(
        doc(db, CLIENTS_COLLECTION, userId),
        {
          userId,
          username: clean(user?.username || user?.loginUsername),
          displayName: visibleName(user),
          role: clean(user?.role),
          department: clean(user?.department),
          appVersion: version,
          lastSeenAt: serverTimestamp(),
          lastUpdateIdSeen: updateId || "",
          lastAppliedUpdateId: (() => {
            try {
              return clean(window.localStorage.getItem(APPLIED_UPDATE_STORAGE_KEY));
            } catch {
              return "";
            }
          })(),
          userAgent: typeof navigator !== "undefined" ? clean(navigator.userAgent).slice(0, 240) : "",
          ...extra,
        },
        { merge: true }
      );
    } catch (error) {
      console.warn("System update compliance heartbeat failed:", error);
    } finally {
      heartbeatBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!userId) return undefined;

    reportClient();
    const timer = window.setInterval(reportClient, 60 * 1000);

    const onFocus = () => reportClient();
    const onVisibility = () => {
      if (document.visibilityState === "visible") reportClient();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, updateId, currentVersion]);

  const applyUpdate = async () => {
    if (!updateId || applying) return;
    setApplying(true);

    try {
      await checkAeroStationServiceWorkerUpdate();
    } catch (error) {
      console.warn("Service worker update check failed:", error);
    }

    let version = requiredVersion || currentVersion;
    if (!version) version = await fetchCurrentVersion();

    try {
      window.localStorage.setItem(APPLIED_UPDATE_STORAGE_KEY, updateId);
      if (version) window.localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
    } catch (error) {
      console.warn("Could not persist forced update acknowledgement:", error);
    }

    await reportClient({
      lastAppliedUpdateId: updateId,
      appVersion: version || currentVersion || "",
      updateAppliedAt: serverTimestamp(),
    });

    try {
      await activateAeroStationUpdate();
    } catch (error) {
      console.warn("Could not activate AeroStation update; reloading directly:", error);
      window.location.reload();
      return;
    }

    // Fallback in case the service worker helper did not reload the page.
    window.setTimeout(() => window.location.reload(), 1200);
  };

  if (!needsForcedUpdate && !showSoftNotice) return null;

  const mandatory = needsForcedUpdate;
  const title = mandatory ? "AeroStation Hub Update Required" : "AeroStation Hub Update Available";
  const message = clean(config?.message) ||
    (mandatory
      ? "A new operational version of AeroStation Hub must be loaded before you continue."
      : "A new version of AeroStation Hub is available.");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250000,
        background: mandatory ? "rgba(2, 12, 27, 0.78)" : "rgba(15,23,42,0.48)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-update-title"
        style={{
          width: "100%",
          maxWidth: 540,
          borderRadius: 24,
          overflow: "hidden",
          background: "#fff",
          border: "1px solid #dbeafe",
          boxShadow: "0 26px 80px rgba(2,12,27,0.34)",
        }}
      >
        <div
          style={{
            padding: "20px 22px",
            color: "#fff",
            background:
              "linear-gradient(135deg, #061f3d 0%, #0f4c81 55%, #1769aa 100%)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".13em", opacity: .78 }}>
            SYSTEM UPDATE
          </div>
          <h2 id="system-update-title" style={{ margin: "5px 0 0", fontSize: 23 }}>
            {mandatory ? "🔄 " : "✨ "}{title}
          </h2>
        </div>

        <div style={{ padding: 22 }}>
          <p style={{ margin: 0, color: "#334155", lineHeight: 1.6, fontSize: 14.5 }}>
            {message}
          </p>

          <div
            style={{
              marginTop: 16,
              padding: 13,
              borderRadius: 14,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              display: "grid",
              gap: 5,
              color: "#475569",
              fontSize: 12.5,
            }}
          >
            {requiredVersion && <div><b>Required version:</b> {requiredVersion}</div>}
            {currentVersion && <div><b>Current loaded version:</b> {currentVersion}</div>}
            <div><b>Update ID:</b> {updateId}</div>
          </div>

          {mandatory && (
            <p style={{ margin: "14px 0 0", color: "#b45309", fontSize: 12.5, fontWeight: 800 }}>
              This update is required. AeroStation Hub will remain locked until the latest version is loaded.
            </p>
          )}

          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {!mandatory && (
              <button
                type="button"
                disabled={applying}
                onClick={() => setSoftDismissedId(updateId)}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#475569",
                  borderRadius: 12,
                  padding: "11px 15px",
                  fontWeight: 800,
                  cursor: applying ? "not-allowed" : "pointer",
                }}
              >
                Later
              </button>
            )}

            <button
              type="button"
              disabled={applying}
              onClick={applyUpdate}
              style={{
                border: "none",
                background: "linear-gradient(135deg, #0f4c81, #1769aa)",
                color: "#fff",
                borderRadius: 12,
                padding: "11px 18px",
                fontWeight: 900,
                cursor: applying ? "not-allowed" : "pointer",
                opacity: applying ? .7 : 1,
              }}
            >
              {applying ? "Updating AeroStation..." : mandatory ? "Update Now" : "Refresh Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
