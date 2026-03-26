import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export default function CabinScheduleViewPage() {
  const { id } = useParams();

  const [schedule, setSchedule] = useState(null);
  const [slotsByDay, setSlotsByDay] = useState({});
  const [flightsByDay, setFlightsByDay] = useState({});
  const [demandByDay, setDemandByDay] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadScheduleView() {
      try {
        setLoading(true);
        setError("");

        const scheduleRef = doc(db, "cabinSchedules", id);
        const scheduleSnap = await getDoc(scheduleRef);

        if (!scheduleSnap.exists()) {
          throw new Error("Cabin schedule not found.");
        }

        const scheduleData = {
          id: scheduleSnap.id,
          ...scheduleSnap.data(),
        };
        setSchedule(scheduleData);

        const [slotsSnap, flightsSnap, demandSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "cabinScheduleSlots"),
              where("scheduleId", "==", id)
            )
          ),
          getDocs(
            query(
              collection(db, "cabinScheduleFlights"),
              where("scheduleId", "==", id)
            )
          ),
          getDocs(
            query(
              collection(db, "cabinScheduleDemandBlocks"),
              where("scheduleId", "==", id)
            )
          ),
        ]);

        const slots = slotsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const flights = flightsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        const demandBlocks = demandSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setSlotsByDay(groupByDay(slots, sortSlots));
        setFlightsByDay(groupByDay(flights, sortFlights));
        setDemandByDay(groupByDay(demandBlocks, sortDemandBlocks));
      } catch (err) {
        console.error("Error loading cabin schedule view:", err);
        setError(err.message || "Error loading cabin schedule.");
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      loadScheduleView();
    }
  }, [id]);

  const totalFlights = useMemo(
    () => Object.values(flightsByDay).reduce((sum, items) => sum + items.length, 0),
    [flightsByDay]
  );

  const totalSlots = useMemo(
    () => Object.values(slotsByDay).reduce((sum, items) => sum + items.length, 0),
    [slotsByDay]
  );

  const assignedSlots = useMemo(
    () =>
      Object.values(slotsByDay)
        .flat()
        .filter((slot) => slot.employeeId || slot.employeeName).length,
    [slotsByDay]
  );

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={cardStyle}>Loading cabin schedule...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div style={errorStyle}>{error}</div>
        <div style={{ marginTop: 16 }}>
          <Link to="/cabin-saved-schedules" style={linkStyle}>
            Back to Cabin Saved Schedules
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={pageTitleStyle}>Cabin Schedule View</h1>
          <p style={pageSubStyle}>
            Weekly Cabin Service schedule details
          </p>
        </div>

        <Link to="/cabin-saved-schedules" style={backButtonStyle}>
          Back to Saved Schedules
        </Link>
      </div>

      <div style={{ height: 16 }} />

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Schedule Summary</h2>

        <div style={summaryGridStyle}>
          <SummaryBox label="Week Start" value={schedule?.weekStartDate || "-"} />
          <SummaryBox label="Created By" value={schedule?.createdBy || "-"} />
          <SummaryBox label="Status" value={schedule?.status || "draft"} />
          <SummaryBox label="Flights" value={String(totalFlights)} />
          <SummaryBox label="Slots" value={String(totalSlots)} />
          <SummaryBox label="Assigned" value={`${assignedSlots}/${totalSlots}`} />
        </div>
      </div>

      <div style={{ height: 16 }} />

      {DAY_KEYS.map((dayKey) => {
        const slots = slotsByDay[dayKey] || [];
        const flights = flightsByDay[dayKey] || [];
        const demandBlocks = demandByDay[dayKey] || [];

        if (!slots.length && !flights.length && !demandBlocks.length) return null;

        const arrivals = flights.filter((f) => f.movementType === "arrival").length;
        const departures = flights.filter((f) => f.movementType !== "arrival").length;
        const peakAgents =
          demandBlocks.length > 0
            ? Math.max(...demandBlocks.map((b) => b.recommendedAgents || 0))
            : 0;

        const shiftSummary = summarizeShifts(slots);

        return (
          <div key={dayKey} style={{ marginBottom: 16 }}>
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>{DAY_LABELS[dayKey]}</h2>

              <div style={dayStatsStyle}>
                <span>
                  Flights: <b>{flights.length}</b>
                </span>
                <span>
                  Arrivals: <b>{arrivals}</b>
                </span>
                <span>
                  Departures: <b>{departures}</b>
                </span>
                <span>
                  Peak Agents: <b>{peakAgents}</b>
                </span>
              </div>

              <div style={{ marginTop: 16 }}>
                <h3 style={subTitleStyle}>Generated Shifts</h3>
                {shiftSummary.length ? (
                  <div style={chipWrapStyle}>
                    {shiftSummary.map((item) => (
                      <div
                        key={`${dayKey}-${item.start}-${item.end}-${item.role}`}
                        style={chipStyle}
                      >
                        {item.start}–{item.end} | {item.role} x{item.count}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={emptyTextStyle}>No shifts found</div>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <h3 style={subTitleStyle}>Assigned Schedule</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thTdStyle}>Start</th>
                        <th style={thTdStyle}>End</th>
                        <th style={thTdStyle}>Role</th>
                        <th style={thTdStyle}>Paid Hours</th>
                        <th style={thTdStyle}>Employee</th>
                        <th style={thTdStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((slot) => (
                        <tr key={slot.id}>
                          <td style={thTdStyle}>{slot.start || "-"}</td>
                          <td style={thTdStyle}>{slot.end || "-"}</td>
                          <td style={thTdStyle}>{slot.role || "-"}</td>
                          <td style={thTdStyle}>{slot.paidHours ?? "-"}</td>
                          <td style={thTdStyle}>
                            {slot.employeeName || slot.employeeId || "Open"}
                          </td>
                          <td style={thTdStyle}>
                            <span
                              style={
                                slot.employeeId || slot.employeeName
                                  ? assignedChipStyle
                                  : openChipStyle
                              }
                            >
                              {slot.employeeId || slot.employeeName ? "Assigned" : "Open"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <h3 style={subTitleStyle}>Flights</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thTdStyle}>Type</th>
                        <th style={thTdStyle}>Flight</th>
                        <th style={thTdStyle}>Time</th>
                        <th style={thTdStyle}>Route</th>
                        <th style={thTdStyle}>Aircraft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flights.map((flight) => (
                        <tr key={flight.id}>
                          <td style={thTdStyle}>{flight.movementType || "-"}</td>
                          <td style={thTdStyle}>{flight.flightNumber || "-"}</td>
                          <td style={thTdStyle}>{flight.scheduledTime || "-"}</td>
                          <td style={thTdStyle}>{flight.route || "-"}</td>
                          <td style={thTdStyle}>{flight.aircraft || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function groupByDay(items, sorter) {
  const grouped = {};

  for (const item of items || []) {
    const dayKey = item.dayKey || "unknown";
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(item);
  }

  Object.keys(grouped).forEach((dayKey) => {
    grouped[dayKey] = grouped[dayKey].sort(sorter);
  });

  return grouped;
}

function summarizeShifts(slots) {
  const map = new Map();

  for (const slot of slots) {
    const key = `${slot.start}|${slot.end}|${slot.role}`;
    if (!map.has(key)) {
      map.set(key, {
        start: slot.start,
        end: slot.end,
        role: slot.role,
        count: 0,
      });
    }
    map.get(key).count += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    if ((a.start || "") !== (b.start || "")) {
      return (a.start || "").localeCompare(b.start || "");
    }
    if ((a.end || "") !== (b.end || "")) {
      return (a.end || "").localeCompare(b.end || "");
    }
    return (a.role || "").localeCompare(b.role || "");
  });
}

function sortSlots(a, b) {
  if ((a.start || "") !== (b.start || "")) {
    return (a.start || "").localeCompare(b.start || "");
  }
  if ((a.end || "") !== (b.end || "")) {
    return (a.end || "").localeCompare(b.end || "");
  }
  return (a.role || "").localeCompare(b.role || "");
}

function sortFlights(a, b) {
  if ((a.scheduledTime || "") !== (b.scheduledTime || "")) {
    return (a.scheduledTime || "").localeCompare(b.scheduledTime || "");
  }
  return (a.flightNumber || "").localeCompare(b.flightNumber || "");
}

function sortDemandBlocks(a, b) {
  return (a.startTime || "").localeCompare(b.startTime || "");
}

function SummaryBox({ label, value }) {
  return (
    <div style={summaryBoxStyle}>
      <div style={summaryLabelStyle}>{label}</div>
      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

const headerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
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

const subTitleStyle = {
  fontSize: 15,
  marginBottom: 10,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const summaryBoxStyle = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
};

const summaryLabelStyle = {
  fontSize: 12,
  color: "#64748b",
  marginBottom: 6,
};

const summaryValueStyle = {
  fontSize: 18,
  fontWeight: 700,
};

const dayStatsStyle = {
  display: "flex",
  gap: 20,
  fontSize: 14,
  color: "#334155",
  flexWrap: "wrap",
};

const chipWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const chipStyle = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 600,
};

const emptyTextStyle = {
  fontSize: 14,
  color: "#64748b",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thTdStyle = {
  borderBottom: "1px solid #e2e8f0",
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 14,
};

const assignedChipStyle = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  fontSize: 12,
  fontWeight: 600,
};

const openChipStyle = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  fontSize: 12,
  fontWeight: 600,
};

const errorStyle = {
  padding: 10,
  borderRadius: 6,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 14,
};

const backButtonStyle = {
  display: "inline-block",
  background: "#1d4ed8",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 6,
  textDecoration: "none",
  fontWeight: 600,
};

const linkStyle = {
  color: "#1d4ed8",
  textDecoration: "none",
  fontWeight: 600,
};
