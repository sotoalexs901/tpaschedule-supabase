import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

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
    <div style={{ padding: 20 }}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={pageTitleStyle}>Cabin Saved Schedules</h1>
          <p style={pageSubStyle}>
            View all weekly Cabin Service schedules saved in Firebase.
          </p>
        </div>
      </div>

      <div style={summaryCardStyle}>
        <div style={summaryItemStyle}>
          <div style={summaryLabelStyle}>Total Schedules</div>
          <div style={summaryValueStyle}>{totalSchedules}</div>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Saved Weekly Schedules</h2>

        {loading && <div style={infoTextStyle}>Loading schedules...</div>}

        {!loading && error && <div style={errorStyle}>{error}</div>}

        {!loading && !error && schedules.length === 0 && (
          <div style={infoTextStyle}>No Cabin schedules found yet.</div>
        )}

        {!loading && !error && schedules.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thTdStyle}>Week Start</th>
                  <th style={thTdStyle}>Created By</th>
                  <th style={thTdStyle}>Uploaded Days</th>
                  <th style={thTdStyle}>Flights</th>
                  <th style={thTdStyle}>Slots</th>
                  <th style={thTdStyle}>Status</th>
                  <th style={thTdStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => (
                  <tr key={item.id}>
                    <td style={thTdStyle}>{item.weekStartDate || "-"}</td>
                    <td style={thTdStyle}>{item.createdBy || "-"}</td>
                    <td style={thTdStyle}>
                      {Array.isArray(item.uploadedDays)
                        ? item.uploadedDays.length
                        : 0}
                    </td>
                    <td style={thTdStyle}>{item.totalFlights ?? 0}</td>
                    <td style={thTdStyle}>{item.totalSlots ?? 0}</td>
                    <td style={thTdStyle}>
                      <span style={statusChipStyle}>
                        {item.status || "draft"}
                      </span>
                    </td>
                    <td style={thTdStyle}>
                      <Link to={`/cabin-saved-schedules/${item.id}`} style={viewLinkStyle}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
};

const pageTitleStyle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
};

const pageSubStyle = {
  marginTop: 6,
  color: "#475569",
  fontSize: 14,
};

const summaryCardStyle = {
  marginTop: 16,
  background: "#ffffff",
  borderRadius: 10,
  padding: 16,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  display: "inline-flex",
};

const summaryItemStyle = {
  minWidth: 180,
};

const summaryLabelStyle = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const summaryValueStyle = {
  fontSize: 24,
  fontWeight: 700,
};

const cardStyle = {
  background: "#ffffff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const sectionTitleStyle = {
  fontSize: 18,
  marginBottom: 15,
};

const infoTextStyle = {
  fontSize: 14,
  color: "#475569",
};

const errorStyle = {
  padding: 10,
  borderRadius: 6,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 14,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thTdStyle = {
  borderBottom: "1px solid #e2e8f0",
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 14,
};

const statusChipStyle = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "capitalize",
};

const viewLinkStyle = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
};
