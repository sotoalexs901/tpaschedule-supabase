import React, { useMemo, useState } from "react";
import { useUser } from "../UserContext.jsx";
import { parseCabinFlights } from "../utils/parseCabinFlights.js";
import { buildDemandBlocks } from "../utils/buildDemandBlocks.js";
import { generateCabinShifts } from "../utils/generateCabinShifts.js";
import { saveCabinWeeklySchedule } from "../services/cabinSchedulesService.js";

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
  const { user } = useUser();

  const [weekStartDate, setWeekStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function handleSaveWeeklySchedule() {
    try {
      setSaving(true);

      const scheduleId = await saveCabinWeeklySchedule({
        weekStartDate,
        weeklyFlights,
        weeklyDemandBlocks,
        weeklySlots,
        createdBy: user?.username || user?.id || "",
      });

      alert(`Weekly schedule saved successfully. ID: ${scheduleId}`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error saving weekly schedule.");
    } finally {
      setSaving(false);
    }
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
                onClick={handleSaveWeeklySchedule}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Weekly Schedule"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
