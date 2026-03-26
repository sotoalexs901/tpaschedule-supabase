import React, { useMemo, useState } from "react";
import { parseCabinFlights } from "../utils/parseCabinFlights.js";
import { buildDemandBlocks } from "../utils/buildDemandBlocks.js";
import { generateCabinShifts } from "../utils/generateCabinShifts.js";

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

export default function CabinServicePage() {
  const [weekStartDate, setWeekStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [dayFiles, setDayFiles] = useState({
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  });

  const [weeklyFlights, setWeeklyFlights] = useState({});
  const [weeklyDemandBlocks, setWeeklyDemandBlocks] = useState({});
  const [weeklySlots, setWeeklySlots] = useState({});
  const [step, setStep] = useState("upload");

  const [employees] = useState([
    { id: "1", name: "John Smith" },
    { id: "2", name: "Maria Lopez" },
    { id: "3", name: "Carlos Perez" },
    { id: "4", name: "Ana Torres" },
    { id: "5", name: "Luis Gomez" },
    { id: "6", name: "Daniel Ruiz" },
    { id: "7", name: "Sofia Martinez" },
    { id: "8", name: "Miguel Rivera" },
  ]);

  const uploadedDaysCount = useMemo(() => {
    return DAY_KEYS.filter((day) => !!dayFiles[day]).length;
  }, [dayFiles]);

  const assignedCount = useMemo(() => {
    return Object.values(weeklySlots)
      .flat()
      .filter((slot) => slot.employeeId).length;
  }, [weeklySlots]);

  const totalSlots = useMemo(() => {
    return Object.values(weeklySlots).flat().length;
  }, [weeklySlots]);

  function handleFileChange(dayKey, file) {
    setDayFiles((prev) => ({
      ...prev,
      [dayKey]: file || null,
    }));
  }

  async function handleGenerateWeeklySchedule() {
    if (!weekStartDate) {
      alert("Please select the week start date.");
      return;
    }

    if (uploadedDaysCount === 0) {
      alert("Please upload at least one daily CSV file.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const parsedByDay = {};
      const demandByDay = {};
      const slotsByDay = {};

      for (const dayKey of DAY_KEYS) {
        const file = dayFiles[dayKey];
        if (!file) continue;

        const flights = await parseCabinFlights(file);
        const demandBlocks = buildDemandBlocks(flights);
        const slots = generateCabinShifts(demandBlocks, dayKey);

        parsedByDay[dayKey] = flights;
        demandByDay[dayKey] = demandBlocks;
        slotsByDay[dayKey] = slots;
      }

      setWeeklyFlights(parsedByDay);
      setWeeklyDemandBlocks(demandByDay);
      setWeeklySlots(slotsByDay);
      setStep("assignment");
    } catch (err) {
      console.error(err);
      setError(err.message || "Error generating weekly schedule.");
    } finally {
      setLoading(false);
    }
  }

  function handleAssign(dayKey, slotId, employeeId) {
    setWeeklySlots((prev) => {
      const daySlots = prev[dayKey] || [];
      return {
        ...prev,
        [dayKey]: daySlots.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                employeeId,
              }
            : slot
        ),
      };
    });
  }

  function handleBackToUpload() {
    setStep("upload");
    setWeeklyFlights({});
    setWeeklyDemandBlocks({});
    setWeeklySlots({});
    setError("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>
        Cabin Service Weekly Schedule
      </h1>

      {step === "upload" && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Create Weekly Schedule</h2>

          <div style={fieldBlockStyle}>
            <label style={labelStyle}>Week Start Date</label>
            <input
              type="date"
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Upload Daily Flight Files</h3>

            <div style={uploadGridStyle}>
              {DAY_KEYS.map((dayKey) => (
                <div key={dayKey} style={uploadBoxStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {DAY_LABELS[dayKey]}
                  </div>

                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) =>
                      handleFileChange(dayKey, e.target.files?.[0] || null)
                    }
                  />

                  <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
                    {dayFiles[dayKey] ? (
                      <>
                        <b>Uploaded:</b> {dayFiles[dayKey].name}
                      </>
                    ) : (
                      "No file uploaded"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={summaryMiniStyle}>
              Uploaded days: <b>{uploadedDaysCount}/7</b>
            </div>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <div style={{ marginTop: 18 }}>
            <button
              style={btnPrimary}
              onClick={handleGenerateWeeklySchedule}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Weekly Schedule"}
            </button>
          </div>
        </div>
      )}

      {step === "assignment" && (
        <>
          <div style={cardStyle}>
            <h2 style={titleStyle}>Weekly Summary</h2>

            <div style={summaryGridStyle}>
              <SummaryBox label="Week Start" value={weekStartDate || "-"} />
              <SummaryBox label="Uploaded Days" value={`${uploadedDaysCount}/7`} />
              <SummaryBox
                label="Flights Loaded"
                value={String(
                  Object.values(weeklyFlights).reduce(
                    (sum, flights) => sum + flights.length,
                    0
                  )
                )}
              />
              <SummaryBox
                label="Assigned Slots"
                value={`${assignedCount}/${totalSlots}`}
              />
            </div>
          </div>

          <div style={{ height: 16 }} />

          {DAY_KEYS.map((dayKey) => {
            const flights = weeklyFlights[dayKey] || [];
            const demandBlocks = weeklyDemandBlocks[dayKey] || [];
            const slots = weeklySlots[dayKey] || [];

            if (!flights.length && !slots.length) return null;

            const shiftSummary = summarizeShifts(slots);
            const peakAgents =
              demandBlocks.length > 0
                ? Math.max(...demandBlocks.map((b) => b.recommendedAgents || 0))
                : 0;

            return (
              <div key={dayKey} style={{ marginBottom: 16 }}>
                <div style={cardStyle}>
                  <h2 style={titleStyle}>{DAY_LABELS[dayKey]}</h2>

                  <div style={dayStatsStyle}>
                    <span>
                      Flights: <b>{flights.length}</b>
                    </span>
                    <span>
                      Slots: <b>{slots.length}</b>
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
                      <div style={emptyTextStyle}>No shifts generated</div>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <h3 style={subTitleStyle}>Flights</h3>
                    <div style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thTdStyle}>Flight</th>
                            <th style={thTdStyle}>Time</th>
                            <th style={thTdStyle}>Route</th>
                            <th style={thTdStyle}>Aircraft</th>
                            <th style={thTdStyle}>Gate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flights.map((flight, index) => (
                            <tr
                              key={`${dayKey}-${flight.flightNumber}-${flight.scheduledTime}-${index}`}
                            >
                              <td style={thTdStyle}>{flight.flightNumber || "-"}</td>
                              <td style={thTdStyle}>{flight.scheduledTime || "-"}</td>
                              <td style={thTdStyle}>{flight.route || "-"}</td>
                              <td style={thTdStyle}>{flight.aircraft || "-"}</td>
                              <td style={thTdStyle}>{flight.gate || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <h3 style={subTitleStyle}>Assign Employees</h3>
                    <div style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thTdStyle}>Start</th>
                            <th style={thTdStyle}>End</th>
                            <th style={thTdStyle}>Role</th>
                            <th style={thTdStyle}>Paid Hours</th>
                            <th style={thTdStyle}>Employee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((slot) => (
                            <tr key={`${dayKey}-${slot.id}`}>
                              <td style={thTdStyle}>{slot.start}</td>
                              <td style={thTdStyle}>{slot.end}</td>
                              <td style={thTdStyle}>{slot.role}</td>
                              <td style={thTdStyle}>{slot.paidHours ?? "-"}</td>
                              <td style={thTdStyle}>
                                <select
                                  value={slot.employeeId}
                                  onChange={(e) =>
                                    handleAssign(dayKey, slot.id, e.target.value)
                                  }
                                  style={selectStyle}
                                >
                                  <option value="">Select employee</option>
                                  {employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                      {emp.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
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

          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={btnSecondary} onClick={handleBackToUpload}>
                Back
              </button>

              <button
                style={btnPrimary}
                onClick={() => alert("Next step: save weekly schedule to Firebase")}
              >
                Save Weekly Schedule
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div style={summaryBoxStyle}>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
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
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    if (a.end !== b.end) return a.end.localeCompare(b.end);
    return a.role.localeCompare(b.role);
  });
}

const cardStyle = {
  background: "#ffffff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const titleStyle = {
  fontSize: 18,
  marginBottom: 15,
};

const subTitleStyle = {
  fontSize: 15,
  marginBottom: 10,
};

const fieldBlockStyle = {
  marginBottom: 14,
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  maxWidth: 280,
};

const uploadGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const uploadBoxStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 12,
  background: "#f8fafc",
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

const selectStyle = {
  minWidth: 180,
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

const btnPrimary = {
  background: "#1d4ed8",
  color: "#fff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const btnSecondary = {
  background: "#e5e7eb",
  color: "#111",
  padding: "8px 14px",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const errorStyle = {
  marginTop: 10,
  padding: 10,
  borderRadius: 6,
  background: "#fee2e2",
  color: "#991b1b",
  fontSize: 14,
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

const summaryMiniStyle = {
  fontSize: 14,
  color: "#334155",
};
