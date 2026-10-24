// src/pages/SystemUpdatePage.jsx
// AeroStation Hub - Station Manager update control + version compliance

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

const CONFIG_REF = ["system_config", "app_update"];
const CLIENTS_COLLECTION = "app_update_clients";

function clean(value) {
  return String(value || "").trim();
}

function visibleName(user) {
  return user?.displayName || user?.fullName || user?.name || user?.username || "Management";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function makeUpdateId() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function fetchCurrentVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return "";
    const data = await response.json();
    return clean(data?.version);
  } catch {
    return "";
  }
}

export default function SystemUpdatePage() {
  const { user } = useUser();
  const [config, setConfig] = useState(null);
  const [clients, setClients] = useState([]);
  const [currentVersion, setCurrentVersion] = useState("");
  const [message, setMessage] = useState("Operational update available. Please refresh AeroStation Hub.");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const isStationManager = clean(user?.role).toLowerCase() === "station_manager";

  useEffect(() => {
    fetchCurrentVersion().then(setCurrentVersion);

    const unsubscribeConfig = onSnapshot(
      doc(db, ...CONFIG_REF),
      (snapshot) => setConfig(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
      (err) => setError(`Could not load update configuration: ${err.message}`)
    );

    const unsubscribeClients = onSnapshot(
      collection(db, CLIENTS_COLLECTION),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aTime = toDate(a.lastSeenAt)?.getTime() || 0;
            const bTime = toDate(b.lastSeenAt)?.getTime() || 0;
            return bTime - aTime;
          });
        setClients(rows);
      },
      (err) => setError(`Could not load version compliance: ${err.message}`)
    );

    return () => {
      unsubscribeConfig();
      unsubscribeClients();
    };
  }, []);

  const requiredVersion = clean(config?.requiredVersion || currentVersion);
  const activeUpdateId = clean(config?.updateId);

  const compliance = useMemo(() => {
    const now = Date.now();
    return clients.map((client) => {
      const seenAt = toDate(client.lastSeenAt);
      const onlineRecently = Boolean(seenAt && now - seenAt.getTime() <= 3 * 60 * 1000);
      const applied = Boolean(activeUpdateId && clean(client.lastAppliedUpdateId) === activeUpdateId);
      const versionOk = !requiredVersion || clean(client.appVersion) === requiredVersion;
      return { ...client, onlineRecently, applied, versionOk, compliant: applied && versionOk };
    });
  }, [clients, activeUpdateId, requiredVersion]);

  const compliantCount = compliance.filter((item) => item.compliant).length;
  const pendingCount = activeUpdateId ? compliance.filter((item) => !item.compliant).length : 0;
  const onlineCount = compliance.filter((item) => item.onlineRecently).length;

  const publish = async (mode) => {
    if (!isStationManager || busy) return;

    const label = mode === "FORCE" ? "force this update for every AeroStation user" : "publish an optional update notice";
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusy(mode);
    setError("");
    setStatus("");

    try {
      const version = (await fetchCurrentVersion()) || currentVersion || clean(config?.requiredVersion);
      const updateId = makeUpdateId();

      await setDoc(
        doc(db, ...CONFIG_REF),
        {
          updateId,
          mode,
          requiredVersion: version,
          message: clean(message) || "AeroStation Hub update available.",
          active: true,
          publishedAt: serverTimestamp(),
          publishedById: clean(user?.id || user?.uid || user?.employeeId),
          publishedByName: visibleName(user),
          publishedByUsername: clean(user?.username || user?.loginUsername),
        },
        { merge: true }
      );

      setCurrentVersion(version);
      setStatus(
        mode === "FORCE"
          ? `Mandatory update ${updateId} published. Active users will be blocked until they refresh.`
          : `Update notice ${updateId} published.`
      );
    } catch (err) {
      console.error("System update publish failed:", err);
      setError(err?.message || "Could not publish the AeroStation update.");
    } finally {
      setBusy("");
    }
  };

  const clearUpdate = async () => {
    if (!isStationManager || busy) return;
    if (!window.confirm("Clear the active update requirement/notice? Users will no longer be prompted for this update ID.")) return;

    setBusy("CLEAR");
    setError("");
    setStatus("");
    try {
      await setDoc(
        doc(db, ...CONFIG_REF),
        {
          mode: "NONE",
          active: false,
          clearedAt: serverTimestamp(),
          clearedByName: visibleName(user),
        },
        { merge: true }
      );
      setStatus("Active update requirement cleared.");
    } catch (err) {
      setError(err?.message || "Could not clear the update requirement.");
    } finally {
      setBusy("");
    }
  };

  if (!isStationManager) {
    return (
      <main style={{ padding: 24 }}>
        <h2>Access restricted</h2>
        <p>Only Station Managers may control AeroStation Hub system updates.</p>
      </main>
    );
  }

  const card = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 12px 32px rgba(15,23,42,.05)",
  };

  const metric = {
    background: "#f8fbff",
    border: "1px solid #dbeafe",
    borderRadius: 14,
    padding: 14,
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 34px", color: "#0f172a" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".13em", color: "#2563eb" }}>ADMIN · PLATFORM CONTROL</div>
        <h1 style={{ margin: "4px 0 4px", fontSize: 28 }}>🔄 System Update</h1>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>
          Publish AeroStation Hub updates, force a mandatory refresh when operational changes require it, and review version compliance by account.
        </p>
      </div>

      {error && <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>{error}</div>}
      {status && <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}>{status}</div>}

      <section style={{ ...card, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21 }}>Update Control</h2>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Current deployed version is read from version.json.</p>
          </div>
          <span style={{ padding: "7px 11px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, fontSize: 12 }}>
            Version {currentVersion || "Unknown"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div style={metric}><small style={{ color: "#64748b" }}>Active update</small><div style={{ marginTop: 5, fontWeight: 900 }}>{activeUpdateId || "None"}</div></div>
          <div style={metric}><small style={{ color: "#64748b" }}>Mode</small><div style={{ marginTop: 5, fontWeight: 900 }}>{clean(config?.mode) || "NONE"}</div></div>
          <div style={metric}><small style={{ color: "#64748b" }}>Published</small><div style={{ marginTop: 5, fontWeight: 900 }}>{formatTime(config?.publishedAt)}</div></div>
          <div style={metric}><small style={{ color: "#64748b" }}>Published by</small><div style={{ marginTop: 5, fontWeight: 900 }}>{clean(config?.publishedByName) || "—"}</div></div>
        </div>

        <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 13 }}>
          Message shown to users
          <textarea
            rows={3}
            maxLength={500}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, font: "inherit", resize: "vertical" }}
          />
        </label>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => publish("NOTICE")}
            disabled={Boolean(busy)}
            style={{ padding: "11px 15px", borderRadius: 11, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 900, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy === "NOTICE" ? "Publishing..." : "✨ Publish Update Notice"}
          </button>

          <button
            type="button"
            onClick={() => publish("FORCE")}
            disabled={Boolean(busy)}
            style={{ padding: "11px 15px", borderRadius: 11, border: "none", background: "#dc2626", color: "#fff", fontWeight: 900, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy === "FORCE" ? "Publishing..." : "🔄 Force Update All Users"}
          </button>

          <button
            type="button"
            onClick={clearUpdate}
            disabled={Boolean(busy) || !activeUpdateId}
            style={{ padding: "11px 15px", borderRadius: 11, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 850, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy === "CLEAR" ? "Clearing..." : "Clear Active Update"}
          </button>
        </div>
      </section>

      <section style={{ ...card, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".12em", color: "#7c3aed" }}>VERSION COMPLIANCE</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 21 }}>Connected / Recently Seen Accounts</h2>
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>{clients.length} tracked devices/accounts</span>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <div style={metric}><small style={{ color: "#64748b" }}>Recently active</small><div style={{ fontSize: 25, fontWeight: 950, marginTop: 3 }}>{onlineCount}</div></div>
          <div style={metric}><small style={{ color: "#64748b" }}>Compliant</small><div style={{ fontSize: 25, fontWeight: 950, marginTop: 3 }}>{compliantCount}</div></div>
          <div style={metric}><small style={{ color: "#64748b" }}>Pending</small><div style={{ fontSize: 25, fontWeight: 950, marginTop: 3 }}>{pendingCount}</div></div>
        </div>

        <div style={{ marginTop: 14, overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                {["User", "Role / Dept", "Loaded Version", "Update ID", "Status", "Last Seen"].map((label) => (
                  <th key={label} style={{ padding: 11, borderBottom: "1px solid #e2e8f0", fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compliance.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 18, color: "#64748b" }}>No client compliance records yet. Records appear automatically as users load the updated AeroStation code.</td></tr>
              ) : compliance.map((client) => (
                <tr key={client.id}>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><b>{client.displayName || client.username || client.id}</b><div style={{ color: "#94a3b8", fontSize: 11 }}>{client.username || ""}</div></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{client.role || "—"}<br/><small>{client.department || ""}</small></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}><b>{client.appVersion || "Unknown"}</b></td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{client.lastAppliedUpdateId || "—"}</td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ padding: "5px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900, background: client.compliant ? "#ecfdf5" : "#fff7ed", color: client.compliant ? "#047857" : "#b45309" }}>
                      {client.compliant ? "COMPLIANT" : activeUpdateId ? "PENDING" : "TRACKED"}
                    </span>
                    {client.onlineRecently && <div style={{ marginTop: 4, color: "#16a34a", fontSize: 10, fontWeight: 800 }}>● Recently active</div>}
                  </td>
                  <td style={{ padding: 11, borderBottom: "1px solid #f1f5f9", color: "#475569" }}>{formatTime(client.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
