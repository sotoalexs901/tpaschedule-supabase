// src/pages/MyWCHRReports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatMMDDYYYYFromFirestore(val) {
  // val puede ser Firestore Timestamp, Date, string
  try {
    const d =
      val?.toDate?.() instanceof Date
        ? val.toDate()
        : val instanceof Date
        ? val
        : new Date(val);

    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
  } catch {
    return "";
  }
}

export default function MyWCHRReports() {
  const navigate = useNavigate();
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const employeeId = useMemo(() => user?.id || "", [user]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setError("");
      setLoading(true);

      try {
        if (!employeeId) {
          setRows([]);
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, "wch_reports"),
          where("employee_id", "==", employeeId),
          orderBy("submitted_at", "desc"),
          limit(50)
        );

        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (mounted) setRows(data);
      } catch (e) {
        console.error(e);
        if (mounted) setError(e?.message || "Failed to load reports.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [employeeId]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>My WCHR Reports</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Your most recent submissions.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => navigate("/wchr/scan")}
            style={btnPrimary}
          >
            + New Report
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={btnGhost}
          >
            Back
          </button>
        </div>
      </div>

      {error && (
        <div style={alertError}>
          <div style={{ fontSize: 14 }}>{error}</div>
        </div>
      )}

      <div style={card}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.8 }}>
            No reports yet. Click <b>New Report</b> to submit one.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.8 }}>
                  <th style={th}>Report ID</th>
                  <th style={th}>Flight</th>
                  <th style={th}>Date</th>
                  <th style={th}>Passenger</th>
                  <th style={th}>Type</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={td}>
                      {r.report_id || <span style={{ opacity: 0.6 }}>—</span>}
                    </td>
                    <td style={td}>
                      {(r.airline || "—") + " " + (r.flight_number || "")}
                    </td>
                    <td style={td}>
                      {formatMMDDYYYYFromFirestore(r.flight_date) || "—"}
                    </td>
                    <td style={td}>{r.passenger_name || "—"}</td>
                    <td style={td}>{r.wch_type || "—"}</td>
                    <td style={td}>
                      <span style={badge(r.status)}>{r.status || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Tip: After a flight is closed, new submissions for that flight will be marked as <b>LATE</b>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const card = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
};

const alertError = {
  marginTop: 12,
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,0,0,0.12)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const btnPrimary = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.18)",
  color: "inherit",
  cursor: "pointer",
};

const btnGhost = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

const th = { padding: "10px 8px" };
const td = { padding: "10px 8px", verticalAlign: "top" };

function badge(status) {
  const s = String(status || "").toUpperCase();
  const base = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    fontSize: 12,
    opacity: 0.95,
  };
  if (s === "LATE") return { ...base, background: "rgba(255,165,0,0.14)" };
  if (s === "NEW") return { ...base, background: "rgba(0,255,0,0.10)" };
  return { ...base, background: "rgba(255,255,255,0.08)" };
}
