// src/pages/CabinSavedSchedulesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

function PageCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.96)",
        borderRadius: 24,
        boxShadow: "0 18px 42px rgba(15,23,42,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function statusBadge(status) {
  const s = String(status || "draft").toLowerCase();

  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid transparent",
    textTransform: "capitalize",
  };

  if (s === "approved") {
    return {
      ...base,
      background: "#ecfdf5",
      color: "#065f46",
      borderColor: "#a7f3d0",
    };
  }

  if (s === "pending") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#9a3412",
      borderColor: "#fed7aa",
    };
  }

  if (s === "rejected") {
    return {
      ...base,
      background: "#fff1f2",
      color: "#9f1239",
      borderColor: "#fecdd3",
    };
  }

  return {
    ...base,
    background: "#edf7ff",
    color: "#1769aa",
    borderColor: "#cfe7fb",
  };
}

export default function CabinSavedSchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSchedules() {
      try {
        setLoading(true);
        setError("");

        const q = query(
          collection(db, "cabinSchedules"),
          orderBy("createdAt", "desc")
        );

        const snap = await getDocs(q);

        const items = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
          };
        });

        setSchedules(items);
      } catch (err) {
        console.error("Error loading cabin schedules:", err);
        setError(err.message || "Error loading cabin schedules.");
      } finally {
        setLoading(false);
      }
    }

    loadSchedules();
  }, []);

  const totalSchedules = useMemo(() => schedules.length, [schedules]);

  return (
    <div
      style={{
        display: "grid",
        gap: 18,
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(135deg, #0f5c91 0%, #1f7cc1 42%, #6ec6e8 100%)",
          borderRadius: 28,
          padding: 24,
          color: "#fff",
          boxShadow: "0 24px 60px rgba(23,105,170,0.22)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            top: -80,
            right: -40,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              TPA OPS · Cabin Service
            </p>

            <h1
              style={{
                margin: "10px 0 6px",
                fontSize: 32,
                lineHeight: 1.05,
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              Cabin Saved Schedules
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: 14,
                color: "rgba(255,255,255,0.88)",
              }}
            >
              Review all weekly Cabin Service schedules saved in Firebase and
              open any record for full details.
            </p>
          </div>
        </div>
      </div>

      <PageCard style={{ padding: 18 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              borderRadius: 16,
              padding: "14px 16px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Total Schedules
            </p>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 28,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.03em",
              }}
            >
              {totalSchedules}
            </p>
          </div>
        </div>
      </PageCard>

      <PageCard style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            Saved Weekly Schedules
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Open any saved Cabin Service schedule to review its full content.
          </p>
        </div>

        {loading && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Loading schedules...
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#9f1239",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && schedules.length === 0 && (
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "#f8fbff",
              border: "1px solid #dbeafe",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            No Cabin schedules found yet.
          </div>
        )}

        {!loading && !error && schedules.length > 0 && (
          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid #e2e8f0",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 880,
                background: "#fff",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fbff" }}>
                  <th style={thStyle}>Week Start</th>
                  <th style={thStyle}>Created By</th>
                  <th style={thStyle}>Uploaded Days</th>
                  <th style={thStyle}>Flights</th>
                  <th style={thStyle}>Slots</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item, index) => (
                  <tr
                    key={item.id}
                    style={{
                      background: index % 2 === 0 ? "#ffffff" : "#fbfdff",
                    }}
                  >
                    <td style={tdStyle}>{item.weekStartDate || "-"}</td>
                    <td style={tdStyle}>{item.createdBy || "-"}</td>
                    <td style={tdStyle}>
                      {Array.isArray(item.uploadedDays)
                        ? item.uploadedDays.length
                        : 0}
                    </td>
                    <td style={tdStyle}>{item.totalFlights ?? 0}</td>
                    <td style={tdStyle}>{item.totalSlots ?? 0}</td>
                    <td style={tdStyle}>
                      <span style={statusBadge(item.status)}>
                        {item.status || "draft"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <Link
                        to={`/cabin-saved-schedules/${item.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "#edf7ff",
                          color: "#1769aa",
                          border: "1px solid #cfe7fb",
                          textDecoration: "none",
                          fontSize: 13,
                          fontWeight: 800,
                        }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>
    </div>
  );
}

const thStyle = {
  padding: "14px 14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  fontSize: 14,
  color: "#0f172a",
};
