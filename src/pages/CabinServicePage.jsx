import React, { useMemo, useState } from "react";
import { parseCabinFlights } from "../utils/parseCabinFlights.js";

export default function CabinServicePage() {
  const [file, setFile] = useState(null);
  const [operationDate, setOperationDate] = useState("");
  const [step, setStep] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [parsedFlights, setParsedFlights] = useState([]);
  const [slots, setSlots] = useState([]);

  const [employees] = useState([
    { id: "1", name: "John Smith" },
    { id: "2", name: "Maria Lopez" },
    { id: "3", name: "Carlos Perez" },
    { id: "4", name: "Ana Torres" },
    { id: "5", name: "Luis Gomez" },
    { id: "6", name: "Daniel Ruiz" },
  ]);

  const flightSummary = useMemo(() => {
    if (!parsedFlights.length) {
      return {
        totalFlights: 0,
        firstFlight: "",
        lastFlight: "",
      };
    }

    return {
      totalFlights: parsedFlights.length,
      firstFlight: parsedFlights[0].scheduledTime,
      lastFlight: parsedFlights[parsedFlights.length - 1].scheduledTime,
    };
  }, [parsedFlights]);

  const buildSampleShiftsFromFlights = (flights) => {
    if (!flights.length) return [];

    const firstFlight = flights[0]?.scheduledTime || "07:00";
    const lastFlight = flights[flights.length - 1]?.scheduledTime || "19:00";

    const generated = [
      {
        id: 1,
        start: subtractTwoHours(firstFlight),
        end: addEightAndHalfHours(subtractTwoHours(firstFlight)),
        role: "Supervisor",
        employeeId: "",
      },
      {
        id: 2,
        start: subtractTwoHours(firstFlight),
        end: addEightAndHalfHours(subtractTwoHours(firstFlight)),
        role: "LAV",
        employeeId: "",
      },
      {
        id: 3,
        start: subtractTwoHours(firstFlight),
        end: addEightAndHalfHours(subtractTwoHours(firstFlight)),
        role: "Agent",
        employeeId: "",
      },
      {
        id: 4,
        start: firstFlight,
        end: addEightAndHalfHours(firstFlight),
        role: "Agent",
        employeeId: "",
      },
      {
        id: 5,
        start: subtractFourHours(lastFlight),
        end: addFourHours(subtractFourHours(lastFlight)),
        role: "Agent",
        employeeId: "",
      },
    ];

    return generated;
  };

  const handleAnalyze = async () => {
    if (!file || !operationDate) {
      alert("Please upload a CSV file and select a date.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const flights = await parseCabinFlights(file);
      setParsedFlights(flights);

      const generatedSlots = buildSampleShiftsFromFlights(flights);
      setSlots(generatedSlots);
      setStep("assignment");
    } catch (err) {
      console.error(err);
      setError(err.message || "Error processing file.");
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = (slotId, employeeId) => {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, employeeId } : slot
      )
    );
  };

  const assignedCount = slots.filter((slot) => slot.employeeId).length;

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 20 }}>
        Cabin Service
      </h1>

      {step === "upload" && (
        <div style={cardStyle}>
          <h2 style={titleStyle}>Upload Flight Schedule</h2>

          <div style={fieldBlockStyle}>
            <label style={labelStyle}>Operation Date</label>
            <input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={fieldBlockStyle}>
            <label style={labelStyle}>Upload CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={inputStyle}
            />
          </div>

          {file && (
            <p style={{ marginTop: 10, fontSize: 14 }}>
              Selected file: <b>{file.name}</b>
            </p>
          )}

          {error && (
            <div style={errorStyle}>
              {error}
            </div>
          )}

          <button
            style={btnPrimary}
            onClick={handleAnalyze}
            disabled={loading}
          >
            {loading ? "Processing..." : "Analyze Schedule"}
          </button>
        </div>
      )}

      {step === "assignment" && (
        <>
          <div style={cardStyle}>
            <h2 style={titleStyle}>Flight Summary</h2>

            <div style={summaryGridStyle}>
              <SummaryBox label="Date" value={operationDate || "-"} />
              <SummaryBox label="Flights" value={String(flightSummary.totalFlights)} />
              <SummaryBox label="First Flight" value={flightSummary.firstFlight || "-"} />
              <SummaryBox label="Last Flight" value={flightSummary.lastFlight || "-"} />
              <SummaryBox label="Assigned Slots" value={`${assignedCount}/${slots.length}`} />
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div style={cardStyle}>
            <h2 style={titleStyle}>Parsed Flights</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th>Flight</th>
                    <th>Time</th>
                    <th>Route</th>
                    <th>Aircraft</th>
                    <th>Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedFlights.map((flight, index) => (
                    <tr key={`${flight.flightNumber}-${flight.scheduledTime}-${index}`}>
                      <td>{flight.flightNumber || "-"}</td>
                      <td>{flight.scheduledTime || "-"}</td>
                      <td>{flight.route || "-"}</td>
                      <td>{flight.aircraft || "-"}</td>
                      <td>{flight.gate || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div style={cardStyle}>
            <h2 style={titleStyle}>Assign Employees</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th>Start</th>
                    <th>End</th>
                    <th>Role</th>
                    <th>Employee</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.id}>
                      <td>{slot.start}</td>
                      <td>{slot.end}</td>
                      <td>{slot.role}</td>
                      <td>
                        <select
                          value={slot.employeeId}
                          onChange={(e) => handleAssign(slot.id, e.target.value)}
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

            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button
                style={btnSecondary}
                onClick={() => {
                  setStep("upload");
                  setParsedFlights([]);
                  setSlots([]);
                  setError("");
                }}
              >
                Back
              </button>

              <button
                style={btnPrimary}
                onClick={() => alert("Next step: save to Firebase")}
              >
                Save Schedule
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
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toTimeString(totalMinutes) {
  let mins = totalMinutes % (24 * 60);
  if (mins < 0) mins += 24 * 60;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function subtractTwoHours(hhmm) {
  return toTimeString(toMinutes(hhmm) - 120);
}

function subtractFourHours(hhmm) {
  return toTimeString(toMinutes(hhmm) - 240);
}

function addFourHours(hhmm) {
  return toTimeString(toMinutes(hhmm) + 240);
}

function addEightAndHalfHours(hhmm) {
  return toTimeString(toMinutes(hhmm) + 510);
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
  maxWidth: 360,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const selectStyle = {
  minWidth: 180,
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
  marginBottom: 12,
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
